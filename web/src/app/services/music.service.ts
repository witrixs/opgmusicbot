import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, combineLatest, distinctUntilChanged, map, of, tap } from 'rxjs';
import { Queue } from '../models/queue.model';
import { PlayerState, Track } from '../models/track.model';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';

/**
 * Сервис для работы с музыкальным API (NestJS)
 */
@Injectable({
  providedIn: 'root'
})
export class MusicService {
  // BehaviorSubject для хранения текущего состояния плеера
  // Подписчики автоматически получают последнее значение при подписке
  private playerStateSubject = new BehaviorSubject<PlayerState>({
    currentTrack: null,
    isPlaying: false,
    isPaused: false
  });
  public playerState$ = this.playerStateSubject.asObservable();

  // BehaviorSubject для хранения очереди треков
  private queueSubject = new BehaviorSubject<Queue>({
    tracks: [],
    currentIndex: -1
  });
  public queue$ = this.queueSubject.asObservable();

  // Флаг подключения бота к голосовому каналу
  private isBotInChannelSubject = new BehaviorSubject<boolean>(false);
  public isBotInChannel$ = this.isBotInChannelSubject.asObservable();

  // Флаг доступности бэкенда
  private isBackendOnlineSubject = new BehaviorSubject<boolean>(true);
  public isBackendOnline$ = this.isBackendOnlineSubject.asObservable();

  // Список гильдий (серверов), где находится бот (для выбора сервера в UI)
  private guildsSubject = new BehaviorSubject<ApiGuild[]>([]);
  public guilds$ = this.guildsSubject.asObservable();

  // Выбранная гильдия (сервер), в контексте которой управляем музыкой
  private selectedGuildIdSubject = new BehaviorSubject<string | null>(null);
  public selectedGuildId$ = this.selectedGuildIdSubject.asObservable();

  public selectedGuild$ = combineLatest([this.guilds$, this.selectedGuildId$]).pipe(
    map(([guilds, selectedId]) => guilds.find((g) => g.id === selectedId) ?? null),
  );

  private readonly apiBaseUrl = API_BASE_URL.replace(/\/$/, '') || '/api';

  private lastQueueKey: string | null = null;
  private lastPlayerKey: string | null = null;
  private backendStatusCheckInterval: any = null;
  private eventSource: EventSource | null = null;
  private readonly selectedGuildStorageKey = 'opgmusic.selectedGuildId';

  constructor(
    private http: HttpClient,
    private zone: NgZone,
    private auth: AuthService,
  ) {
    // Восстанавливаем выбранную гильдию (если была)
    try {
      const saved = localStorage.getItem(this.selectedGuildStorageKey);
      if (saved) this.selectedGuildIdSubject.next(saved);
    } catch {
      // ignore
    }

    // Первый рефреш данных при старте приложения
    this.refreshState().subscribe();
    this.connectRealtime();
    // Запускаем проверку статуса бэкенда
    this.startBackendStatusCheck();

    // Тянем список гильдий бота (для селектора сервера)
    this.loadGuilds().subscribe();

    // При смене выбранной гильдии — обновляем состояние и переподключаем realtime
    this.selectedGuildId$.pipe(distinctUntilChanged()).subscribe(() => {
      this.refreshState().subscribe();
      this.connectRealtime();
    });
  }

  private applyRemoteState(remote: ApiMusicState): void {
    // botConnected означает, что бот подключен к голосовому каналу
    this.isBotInChannelSubject.next(Boolean(remote.botConnected));
    // Если получили ответ от API, значит бэкенд онлайн
    this.isBackendOnlineSubject.next(true);

    const queueIds = (remote.queue?.tracks || []).map((t) => t.id).join(',');
    const queueKey = `${remote.queue?.currentIndex ?? -1}|${queueIds}`;
    if (queueKey !== this.lastQueueKey) {
      this.lastQueueKey = queueKey;
      this.queueSubject.next(remote.queue);
    }

    const ct = remote.playerState?.currentTrack?.id ?? 'none';
    const playerKey = `${ct}|${remote.playerState?.isPlaying ? 1 : 0}|${remote.playerState?.isPaused ? 1 : 0}`;
    if (playerKey !== this.lastPlayerKey) {
      this.lastPlayerKey = playerKey;
      this.playerStateSubject.next(remote.playerState);
    }
  }

  refreshState(): Observable<void> {
    // добавляем timestamp чтобы исключить кэширование
    const guildId = this.selectedGuildIdSubject.value;
    const url = guildId
      ? `${this.apiBaseUrl}/music/state?t=${Date.now()}&guildId=${encodeURIComponent(guildId)}`
      : `${this.apiBaseUrl}/music/state?t=${Date.now()}`;

    return this.http.get<ApiMusicState>(url).pipe(
      tap((state) => this.applyRemoteState(state)),
      map(() => void 0),
      catchError((err) => {
        console.error('Failed to refresh state:', err);
        // Если не удалось получить ответ, бэкенд может быть недоступен
        this.isBackendOnlineSubject.next(false);
        this.isBotInChannelSubject.next(false);
        return of(void 0);
      }),
    );
  }

  /**
   * Проверка статуса бэкенда
   */
  private checkBackendStatus(): void {
    this.http.get<{ ok: boolean; bot: { ready: boolean; userTag: string | null; ping: number | null } }>(`${this.apiBaseUrl}/status`).pipe(
      tap((status) => {
        this.isBackendOnlineSubject.next(status.ok && status.bot.ready);
      }),
      catchError((err) => {
        console.error('Backend status check failed:', err);
        this.isBackendOnlineSubject.next(false);
        return of(null);
      }),
    ).subscribe();
  }

  /**
   * Запуск периодической проверки статуса бэкенда
   */
  private startBackendStatusCheck(): void {
    // Проверяем сразу
    this.checkBackendStatus();
    // Затем каждые 10 секунд
    this.backendStatusCheckInterval = setInterval(() => {
      this.checkBackendStatus();
    }, 10000);
  }

  /**
   * Остановка проверки статуса бэкенда
   */
  private stopBackendStatusCheck(): void {
    if (this.backendStatusCheckInterval) {
      clearInterval(this.backendStatusCheckInterval);
      this.backendStatusCheckInterval = null;
    }
  }

  /**
   * Воспроизведение трека по запросу или URL
   */
  playTrack(query: string): Observable<Track | null> {
    const guildId = this.selectedGuildIdSubject.value;
    return this.http.post<ApiMusicState>(`${this.apiBaseUrl}/music/play`, { query, guildId }).pipe(
      tap((state) => {
        this.applyRemoteState(state);
        // При успешном запросе бэкенд точно онлайн
        this.isBackendOnlineSubject.next(true);
      }),
      map((state) => state.playerState.currentTrack),
      catchError((err) => {
        console.error('Failed to play track:', err);
        this.isBackendOnlineSubject.next(false);
        throw err;
      }),
    );
  }

  /**
   * Пауза текущего трека
   */
  pauseTrack(): Observable<void> {
    const guildId = this.selectedGuildIdSubject.value;
    return this.http.post<ApiMusicState>(`${this.apiBaseUrl}/music/pause`, { guildId }).pipe(
      tap((state) => {
        this.applyRemoteState(state);
        this.isBackendOnlineSubject.next(true);
      }),
      map(() => void 0),
      catchError((err) => {
        console.error('Failed to pause track:', err);
        this.isBackendOnlineSubject.next(false);
        throw err;
      }),
    );
  }

  /**
   * Возобновление воспроизведения
   */
  resumeTrack(): Observable<void> {
    const guildId = this.selectedGuildIdSubject.value;
    return this.http.post<ApiMusicState>(`${this.apiBaseUrl}/music/resume`, { guildId }).pipe(
      tap((state) => {
        this.applyRemoteState(state);
        this.isBackendOnlineSubject.next(true);
      }),
      map(() => void 0),
      catchError((err) => {
        console.error('Failed to resume track:', err);
        this.isBackendOnlineSubject.next(false);
        throw err;
      }),
    );
  }

  /**
   * Пропуск текущего трека
   */
  skipTrack(): Observable<void> {
    const guildId = this.selectedGuildIdSubject.value;
    return this.http.post<ApiMusicState>(`${this.apiBaseUrl}/music/skip`, { guildId }).pipe(
      tap((state) => {
        this.applyRemoteState(state);
        this.isBackendOnlineSubject.next(true);
      }),
      map(() => void 0),
      catchError((err) => {
        console.error('Failed to skip track:', err);
        this.isBackendOnlineSubject.next(false);
        throw err;
      }),
    );
  }

  /**
   * Получение текущей очереди
   */
  getQueue(): Observable<Queue> {
    return this.queue$;
  }

  /**
   * Удаление трека из очереди
   */
  removeTrackFromQueue(trackId: string): Observable<void> {
    const guildId = this.selectedGuildIdSubject.value;
    return this.http
      .delete<ApiMusicState>(`${this.apiBaseUrl}/music/queue/${encodeURIComponent(trackId)}`, {
        body: { guildId },
      })
      .pipe(
        tap((state) => {
          this.applyRemoteState(state);
          this.isBackendOnlineSubject.next(true);
        }),
        map(() => void 0),
        catchError((err) => {
          console.error('Failed to remove track from queue:', err);
          this.isBackendOnlineSubject.next(false);
          throw err;
        }),
      );
  }

  private connectRealtime(): void {
    try {
      const token = this.auth.getToken();
      const guildId = this.selectedGuildIdSubject.value;

      // Для SSE используем query param, т.к. EventSource не позволяет выставлять headers
      const params: string[] = [];
      if (token) params.push(`token=${encodeURIComponent(token)}`);
      if (guildId) params.push(`guildId=${encodeURIComponent(guildId)}`);
      const url = params.length ? `${this.apiBaseUrl}/music/stream?${params.join('&')}` : `${this.apiBaseUrl}/music/stream`;

      // Переподключение при смене гильдии: закрываем старый EventSource
      try {
        this.eventSource?.close();
      } catch {
        // ignore
      }
      this.eventSource = new EventSource(url);

      this.eventSource.onmessage = (event) => {
        try {
          const data = this.safeParseState(event.data);
          if (data) {
            // EventSource callbacks могут быть вне Angular zone,
            // из-за чего UI обновляется только при следующем пользовательском событии.
            this.zone.run(() => this.applyRemoteState(data));
          }
        } catch (e) {
          console.warn('SSE message parse failed:', e);
        }
      };

      this.eventSource.onerror = () => {
        // EventSource сам переподключается; на всякий случай дёрнем state один раз
        this.zone.run(() => {
          this.refreshState().subscribe();
          // Если SSE не работает, проверяем статус бэкенда
          this.checkBackendStatus();
        });
      };
    } catch (e) {
      // fallback: если браузер/окружение не поддерживает SSE
      this.refreshState().subscribe();
    }
  }

  private safeParseState(raw: any): ApiMusicState | null {
    if (raw == null) return null;
    if (typeof raw !== 'string') return raw as ApiMusicState;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') {
        return JSON.parse(parsed) as ApiMusicState;
      }
      return parsed as ApiMusicState;
    } catch {
      return null;
    }
  }

  /**
   * Загрузить список гильдий (серверов), где находится бот
   */
  loadGuilds(): Observable<ApiGuild[]> {
    return this.http.get<ApiGuild[]>(`${this.apiBaseUrl}/guilds`).pipe(
      tap((guilds) => {
        const list = guilds || [];
        this.guildsSubject.next(list);

        // Выбор гильдии:
        // - если сохранённый выбор валиден — оставляем
        // - если гильдия ровно одна — выбираем её автоматически
        // - если гильдий несколько — ничего не выбираем (пользователь выберет сам)
        const current = this.selectedGuildIdSubject.value;
        if (!list.length) {
          this.setSelectedGuildId(null);
          return;
        }

        if (current && list.some((g) => g.id === current)) {
          return;
        }

        if (list.length === 1) {
          this.setSelectedGuildId(list[0].id);
          return;
        }

        this.setSelectedGuildId(null);
      }),
      catchError((err) => {
        console.error('Failed to load guilds:', err);
        this.isBackendOnlineSubject.next(false);
        this.guildsSubject.next([]);
        return of([] as ApiGuild[]);
      }),
    );
  }

  setSelectedGuildId(guildId: string | null): void {
    this.selectedGuildIdSubject.next(guildId);
    try {
      if (guildId) localStorage.setItem(this.selectedGuildStorageKey, guildId);
      else localStorage.removeItem(this.selectedGuildStorageKey);
    } catch {
      // ignore
    }
  }
}

type ApiMusicState = {
  botConnected: boolean;
  guildId: string | null;
  playerState: PlayerState;
  queue: Queue;
};

export type ApiGuild = {
  id: string;
  name: string;
  iconUrl: string | null;
};
