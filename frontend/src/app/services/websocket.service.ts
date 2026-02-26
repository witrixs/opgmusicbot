import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, interval } from 'rxjs';
import { Track } from '../models/track.model';
import { Queue } from '../models/queue.model';
import { PlayerState } from '../models/track.model';

/**
 * Заготовка под real-time обновления (WebSocket/SSE).
 * Сейчас фронт получает актуальные данные через REST API (см. `MusicService`).
 */
@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  // BehaviorSubject для эмуляции WebSocket сообщений о текущем треке
  private trackUpdateSubject = new BehaviorSubject<Track | null>(null);
  public trackUpdate$ = this.trackUpdateSubject.asObservable();

  // BehaviorSubject для эмуляции WebSocket сообщений об очереди
  private queueUpdateSubject = new BehaviorSubject<Queue | null>(null);
  public queueUpdate$ = this.queueUpdateSubject.asObservable();

  // BehaviorSubject для эмуляции WebSocket сообщений о состоянии плеера
  private playerStateUpdateSubject = new BehaviorSubject<PlayerState | null>(null);
  public playerStateUpdate$ = this.playerStateUpdateSubject.asObservable();

  constructor() {
  }

  /**
   * Эмуляция получения обновления трека через WebSocket
   * В реальном приложении это будет вызываться из WebSocket onmessage handler
   */
  emitTrackUpdate(track: Track | null): void {
    this.trackUpdateSubject.next(track);
  }

  /**
   * Эмуляция получения обновления очереди через WebSocket
   */
  emitQueueUpdate(queue: Queue): void {
    this.queueUpdateSubject.next(queue);
  }

  /**
   * Эмуляция получения обновления состояния плеера через WebSocket
   */
  emitPlayerStateUpdate(state: PlayerState): void {
    this.playerStateUpdateSubject.next(state);
  }

  /**
   * Подключение к WebSocket (mock)
   * В реальном приложении здесь будет установка соединения
   */
  connect(): Observable<boolean> {
    return new Observable<boolean>(observer => {
      setTimeout(() => {
        observer.next(true);
        observer.complete();
      }, 100);
    });
  }

  /**
   * Отключение от WebSocket (mock)
   */
  disconnect(): void {
    // no-op
  }
}
