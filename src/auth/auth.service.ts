import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

export type JwtPayload = {
  discordId: string;
  username: string;
  avatar: string | null;
};

/**
 * Сервис для генерации JWT.
 * JWT хранит только минимальные данные пользователя, без access_token.
 */
@Injectable()
export class AuthService {
  signJwt(payload: JwtPayload): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Явный фейл при отсутствии секрета, чтобы не запускаться "тихо" без защиты
      throw new Error('JWT_SECRET is not set');
    }

    return jwt.sign(payload, secret, {
      expiresIn: '7d',
    });
  }
}

