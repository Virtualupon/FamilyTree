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
  templateUrl: './install-prompt.component.html',
  styleUrls: ['./install-prompt.component.scss']
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
