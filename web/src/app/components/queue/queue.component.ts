import { Component, OnInit, OnDestroy } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { MusicService } from '../../services/music.service';
import { Queue } from '../../models/queue.model';
import { Track } from '../../models/track.model';
import { Subscription } from 'rxjs';

/**
 * Компонент отображения очереди треков
 * Показывает список треков в очереди и позволяет удалять их
 */
@Component({
  selector: 'app-queue',
  templateUrl: './queue.component.html',
  styleUrls: ['./queue.component.css'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class QueueComponent implements OnInit, OnDestroy {
  // Текущая очередь треков
  queue: Queue | null = null;
  
  // Флаг подключения бота
  isBotConnected: boolean = false;
  
  // Флаг загрузки
  isLoading: boolean = true;

  // Модалка удаления
  deleteModalOpen = false;
  deleteModalLoading = false;
  deleteTarget: { id: string; title: string; author: string } | null = null;

  // Warning modal (если пользователь не в голосовом канале / не в том же канале)
  warningOpen = false;
  warningTitle = 'Предупреждение';
  warningMessage = '';

  // Наведение на строку трека — показать иконку play
  hoverNumIndex: number | null = null;
  // Наведение на сам значек play/номер — показать обводку
  hoverOnPlayIndex: number | null = null;
  
  // Подписки для отписки при уничтожении компонента
  private subscriptions: Subscription[] = [];

  constructor(private musicService: MusicService) {}

  ngOnInit(): void {
    // Имитация загрузки при инициализации
    setTimeout(() => {
      this.isLoading = false;
    }, 800);

    // Подписка на изменения очереди
    // BehaviorSubject автоматически отправит текущее значение при подписке
    const queueSub = this.musicService.queue$.subscribe(
      (queue: Queue) => {
        this.queue = queue;
        // Небольшая задержка для плавного перехода
        if (this.isLoading) {
          setTimeout(() => {
            this.isLoading = false;
          }, 300);
        }
      }
    );

    // Подписка на изменения подключения бота к голосовому каналу
    const botConnectionSub = this.musicService.isBotInChannel$.subscribe(
      (inChannel: boolean) => {
        this.isBotConnected = inChannel;
      }
    );

    this.subscriptions.push(queueSub, botConnectionSub);
  }

  ngOnDestroy(): void {
    // Отписка от всех подписок для предотвращения утечек памяти
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Проверка, является ли трек текущим
   */
  isCurrentTrack(originalIndex: number): boolean {
    return this.queue !== null && this.queue.currentIndex === originalIndex;
  }

  get displayedTracks(): Array<{ track: Track; originalIndex: number }> {
    if (!this.queue) return [];
    return this.queue.tracks.map((track, originalIndex) => ({ track, originalIndex })).reverse();
  }

  trackByTrackId(index: number, item: { track: Track; originalIndex: number }): string {
    return item.track.id;
  }

  /**
   * Удаление трека из очереди
   */
  removeTrack(trackId: string): void {
    const track = this.queue?.tracks.find((t) => t.id === trackId);
    this.deleteTarget = track
      ? { id: track.id, title: track.title, author: track.author }
      : { id: trackId, title: 'Трек', author: '' };

    this.deleteModalOpen = true;
  }

  closeDeleteModal(): void {
    if (this.deleteModalLoading) return;
    this.deleteModalOpen = false;
    this.deleteTarget = null;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.deleteModalLoading = true;

    this.musicService.removeTrackFromQueue(this.deleteTarget.id).subscribe({
      next: () => {
        this.deleteModalLoading = false;
        this.closeDeleteModal();
      },
      error: (error: any) => {
        console.error('Error removing track:', error);
        this.deleteModalLoading = false;
        this.closeDeleteModal();
        const code = error?.error?.code;
        const message = error?.error?.message || error?.message || 'unknown';

        if (code === 'USER_NOT_IN_VOICE') {
          this.warningTitle = 'Вы не в голосовом канале';
          this.warningMessage = message;
          this.warningOpen = true;
          return;
        }
        if (code === 'USER_NOT_IN_SAME_VOICE') {
          this.warningTitle = 'Вы не в том же канале';
          this.warningMessage = message;
          this.warningOpen = true;
          return;
        }

        alert('Ошибка при удалении трека: ' + message);
      },
    });
  }

  closeWarning(): void {
    this.warningOpen = false;
    this.warningTitle = 'Предупреждение';
    this.warningMessage = '';
  }

  /**
   * Включить трек в очереди по индексу
   */
  playTrackAt(originalIndex: number): void {
    this.musicService.playQueueIndex(originalIndex).subscribe({
      error: (err) => console.error('Play queue index failed', err),
    });
  }

  /**
   * Форматирование длительности трека в минуты:секунды
   */
  formatDuration(duration?: number): string {
    if (!duration) {
      return '--:--';
    }
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}
