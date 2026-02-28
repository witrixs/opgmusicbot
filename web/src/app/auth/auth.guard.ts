import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guard для защиты страниц панели управления.
 */
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): boolean | UrlTree {
    if (this.auth.isLoggedIn()) return true;
    return this.router.parseUrl('/login');
  }
}

