import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

/**
 * Страница, куда backend редиректит после успешного OAuth:
 * `/login-success?token=JWT`
 */
@Component({
  selector: 'app-login-success',
  templateUrl: './login-success.component.html',
  styleUrls: ['./login-success.component.css'],
})
export class LoginSuccessComponent {
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
  ) {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.router.navigateByUrl('/login?error=missing_token', { replaceUrl: true });
      return;
    }

    this.auth.setToken(token);

    // Сразу уходим на dashboard и убираем token из URL
    this.router.navigateByUrl('/dashboard', { replaceUrl: true });
  }
}

