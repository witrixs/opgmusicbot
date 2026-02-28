import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { DiscordStrategy } from './discord.strategy';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';

/**
 * AuthModule
 * - Discord OAuth2 (passport-discord)
 * - JWT (passport-jwt)
 *
 * Важно: session не используем — всё на stateless JWT.
 */
@Module({
  imports: [PassportModule.register({ session: false })],
  controllers: [AuthController],
  providers: [AuthService, DiscordStrategy, JwtStrategy],
  exports: [PassportModule],
})
export class AuthModule {}

