import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'warn' | 'accent';
  icon?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, TranslatePipe],
  template: `
    <div class="confirm-dialog">
      <div class="confirm-dialog__header">
        @if (data.icon) {
          <i [ngClass]="[data.icon, 'confirm-dialog__icon', 'confirm-dialog__icon--' + (data.confirmColor || 'primary')]"
             aria-hidden="true"></i>
        }
        <h2 class="confirm-dialog__title">{{ data.title }}</h2>
      </div>
      
      <div class="confirm-dialog__content">
        <p class="confirm-dialog__message">{{ data.message }}</p>
      </div>
      
      <div class="confirm-dialog__actions">
        <button 
          mat-button 
          (click)="onCancel()"
          class="confirm-dialog__btn confirm-dialog__btn--cancel">
          {{ data.cancelText || ('common.cancel' | translate) }}
        </button>
        <button 
          mat-flat-button 
          [color]="data.confirmColor || 'primary'"
          (click)="onConfirm()"
          class="confirm-dialog__btn confirm-dialog__btn--confirm">
          {{ data.confirmText || ('common.confirm' | translate) }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .confirm-dialog {
      padding: var(--ft-spacing-md);
      max-width: 400px;
      
      &__header {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: var(--ft-spacing-md);
      }
      
      &__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        font-size: 48px;
        margin-bottom: var(--ft-spacing-md);

        &--primary {
          color: var(--ft-primary);
        }

        &--warn {
          color: var(--ft-error);
        }

        &--accent {
          color: var(--ft-accent);
        }
      }
      
      &__title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--ft-on-surface);
      }
      
      &__content {
        margin-bottom: var(--ft-spacing-lg);
      }
      
      &__message {
        margin: 0;
        text-align: center;
        color: var(--ft-on-surface-variant);
        line-height: 1.5;
      }
      
      &__actions {
        display: flex;
        gap: var(--ft-spacing-sm);
        justify-content: center;
        
        @media (max-width: 400px) {
          flex-direction: column-reverse;
        }
      }
      
      &__btn {
        min-width: 100px;
        min-height: var(--ft-touch-target);
      }
    }
  `]
})
export class ConfirmDialogComponent {
  private dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
