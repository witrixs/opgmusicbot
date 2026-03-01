import { Component, HostListener } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService, AuthUser } from '../../auth/auth.service';
import { ApiGuild, MusicService } from '../../services/music.service';

@Component({
  selector: 'app-settings-page',
  templateUrl: './settings-page.component.html',
  styleUrls: ['./settings-page.component.css'],
})
export class SettingsPageComponent {
  sidebarOpen = false;
  user: AuthUser | null;
  guilds$: Observable<ApiGuild[]>;
  selectedGuild$: Observable<ApiGuild | null>;
  selectedGuildId$: Observable<string | null>;

  constructor(
    private readonly auth: AuthService,
    private readonly musicService: MusicService
  ) {
    this.user = this.auth.getUserFromToken();
    this.guilds$ = this.musicService.guilds$;
    this.selectedGuild$ = this.musicService.selectedGuild$;
    this.selectedGuildId$ = this.musicService.selectedGuildId$;
  }

  get avatarUrl(): string | null {
    if (!this.user) return null;
    if (this.user.avatar?.startsWith('http')) return this.user.avatar;
    if (this.user.avatar)
      return `https://cdn.discordapp.com/avatars/${this.user.discordId}/${this.user.avatar}.png?size=128`;
    const index = Number(BigInt(this.user.discordId) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: { target?: { innerWidth?: number } }): void {
    if (event?.target?.innerWidth && event.target.innerWidth > 768) {
      this.sidebarOpen = false;
    }
  }
}
