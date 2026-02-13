import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';

import { SupportTicketService } from '../../core/services/support-ticket.service';
import { TranslatePipe, I18nService } from '../../core/i18n';
import { TicketCategory } from '../../core/models/support-ticket.models';

@Component({
  selector: 'app-submit-ticket-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatChipsModule,
    TranslatePipe
  ],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <i class="fa-solid fa-ticket" aria-hidden="true"></i>
      {{ 'support.submitTicket' | translate }}
    </h2>

    <mat-dialog-content class="dialog-content">
      <form [formGroup]="form" class="ticket-form">

        <!-- Category Toggle -->
        <div class="form-section">
          <label class="form-label">{{ 'support.category.label' | translate }}</label>
          <mat-button-toggle-group formControlName="category" class="category-toggle">
            <mat-button-toggle [value]="TicketCategory.Bug" class="toggle-bug">
              <i class="fa-solid fa-bug" aria-hidden="true"></i>
              {{ 'support.category.bug' | translate }}
            </mat-button-toggle>
            <mat-button-toggle [value]="TicketCategory.Enhancement" class="toggle-enhancement">
              <i class="fa-solid fa-lightbulb" aria-hidden="true"></i>
              {{ 'support.category.enhancement' | translate }}
            </mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <!-- Subject -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'support.form.subject' | translate }}</mat-label>
          <input matInput formControlName="subject" maxlength="200"
                 [placeholder]="'support.form.subjectPlaceholder' | translate">
          <mat-hint align="end">{{ form.get('subject')?.value?.length || 0 }}/200</mat-hint>
          @if (form.get('subject')?.hasError('required') && form.get('subject')?.touched) {
            <mat-error>{{ 'support.form.subjectRequired' | translate }}</mat-error>
          }
        </mat-form-field>

        <!-- Description -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'support.form.description' | translate }}</mat-label>
          <textarea matInput formControlName="description" rows="4"
                    [placeholder]="'support.form.descriptionPlaceholder' | translate">
          </textarea>
          @if (form.get('description')?.hasError('required') && form.get('description')?.touched) {
            <mat-error>{{ 'support.form.descriptionRequired' | translate }}</mat-error>
          }
        </mat-form-field>

        <!-- Steps to Reproduce (only for bugs) -->
        @if (form.get('category')?.value === TicketCategory.Bug) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'support.form.stepsToReproduce' | translate }}</mat-label>
            <textarea matInput formControlName="stepsToReproduce" rows="3"
                      [placeholder]="'support.form.stepsPlaceholder' | translate">
            </textarea>
          </mat-form-field>
        }

        <!-- Attachments -->
        <div class="form-section">
          <label class="form-label">
            {{ 'support.form.attachments' | translate }}
            <span class="form-hint">{{ 'support.form.attachmentsHint' | translate }}</span>
          </label>

          <input type="file" #fileInput hidden
                 accept="image/jpeg,image/png,image/gif,image/webp"
                 multiple
                 (change)="onFilesSelected($event)">

          <div class="attachments-area">
            @if (selectedFiles().length > 0) {
              <div class="attachment-previews">
                @for (file of selectedFiles(); track file.name; let i = $index) {
                  <div class="attachment-preview">
                    <img [src]="filePreviews()[i]" [alt]="file.name" class="preview-img">
                    <button type="button" class="remove-btn" (click)="removeFile(i)"
                            [matTooltip]="'common.remove' | translate">
                      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                    <span class="file-name">{{ file.name }}</span>
                    <span class="file-size">{{ ticketService.formatFileSize(file.size) }}</span>
                  </div>
                }
              </div>
            }

            @if (selectedFiles().length < 5) {
              <button type="button" class="add-file-btn" (click)="fileInput.click()">
                <i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>
                <span>{{ 'support.form.addImages' | translate }}</span>
              </button>
            }
          </div>

          @if (fileError()) {
            <div class="file-error">
              <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
              {{ fileError() }}
            </div>
          }
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end" class="dialog-actions">
      <button mat-button mat-dialog-close [disabled]="submitting()">
        {{ 'common.cancel' | translate }}
      </button>
      <button mat-flat-button color="primary"
              [disabled]="form.invalid || submitting()"
              (click)="submit()">
        @if (submitting()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          {{ 'support.form.submit' | translate }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--ft-charcoal, #333);
      font-size: 1.25rem;
      margin: 0;

      i { color: var(--ft-teal, #187573); }
    }

    .dialog-content {
      min-width: 480px;
      max-width: 600px;
      padding: 16px 24px !important;
    }

    .ticket-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--ft-charcoal, #333);
    }

    .form-hint {
      font-weight: 400;
      color: #888;
      font-size: 0.75rem;
      margin-inline-start: 4px;
    }

    .category-toggle {
      width: 100%;

      .mat-button-toggle {
        flex: 1;
      }

      .toggle-bug.mat-button-toggle-checked {
        background: #fff3e0;
        color: #e65100;
      }

      .toggle-enhancement.mat-button-toggle-checked {
        background: #e8f5e9;
        color: #2e7d32;
      }

      i { margin-inline-end: 6px; }
    }

    .full-width {
      width: 100%;
    }

    .attachments-area {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .attachment-previews {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .attachment-preview {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100px;
      gap: 4px;

      .preview-img {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 8px;
        border: 2px solid #e0e0e0;
      }

      .remove-btn {
        position: absolute;
        top: -6px;
        right: 4px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: none;
        background: #f44336;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
      }

      .file-name {
        font-size: 0.65rem;
        color: #666;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100px;
      }

      .file-size {
        font-size: 0.6rem;
        color: #999;
      }
    }

    .add-file-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      border: 2px dashed #ccc;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
      color: #666;
      transition: all 0.2s;

      &:hover {
        border-color: var(--ft-teal, #187573);
        color: var(--ft-teal, #187573);
        background: #f5fffe;
      }

      i { font-size: 1.2rem; }
    }

    .file-error {
      color: #f44336;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .dialog-actions {
      padding: 12px 24px;

      button {
        min-width: 100px;
      }

      mat-spinner {
        display: inline-block;
      }
    }

    @media (max-width: 600px) {
      .dialog-content {
        min-width: unset;
        max-width: unset;
      }
    }
  `]
})
export class SubmitTicketDialogComponent {
  private readonly fb = inject(FormBuilder);
  readonly ticketService = inject(SupportTicketService);
  private readonly dialogRef = inject(MatDialogRef<SubmitTicketDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  readonly TicketCategory = TicketCategory;

  submitting = signal(false);
  selectedFiles = signal<File[]>([]);
  filePreviews = signal<string[]>([]);
  fileError = signal<string>('');

  form: FormGroup = this.fb.group({
    category: [TicketCategory.Bug, Validators.required],
    subject: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.required],
    stepsToReproduce: ['']
  });

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const currentFiles = this.selectedFiles();
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    this.fileError.set('');

    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];

      // Check total count
      if (currentFiles.length + newFiles.length >= 5) {
        this.fileError.set(this.i18n.t('support.form.maxFilesError'));
        break;
      }

      // Validate type
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
        this.fileError.set(this.i18n.t('support.form.invalidFileType'));
        continue;
      }

      // Validate size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        this.fileError.set(this.i18n.t('support.form.fileTooLarge'));
        continue;
      }

      newFiles.push(file);

      // Generate preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        this.filePreviews.update(prev => [...prev, result]);
      };
      reader.readAsDataURL(file);
    }

    this.selectedFiles.update(prev => [...prev, ...newFiles]);

    // Reset input so same file can be selected again
    input.value = '';
  }

  removeFile(index: number): void {
    this.selectedFiles.update(files => files.filter((_, i) => i !== index));
    this.filePreviews.update(previews => previews.filter((_, i) => i !== index));
    this.fileError.set('');
  }

  submit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    const formValue = this.form.value;

    const request = {
      category: formValue.category,
      subject: formValue.subject,
      description: formValue.description,
      stepsToReproduce: formValue.stepsToReproduce || undefined,
      pageUrl: window.location.href,
      browserInfo: navigator.userAgent
    };

    // Step 1: Create the ticket
    this.ticketService.createTicket(request).subscribe({
      next: (ticket) => {
        // Step 2: Upload attachments sequentially
        if (this.selectedFiles().length > 0) {
          this.uploadAttachments(ticket.id, 0);
        } else {
          this.onSuccess(ticket.ticketNumber);
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.snackBar.open(
          this.i18n.t('support.form.submitError'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
        console.error('Failed to create ticket:', err);
      }
    });
  }

  private uploadAttachments(ticketId: string, index: number): void {
    const files = this.selectedFiles();
    if (index >= files.length) {
      // All uploaded
      this.onSuccess(0); // ticketNumber already shown
      return;
    }

    this.ticketService.uploadAttachment(ticketId, files[index]).subscribe({
      next: () => {
        this.uploadAttachments(ticketId, index + 1);
      },
      error: (err) => {
        console.error(`Failed to upload attachment ${index + 1}:`, err);
        // Continue with remaining attachments
        this.uploadAttachments(ticketId, index + 1);
      }
    });
  }

  private onSuccess(ticketNumber: number): void {
    this.submitting.set(false);
    this.snackBar.open(
      this.i18n.t('support.form.submitSuccess'),
      this.i18n.t('common.close'),
      { duration: 5000 }
    );
    this.dialogRef.close(true);
  }
}
