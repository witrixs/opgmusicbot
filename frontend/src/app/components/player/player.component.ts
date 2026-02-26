import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiGuild, MusicService } from '../../services/music.service';
import { PlayerState } from '../../models/track.model';
import { Subscription } from 'rxjs';

/**
 * Компонент управления музыкальным плеером
 * Отображает текущий трек и предоставляет кнопки управления
 */
@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css']
})
export class PlayerComponent implements OnInit, OnDestroy {
  // Форма для ввода запроса или URL трека
  trackForm: FormGroup;
  
  // Текущее состояние плеера
  playerState: PlayerState | null = null;
  
  // Флаг подключения бота
  isBotConnected: boolean = false;
  
  // Флаг загрузки (для отображения спиннера при запросах)
  isLoading: boolean = false;

  // Guild picker (если сервер не выбран)
  guildPickerOpen = false;
  guildPickerMandatory = false;
  guilds: ApiGuild[] = [];
  selectedGuildId: string | null = null;
  private pendingAction: { type: 'play'; query: string } | null = null;

  // Warning modal (если пользователь не в голосовом канале)
  warningOpen = false;
  warningMessage = '';
  warningTitle = 'Предупреждение';
  
  // Подписки для отписки при уничтожении компонента
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private musicService: MusicService
  ) {
    // Инициализация формы с валидацией
    this.trackForm = this.fb.group({
      query: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  ngOnInit(): void {
    // Подписка на изменения состояния плеера
    // BehaviorSubject автоматически отправит текущее значение при подписке
    const playerStateSub = this.musicService.playerState$.subscribe(
      (state: PlayerState) => {
        this.playerState = state;
      }
    );

    // Подписка на изменения подключения бота к голосовому каналу
    const botConnectionSub = this.musicService.isBotInChannel$.subscribe(
      (inChannel: boolean) => {
        this.isBotConnected = inChannel;
      }
    );

    const guildsSub = this.musicService.guilds$.subscribe((list) => {
      this.guilds = list || [];
      this.maybeOpenGuildPicker();
    });

    const selectedGuildSub = this.musicService.selectedGuildId$.subscribe((id) => {
      this.selectedGuildId = id ?? null;
      this.maybeOpenGuildPicker();
    });

    this.subscriptions.push(playerStateSub, botConnectionSub, guildsSub, selectedGuildSub);
  }

  ngOnDestroy(): void {
    // Отписка от всех подписок для предотвращения утечек памяти
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Воспроизведение трека по запросу или URL
   */
  onPlay(): void {
    // Важно: бот может быть НЕ подключен к voice сейчас — он подключится после нажатия "Воспроизвести".
    if (!this.trackForm.valid) {
      return;
    }

    const query = this.trackForm.get('query')?.value;
    if (!query) {
      return;
    }

    if (!this.ensureGuildSelectedForPlay(query)) {
      return;
    }

    this.executePlay(query);
  }

  closeGuildPicker(): void {
    // Если выбор обязателен — не даём закрыть модалку
    if (this.guildPickerMandatory) return;
    this.guildPickerOpen = false;
    this.pendingAction = null;
  }

  onGuildPickerBackdropClick(): void {
    if (this.guildPickerMandatory) return;
    this.closeGuildPicker();
  }

  pickGuild(guildId: string): void {
    this.musicService.setSelectedGuildId(guildId);
    this.guildPickerOpen = false;
    this.guildPickerMandatory = false;

    const pending = this.pendingAction;
    this.pendingAction = null;

    if (pending?.type === 'play') {
      this.executePlay(pending.query);
    }
  }

  private ensureGuildSelectedForPlay(query: string): boolean {
    if (this.selectedGuildId) return true;

    if (this.guilds.length === 1) {
      this.musicService.setSelectedGuildId(this.guilds[0].id);
      return true;
    }

    // Если гильдий несколько — просим выбрать
    this.pendingAction = { type: 'play', query };
    this.guildPickerOpen = true;
    this.guildPickerMandatory = true;
    return false;
  }

  private maybeOpenGuildPicker(): void {
    // Если сервер не выбран, а серверов несколько — показываем окно сразу
    if (!this.selectedGuildId && this.guilds.length > 1) {
      this.guildPickerOpen = true;
      this.guildPickerMandatory = true;
      return;
    }

    // Если выбор появился (или серверов <= 1) — снимаем "обязательность"
    if (this.selectedGuildId || this.guilds.length <= 1) {
      this.guildPickerMandatory = false;
    }
  }

  private executePlay(query: string): void {
    this.isLoading = true;
    
    // Вызов mock сервиса для воспроизведения трека
    this.musicService.playTrack(query).subscribe({
      next: () => {
        this.isLoading = false;
        this.trackForm.reset(); // Очистка формы после успешного добавления
      },
      error: (error: any) => {
        console.error('Error playing track:', error);
        this.isLoading = false;
        if (this.handleVoiceGuardError(error)) return;
        alert('Ошибка при воспроизведении трека: ' + (error?.error?.message || error?.message || 'unknown'));
      }
    });
  }

  closeWarning(): void {
    this.warningOpen = false;
    this.warningMessage = '';
    this.warningTitle = 'Предупреждение';
  }

  private handleVoiceGuardError(error: any): boolean {
    const code = error?.error?.code;
    const message = error?.error?.message || error?.message || 'unknown';

    if (code === 'USER_NOT_IN_VOICE') {
      this.warningTitle = 'Вы не в голосовом канале';
      this.warningMessage = message;
      this.warningOpen = true;
      return true;
    }

    if (code === 'USER_NOT_IN_SAME_VOICE') {
      this.warningTitle = 'Вы не в том же канале';
      this.warningMessage = message;
      this.warningOpen = true;
      return true;
    }

    return false;
  }

  /**
   * Пауза текущего трека
   */
  onPause(): void {
    if (!this.isBotConnected || !this.playerState?.isPlaying) {
      return;
    }

    this.musicService.pauseTrack().subscribe({
      error: (error: any) => {
        console.error('Error pausing track:', error);
        if (this.handleVoiceGuardError(error)) return;
        alert('Ошибка при паузе: ' + (error?.message || 'unknown'));
      }
    });
  }

  /**
   * Возобновление воспроизведения
   */
  onResume(): void {
    if (!this.isBotConnected || !this.playerState?.isPaused) {
      return;
    }

    this.musicService.resumeTrack().subscribe({
      error: (error: any) => {
        console.error('Error resuming track:', error);
        if (this.handleVoiceGuardError(error)) return;
        alert('Ошибка при возобновлении: ' + (error?.message || 'unknown'));
      }
    });
  }

  /**
   * Пропуск текущего трека
   */
  onSkip(): void {
    if (!this.isBotConnected) {
      return;
    }

    this.musicService.skipTrack().subscribe({
      error: (error: any) => {
        console.error('Error skipping track:', error);
        if (this.handleVoiceGuardError(error)) return;
        alert('Ошибка при пропуске трека: ' + (error?.message || 'unknown'));
      }
    });
  }

  /**
   * Проверка, можно ли поставить на паузу
   */
  canPause(): boolean {
    return this.isBotConnected && 
           this.playerState !== null && 
           this.playerState.isPlaying && 
           !this.playerState.isPaused;
  }

  /**
   * Проверка, можно ли возобновить воспроизведение
   */
  canResume(): boolean {
    return this.isBotConnected && 
           this.playerState !== null && 
           this.playerState.isPaused;
  }

  /**
   * Проверка, можно ли пропустить трек
   */
  canSkip(): boolean {
    return this.isBotConnected && this.playerState !== null;
  }
}
