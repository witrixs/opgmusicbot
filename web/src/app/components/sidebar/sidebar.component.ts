import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { AuthService, AuthUser } from '../../auth/auth.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @Input() isOpen = false;
  @Output() closeSidebar = new EventEmitter<void>();
  appVersion = '2';

  user: AuthUser | null;
  userMenuOpen = false;
  logoutModalOpen = false;
  
  menuItems = [
    { icon: 'dashboard', label: 'Панель управления', route: '/', active: true },
    { icon: 'music', label: 'Плеер', route: '/player', active: false },
    { icon: 'queue', label: 'Очередь', route: '/queue', active: false },
    { icon: 'settings', label: 'Настройки', route: '/settings', active: false }
  ];

  constructor(private readonly auth: AuthService) {
    this.user = this.auth.getUserFromToken();
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
