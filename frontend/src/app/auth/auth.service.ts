import { Injectable } from '@angular/core';

export type AuthUser = {
  discordId: string;
  username: string;
  avatar: string | null;
};

type JwtPayload = AuthUser & {
  exp?: number; // seconds
};

/**
 * AuthService
 * - хранит JWT в localStorage
 * - умеет проверять срок жизни (exp)
 * - умеет доставать пользователя из payload (без запроса на backend)
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'auth_token';

  getToken(): string | null {
    return localStorage.getItem(this.storageKey);
  }

  setToken(token: string): void {
    localStorage.setItem(this.storageKey, token);
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!token) return false;

    const payload = this.decodeJwt(token);
    if (!payload) return false;

    // Если exp нет — считаем токен невалидным (для безопасности)
    if (!payload.exp) return false;

    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp > nowSec;
  }

  getUserFromToken(): AuthUser | null {
    const token = this.getToken();
    if (!token) return null;

    const payload = this.decodeJwt(token);
    if (!payload?.discordId || !payload?.username) return null;

    return {
      discordId: payload.discordId,
      username: payload.username,
      avatar: payload.avatar ?? null,
    };
  }

  private decodeJwt(token: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
      const raw = this.base64UrlDecode(parts[1]);
      return JSON.parse(raw) as JwtPayload;
    } catch {
      return null;
    }
  }

  private base64UrlDecode(input: string): string {
    // base64url -> base64
    let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    // pad
    const pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);

    // atob работает с latin1; для JSON payload этого достаточно
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(base64), (c: string) => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join(''),
    );
  }
}

