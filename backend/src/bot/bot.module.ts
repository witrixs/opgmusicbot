import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { MusicModule } from '../music/music.module';
import { LavalinkModule } from '../lavalink/lavalink.module';

/**
 * Модуль для работы с Discord ботом
 * Инициализирует бота и обрабатывает команды
 */
@Module({
  imports: [MusicModule, LavalinkModule],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
