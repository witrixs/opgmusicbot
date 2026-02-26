import { Injectable, Logger } from '@nestjs/common';
import { LavalinkService } from '../lavalink/lavalink.service';
import { PlayerManager } from './player.manager';
import { Queue, QueueTrack } from './queue';
import { Node } from 'shoukaku';
import { MusicEventsService } from './music.events.service';

/**
 * Сервис для управления музыкой
 * Обрабатывает команды воспроизведения, паузы, пропуска и управления очередью
 */
@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  private botService: any = null; // Для обратного вызова

  constructor(
    private readonly lavalinkService: LavalinkService,
    private readonly playerManager: PlayerManager,
    private readonly events: MusicEventsService,
  ) {}

  /**
   * Установить BotService для обратных вызовов (для удаления сообщений)
   * @param botService - Экземпляр BotService
   */
  setBotService(botService: any): void {
    this.botService = botService;
    // Устанавливаем callback в PlayerManager для вызова когда очередь пуста
    this.playerManager.setOnQueueEmptyCallback(async (guildId: string) => {
      await this.deletePlayerMessage(guildId);
    });
    // Устанавливаем callback для отключения от канала
    this.playerManager.setOnDisconnectCallback(async (guildId: string) => {
      const shoukaku = this.lavalinkService.getClient();
      if (!shoukaku) {
        return;
      }
      const node = shoukaku.getNode('main') || Array.from(shoukaku.nodes.values())[0];
      if (node) {
        try {
          node.leaveChannel(guildId);
          this.logger.log(`Bot disconnected from voice channel for guild ${guildId}`);
        } catch (error) {
          this.logger.error(`Error disconnecting from channel for guild ${guildId}: ${error.message}`);
        }
      }
    });
    // Устанавливаем callback для удаления сообщения при очистке сессии
    this.playerManager.setOnCleanupCallback(async (guildId: string) => {
      await this.deletePlayerMessage(guildId);
    });
  }

  /**
   * Определить голосовой канал пользователя по его Discord ID.
   *
   * Используется веб-интерфейсом: пользователь авторизован через Discord OAuth,
   * мы получаем `discordId` из JWT и можем понять, в каком voice-канале он находится.
   */
  async resolveUserVoiceChannelId(guildId: string, userId: string): Promise<string | null> {
    const client = this.botService?.getClient?.();
    if (!client || !client.isReady?.()) {
      this.logger.warn('Discord client is not ready yet (resolveUserVoiceChannelId)');
      return null;
    }

    let guild: any = client.guilds?.cache?.get?.(guildId) ?? null;
    if (!guild && client.guilds?.fetch) {
      try {
        guild = await client.guilds.fetch(guildId);
      } catch {
        guild = null;
      }
    }
    if (!guild) return null;

    // Самый надёжный способ — брать из voiceStates cache (GuildVoiceStates intent включен в BotService)
    let vs: any = guild.voiceStates?.cache?.get?.(userId) ?? null;

    // Если по какой-то причине нет — попробуем fetch member (может прогреть кэши)
    if (!vs && guild.members?.fetch) {
      try {
        await guild.members.fetch(userId);
      } catch {
        // ignore
      }
      vs = guild.voiceStates?.cache?.get?.(userId) ?? null;
    }

    return vs?.channelId ?? null;
  }

  /**
   * Удалить сообщение с плеером для гильдии (вызывается когда очередь пуста)
   * @param {string} guildId - ID гильдии Discord
   */
  async deletePlayerMessage(guildId: string): Promise<void> {
    if (this.botService && typeof this.botService.deletePlayerMessage === 'function') {
      try {
        await this.botService.deletePlayerMessage(guildId);
      } catch (error) {
        this.logger.error(`Error calling deletePlayerMessage: ${error.message}`);
      }
    }
  }

  /**
   * Воспроизвести трек или добавить в очередь
   * @param {string} guildId - ID гильдии Discord
   * @param {string} voiceChannelId - ID голосового канала
   * @param {string} query - Поисковый запрос или URL трека
   * @param {string} userId - ID пользователя, запросившего трек
   * @param {string} userName - Имя пользователя
   * @returns {Promise<string>} Сообщение о результате операции
   */
  async play(
    guildId: string,
    voiceChannelId: string,
    query: string,
    userId: string,
    userName: string,
  ): Promise<string> {
    try {
      const shoukaku = this.lavalinkService.getClient();
      
      if (!shoukaku) {
        return '❌ Shoukaku клиент не инициализирован';
      }

      // Проверяем доступность узлов
      if (shoukaku.nodes.size === 0) {
        this.logger.warn('No nodes available in shoukaku.nodes map');
        return '❌ Lavalink узлы не добавлены. Проверьте конфигурацию.';
      }

      // Получаем узел по имени 'main' или первый доступный
      const node = shoukaku.getNode('main') || Array.from(shoukaku.nodes.values())[0];

      if (!node) {
        this.logger.warn(`Node 'main' not found. Available nodes: ${Array.from(shoukaku.nodes.keys()).join(', ')}`);
        return '❌ Lavalink узел недоступен. Узлы еще не подключены.';
      }

      // Форматируем запрос: если это не URL и нет префикса источника, добавляем ytsearch:
      let searchQuery = query.trim();
      const isUrl = /^https?:\/\//.test(searchQuery);
      const hasSourcePrefix = /^(ytsearch|ytmsearch|scsearch|spsearch|amsearch|dzsearch):/.test(searchQuery);
      
      // Проверяем, является ли ссылка Spotify
      const spotifyMatch = searchQuery.match(/open\.spotify\.com\/(track|album|playlist|artist)/);
      
      if (spotifyMatch) {
        const spotifyType = spotifyMatch[1];
        
        if (spotifyType === 'playlist') {
          return '❌ Плейлисты Spotify не поддерживаются из-за DRM защиты.\n💡 **Решение:** Добавляйте треки из плейлиста по одному, используя команду `/play <название трека>`. Бот найдет треки на YouTube.';
        } else if (spotifyType === 'album') {
          return '❌ Альбомы Spotify не поддерживаются из-за DRM защиты.\n💡 **Решение:** Добавляйте треки из альбома по одному, используя команду `/play <название трека>`. Бот найдет треки на YouTube.';
        } else {
          return '❌ Прямые ссылки Spotify не поддерживаются из-за DRM защиты.\n💡 **Решение:** Скопируйте название трека и исполнителя из Spotify и используйте команду `/play <название>`, бот найдет трек на YouTube.';
        }
      }
      
      if (!isUrl && !hasSourcePrefix) {
        // Если это не URL и нет префикса, используем поиск на YouTube
        // ВАЖНО: Lavalink 3.7.0 с Lavaplayer 1.3.99.2 может не поддерживать ytsearch:
        // из-за изменений в API YouTube. Рекомендуется обновить Lavalink до версии 4+,
        // или использовать прямые URL YouTube видео.
        searchQuery = `ytsearch:${searchQuery}`;
      }

      this.logger.log(`Поиск трека с запросом: ${searchQuery}`);

      // Поиск трека
      const result = await node.rest.resolve(searchQuery);

      if (!result) {
        this.logger.error(`Lavalink вернул null для запроса: ${searchQuery}`);
        return '❌ Ошибка при обращении к Lavalink серверу. Проверьте подключение и логи сервера.';
      }

      this.logger.log(`Результат поиска: loadType=${result.loadType}, tracks=${result.tracks.length}`);

      if (result.tracks.length === 0) {
        this.logger.warn(`Трек не найден для запроса: ${searchQuery}, loadType: ${result.loadType}`);
        if (result.loadType === 'LOAD_FAILED') {
          return '❌ Ошибка загрузки трека. Возможно, требуется обновление Lavalink.';
        }
        return '❌ Трек не найден. Попробуйте использовать прямую ссылку на YouTube видео, или обновите Lavalink до версии 4+ для поддержки поиска.';
      }

      const track = result.tracks[0];
      const queue = this.playerManager.getQueue(guildId);

      // Проверяем, не подключен ли бот уже к другому каналу на этом сервере
      const existingPlayer = this.playerManager.getPlayer(guildId);
      const existingState = existingPlayer?.connection?.state;
      const isExistingConnected = existingState === 1; // CONNECTED

      // Если плеер "завис" (бот кикнут/отключен), пересоздаем сессию даже если channelId совпадает
      if (existingPlayer && !isExistingConnected) {
        this.logger.warn(
          `Existing player for guild ${guildId} is not connected (state=${existingState}). Resetting session before play...`,
        );
        try {
          node.leaveChannel(guildId);
        } catch {
          // ignore
        }
        await this.playerManager.resetGuildSession(guildId, 'stale_player');
      } else if (existingPlayer && existingPlayer.connection.channelId && existingPlayer.connection.channelId !== voiceChannelId) {
        this.logger.log(`Bot is already in channel ${existingPlayer.connection.channelId}, disconnecting first...`);
        node.leaveChannel(guildId);
        await this.playerManager.resetGuildSession(guildId, 'switch_channel');
      }

      // Используем правильный метод Node для подключения к голосовому канала
      let player = this.playerManager.getPlayer(guildId);
      if (!player || player.connection.channelId !== voiceChannelId || player.connection.state !== 1) {
        this.logger.log(`Joining voice channel ${voiceChannelId} for guild ${guildId}`);
        player = await node.joinChannel({
          guildId,
          shardId: 0,
          channelId: voiceChannelId,
          deaf: false,
          mute: false,
        });
        this.playerManager.setPlayer(guildId, player);
      }

      // Сбрасываем таймер неактивности при добавлении трека
      this.playerManager.resetInactivityTimer(guildId);

      // Добавляем трек в очередь с информацией о запросившем
      const queueTrack: QueueTrack = {
        track: track.track,
        info: track.info,
        requesterId: userId,
        requesterName: userName,
      };

      queue.add(queueTrack);
      // ВАЖНО: если трек добавили в очередь во время воспроизведения, PlayerManager events не сработают.
      // Поэтому явно пушим обновление для UI.
      this.events.emit(guildId, 'queue_changed');

      // Если плеер не воспроизводит ничего, начинаем воспроизведение
      const isActive = this.playerManager.isPlaybackActive(guildId);
      if (!isActive) {
        await this.playerManager.playNext(guildId);
        return `▶️ Воспроизведение: **${track.info.title}**`;
      } else {
        return `➕ Добавлено в очередь: **${track.info.title}**`;
      }
    } catch (error) {
      this.logger.error(`Error in play: ${error.message}`);
      return `❌ Ошибка при воспроизведении: ${error.message}`;
    }
  }

  /**
   * Получить состояние паузы плеера
   * @param {string} guildId - ID гильдии Discord
   * @returns {boolean | null} true если на паузе, false если играет, null если нет плеера
   */
  getPausedState(guildId: string): boolean | null {
    const player = this.playerManager.getPlayer(guildId);
    if (!player || !player.track) {
      return null;
    }
    return player.paused;
  }

  /**
   * Переключить паузу (поставить на паузу или возобновить)
   * @param {string} guildId - ID гильдии Discord
   * @returns {Promise<{ message: string; isPaused: boolean }>} Сообщение и новое состояние паузы
   */
  async togglePause(guildId: string): Promise<{ message: string; isPaused: boolean }> {
    const player = this.playerManager.getPlayer(guildId);
    if (!player || !player.track) {
      return { message: '❌ Нет активного воспроизведения', isPaused: false };
    }

    if (player.paused) {
      await player.setPaused(false);
      this.events.emit(guildId, 'pause_changed');
      return { message: '▶️ Воспроизведение возобновлено', isPaused: false };
    } else {
      await player.setPaused(true);
      this.events.emit(guildId, 'pause_changed');
      return { message: '⏸️ Воспроизведение поставлено на паузу', isPaused: true };
    }
  }

  /**
   * Поставить воспроизведение на паузу
   * @param {string} guildId - ID гильдии Discord
   * @returns {Promise<string>} Сообщение о результате операции
   */
  async pause(guildId: string): Promise<string> {
    const player = this.playerManager.getPlayer(guildId);
    if (!player || !player.track) {
      return '❌ Нет активного воспроизведения';
    }

    if (player.paused) {
      return '⏸️ Воспроизведение уже на паузе';
    }

    await player.setPaused(true);
    this.events.emit(guildId, 'pause_changed');
    return '⏸️ Воспроизведение поставлено на паузу';
  }

  /**
   * Возобновить воспроизведение
   * @param {string} guildId - ID гильдии Discord
   * @returns {Promise<string>} Сообщение о результате операции
   */
  async resume(guildId: string): Promise<string> {
    const player = this.playerManager.getPlayer(guildId);
    if (!player || !player.track) {
      return '❌ Нет активного воспроизведения';
    }

    if (!player.paused) {
      return '▶️ Воспроизведение уже идет';
    }

    await player.setPaused(false);
    this.events.emit(guildId, 'pause_changed');
    return '▶️ Воспроизведение возобновлено';
  }

  /**
   * Пропустить текущий трек
   * @param {string} guildId - ID гильдии Discord
   * @returns {Promise<string>} Сообщение о результате операции
   */
  async skip(guildId: string): Promise<string> {
    const player = this.playerManager.getPlayer(guildId);
    if (!player || !player.track) {
      return '❌ Нет активного воспроизведения';
    }

    const queue = this.playerManager.getQueue(guildId);
    
    // Останавливаем текущее воспроизведение
    await player.stopTrack();
    this.events.emit(guildId, 'track_skip');
    
    // playNext() сам вызовет queue.next() и начнет воспроизведение следующего трека
    await this.playerManager.playNext(guildId);
    
    const nextTrackInfo = queue.current();
    if (!nextTrackInfo) {
      return '⏭️ Трек пропущен. Очередь пуста';
    }
    
    return `⏭️ Пропущено. Воспроизведение: **${nextTrackInfo.info.title}**`;
  }

  /**
   * Остановить воспроизведение и отключиться от голосового канала
   * @param {string} guildId - ID гильдии Discord
   * @returns {Promise<string>} Сообщение о результате операции
   */
  async stop(guildId: string): Promise<string> {
    const shoukaku = this.lavalinkService.getClient();
    if (!shoukaku) {
      // Всё равно очищаем локальную сессию
      await this.playerManager.resetGuildSession(guildId, 'stop_no_client');
      return '❌ Shoukaku клиент не инициализирован';
    }

    const player = this.playerManager.getPlayer(guildId);
    if (!player) {
      await this.playerManager.resetGuildSession(guildId, 'stop_no_player');
      return '❌ Бот не подключен к голосовому каналу';
    }

    const node = shoukaku.getNode('main') || Array.from(shoukaku.nodes.values())[0];
    if (!node) {
      await this.playerManager.resetGuildSession(guildId, 'stop_no_node');
      return '❌ Lavalink узел недоступен';
    }

    // Останавливаем воспроизведение и отключаемся
    if (player.track) {
      await player.stopTrack();
    }
    
    node.leaveChannel(guildId);
    await this.playerManager.resetGuildSession(guildId, 'stop');
    
    return '⏹️ Воспроизведение остановлено. Бот отключен от голосового канала';
  }

  /**
   * Получить информацию об очереди треков
   * @param {string} guildId - ID гильдии Discord
   * @returns {Promise<string>} Форматированное сообщение с очередью
   */
  async getQueue(guildId: string): Promise<string> {
    const player = this.playerManager.getPlayer(guildId);
    const queue = this.playerManager.getQueue(guildId);

    if (!player || !player.track) {
      if (queue.isEmpty()) {
        return '📋 Очередь пуста';
      }
    }

    // Получаем только следующие треки (без текущего и уже сыгранных)
    const upcomingTracks = queue.getUpcoming();
    
    let message = '📋 **Очередь треков:**\n\n';

    if (upcomingTracks.length > 0) {
      // Показываем максимум 10 следующих треков
      const tracksToShow = upcomingTracks.slice(0, 10);
      message += '**Следующие треки:**\n';
      tracksToShow.forEach((track, index) => {
        message += `${index + 1}. ${track.info.title} - ${track.requesterName || 'Неизвестно'}\n`;
      });
      if (upcomingTracks.length > 10) {
        message += `\n... и еще ${upcomingTracks.length - 10} треков`;
      }
    } else {
      message += 'Нет следующих треков в очереди';
    }

    return message;
  }
}
