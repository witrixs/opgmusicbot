import { Component, Input } from '@angular/core';

/**
 * Компонент загрузчика (spinner)
 * Современный анимированный индикатор загрузки
 */
@Component({
  selector: 'app-loader',
  templateUrl: './loader.component.html',
  styleUrls: ['./loader.component.css']
})
export class LoaderComponent {
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() color: 'primary' | 'secondary' | 'success' | 'warning' | 'error' = 'primary';
  @Input() text?: string;
  @Input() inline: boolean = false;
}
