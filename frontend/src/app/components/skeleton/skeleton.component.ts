import { Component, Input } from '@angular/core';

/**
 * Компонент skeleton loader
 * Отображает плейсхолдеры контента во время загрузки
 */
@Component({
  selector: 'app-skeleton',
  templateUrl: './skeleton.component.html',
  styleUrls: ['./skeleton.component.css']
})
export class SkeletonComponent {
  @Input() width?: string;
  @Input() height?: string;
  @Input() variant: 'text' | 'circular' | 'rectangular' | 'rounded' = 'text';
  @Input() lines?: number;
  @Input() animation: 'pulse' | 'wave' | 'none' = 'wave';

  getLinesArray(): number[] {
    return Array(this.lines || 1).fill(0).map((_, i) => i);
  }

  getLineWidth(index: number): string {
    if (!this.lines) return '100%';
    // Последняя строка обычно короче
    if (index === this.lines - 1) {
      return '60%';
    }
    return '100%';
  }

  getDefaultHeight(): string {
    switch (this.variant) {
      case 'circular':
        return '40px';
      case 'rectangular':
      case 'rounded':
        return '100px';
      default:
        return '1rem';
    }
  }
}
