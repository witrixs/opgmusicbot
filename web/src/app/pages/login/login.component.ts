import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { AuthService } from '../../auth/auth.service';
import { API_BASE_URL } from '../../config/api.config';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit, OnDestroy {
  error: string | null = null;

  private readonly apiBaseUrl = API_BASE_URL.replace(/\/$/, '') || '/api';

  private manifestLink: HTMLLinkElement | null = null;
  private appleMetaTags: HTMLMetaElement[] = [];
  private originalTitle: string = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly title: Title,
    route: ActivatedRoute,
  ) {
    this.error = route.snapshot.queryParamMap.get('error');

    // Если токен уже есть и валиден — сразу в dashboard
    if (this.auth.isLoggedIn()) {
      this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    }
  }

  ngOnInit(): void {
    // Сохраняем оригинальный title и устанавливаем новый для страницы логина
    this.originalTitle = this.title.getTitle();
    this.title.setTitle('Авторизация // OPGMusic');
    
    // Удаляем PWA мета-теги на странице логина
    this.removePWATags();
  }

  ngOnDestroy(): void {
    // Восстанавливаем оригинальный title
    if (this.originalTitle) {
      this.title.setTitle(this.originalTitle);
    }
    
    // Восстанавливаем PWA мета-теги при уходе со страницы логина
    this.restorePWATags();
  }

  private removePWATags(): void {
    // Удаляем манифест
    this.manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
    if (this.manifestLink) {
      this.manifestLink.remove();
    }

    // Удаляем Apple PWA мета-теги
    const appleTags = [
      'apple-mobile-web-app-capable',
      'apple-mobile-web-app-status-bar-style',
      'apple-mobile-web-app-title',
      'mobile-web-app-capable'
    ];

    appleTags.forEach(name => {
      const tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (tag) {
        // Сохраняем копию атрибутов перед удалением
        const savedTag = document.createElement('meta');
        savedTag.name = tag.name;
        savedTag.content = tag.content || '';
        this.appleMetaTags.push(savedTag);
        tag.remove();
      }
    });
  }

  private restorePWATags(): void {
    // Восстанавливаем манифест
    if (this.manifestLink && !document.querySelector('link[rel="manifest"]')) {
      document.head.appendChild(this.manifestLink);
    }

    // Восстанавливаем Apple мета-теги
    this.appleMetaTags.forEach(tag => {
      if (!document.querySelector(`meta[name="${tag.name}"]`)) {
        document.head.appendChild(tag);
      }
    });
    this.appleMetaTags = [];
  }

  loginWithDiscord(): void {
    // Важно: OAuth выполняем на backend, без client secret на фронте.
    window.location.href = `${this.apiBaseUrl}/auth/discord`;
  }
}

