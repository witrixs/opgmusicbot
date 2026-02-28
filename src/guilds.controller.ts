import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { BotService } from './bot/bot.service';
import { JwtAuthGuard } from './auth/jwt.guard';

type ApiGuild = {
  id: string;
  name: string;
  iconUrl: string | null;
};

/**
 * Список гильдий (серверов), где находится бот.
 * Нужен для выбора сервера в веб-панели.
 */
@UseGuards(JwtAuthGuard)
@Controller('guilds')
export class GuildsController {
  constructor(private readonly botService: BotService) {}

  @Get()
  async getGuilds(@Req() req: any): Promise<ApiGuild[]> {
    const client = this.botService.getClient();
    if (!client?.isReady?.()) return [];

    const userId: string | undefined = req?.user?.discordId;
    if (!userId) return [];

    // Показываем только те сервера, где состоит пользователь (и где есть бот).
    // Проверяем членство через Discord API: guild.members.fetch(userId).
    const guilds = await Promise.all(
      client.guilds.cache.map(async (g) => {
        try {
          await g.members.fetch(userId);
          return {
            id: g.id,
            name: g.name,
            iconUrl: g.iconURL?.({ size: 64 }) ?? null,
          } satisfies ApiGuild;
        } catch {
          return null;
        }
      }),
    );

    return guilds
      .filter((g): g is ApiGuild => Boolean(g))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
}

