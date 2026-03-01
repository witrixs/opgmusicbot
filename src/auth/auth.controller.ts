import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService, JwtPayload } from './auth.service';
import { BotService } from '../bot/bot.service';

/** Discord permission: Administrator */
const DISCORD_ADMINISTRATOR = 8;

type DiscordGuildFromProfile = {
  id: string;
  permissions?: string;
  owner?: boolean;
};

type DiscordUser = JwtPayload & {
  guilds?: DiscordGuildFromProfile[];
};

/**
 * OAuth2 endpoints (Discord).
 *
 * URL-ы будут с учётом globalPrefix: `/api/auth/...`
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly botService: BotService,
  ) {}

  /**
   * GET /api/auth/discord
   * Редиректит пользователя на страницу авторизации Discord.
   */
  @Get('discord')
  @UseGuards(AuthGuard('discord'))
  discordLogin(): void {
    // Passport сам сделает redirect на Discord.
  }

  /**
   * GET /api/auth/discord/callback
   * Обрабатывает callback от Discord, генерирует JWT и редиректит на Angular.
   * isAdmin = true, если пользователь владелец или имеет право Administrator хотя бы на одном сервере, где есть бот.
   */
  @Get('discord/callback')
  @UseGuards(AuthGuard('discord'))
  discordCallback(@Req() req: any, @Res() res: any): void {
    const user = req.user as DiscordUser | undefined;

    if (!user?.discordId) {
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
      return;
    }

    const isAdmin = this.computeIsAdmin(user.guilds ?? []);

    const token = this.authService.signJwt({
      discordId: user.discordId,
      username: user.username,
      avatar: user.avatar ?? null,
      isAdmin,
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
    res.redirect(`${frontendUrl}/login-success?token=${encodeURIComponent(token)}`);
  }

  /**
   * true, если пользователь админ (owner или ADMINISTRATOR) хотя бы в одной гильдии, где есть бот.
   */
  private computeIsAdmin(userGuilds: DiscordGuildFromProfile[]): boolean {
    const client = this.botService.getClient();
    const botGuildIds = new Set(client?.guilds?.cache?.map((g) => g.id) ?? []);

    for (const g of userGuilds) {
      if (!botGuildIds.has(g.id)) continue;
      if (g.owner) return true;
      const perm = parseInt(g.permissions ?? '0', 10);
      if ((perm & DISCORD_ADMINISTRATOR) !== 0) return true;
    }
    return false;
  }
}

