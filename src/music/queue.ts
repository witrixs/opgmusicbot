import { Track } from 'shoukaku';

/**
 * Интерфейс для трека в очереди
 * Расширяет базовый Track из Shoukaku дополнительной информацией
 */
export interface QueueTrack {
  track: string;
  info: {
    identifier: string;
    isSeekable: boolean;
    isStream: boolean;
    author: string;
    length: number;
    position: number;
    title: string;
    uri: string;
  };
  requesterId?: string;
  requesterName?: string;
}

/**
 * Класс для управления очередью треков на сервере
 * Хранит список треков и управляет их воспроизведением
 */
export class Queue {
  private tracks: QueueTrack[] = [];
  private currentIndex: number = -1;

  /**
   * Добавить трек в очередь
   * @param {QueueTrack} track - Трек для добавления
   */
  add(track: QueueTrack): void {
    this.tracks.push(track);
  }

  /**
   * Добавить несколько треков в очередь
   * @param {QueueTrack[]} tracks - Массив треков для добавления
   */
  addMany(tracks: QueueTrack[]): void {
    this.tracks.push(...tracks);
  }

  /**
   * Получить следующий трек из очереди
   * @returns {QueueTrack | null} Следующий трек или null, если очередь пуста
   */
  next(): QueueTrack | null {
    this.currentIndex++;
    if (this.currentIndex >= this.tracks.length) {
      return null;
    }
    return this.tracks[this.currentIndex];
  }

  /**
   * Установить текущий индекс (используется менеджером плеера после успешного playTrack)
   */
  setCurrentIndex(index: number): void {
    if (index < -1) {
      this.currentIndex = -1;
      return;
    }
    if (index >= this.tracks.length) {
      this.currentIndex = this.tracks.length - 1;
      return;
    }
    this.currentIndex = index;
  }

  /**
   * Получить текущий трек
   * @returns {QueueTrack | null} Текущий трек или null
   */
  current(): QueueTrack | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.tracks.length) {
      return null;
    }
    return this.tracks[this.currentIndex];
  }

  /**
   * Пропустить текущий трек и получить следующий
   * @returns {QueueTrack | null} Следующий трек или null
   */
  skip(): QueueTrack | null {
    return this.next();
  }

  /**
   * Очистить очередь
   */
  clear(): void {
    this.tracks = [];
    this.currentIndex = -1;
  }

  /**
   * Получить все треки в очереди
   * @returns {QueueTrack[]} Массив всех треков
   */
  getAll(): QueueTrack[] {
    return this.tracks;
  }

  /**
   * Получить текущий индекс
   * @returns {number} Текущий индекс или -1 если нет текущего трека
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Получить следующие треки в очереди (без текущего и уже сыгранных)
   * @returns {QueueTrack[]} Массив следующих треков
   */
  getUpcoming(): QueueTrack[] {
    return this.tracks.slice(this.currentIndex + 1);
  }

  /**
   * Получить количество треков в очереди
   * @returns {number} Количество треков
   */
  size(): number {
    return this.tracks.length;
  }

  /**
   * Проверить, пуста ли очередь
   * @returns {boolean} true, если очередь пуста
   */
  isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  /**
   * Удалить трек по индексу
   * @param {number} index - Индекс трека для удаления
   * @returns {boolean} true, если трек был удален
   */
  remove(index: number): boolean {
    if (index < 0 || index >= this.tracks.length) {
      return false;
    }
    this.tracks.splice(index, 1);
    if (index <= this.currentIndex) {
      this.currentIndex--;
    }
    return true;
  }
}
