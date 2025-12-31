import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { NetworkService } from '../../core/services/network.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-offline',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  template: `
    <div class="offline-page">
      <div class="offline-page__container">
        <div class="offline-page__icon">
          <i class="fa-solid fa-wifi" aria-hidden="true"></i>
          <div class="offline-page__icon-slash"></div>
        </div>

        <h1 class="offline-page__title">You're Offline</h1>

        <p class="offline-page__message">
          It looks like you've lost your internet connection.
          Please check your network settings and try again.
        </p>

        <div class="offline-page__actions">
          <button
            mat-flat-button
            color="primary"
            class="offline-page__btn"
            (click)="tryAgain()">
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
            Try Again
          </button>

          @if (networkService.isOnline()) {
            <button
              mat-stroked-button
              class="offline-page__btn offline-page__btn--secondary"
              (click)="goHome()">
              <i class="fa-solid fa-house" aria-hidden="true"></i>
              Go Home
            </button>
          }
        </div>

        <div class="offline-page__tips">
          <h3>While you're offline:</h3>
          <ul>
            <li>Check your WiFi or mobile data connection</li>
            <li>Try moving closer to your router</li>
            <li>Restart your device if the problem persists</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .offline-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #FAF7F1 0%, #FFF9F5 100%);
      padding: 24px;

      &__container {
        max-width: 400px;
        text-align: center;
      }

      &__icon {
        position: relative;
        width: 120px;
        height: 120px;
        margin: 0 auto 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #FFF8F0 0%, #FFEDD5 100%);
        border-radius: 50%;
        border: 3px solid #F4E4D7;

        i.fa-solid {
          font-size: 48px;
          color: #E85D35; // Nubian orange
        }
      }

      &__icon-slash {
        position: absolute;
        width: 80px;
        height: 4px;
        background: #E85D35;
        transform: rotate(-45deg);
        border-radius: 2px;
      }

      &__title {
        margin: 0 0 16px;
        font-size: 28px;
        font-weight: 700;
        color: #2D2D2D;
        font-family: 'Cinzel', serif;
      }

      &__message {
        margin: 0 0 32px;
        font-size: 16px;
        color: #6B6B6B;
        line-height: 1.6;
      }

      &__actions {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 32px;
      }

      &__btn {
        min-height: 48px;
        font-size: 16px;

        i.fa-solid {
          margin-right: 8px;
        }

        &--secondary {
          color: #187573;
          border-color: #187573;
        }
      }

      &__tips {
        padding: 20px;
        background: white;
        border-radius: 12px;
        border: 1px solid #F4E4D7;
        text-align: left;

        h3 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 600;
          color: #2D2D2D;
        }

        ul {
          margin: 0;
          padding-left: 20px;
          color: #6B6B6B;
          font-size: 14px;
          line-height: 1.8;
        }
      }
    }
  `]
})
export class OfflineComponent {
  readonly networkService = inject(NetworkService);
  private readonly router = inject(Router);

  tryAgain(): void {
    window.location.reload();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
