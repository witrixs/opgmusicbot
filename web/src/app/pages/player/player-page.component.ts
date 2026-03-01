import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subscription, combineLatest, map } from 'rxjs';
import { ApiGuild, MusicService } from '../../services/music.service';
import { PlayerState } from '../../models/track.model';

export interface PlayerPageVm {
  state: PlayerState | null;
  connected: boolean;
  queue: { currentIndex: number };
  repeat: 'off' | 'one';
  shuffle: boolean;
}

/** Количество полос эквалайзера на полный фон */
const EQ_FULL_BAR_COUNT = 64;

/**
 * Страница полноценного плеера в стиле Spotify:
 * обложка трека, предыдущий/пауза·воспроизведение/следующий, повтор трека.
 */
@Component({
  selector: 'app-player-page',
  templateUrl: './player-page.component.html',
  styleUrls: ['./player-page.component.css'],
})
export class PlayerPageComponent implements OnInit, OnDestroy {
  sidebarOpen = false;
  guildMenuOpen = false;
  /** Массив для *ngFor полос эквалайзера на весь фон */
  eqBarCount = Array(EQ_FULL_BAR_COUNT).fill(0);

  playerState$: Observable<PlayerState>;
  /** Объединённая модель для шаблона (без pipe в обработчиках) */
  vm$: Observable<PlayerPageVm>;
  guilds$: Observable<ApiGuild[]>;
  selectedGuild$: Observable<ApiGuild | null>;
  selectedGuildId$: Observable<string | null>;

  private subs = new Subscription();

  constructor(private readonly musicService: MusicService) {
    this.playerState$ = this.musicService.playerState$;
    this.vm$ = combineLatest({
      state: this.musicService.playerState$,
      connected: this.musicService.isBotInChannel$,
      queue: this.musicService.queue$,
      repeat: this.musicService.repeatMode$,
      shuffle: this.musicService.shuffleMode$,
    }).pipe(
      map(({ state, connected, queue, repeat, shuffle }) => ({
        state,
        connected,
        queue: { currentIndex: queue?.currentIndex ?? -1 },
        repeat: repeat ?? 'off',
        shuffle: shuffle ?? false,
      })),
    );
    this.guilds$ = this.musicService.guilds$;
    this.selectedGuild$ = this.musicService.selectedGuild$;
    this.selectedGuildId$ = this.musicService.selectedGuildId$;
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /** Перемотка на позицию (секунды) */
  onSeek(positionSeconds: number): void {
    this.musicService.seek(positionSeconds).subscribe({
      error: (err) => console.error('Seek failed', err),
    });
  }

  /** Доля пройденного (0–100) для заливки ползунка */
  seekPercent(position?: number, duration?: number): number {
    if (!duration || duration <= 0) return 0;
    const pos = position ?? 0;
    return Math.min(100, (pos / duration) * 100);
  }

  /** Форматирование времени мм:сс */
  formatTime(seconds?: number): string {
    if (seconds == null || !Number.isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  toggleGuildMenu(): void {
    this.guildMenuOpen = !this.guildMenuOpen;
  }

  selectGuild(guildId: string): void {
    this.musicService.setSelectedGuildId(guildId);
    this.guildMenuOpen = false;
  }

  onPrevious(): void {
    this.musicService.previousTrack().subscribe({
      error: (err) => console.error('Previous failed', err),
    });
  }

  onPlayPause(playerState: PlayerState | null, isConnected: boolean): void {
    if (!isConnected || !playerState) return;
    if (playerState.isPaused) {
      this.musicService.resumeTrack().subscribe({ error: (e) => console.error(e) });
    } else {
      this.musicService.pauseTrack().subscribe({ error: (e) => console.error(e) });
    }
  }

  onNext(): void {
    this.musicService.skipTrack().subscribe({
      error: (err) => console.error('Skip failed', err),
    });
  }

  toggleRepeat(repeatMode: 'off' | 'one'): void {
    const next = repeatMode === 'one' ? 'off' : 'one';
    this.musicService.setRepeatMode(next).subscribe({ error: (e) => console.error(e) });
  }

  toggleShuffle(shuffle: boolean): void {
    this.musicService.setShuffleMode(!shuffle).subscribe({ error: (e) => console.error(e) });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.guildMenuOpen = false;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    if (event?.target?.innerWidth > 768) {
      this.sidebarOpen = false;
    }
  }
}
