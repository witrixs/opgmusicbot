import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { MusicService } from './music.service';
import { PlayerManager } from './player.manager';
import { QueueTrack } from './queue';
import { MusicEventsService } from './music.events.service';
import { filter, interval, merge } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt.guard';

type ApiTrack = {
  id: string;
  title: string;
  author: string;
  url?: string;
  duration?: number; // seconds
  thumbnail?: string;
};

type ApiQueue = {
  tracks: ApiTrack[];
  currentIndex: number;
};

type ApiPlayerState = {
  currentTrack: ApiTrack | null;
  isPlaying: boolean;
  isPaused: boolean;
  position?: number;
};

type ApiMusicState = {
  botConnected: boolean;
  guildId: string | null;
  playerState: ApiPlayerState;
  queue: ApiQueue;
  repeatMode: 'off' | 'one';
  shuffleMode: boolean;
  lastError?: { at: number; error: string; message?: string; cause?: string; severity?: string } | null;
};

type PlayBody = {
  query: string;
  guildId?: string;
  voiceChannelId?: string;
  requesterId?: string;
  requesterName?: string;
};

@UseGuards(JwtAuthGuard)
@Controller('music')
export class MusicApiController {
  constructor(
    private readonly musicService: MusicService,
    private readonly playerManager: PlayerManager,
    private readonly events: MusicEventsService,
  ) {}

  /**
   * Защита управления музыкой:
   * - пользователь должен быть в voice канале на сервере
   * - если бот уже подключен, пользователь должен быть в том же канале
   */
  private async assertUserCanControl(req: any, guildId: string, botChannelId?: string | null): Promise<string> {
    const jwtUser = req?.user as { discordId?: string; username?: string } | undefined;
    const userId = jwtUser?.discordId;

    if (!userId) {
      // В норме сюда не попадём, т.к. JwtAuthGuard уже отработал.
      throw new BadRequestException({ code: 'AUTH_REQUIRED', message: 'Authentication required' });
    }

    const userVoiceChannelId = await this.musicService.resolveUserVoiceChannelId(guildId, userId);
    if (!userVoiceChannelId) {
      throw new BadRequestException({
        code: 'USER_NOT_IN_VOICE',
        message:
          'Вы должны быть подключены к голосовому каналу на сервере Discord, чтобы управлять ботом. Зайдите в voice-канал и повторите действие.',
      });
    }

    if (botChannelId && userVoiceChannelId !== botChannelId) {
      throw new BadRequestException({
        code: 'USER_NOT_IN_SAME_VOICE',
        message:
          'Вы должны находиться в том же голосовом канале, что и бот, чтобы управлять воспроизведением.',
      });
    }

    return userVoiceChannelId;
  }

  @Get('state')
  getState(@Query('guildId') guildIdQuery?: string): ApiMusicState {
    const resolvedGuildId = this.resolveGuildId(guildIdQuery?.trim() || undefined);
    if (!resolvedGuildId) {
      return this.emptyState();
    }
    return this.buildState(resolvedGuildId);
  }

  /**
   * SSE stream для "живых" обновлений UI без перезагрузки страницы
   */
  @Get('stream')
  stream(@Req() req: any, @Res() res: any, @Query('guildId') guildIdQuery?: string): void {
    // Явно закрепляемся за гильдией из env (или из query), чтобы UI всегда был консистентный.
    // Приоритет: query.guildId -> DEFAULT_GUILD_ID -> GUILD_ID -> DISCORD_GUILD_ID
    const scopedGuildId = (guildIdQuery?.trim() || this.resolveGuildId()) ?? null;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Важно: отправить заголовки сразу, чтобы браузер начал читать стрим
    res.flushHeaders?.();

    const send = () => {
      const payload = scopedGuildId ? this.buildState(scopedGuildId) : this.emptyState();
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // init event
    send();

    const updates$ = scopedGuildId
      ? this.events.events$.pipe(filter((e) => e.guildId === scopedGuildId))
      : this.events.events$;

    const heartbeat$ = interval(15000);

    // Раз в секунду шлём state с актуальной позицией, пока в гильдии играет трек — ползунок обновляется плавно по SSE
    const positionTick$ = interval(1000).pipe(
      filter(() => {
        if (!scopedGuildId) return false;
        const player = this.playerManager.getPlayer(scopedGuildId);
        const isPaused = this.musicService.getPausedState(scopedGuildId);
        return !!player?.track && isPaused !== null;
      }),
    );

    const sub = merge(updates$, heartbeat$, positionTick$).subscribe(() => send());

    req.on('close', () => {
      sub.unsubscribe();
      res.end();
    });
  }

  @Post('play')
  async play(@Req() req: any, @Body() body: PlayBody): Promise<ApiMusicState> {
    const query = (body.query || '').trim();
    if (!query) {
      throw new BadRequestException('query is required');
    }

    const guildId = this.resolveGuildId(body.guildId);
    if (!guildId) {
      throw new BadRequestException(
        'guildId is not set. Provide it in request, or set DEFAULT_GUILD_ID/GUILD_ID in backend .env',
      );
    }

    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;

    // Если бот уже в voice — запрещаем "перетягивать" управление из другого канала
    const userVoiceChannelId = await this.assertUserCanControl(req, guildId, botChannelId);

    const jwtUser = req?.user as { discordId?: string; username?: string } | undefined;

    // voiceChannelId может быть передан явно (например, админским UI), но по умолчанию используем voice пользователя.
    const voiceChannelId =
      body.voiceChannelId ||
      botChannelId ||
      userVoiceChannelId ||
      process.env.DEFAULT_VOICE_CHANNEL_ID ||
      process.env.VOICE_CHANNEL_ID;

    const requesterId = body.requesterId || jwtUser?.discordId || process.env.DEFAULT_REQUESTER_ID || 'web';
    const requesterName = body.requesterName || jwtUser?.username || process.env.DEFAULT_REQUESTER_NAME || 'Web UI';

    await this.musicService.play(guildId, voiceChannelId, query, requesterId, requesterName);
    return this.buildState(guildId);
  }

  @Post('pause')
  async pause(@Req() req: any, @Body() body: { guildId?: string }): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);
    await this.musicService.pause(guildId);
    return this.buildState(guildId);
  }

  @Post('resume')
  async resume(@Req() req: any, @Body() body: { guildId?: string }): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);
    await this.musicService.resume(guildId);
    return this.buildState(guildId);
  }

  @Post('skip')
  async skip(@Req() req: any, @Body() body: { guildId?: string }): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);
    await this.musicService.skip(guildId);
    return this.buildState(guildId);
  }

  @Post('previous')
  async previous(@Req() req: any, @Body() body: { guildId?: string }): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);
    await this.musicService.previous(guildId);
    return this.buildState(guildId);
  }

  @Post('seek')
  async seek(
    @Req() req: any,
    @Body() body: { guildId?: string; position: number },
  ): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const position = Number(body.position);
    if (!Number.isFinite(position) || position < 0) {
      throw new BadRequestException('position must be a non-negative number (seconds)');
    }
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);
    this.musicService.seek(guildId, position);
    return this.buildState(guildId);
  }

  @Post('repeat')
  async setRepeat(
    @Req() req: any,
    @Body() body: { guildId?: string; mode?: 'off' | 'one' },
  ): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const mode = body.mode === 'one' ? 'one' : 'off';
    this.musicService.setRepeatMode(guildId, mode);
    return this.buildState(guildId);
  }

  @Post('shuffle')
  async setShuffle(
    @Req() req: any,
    @Body() body: { guildId?: string; shuffle?: boolean },
  ): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    this.musicService.setShuffleMode(guildId, Boolean(body.shuffle));
    return this.buildState(guildId);
  }

  @Post('stop')
  async stop(@Req() req: any, @Body() body: { guildId?: string }): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);
    await this.musicService.stop(guildId);
    return this.buildState(guildId);
  }

  @Delete('queue/:trackId')
  async removeFromQueue(
    @Req() req: any,
    @Param('trackId') trackId: string,
    @Body() body: { guildId?: string } = {},
  ): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);

    const queue = this.playerManager.getQueue(guildId);
    const all = queue.getAll();

    const idx = all.findIndex((t) => t.info?.identifier === trackId);
    if (idx >= 0) {
      queue.remove(idx);
      this.events.emit(guildId, 'queue_changed');
    }

    return this.buildState(guildId);
  }

  @Post('queue/play-index')
  async playQueueIndex(
    @Req() req: any,
    @Body() body: { guildId?: string; index?: number },
  ): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);
    const index = typeof body.index === 'number' ? body.index : -1;
    const queue = this.playerManager.getQueue(guildId);
    const len = queue.getAll().length;
    if (index < 0 || index >= len) {
      throw new BadRequestException('index must be a valid queue index');
    }
    await this.playerManager.playAtIndex(guildId, index);
    this.events.emit(guildId, 'queue_changed');
    return this.buildState(guildId);
  }

  @Post('queue/reorder')
  async reorderQueue(
    @Req() req: any,
    @Body() body: { guildId?: string; fromIndex?: number; toIndex?: number },
  ): Promise<ApiMusicState> {
    const guildId = this.requireGuildId(body.guildId);
    const existingPlayer = this.playerManager.getPlayer(guildId);
    const botChannelId =
      existingPlayer?.connection?.state === 1 ? (existingPlayer?.connection?.channelId ?? null) : null;
    await this.assertUserCanControl(req, guildId, botChannelId);

    const fromIndex = typeof body.fromIndex === 'number' ? body.fromIndex : -1;
    const toIndex = typeof body.toIndex === 'number' ? body.toIndex : -1;
    const queue = this.playerManager.getQueue(guildId);
    const len = queue.getAll().length;
    if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) {
      throw new BadRequestException('fromIndex and toIndex must be valid queue indices');
    }
    queue.move(fromIndex, toIndex);
    this.events.emit(guildId, 'queue_changed');
    return this.buildState(guildId);
  }

  private requireGuildId(explicit?: string): string {
    const guildId = this.resolveGuildId(explicit);
    if (!guildId) {
      throw new BadRequestException(
        'guildId is not set. Provide it in request, or set DEFAULT_GUILD_ID/GUILD_ID in backend .env',
      );
    }
    return guildId;
  }

  private resolveGuildId(explicit?: string): string | null {
    if (explicit) return explicit;

    const envGuildId = process.env.DEFAULT_GUILD_ID || process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;
    if (envGuildId) return envGuildId;

    return null;
  }

  private emptyState(): ApiMusicState {
    return {
      botConnected: false,
      guildId: null,
      playerState: { currentTrack: null, isPlaying: false, isPaused: false },
      queue: { tracks: [], currentIndex: -1 },
      repeatMode: 'off',
      shuffleMode: false,
      lastError: null,
    };
  }

  private buildState(guildId: string): ApiMusicState {
    const queue = this.playerManager.getQueue(guildId);
    const player = this.playerManager.getPlayer(guildId);

    const all = queue.getAll();
    const rawIndex = queue.getCurrentIndex();

    const tracks = all.map((t) => this.mapQueueTrackToApiTrack(t));

    // ВАЖНО: когда трек закончился и плеер уже не играет, не подсвечиваем "сейчас играет" в UI
    const isPaused = this.musicService.getPausedState(guildId) ?? false;
    const isPlaying = this.playerManager.isPlaybackActive(guildId) && !isPaused;
    const currentIndex = isPlaying || isPaused ? rawIndex : -1;
    const currentTrack = currentIndex >= 0 && currentIndex < tracks.length ? tracks[currentIndex] : null;

    // Позиция воспроизведения в секундах (Lavalink — position в ms)
    const positionSeconds =
      player?.track && typeof player.position === 'number'
        ? Math.floor(player.position / 1000)
        : undefined;

    return {
      botConnected: Boolean(player?.connection?.channelId) && player.connection.state === 1,
      guildId,
      playerState: {
        currentTrack,
        isPlaying,
        isPaused,
        position: positionSeconds,
      },
      queue: {
        tracks,
        currentIndex,
      },
      repeatMode: this.playerManager.getRepeatMode(guildId),
      shuffleMode: this.playerManager.getShuffleMode(guildId),
      lastError: this.playerManager.getLastPlaybackError(guildId),
    };
  }

  private mapQueueTrackToApiTrack(t: QueueTrack): ApiTrack {
    const url = t.info?.uri || undefined;
    const identifier = t.info?.identifier || t.track;
    const thumbnail = this.guessThumbnail(url, identifier);
    const durationSeconds =
      typeof t.info?.length === 'number' ? Math.round(t.info.length / 1000) : undefined;

    return {
      id: identifier,
      title: t.info?.title || 'Unknown',
      author: t.info?.author || 'Unknown',
      url,
      duration: durationSeconds,
      thumbnail,
    };
  }

  private guessThumbnail(url?: string, identifier?: string): string | undefined {
    const candidate = url || '';
    const yt = candidate.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    const videoId = yt?.[1] || (identifier && /^[a-zA-Z0-9_-]{8,}$/.test(identifier) ? identifier : null);
    if (!videoId) return undefined;
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
}

