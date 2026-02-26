/**
 * Модель трека для отображения информации о музыкальной композиции
 */
export interface Track {
  id: string;
  title: string;
  author: string;
  url?: string;
  duration?: number; // в секундах
  thumbnail?: string;
}

/**
 * Модель состояния плеера
 */
export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isPaused: boolean;
  position?: number; // текущая позиция в секундах
}
