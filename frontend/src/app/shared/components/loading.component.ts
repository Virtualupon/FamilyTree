import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="loading" [class.loading--overlay]="overlay" [class.loading--fullscreen]="fullscreen">
      <mat-spinner [diameter]="size"></mat-spinner>
      @if (message) {
        <p class="loading__message">{{ message }}</p>
      }
    </div>
  `,
  styles: [`
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--ft-spacing-md);
      padding: var(--ft-spacing-xl);
      
      &--overlay {
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.8);
        z-index: 10;
      }
      
      &--fullscreen {
        position: fixed;
        inset: 0;
        background: var(--ft-background);
        z-index: var(--ft-z-modal);
      }
      
      &__message {
        margin: 0;
        color: var(--ft-on-surface-variant);
        font-size: 0.875rem;
      }
    }
  `]
})
export class LoadingComponent {
  @Input() size = 40;
  @Input() message?: string;
  @Input() overlay = false;
  @Input() fullscreen = false;
}
