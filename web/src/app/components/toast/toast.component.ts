import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.css']
})
export class ToastComponent implements OnInit, OnDestroy {
  data: { latestVersion: string; releaseUrl: string | null } | null = null;
  private sub: Subscription | null = null;

  constructor(private readonly toast: ToastService) {}

  ngOnInit(): void {
    this.sub = this.toast.updateToast.subscribe(d => this.data = d);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  dismiss(): void {
    this.toast.dismissUpdateToast();
  }

  copyCommand(): void {
    const cmd = 'opgbot update';
    navigator.clipboard.writeText(cmd).then(() => {
      // Можно показать краткую подсказку "Скопировано"
      const btn = document.querySelector('.toast-copy-btn') as HTMLElement;
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Скопировано!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    });
  }
}
