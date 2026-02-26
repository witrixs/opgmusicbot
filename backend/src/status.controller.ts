import { Controller, Get } from '@nestjs/common';
import { BotService } from './bot/bot.service';

/**
 * Простой health/status endpoint для фронтенда
 */
@Controller('status')
export class StatusController {
  constructor(private readonly botService: BotService) {}

  @Get()
  getStatus() {
    return {
      ok: true,
      bot: this.botService.getStatus(),
    };
  }
}

