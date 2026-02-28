import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirm-modal',
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.css'],
})
export class ConfirmModalComponent {
  @Input() open = false;
  @Input() title = 'Подтвердите действие';
  @Input() message = '';
  @Input() confirmText = 'Подтвердить';
  @Input() cancelText = 'Отмена';
  @Input() danger = false;
  @Input() loading = false;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onBackdropClick(): void {
    if (this.loading) return;
    this.cancel.emit();
  }

  onCancel(): void {
    if (this.loading) return;
    this.cancel.emit();
  }

  onConfirm(): void {
    if (this.loading) return;
    this.confirm.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open || this.loading) return;
    this.cancel.emit();
  }
}

