import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService, JwtPayload } from './auth.service';

type DiscordUser = JwtPayload & {
  guilds?: any[];
};

/**
 * OAuth2 endpoints (Discord).
 *
 * URL-ы будут с учётом globalPrefix: `/api/auth/...`
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

    const token = this.authService.signJwt({
      discordId: user.discordId,
      username: user.username,
      avatar: user.avatar ?? null,
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(/\/$/, '');
    res.redirect(`${frontendUrl}/login-success?token=${encodeURIComponent(token)}`);
  }
}

