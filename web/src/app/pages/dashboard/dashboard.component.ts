import { Component, HostListener, OnInit } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiGuild, MusicService } from '../../services/music.service';

/**
 * Защищённая панель управления (бывший AppComponent UI).
 */
@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit {
  sidebarOpen = false;
  guildMenuOpen = false;

  botInChannel$: Observable<boolean>;
  backendOnline$: Observable<boolean>;
  queueCount$: Observable<number>;
  guilds$: Observable<ApiGuild[]>;
  selectedGuild$: Observable<ApiGuild | null>;
  selectedGuildId$: Observable<string | null>;

  constructor(private readonly musicService: MusicService) {
    this.botInChannel$ = this.musicService.isBotInChannel$;
    this.backendOnline$ = this.musicService.isBackendOnline$;
    this.queueCount$ = this.musicService.queue$.pipe(map((q) => q.tracks.length));
    this.guilds$ = this.musicService.guilds$;
    this.selectedGuild$ = this.musicService.selectedGuild$;
    this.selectedGuildId$ = this.musicService.selectedGuildId$;
  }

  ngOnInit(): void {
    // Убеждаемся, что PWA мета-теги присутствуют на странице dashboard
    this.ensurePWATags();
  }

  private ensurePWATags(): void {
    // Восстанавливаем манифест, если его нет
    if (!document.querySelector('link[rel="manifest"]')) {
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = 'manifest.json';
      document.head.appendChild(manifestLink);
    }

    // Восстанавливаем Apple PWA мета-теги, если их нет
    const appleTags = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'OPGMusic' },
      { name: 'mobile-web-app-capable', content: 'yes' }
    ];

    appleTags.forEach(({ name, content }) => {
      if (!document.querySelector(`meta[name="${name}"]`)) {
        const meta = document.createElement('meta');
        meta.name = name;
        meta.content = content;
        document.head.appendChild(meta);
      }
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  toggleGuildMenu(): void {
    this.guildMenuOpen = !this.guildMenuOpen;
  }

  closeGuildMenu(): void {
    this.guildMenuOpen = false;
  }

  selectGuild(guildId: string): void {
    this.musicService.setSelectedGuildId(guildId);
    this.guildMenuOpen = false;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.guildMenuOpen = false;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any): void {
    if (event?.target?.innerWidth > 768) {
      this.sidebarOpen = false;
    }
  }
}

