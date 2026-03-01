import { forwardRef, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { DiscordStrategy } from './discord.strategy';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';
import { BotModule } from '../bot/bot.module';

/**
 * AuthModule
 * - Discord OAuth2 (passport-discord)
 * - JWT (passport-jwt)
 *
 * Важно: session не используем — всё на stateless JWT.
 * forwardRef(BotModule) из-за цикла: AuthModule -> BotModule -> MusicModule -> AuthModule.
 */
@Module({
  imports: [PassportModule.register({ session: false }), forwardRef(() => BotModule)],
  controllers: [AuthController],
  providers: [AuthService, DiscordStrategy, JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}

