import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-discord';

type DiscordGuild = {
  id: string;
  name?: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
};

type DiscordProfile = {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string | null;
  guilds?: DiscordGuild[];
};

function buildAvatarUrl(discordId: string, avatarHash?: string | null): string | null {
  if (!avatarHash) return null;
  // Discord CDN (по умолчанию png; для анимированных аватаров можно проверять префикс "a_")
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=128`;
}

/**
 * Discord OAuth2 стратегия.
 * Scope: identify, guilds
 */
@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor() {
    const clientID = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientID) throw new Error('DISCORD_CLIENT_ID is not set');
    if (!clientSecret) throw new Error('DISCORD_CLIENT_SECRET is not set');

    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const callbackURL = `${backendUrl}/api/auth/discord/callback`;

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['identify', 'guilds'],
    });
  }

  /**
   * validate вызывается после успешной авторизации у Discord.
   * Важно: не сохраняем accessToken/refreshToken в JWT (stateless).
   */
  validate(accessToken: string, refreshToken: string, profile: DiscordProfile, done: Function) {
    const user = {
      discordId: profile.id,
      username: profile.username,
      avatar: buildAvatarUrl(profile.id, profile.avatar ?? null),
      guilds: profile.guilds ?? [],
      // accessToken / refreshToken можно использовать для более глубоких интеграций,
      // но в этом проекте в JWT мы их не кладём.
    };

    done(null, user);
  }
}

