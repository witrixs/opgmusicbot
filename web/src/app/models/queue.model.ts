import { Track } from './track.model';

/**
 * Модель очереди треков
 */
export interface Queue {
  tracks: Track[];
  currentIndex: number; // индекс текущего трека в очереди
}
