import { Component, HostListener, OnDestroy, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ApiGuild, MusicService } from '../../services/music.service';
import { Queue } from '../../models/queue.model';
import { Track } from '../../models/track.model';

@Component({
  selector: 'app-queue-page',
  templateUrl: './queue-page.component.html',
  styleUrls: ['./queue-page.component.css'],
})
export class QueuePageComponent implements OnInit, OnDestroy {
  sidebarOpen = false;
  guildMenuOpen = false;

  queue$: Observable<Queue>;
  guilds$: Observable<ApiGuild[]>;
  selectedGuild$: Observable<ApiGuild | null>;
  selectedGuildId$: Observable<string | null>;

  dragIndex: number | null = null;
  hoverNumIndex: number | null = null;
  hoverOnPlayIndex: number | null = null;
  dropTargetIndex: number | null = null;
  touchDragActive = false;
  private subs = new Subscription();
  @ViewChild('scrollContainer') scrollContainer: ElementRef<HTMLElement> | null = null;

  private scrollRAF: number | null = null;
  private scrollDirection: 0 | 1 | -1 = 0;
  private readonly edgeZonePx = 80;
  private readonly scrollStepPx = 12;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private touchStartIndex: number | null = null;
  private touchStartedOnRow = false;
  private readonly longPressMs = 400;

  constructor(private readonly musicService: MusicService) {
    this.queue$ = this.musicService.queue$;
    this.guilds$ = this.musicService.guilds$;
    this.selectedGuild$ = this.musicService.selectedGuild$;
    this.selectedGuildId$ = this.musicService.selectedGuildId$;
  }

  ngOnInit(): void {
    this.boundTouchMove = this.onDocumentTouchMoveBound.bind(this);
    this.boundTouchEnd = this.onDocumentTouchEndBound.bind(this);
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    document.addEventListener('touchcancel', this.boundTouchEnd, { passive: false });
  }

  ngOnDestroy(): void {
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
    document.removeEventListener('touchcancel', this.boundTouchEnd);
    this.subs.unsubscribe();
    this.stopEdgeScroll();
    if (this.longPressTimer != null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private boundTouchMove!: (e: TouchEvent) => void;
  private boundTouchEnd!: (e: TouchEvent) => void;
  private onDocumentTouchMoveBound(e: TouchEvent): void {
    this.onDocumentTouchMove(e);
  }
  private onDocumentTouchEndBound(e: TouchEvent): void {
    this.onDocumentTouchEnd(e);
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

  isCurrentTrack(queue: Queue | null, index: number): boolean {
    return queue != null && queue.currentIndex === index;
  }

  getCurrentTrack(queue: Queue | null): Track | null {
    if (!queue || queue.currentIndex < 0 || queue.currentIndex >= queue.tracks.length) return null;
    return queue.tracks[queue.currentIndex] ?? null;
  }

  getNextTrack(queue: Queue | null): Track | null {
    if (!queue) return null;
    const nextIndex = queue.currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= queue.tracks.length) return null;
    return queue.tracks[nextIndex] ?? null;
  }

  playTrackAt(index: number): void {
    this.musicService.playQueueIndex(index).subscribe({
      error: (err) => console.error('Play queue index failed', err),
    });
  }

  formatDuration(duration?: number): string {
    if (duration == null) return '--:--';
    const m = Math.floor(duration / 60);
    const s = duration % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  onDragStart(event: DragEvent, index: number): void {
    this.dragIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  onDragEnd(): void {
    this.dragIndex = null;
    this.stopEdgeScroll();
  }

  onTouchStart(event: TouchEvent, index: number): void {
    if (this.longPressTimer != null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.touchStartedOnRow = true;
    this.touchStartIndex = index;
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.touchDragActive = true;
      this.dragIndex = index;
      this.dropTargetIndex = index;
    }, this.longPressMs);
  }

  onDocumentTouchMove(event: TouchEvent): void {
    if (this.longPressTimer != null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
      this.touchStartedOnRow = false;
      this.touchStartIndex = null;
      return;
    }
    if (!this.touchDragActive || !event.touches?.[0]) return;
    event.preventDefault();
    const t = event.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const row = el?.closest?.('.queue-row');
    if (row) {
      const idx = row.getAttribute('data-index');
      this.dropTargetIndex = idx != null ? parseInt(idx, 10) : null;
    } else {
      this.dropTargetIndex = null;
    }
  }

  onDocumentTouchEnd(event: TouchEvent): void {
    if (this.longPressTimer != null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
      this.touchStartedOnRow = false;
      this.touchStartIndex = null;
      return;
    }
    if (!this.touchDragActive) {
      this.touchStartedOnRow = false;
      return;
    }
    event.preventDefault();
    const from = this.touchStartIndex;
    const to = this.dropTargetIndex ?? from;
    if (from != null && to != null && from !== to) {
      this.musicService.reorderQueue(from, to).subscribe({
        error: (err) => console.error('Reorder failed', err),
      });
    }
    this.touchDragActive = false;
    this.dragIndex = null;
    this.touchStartIndex = null;
    this.dropTargetIndex = null;
    this.touchStartedOnRow = false;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (this.dragIndex === null) return;
    const el = this.scrollContainer?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = event.clientY;
    if (y <= rect.top + this.edgeZonePx) {
      this.startEdgeScroll(el, -1);
    } else if (y >= rect.bottom - this.edgeZonePx) {
      this.startEdgeScroll(el, 1);
    } else {
      this.stopEdgeScroll();
    }
  }

  private startEdgeScroll(el: HTMLElement, direction: 1 | -1): void {
    if (this.scrollDirection === direction) return;
    this.stopEdgeScroll();
    this.scrollDirection = direction;
    const step = (): void => {
      if (this.scrollDirection === 0) return;
      el.scrollTop += this.scrollDirection * this.scrollStepPx;
      this.scrollRAF = requestAnimationFrame(step);
    };
    this.scrollRAF = requestAnimationFrame(step);
  }

  private stopEdgeScroll(): void {
    this.scrollDirection = 0;
    if (this.scrollRAF != null) {
      cancelAnimationFrame(this.scrollRAF);
      this.scrollRAF = null;
    }
  }

  onDrop(event: DragEvent, toIndex: number): void {
    event.preventDefault();
    const fromIndex = this.dragIndex;
    if (fromIndex == null || fromIndex === toIndex) return;
    this.musicService.reorderQueue(fromIndex, toIndex).subscribe({
      error: (err) => console.error('Reorder failed', err),
    });
    this.dragIndex = null;
  }

  removeTrack(trackId: string): void {
    this.musicService.removeTrackFromQueue(trackId).subscribe({
      error: (err) => console.error('Remove failed', err),
    });
  }

  trackById(index: number, track: Track): string {
    return track.id;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.guildMenuOpen = false;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    const w = (event?.target as Window)?.innerWidth;
    if (w != null && w > 768) this.sidebarOpen = false;
  }
}
