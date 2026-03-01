import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UpdateToastData {
  latestVersion: string;
  releaseUrl: string | null;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly updateToast$ = new BehaviorSubject<UpdateToastData | null>(null);

  get updateToast(): BehaviorSubject<UpdateToastData | null> {
    return this.updateToast$;
  }

  showUpdateAvailable(latestVersion: string, releaseUrl: string | null): void {
    this.updateToast$.next({ latestVersion, releaseUrl });
  }

  dismissUpdateToast(): void {
    this.updateToast$.next(null);
  }
}
