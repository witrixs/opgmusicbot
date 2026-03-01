import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnDestroy, Output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, AuthUser } from '../../auth/auth.service';
import { VersionCheckService, VersionState } from '../../services/version-check.service';
import { ToastService } from '../../services/toast.service';
import { CURRENT_VERSION } from '../../constants/version';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnDestroy {
  @Input() isOpen = false;
  @Output() closeSidebar = new EventEmitter<void>();

  versionState: VersionState | null = null;
  readonly fallbackVersion = CURRENT_VERSION;
  private versionSub: Subscription | null = null;

  user: AuthUser | null;
  userMenuOpen = false;
  logoutModalOpen = false;

  menuItems = [
    { icon: 'dashboard', label: 'Панель управления', route: '/dashboard' },
    { icon: 'music', label: 'Плеер', route: '/player' },
    { icon: 'queue', label: 'Очередь', route: '/queue' },
    { icon: 'settings', label: 'Настройки', route: '/settings' }
  ];

  constructor(
    private readonly auth: AuthService,
    public readonly router: Router,
    private readonly versionCheck: VersionCheckService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.user = this.auth.getUserFromToken();
    const isAdmin = this.user?.isAdmin === true;

    if (isAdmin) {
      this.versionSub = this.versionCheck.getState().subscribe(state => {
        this.versionState = state;
        if (!state.isLoading && state.hasUpdate && state.latestVersion != null) {
          this.toast.showUpdateAvailable(state.latestVersion, state.releaseUrl);
        }
        this.cdr.markForCheck();
      });
      this.versionCheck.check();
    } else {
      this.versionState = {
        currentVersion: CURRENT_VERSION,
        latestVersion: null,
        releaseUrl: null,
        hasUpdate: false,
        isLoading: false,
        error: false,
      };
    }
  }

  ngOnDestroy(): void {
    this.versionSub?.unsubscribe();
  }

  isActiveRoute(route: string): boolean {
    const url = this.router.url;
    if (route === '/dashboard') return url === '' || url === '/' || url === '/dashboard';
    return url.startsWith(route);
  }

  onLinkClick() {
    // Закрываем сайдбар на мобильных устройствах при клике на ссылку
    if (window.innerWidth <= 768) {
      this.closeSidebar.emit();
    }
  }

  toggleUserMenu(): void {
    this.userMenuOpen = !this.userMenuOpen;
  }

  closeUserMenu(): void {
    this.userMenuOpen = false;
  }

  openLogoutModal(): void {
    this.logoutModalOpen = true;
    this.closeUserMenu();
  }

  closeLogoutModal(): void {
    this.logoutModalOpen = false;
  }

  confirmLogout(): void {
    this.logoutModalOpen = false;
    this.auth.logout();
    // Перезагрузка — самый надёжный способ сбросить SSE/состояние сервисов
    window.location.href = '/login';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.userMenuOpen) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // Закрываем меню, если клик был вне блока пользователя
    const inside = target.closest('.user-menu');
    if (!inside) this.closeUserMenu();
  }
}
