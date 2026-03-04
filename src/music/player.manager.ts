import { Injectable, Logger } from '@nestjs/common';
import { Player, VoiceChannelOptions, Node } from 'shoukaku';
import type { Connection } from 'shoukaku';
import { Queue, QueueTrack } from './queue';
import { MusicEventsService } from './music.events.service';
import { LavalinkService } from '../lavalink/lavalink.service';

/**
 * Менеджер для управления плеером Lavalink на сервере
 * Управляет воспроизведением музыки и очередью треков
 */
@Injectable()
export class PlayerManager {
  private readonly logger = new Logger(PlayerManager.name);
  private players: Map<string, Player> = new Map();
  private queues: Map<string, Queue> = new Map();
  private inactivityTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastActiveChannelIds: Map<string, string> = new Map(); // guildId -> channelId для отправки сообщений
  private onQueueEmptyCallback: ((guildId: string) => Promise<void>) | null = null;
  private onDisconnectCallback: ((guildId: string) => Promise<void>) | null = null;
  private onCleanupCallback: ((guildId: string) => Promise<void>) | null = null;
  private lastPlaybackError: Map<
    string,
    { at: number; error: string; message?: string; cause?: string; severity?: string }
  > = new Map();
  private playbackActive: Map<string, boolean> = new Map();
  /** Режим повтора: 'off' — следующий трек, 'one' — повтор текущего */
  private repeatMode: Map<string, 'off' | 'one'> = new Map();
  /** Режим перемешивания: треки в случайном порядке */
  private shuffleMode: Map<string, boolean> = new Map();
  /** При ручной смене трека (skip/previous) не реагировать на 'end', чтобы не вызывать playNext дважды */
  private manualChangeInProgress: Set<string> = new Set();

  constructor(
    private readonly events: MusicEventsService,
    private readonly lavalinkService: LavalinkService,
  ) {}

  /** В Shoukaku v4 connection хранится в shoukaku.connections, а не в player */
  getConnection(guildId: string): Connection | undefined {
    return this.lavalinkService.getClient()?.connections.get(guildId);
  }

  /** Вызвать перед stopTrack() при skip/previous — тогда 'end' не вызовет playNext */
  setManualChangeInProgress(guildId: string, value: boolean): void {
    if (value) this.manualChangeInProgress.add(guildId);
    else this.manualChangeInProgress.delete(guildId);
  }

  setRepeatMode(guildId: string, mode: 'off' | 'one'): void {
    this.repeatMode.set(guildId, mode);
  }

  getRepeatMode(guildId: string): 'off' | 'one' {
    return this.repeatMode.get(guildId) ?? 'off';
  }

  setShuffleMode(guildId: string, enabled: boolean): void {
    this.shuffleMode.set(guildId, enabled);
  }

  getShuffleMode(guildId: string): boolean {
    return this.shuffleMode.get(guildId) ?? false;
  }

  /**
   * Перемотка текущего трека (только для треков с isSeekable)
   * @param guildId - ID гильдии
   * @param positionMs - позиция в миллисекундах
   */
  seek(guildId: string, positionMs: number): void {
    const player = this.players.get(guildId);
    const queue = this.queues.get(guildId);
    if (!player || !player.track || !queue) return;

    const current = queue.current();
    if (!current?.info?.isSeekable || typeof current.info.length !== 'number') return;

    const lengthMs = current.info.length;
    const clamped = Math.max(0, Math.min(positionMs, lengthMs));
    player.seekTo(clamped);
    this.events.emit(guildId, 'player_update');
  }

  /**
   * Полностью очистить музыкальную сессию гильдии (плеер/очередь/ошибки/таймеры).
   * Используется при отключении от войса (в т.ч. если бота кикнули) и при stop/inactivity.
   */
  private async cleanupGuild(guildId: string, reason: string): Promise<void> {
    // таймеры
    this.resetInactivityTimer(guildId);

    // состояния
    this.playbackActive.set(guildId, false);
    this.lastPlaybackError.delete(guildId);
    this.lastActiveChannelIds.delete(guildId);

    // Отключаемся от голосового канала через callback (Shoukaku v4: leaveVoiceChannel)
    if (this.onDisconnectCallback) {
      try {
        await this.onDisconnectCallback(guildId);
      } catch (error) {
        this.logger.error(`Error calling onDisconnectCallback for guild ${guildId}: ${error.message}`);
      }
    }

    // удаляем player/queue (Shoukaku v4: leaveVoiceChannel уже уничтожил connection и player)
    const player = this.players.get(guildId);
    if (player) {
      try {
        if (player.track) {
          await player.stopTrack();
        }
      } catch {
        // ignore
      }
    }

    this.players.delete(guildId);
    this.queues.delete(guildId);
    this.repeatMode.delete(guildId);
    this.shuffleMode.delete(guildId);
    this.manualChangeInProgress.delete(guildId);

    // Вызываем callback для удаления сообщения с плеером (если установлен)
    if (this.onCleanupCallback) {
      try {
        await this.onCleanupCallback(guildId);
      } catch (error) {
        this.logger.error(`Error calling onCleanupCallback for guild ${guildId}: ${error.message}`);
      }
    }

    this.events.emit(guildId, reason);
  }

  /**
   * Публичный сброс музыкальной сессии гильдии.
   */
  async resetGuildSession(guildId: string, reason: string): Promise<void> {
    await this.cleanupGuild(guildId, reason);
  }

  /**
   * Установить callback для вызова когда очередь становится пустой
   * @param callback - Функция для вызова
   */
  setOnQueueEmptyCallback(callback: (guildId: string) => Promise<void>): void {
    this.onQueueEmptyCallback = callback;
  }

  /**
   * Установить callback для вызова при отключении от канала
   * @param callback - Функция для вызова (должна отключить бота от канала через node.leaveChannel)
   */
  setOnDisconnectCallback(callback: (guildId: string) => Promise<void>): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * Установить callback для вызова при очистке сессии (для удаления сообщений)
   * @param callback - Функция для вызова
   */
  setOnCleanupCallback(callback: (guildId: string) => Promise<void>): void {
    this.onCleanupCallback = callback;
  }

  /**
   * В Shoukaku v4 плеер создаётся через shoukaku.joinVoiceChannel() в MusicService.
   * Этот метод оставлен для совместимости, но не используется при обычном flow.
   */
  createPlayer(_guildId: string, _options: VoiceChannelOptions & { node: Node }): Player {
    throw new Error('Shoukaku v4: use shoukaku.joinVoiceChannel() and setPlayer() instead of createPlayer()');
  }

  /**
   * Получить плеер для гильдии
   * @param {string} guildId - ID гильдии Discord
   * @returns {Player | undefined} Плеер или undefined, если не найден
   */
  getPlayer(guildId: string): Player | undefined {
    return this.players.get(guildId);
  }

  /**
   * Установить плеер для гильдии (используется после joinChannel)
   * @param {string} guildId - ID гильдии Discord
   * @param {Player} player - Плеер
   */
  setPlayer(guildId: string, player: Player): void {
    this.players.set(guildId, player);
    
    // Создаем очередь для гильдии, если её нет
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, new Queue());
    }

    // Обработка событий соединения (Shoukaku v4: connection в shoukaku.connections)
    const connection = this.getConnection(guildId);
    if (connection) {
      connection.once('connectionUpdate', (state: number) => {
        if (state === 0) this.logger.log(`Voice connection ready for guild ${guildId}`);
      });
    }

    // Обработка событий плеера
    player.on('start', () => {
      this.playbackActive.set(guildId, true);
      this.events.emit(guildId, 'track_start');
    });

    player.on('end', () => {
      if (this.manualChangeInProgress.has(guildId)) {
        this.logger.log(`Track end ignored (manual change) in guild ${guildId}`);
        return;
      }
      this.logger.log(`Track ended in guild ${guildId}`);
      this.playbackActive.set(guildId, false);
      this.events.emit(guildId, 'track_end');
      if (this.getRepeatMode(guildId) === 'one') {
        this.replayCurrent(guildId);
      } else if (this.getShuffleMode(guildId)) {
        this.playRandom(guildId);
      } else {
        this.playNext(guildId);
      }
    });

    player.on('exception', (data) => {
      const exc = data.exception;
      this.lastPlaybackError.set(guildId, {
        at: Date.now(),
        error: exc?.message || 'TrackExceptionEvent',
        message: exc?.message,
        cause: exc?.cause,
        severity: exc?.severity,
      });

      this.logger.error(
        `Player exception in guild ${guildId}: error="${exc?.message ?? 'TrackExceptionEvent'}"` +
          (exc?.message ? ` message="${exc.message}"` : '') +
          (exc?.cause ? ` cause="${exc.cause}"` : '') +
          (exc?.severity ? ` severity="${exc.severity}"` : ''),
      );

      const queue = this.getQueue(guildId);
      const idx = queue.getCurrentIndex();
      if (idx >= 0) {
        queue.remove(idx);
      }
      this.playbackActive.set(guildId, false);
      this.events.emit(guildId, 'track_exception');
      this.playNext(guildId);
    });

    player.on('closed', (data) => {
      this.logger.warn(`Player closed in guild ${guildId}: ${data.reason}`);
      this.playbackActive.set(guildId, false);
      this.events.emit(guildId, 'ws_closed');
    });
  }

  /**
   * Получить очередь для гильдии
   * @param {string} guildId - ID гильдии Discord
   * @returns {Queue} Очередь треков
   */
  getQueue(guildId: string): Queue {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, new Queue());
    }
    return this.queues.get(guildId)!;
  }

  /**
   * Воспроизвести следующий трек из очереди
   * @param {string} guildId - ID гильдии Discord
   */
  async playNext(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    const queue = this.queues.get(guildId);

    if (!player || !queue) {
      this.logger.warn(`No player or queue for guild ${guildId}`);
      return;
    }

    let connection = this.getConnection(guildId);
    this.logger.log(`Connection state before play: ${connection?.state ?? 'none'}, channelId: ${connection?.channelId ?? 'none'}`);

    if (!connection || connection.state !== 1) {
      this.logger.log(`Waiting for voice connection to be ready for guild ${guildId}...`);
      await new Promise<void>((resolve, reject) => {
        const conn = connection ?? this.getConnection(guildId);
        if (conn?.state === 1) {
          resolve();
          return;
        }
        const timeout = setTimeout(() => {
          conn?.off('connectionUpdate', onReady);
          reject(new Error('Voice connection timeout'));
        }, 20000);

        const onReady = (state: number) => {
          if (state !== 0) return; // 0 = SESSION_READY
          clearTimeout(timeout);
          conn?.off('connectionUpdate', onReady);
          this.logger.log(`Voice connection ready, proceeding with playback for guild ${guildId}`);
          resolve();
        };

        if (conn) {
          conn.once('connectionUpdate', onReady);
        } else {
          reject(new Error('Voice connection not found'));
        }
      }).catch((error) => {
        this.logger.error(`Error waiting for voice connection: ${error.message}`);
        throw error;
      });
    }

    // ВАЖНО: не двигаем currentIndex, пока playTrack не прошёл успешно
    const currentIndex = queue.getCurrentIndex();
    const nextIndex = currentIndex + 1;
    const all = queue.getAll();
    const nextTrack = nextIndex >= 0 && nextIndex < all.length ? all[nextIndex] : null;

    if (!nextTrack) {
      this.logger.log(`Queue is empty for guild ${guildId}`);
      this.playbackActive.set(guildId, false);
      // сообщаем UI что сейчас нечего играть
      this.events.emit(guildId, 'queue_empty');
      // Запускаем таймер неактивности
      this.startInactivityTimer(guildId);
      // Вызываем callback для удаления сообщения с плеером
      if (this.onQueueEmptyCallback) {
        try {
          await this.onQueueEmptyCallback(guildId);
        } catch (error) {
          this.logger.error(`Error in onQueueEmptyCallback: ${error.message}`);
        }
      }
      return;
    }

    // Сбрасываем таймер неактивности при воспроизведении нового трека
    this.resetInactivityTimer(guildId);

    try {
      await player.playTrack({ track: { encoded: nextTrack.track } });
      queue.setCurrentIndex(nextIndex);
      this.lastPlaybackError.delete(guildId);
      this.logger.log(`Playing track: ${nextTrack.info.title} in guild ${guildId}`);
      this.events.emit(guildId, 'track_play');
    } catch (error) {
      this.logger.error(`Error playing track in guild ${guildId}: ${error.message}`);
      this.lastPlaybackError.set(guildId, {
        at: Date.now(),
        error: 'playTrack failed',
        message: error.message,
      });
      // Удаляем проблемный трек и пытаемся следующий
      queue.remove(nextIndex);
      this.events.emit(guildId, 'track_play_failed');
      this.playNext(guildId);
    }
  }

  /**
   * Повторить текущий трек (для режима repeat one)
   * @param {string} guildId - ID гильдии Discord
   */
  async replayCurrent(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    const queue = this.queues.get(guildId);
    if (!player || !queue) return;
    const currentIndex = queue.getCurrentIndex();
    const all = queue.getAll();
    const currentTrack = currentIndex >= 0 && currentIndex < all.length ? all[currentIndex] : null;
    if (!currentTrack) {
      this.playNext(guildId);
      return;
    }
    this.resetInactivityTimer(guildId);
    this.manualChangeInProgress.add(guildId);
    try {
      if (player.track) await player.stopTrack();
      await player.playTrack({ track: { encoded: currentTrack.track } });
      this.lastPlaybackError.delete(guildId);
      this.logger.log(`Replaying track: ${currentTrack.info.title} in guild ${guildId}`);
      this.events.emit(guildId, 'track_play');
    } catch (error) {
      this.manualChangeInProgress.delete(guildId);
      this.logger.error(`Error replaying track in guild ${guildId}: ${(error as Error).message}`);
      this.playNext(guildId);
    }
  }

  /**
   * Воспроизвести предыдущий трек в очереди
   * @param {string} guildId - ID гильдии Discord
   */
  async playPrevious(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    const queue = this.queues.get(guildId);

    if (!player || !queue) {
      this.logger.warn(`No player or queue for guild ${guildId}`);
      return;
    }

    const all = queue.getAll();
    const currentIndex = queue.getCurrentIndex();
    const prevIndex = currentIndex - 1;

    if (prevIndex < 0 || prevIndex >= all.length) {
      this.logger.log(`No previous track for guild ${guildId}`);
      return;
    }

    const prevTrack = all[prevIndex];
    this.resetInactivityTimer(guildId);

    try {
      this.manualChangeInProgress.add(guildId);
      if (player.track) {
        await player.stopTrack();
      }
      await player.playTrack({ track: { encoded: prevTrack.track } });
      queue.setCurrentIndex(prevIndex);
      this.lastPlaybackError.delete(guildId);
      this.playbackActive.set(guildId, true);
      this.logger.log(`Playing previous track: ${prevTrack.info.title} in guild ${guildId}`);
      this.events.emit(guildId, 'track_play');
    } catch (error) {
      this.manualChangeInProgress.delete(guildId);
      this.logger.error(`Error playing previous track in guild ${guildId}: ${error.message}`);
      this.lastPlaybackError.set(guildId, {
        at: Date.now(),
        error: 'playPrevious failed',
        message: (error as Error).message,
      });
      this.playNext(guildId);
    }
  }

  /**
   * Воспроизвести трек в очереди по индексу (переход к выбранному треку)
   */
  async playAtIndex(guildId: string, index: number): Promise<void> {
    const player = this.players.get(guildId);
    const queue = this.queues.get(guildId);
    if (!player || !queue) return;
    const all = queue.getAll();
    if (index < 0 || index >= all.length) return;
    const track = all[index];
    this.resetInactivityTimer(guildId);
    try {
      this.setManualChangeInProgress(guildId, true);
      if (player.track) await player.stopTrack();
      await player.playTrack({ track: { encoded: track.track } });
      queue.setCurrentIndex(index);
      this.lastPlaybackError.delete(guildId);
      this.playbackActive.set(guildId, true);
      this.logger.log(`Playing track at index ${index}: ${track.info.title} in guild ${guildId}`);
      this.events.emit(guildId, 'track_play');
    } catch (error) {
      this.logger.error(`Error playing track at index in guild ${guildId}: ${(error as Error).message}`);
      this.lastPlaybackError.set(guildId, {
        at: Date.now(),
        error: 'playAtIndex failed',
        message: (error as Error).message,
      });
      this.playNext(guildId);
    } finally {
      // Сбрасываем флаг с задержкой: событие 'end' от stopTrack() может прийти асинхронно,
      // и тогда playNext() запустит следующий трек вместо выбранного
      setTimeout(() => this.setManualChangeInProgress(guildId, false), 400);
    }
  }

  /**
   * Воспроизвести случайный трек из очереди (режим shuffle)
   */
  async playRandom(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    const queue = this.queues.get(guildId);
    if (!player || !queue) return;
    const all = queue.getAll();
    if (all.length === 0) {
      this.playbackActive.set(guildId, false);
      this.events.emit(guildId, 'queue_empty');
      this.startInactivityTimer(guildId);
      if (this.onQueueEmptyCallback) {
        try { await this.onQueueEmptyCallback(guildId); } catch (e) { this.logger.error(String(e)); }
      }
      return;
    }
    if (this.getConnection(guildId)?.state !== 1) {
      this.playNext(guildId);
      return;
    }
    const randomIndex = Math.floor(Math.random() * all.length);
    const track = all[randomIndex];
    this.resetInactivityTimer(guildId);
    try {
      await player.playTrack({ track: { encoded: track.track } });
      queue.setCurrentIndex(randomIndex);
      this.lastPlaybackError.delete(guildId);
      this.playbackActive.set(guildId, true);
      this.logger.log(`Playing random track: ${track.info.title} in guild ${guildId}`);
      this.events.emit(guildId, 'track_play');
    } catch (error) {
      this.logger.error(`Error playing random track in guild ${guildId}: ${(error as Error).message}`);
      this.lastPlaybackError.set(guildId, { at: Date.now(), error: 'playRandom failed', message: (error as Error).message });
      this.playNext(guildId);
    }
  }

  /**
   * Запустить таймер неактивности (10 минут)
   * @param {string} guildId - ID гильдии Discord
   */
  private startInactivityTimer(guildId: string): void {
    // Очищаем существующий таймер, если есть
    this.resetInactivityTimer(guildId);

    const player = this.players.get(guildId);
    if (!player) {
      return;
    }

    // Если трек все еще играет, не запускаем таймер
    if (player.track) {
      return;
    }

    this.logger.log(`Starting inactivity timer for guild ${guildId} (10 minutes)`);
    
    const timeout = setTimeout(async () => {
      this.logger.log(`Inactivity timeout reached for guild ${guildId}, disconnecting...`);
      const inactivePlayer = this.players.get(guildId);
      if (inactivePlayer && !inactivePlayer.track) {
        // Бот неактивен 10 минут, отключаемся и очищаем сессию
        this.logger.log(`Bot disconnected due to inactivity in guild ${guildId}`);
        await this.cleanupGuild(guildId, 'inactivity_disconnect');
      }
    }, 10 * 60 * 1000); // 10 минут

    this.inactivityTimers.set(guildId, timeout);
  }

  /**
   * Сбросить таймер неактивности
   * @param {string} guildId - ID гильдии Discord
   */
  resetInactivityTimer(guildId: string): void {
    const timer = this.inactivityTimers.get(guildId);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(guildId);
      this.logger.log(`Inactivity timer reset for guild ${guildId}`);
    }
  }

  /**
   * Удалить плеер для гильдии
   * @param {string} guildId - ID гильдии Discord
   */
  async destroyPlayer(guildId: string): Promise<void> {
    if (this.players.has(guildId) || this.queues.has(guildId)) {
      await this.cleanupGuild(guildId, 'destroy_player');
      this.logger.log(`Player destroyed for guild ${guildId}`);
    }
  }

  /**
   * Проверить, существует ли плеер для гильдии
   * @param {string} guildId - ID гильдии Discord
   * @returns {boolean} true, если плеер существует
   */
  hasPlayer(guildId: string): boolean {
    return this.players.has(guildId);
  }

  /**
   * Получить список guildId, для которых есть активный Player
   */
  getActiveGuildIds(): string[] {
    return Array.from(this.players.keys());
  }

  getLastPlaybackError(
    guildId: string,
  ): { at: number; error: string; message?: string; cause?: string; severity?: string } | null {
    return this.lastPlaybackError.get(guildId) ?? null;
  }

  isPlaybackActive(guildId: string): boolean {
    return this.playbackActive.get(guildId) ?? false;
  }
}
