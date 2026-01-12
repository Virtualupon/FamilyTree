import { Component, signal, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '../../../core/i18n';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const STORAGE_KEY = 'pwa-install-prompt-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

@Component({
  selector: 'app-install-prompt',
  standalone: true,
  imports: [CommonModule, MatButtonModule, TranslatePipe],
  template: `
    @if (showPrompt()) {
      <div class="install-prompt" [class.install-prompt--visible]="isVisible()">
        <div class="install-prompt__content">
          <div class="install-prompt__icon">
            <i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i>
          </div>
          <div class="install-prompt__text">
            <h3 class="install-prompt__title">{{ 'app.install' | translate }} {{ 'app.title' | translate }}</h3>
            <p class="install-prompt__message">
              Add to your home screen for quick access and offline support
            </p>
          </div>
        </div>
        <div class="install-prompt__actions">
          <button
            mat-button
            class="install-prompt__btn install-prompt__btn--dismiss"
            (click)="dismiss()">
            Not now
          </button>
          <button
            mat-flat-button
            color="primary"
            class="install-prompt__btn install-prompt__btn--install"
            (click)="install()">
            <i class="fa-solid fa-download" aria-hidden="true"></i>
            Install
          </button>
        </div>
        <button
          class="install-prompt__close"
          (click)="dismiss()"
          aria-label="Close">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    }
  `,
  styles: [`
    .install-prompt {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: white;
      border-top: 1px solid #F4E4D7;
      box-shadow: 0 -4px 20px rgba(45, 45, 45, 0.1);
      padding: 16px;
      z-index: 1000;
      transform: translateY(100%);
      transition: transform 0.3s ease-out;

      @media (min-width: 768px) {
        bottom: 24px;
        left: 50%;
        right: auto;
        transform: translateX(-50%) translateY(100%);
        max-width: 480px;
        width: calc(100% - 48px);
        border-radius: 16px;
        border: 1px solid #F4E4D7;
      }

      &--visible {
        transform: translateY(0);

        @media (min-width: 768px) {
          transform: translateX(-50%) translateY(0);
        }
      }

      &__content {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 16px;
        padding-right: 32px;
      }

      &__icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        background: linear-gradient(135deg, #E6F5F5 0%, #B3E0DF 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        i.fa-solid {
          font-size: 24px;
          color: #187573;
        }
      }

      &__text {
        flex: 1;
        min-width: 0;
      }

      &__title {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 600;
        color: #2D2D2D;
      }

      &__message {
        margin: 0;
        font-size: 14px;
        color: #6B6B6B;
        line-height: 1.4;
      }

      &__actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      &__btn {
        min-height: 40px;

        i.fa-solid {
          margin-right: 6px;
        }

        &--dismiss {
          color: #6B6B6B;
        }

        &--install {
          background: linear-gradient(135deg, #187573 0%, #2B9A97 100%);
        }
      }

      &__close {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6B6B6B;
        transition: background 0.2s;

        &:hover {
          background: #f5f5f5;
        }

        i.fa-solid {
          font-size: 16px;
        }
      }
    }
  `]
})
export class InstallPromptComponent implements OnInit, OnDestroy {
  showPrompt = signal(false);
  isVisible = signal(false);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private boundHandleBeforeInstallPrompt = this.handleBeforeInstallPrompt.bind(this);

  ngOnInit(): void {
    // Check if already dismissed
    if (this.isDismissed()) {
      return;
    }

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', this.boundHandleBeforeInstallPrompt as EventListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.boundHandleBeforeInstallPrompt as EventListener);
  }

  private handleBeforeInstallPrompt(event: BeforeInstallPromptEvent): void {
    // Prevent the mini-infobar from appearing on mobile
    event.preventDefault();

    // Store the event for later use
    this.deferredPrompt = event;

    // Show our custom prompt after a short delay
    setTimeout(() => {
      this.showPrompt.set(true);
      // Trigger animation
      setTimeout(() => this.isVisible.set(true), 50);
    }, 3000); // Wait 3 seconds before showing
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) {
      return;
    }

    // Show the install prompt
    await this.deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await this.deferredPrompt.userChoice;

    console.log(`Install prompt outcome: ${outcome}`);

    // Clear the deferred prompt
    this.deferredPrompt = null;

    // Hide our custom prompt
    this.hide();
  }

  dismiss(): void {
    // Store dismissal timestamp
    localStorage.setItem(STORAGE_KEY, Date.now().toString());

    // Hide the prompt
    this.hide();
  }

  private hide(): void {
    this.isVisible.set(false);
    setTimeout(() => this.showPrompt.set(false), 300);
  }

  private isDismissed(): boolean {
    const dismissedAt = localStorage.getItem(STORAGE_KEY);
    if (!dismissedAt) {
      return false;
    }

    const dismissedTime = parseInt(dismissedAt, 10);
    const now = Date.now();

    // Check if 7 days have passed
    if (now - dismissedTime > DISMISS_DURATION) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }

    return true;
  }
}
