import { Module } from '@nestjs/common';
import { BotModule } from './bot/bot.module';
import { MusicModule } from './music/music.module';
import { LavalinkModule } from './lavalink/lavalink.module';
import { StatusController } from './status.controller';
import { AuthModule } from './auth/auth.module';
import { GuildsController } from './guilds.controller';

/**
 * Главный модуль приложения
 * Импортирует все необходимые модули для работы бота
 */
@Module({
  imports: [AuthModule, BotModule, MusicModule, LavalinkModule],
  controllers: [StatusController, GuildsController],
})
export class AppModule {}
