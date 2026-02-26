import { Module } from '@nestjs/common';
import { LavalinkService } from './lavalink.service';

/**
 * Модуль для работы с Lavalink сервером
 * Предоставляет сервис для подключения к Lavalink через Shoukaku
 */
@Module({
  providers: [LavalinkService],
  exports: [LavalinkService],
})
export class LavalinkModule {}
