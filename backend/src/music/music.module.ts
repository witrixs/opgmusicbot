import { Module } from '@nestjs/common';
import { MusicService } from './music.service';
import { PlayerManager } from './player.manager';
import { LavalinkModule } from '../lavalink/lavalink.module';
import { MusicApiController } from './music.api.controller';
import { MusicEventsService } from './music.events.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Модуль для управления музыкой
 * Предоставляет сервис для работы с музыкой и менеджер плееров
 */
@Module({
  imports: [LavalinkModule, AuthModule],
  providers: [MusicService, PlayerManager, MusicEventsService],
  controllers: [MusicApiController],
  exports: [MusicService, PlayerManager],
})
export class MusicModule {}
