import { Injectable, signal, computed, OnDestroy } from '@angular/core';

/**
 * Service for detecting online/offline network status.
 * Uses Angular signals for reactive state management.
 */
@Injectable({
  providedIn: 'root'
})
export class NetworkService implements OnDestroy {
  private _isOnline = signal(navigator.onLine);

  /** Signal indicating whether the app is currently online */
  readonly isOnline = this._isOnline.asReadonly();

  /** Signal indicating whether the app is currently offline */
  readonly isOffline = computed(() => !this._isOnline());

  private onlineHandler = () => this._isOnline.set(true);
  private offlineHandler = () => this._isOnline.set(false);

  constructor() {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }
}
