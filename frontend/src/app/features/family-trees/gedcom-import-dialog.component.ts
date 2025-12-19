import { Component, inject, signal, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GedcomService } from '../../core/services/gedcom.service';
import { I18nService } from '../../core/i18n/i18n.service';
import {
  GedcomImportResult,
  GedcomPreviewResult
} from '../../core/models/gedcom.models';

type ImportStep = 'upload' | 'preview' | 'options' | 'importing' | 'result';

@Component({
  selector: 'app-gedcom-import-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="onOverlayClick($event)">
      <div class="modal-container" [class.rtl]="i18n.isRtl()">
        <!-- Header -->
        <div class="modal-header">
          <h2>{{ t('gedcom.title') }}</h2>
          <button class="close-btn" (click)="close.emit()" [attr.aria-label]="t('common.close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Step Indicator -->
        <div class="step-indicator">
          <div class="step" [class.active]="step() === 'upload'" [class.completed]="stepIndex() > 0">
            <span class="step-number">1</span>
            <span class="step-label">{{ t('gedcom.steps.upload') }}</span>
          </div>
          <div class="step-line" [class.completed]="stepIndex() > 0"></div>
          <div class="step" [class.active]="step() === 'preview'" [class.completed]="stepIndex() > 1">
            <span class="step-number">2</span>
            <span class="step-label">{{ t('gedcom.steps.preview') }}</span>
          </div>
          <div class="step-line" [class.completed]="stepIndex() > 1"></div>
          <div class="step" [class.active]="step() === 'options'" [class.completed]="stepIndex() > 2">
            <span class="step-number">3</span>
            <span class="step-label">{{ t('gedcom.steps.options') }}</span>
          </div>
          <div class="step-line" [class.completed]="stepIndex() > 2"></div>
          <div class="step" [class.active]="step() === 'result'" [class.completed]="stepIndex() > 3">
            <span class="step-number">4</span>
            <span class="step-label">{{ t('gedcom.steps.result') }}</span>
          </div>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <!-- Upload Step -->
          @if (step() === 'upload') {
            <div class="upload-area"
                 [class.drag-over]="isDragOver()"
                 (dragover)="onDragOver($event)"
                 (dragleave)="onDragLeave($event)"
                 (drop)="onDrop($event)"
                 (click)="fileInput.click()">
              <input #fileInput type="file" accept=".ged" (change)="onFileSelected($event)" hidden>
              <div class="upload-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <p class="upload-text">{{ t('gedcom.upload.dragDrop') }}</p>
              <p class="upload-subtext">{{ t('gedcom.upload.or') }}</p>
              <button class="browse-btn">{{ t('gedcom.upload.browse') }}</button>
              <p class="upload-hint">{{ t('gedcom.upload.hint') }}</p>
            </div>

            @if (uploadError()) {
              <div class="error-message">{{ uploadError() }}</div>
            }
          }

          <!-- Preview Step -->
          @if (step() === 'preview') {
            @if (loading()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <p>{{ t('gedcom.preview.analyzing') }}</p>
              </div>
            } @else if (preview()) {
              <div class="preview-content">
                <div class="preview-stats">
                  <div class="stat-card">
                    <div class="stat-value">{{ preview()!.individualCount }}</div>
                    <div class="stat-label">{{ t('gedcom.preview.individuals') }}</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">{{ preview()!.familyCount }}</div>
                    <div class="stat-label">{{ t('gedcom.preview.families') }}</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">{{ formatFileSize(preview()!.fileSize) }}</div>
                    <div class="stat-label">{{ t('gedcom.preview.fileSize') }}</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">{{ preview()!.encoding }}</div>
                    <div class="stat-label">{{ t('gedcom.preview.encoding') }}</div>
                  </div>
                </div>

                @if (preview()!.sampleIndividuals.length > 0) {
                  <div class="sample-table">
                    <h4>{{ t('gedcom.preview.sampleData') }}</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>{{ t('gedcom.preview.name') }}</th>
                          <th>{{ t('gedcom.preview.sex') }}</th>
                          <th>{{ t('gedcom.preview.birth') }}</th>
                          <th>{{ t('gedcom.preview.death') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (person of preview()!.sampleIndividuals; track person.id) {
                          <tr>
                            <td>{{ person.name || '—' }}</td>
                            <td>{{ person.sex || '—' }}</td>
                            <td>{{ person.birthDate || '—' }}</td>
                            <td>{{ person.deathDate || '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                @if (preview()!.warningCount > 0) {
                  <div class="warnings-section">
                    <h4>{{ t('gedcom.preview.warnings') }} ({{ preview()!.warningCount }})</h4>
                    <ul>
                      @for (warning of preview()!.warnings; track warning) {
                        <li>{{ warning }}</li>
                      }
                    </ul>
                  </div>
                }
              </div>
            }
          }

          <!-- Options Step -->
          @if (step() === 'options') {
            <div class="options-form">
              <div class="form-group">
                <label for="treeName">{{ t('gedcom.options.treeName') }}</label>
                <input
                  type="text"
                  id="treeName"
                  [(ngModel)]="treeName"
                  [placeholder]="t('gedcom.options.treeNamePlaceholder')"
                >
              </div>

              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" [(ngModel)]="importNotes">
                  <span>{{ t('gedcom.options.importNotes') }}</span>
                </label>
              </div>

              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" [(ngModel)]="importOccupations">
                  <span>{{ t('gedcom.options.importOccupations') }}</span>
                </label>
              </div>

              <div class="info-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <p>{{ t('gedcom.options.info') }}</p>
              </div>
            </div>
          }

          <!-- Importing Step -->
          @if (step() === 'importing') {
            <div class="loading-state">
              <div class="spinner large"></div>
              <p>{{ t('gedcom.importing.message') }}</p>
              <p class="loading-subtext">{{ t('gedcom.importing.patience') }}</p>
            </div>
          }

          <!-- Result Step -->
          @if (step() === 'result') {
            @if (result()) {
              <div class="result-content" [class.success]="result()!.success" [class.error]="!result()!.success">
                <div class="result-icon">
                  @if (result()!.success) {
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  } @else {
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                  }
                </div>

                <h3>{{ result()!.success ? t('gedcom.result.success') : t('gedcom.result.failed') }}</h3>
                <p class="result-message">{{ result()!.message }}</p>

                @if (result()!.success) {
                  <div class="result-stats">
                    <div class="result-stat">
                      <span class="value">{{ result()!.individualsImported }}</span>
                      <span class="label">{{ t('gedcom.result.individuals') }}</span>
                    </div>
                    <div class="result-stat">
                      <span class="value">{{ result()!.familiesImported }}</span>
                      <span class="label">{{ t('gedcom.result.families') }}</span>
                    </div>
                    <div class="result-stat">
                      <span class="value">{{ result()!.relationshipsCreated }}</span>
                      <span class="label">{{ t('gedcom.result.relationships') }}</span>
                    </div>
                  </div>
                }

                @if (result()!.warnings.length > 0) {
                  <div class="result-warnings">
                    <h4>{{ t('gedcom.result.warnings') }}</h4>
                    <ul>
                      @for (warning of result()!.warnings.slice(0, 5); track warning) {
                        <li>{{ warning }}</li>
                      }
                    </ul>
                    @if (result()!.warnings.length > 5) {
                      <p class="more-warnings">{{ t('gedcom.result.moreWarnings', { count: result()!.warnings.length - 5 }) }}</p>
                    }
                  </div>
                }

                @if (result()!.errors.length > 0) {
                  <div class="result-errors">
                    <h4>{{ t('gedcom.result.errors') }}</h4>
                    <ul>
                      @for (error of result()!.errors.slice(0, 5); track error) {
                        <li>{{ error }}</li>
                      }
                    </ul>
                  </div>
                }
              </div>
            }
          }
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          @if (step() === 'upload') {
            <button class="btn secondary" (click)="close.emit()">{{ t('common.cancel') }}</button>
          } @else if (step() === 'preview' || step() === 'options') {
            <button class="btn secondary" (click)="previousStep()">{{ t('common.back') }}</button>
            <button class="btn primary" (click)="nextStep()" [disabled]="loading()">
              {{ step() === 'options' ? t('gedcom.import') : t('common.next') }}
            </button>
          } @else if (step() === 'result') {
            <button class="btn primary" (click)="imported.emit(); close.emit()">{{ t('common.done') }}</button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .modal-container {
      background: white;
      border-radius: 12px;
      width: 100%;
      max-width: 700px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    }

    .modal-container.rtl {
      direction: rtl;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: #111827;
    }

    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
      color: #6b7280;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      gap: 0.5rem;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }

    .step {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #9ca3af;
    }

    .step.active {
      color: #6366f1;
    }

    .step.completed {
      color: #10b981;
    }

    .step-number {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: currentColor;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .step.active .step-number,
    .step.completed .step-number {
      background: currentColor;
    }

    .step-label {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .step-line {
      width: 40px;
      height: 2px;
      background: #e5e7eb;
    }

    .step-line.completed {
      background: #10b981;
    }

    .modal-content {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      min-height: 300px;
    }

    .upload-area {
      border: 2px dashed #d1d5db;
      border-radius: 12px;
      padding: 3rem 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .upload-area:hover,
    .upload-area.drag-over {
      border-color: #6366f1;
      background: #f5f3ff;
    }

    .upload-icon {
      color: #9ca3af;
      margin-bottom: 1rem;
    }

    .upload-text {
      font-size: 1rem;
      color: #374151;
      margin: 0 0 0.25rem;
    }

    .upload-subtext {
      font-size: 0.875rem;
      color: #9ca3af;
      margin: 0 0 1rem;
    }

    .browse-btn {
      background: #6366f1;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .browse-btn:hover {
      background: #4f46e5;
    }

    .upload-hint {
      font-size: 0.75rem;
      color: #9ca3af;
      margin: 1rem 0 0;
    }

    .error-message {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #fef2f2;
      color: #dc2626;
      border-radius: 8px;
      font-size: 0.875rem;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      text-align: center;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .spinner.large {
      width: 60px;
      height: 60px;
      border-width: 4px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-state p {
      margin: 1rem 0 0;
      color: #374151;
    }

    .loading-subtext {
      color: #9ca3af !important;
      font-size: 0.875rem;
    }

    .preview-content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .preview-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }

    .stat-card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #6366f1;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
      margin-top: 0.25rem;
    }

    .sample-table {
      overflow-x: auto;
    }

    .sample-table h4 {
      margin: 0 0 0.75rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
    }

    .sample-table table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    .sample-table th,
    .sample-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }

    .sample-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }

    .sample-table td {
      color: #6b7280;
    }

    .rtl .sample-table th,
    .rtl .sample-table td {
      text-align: right;
    }

    .warnings-section {
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 1rem;
    }

    .warnings-section h4 {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: #92400e;
    }

    .warnings-section ul {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.813rem;
      color: #a16207;
    }

    .rtl .warnings-section ul {
      padding-left: 0;
      padding-right: 1.25rem;
    }

    .options-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .form-group label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
    }

    .form-group input[type="text"] {
      padding: 0.75rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.2s;
    }

    .form-group input[type="text"]:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .checkbox-group label {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
    }

    .checkbox-group input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #6366f1;
    }

    .info-box {
      display: flex;
      gap: 0.75rem;
      padding: 1rem;
      background: #eff6ff;
      border-radius: 8px;
      color: #1e40af;
    }

    .info-box svg {
      flex-shrink: 0;
      margin-top: 2px;
    }

    .info-box p {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .result-content {
      text-align: center;
      padding: 1rem;
    }

    .result-icon {
      margin-bottom: 1rem;
    }

    .result-content.success .result-icon {
      color: #10b981;
    }

    .result-content.error .result-icon {
      color: #ef4444;
    }

    .result-content h3 {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .result-content.success h3 {
      color: #10b981;
    }

    .result-content.error h3 {
      color: #ef4444;
    }

    .result-message {
      color: #6b7280;
      margin: 0 0 1.5rem;
    }

    .result-stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 1.5rem;
    }

    .result-stat {
      text-align: center;
    }

    .result-stat .value {
      display: block;
      font-size: 2rem;
      font-weight: 700;
      color: #6366f1;
    }

    .result-stat .label {
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
    }

    .result-warnings,
    .result-errors {
      text-align: left;
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 8px;
    }

    .result-warnings {
      background: #fffbeb;
      border: 1px solid #fcd34d;
    }

    .result-errors {
      background: #fef2f2;
      border: 1px solid #fca5a5;
    }

    .result-warnings h4,
    .result-errors h4 {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .result-warnings h4 {
      color: #92400e;
    }

    .result-errors h4 {
      color: #991b1b;
    }

    .result-warnings ul,
    .result-errors ul {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.813rem;
    }

    .result-warnings ul {
      color: #a16207;
    }

    .result-errors ul {
      color: #dc2626;
    }

    .more-warnings {
      margin: 0.5rem 0 0;
      font-size: 0.75rem;
      color: #a16207;
      font-style: italic;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 0 0 12px 12px;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn.primary {
      background: #6366f1;
      color: white;
    }

    .btn.primary:hover:not(:disabled) {
      background: #4f46e5;
    }

    .btn.primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn.secondary {
      background: white;
      color: #374151;
      border: 1px solid #d1d5db;
    }

    .btn.secondary:hover {
      background: #f3f4f6;
    }

    @media (max-width: 640px) {
      .step-label {
        display: none;
      }

      .preview-stats {
        grid-template-columns: repeat(2, 1fr);
      }

      .result-stats {
        flex-direction: column;
        gap: 1rem;
      }
    }
  `]
})
export class GedcomImportDialogComponent {
  readonly i18n = inject(I18nService);
  private readonly gedcomService = inject(GedcomService);

  readonly close = output<void>();
  readonly imported = output<void>();

  readonly step = signal<ImportStep>('upload');
  readonly loading = signal(false);
  readonly isDragOver = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly preview = signal<GedcomPreviewResult | null>(null);
  readonly result = signal<GedcomImportResult | null>(null);

  selectedFile: File | null = null;
  treeName = '';
  importNotes = true;
  importOccupations = true;

  readonly stepIndex = computed(() => {
    const steps: ImportStep[] = ['upload', 'preview', 'options', 'importing', 'result'];
    return steps.indexOf(this.step());
  });

  t(key: string, params?: Record<string, any>): string {
    let value = this.i18n.t(key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value.replace(`{${k}}`, String(v));
      });
    }
    return value;
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File): void {
    this.uploadError.set(null);

    if (!file.name.toLowerCase().endsWith('.ged')) {
      this.uploadError.set(this.t('gedcom.error.invalidFile'));
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      this.uploadError.set(this.t('gedcom.error.fileTooLarge'));
      return;
    }

    this.selectedFile = file;
    this.treeName = file.name.replace(/\.ged$/i, '');
    this.loadPreview();
  }

  private loadPreview(): void {
    if (!this.selectedFile) return;

    this.step.set('preview');
    this.loading.set(true);

    this.gedcomService.preview(this.selectedFile).subscribe({
      next: (result) => {
        this.preview.set(result);
        this.loading.set(false);
      },
      error: (err) => {
        this.uploadError.set(err.error?.error || this.t('gedcom.error.previewFailed'));
        this.step.set('upload');
        this.loading.set(false);
      }
    });
  }

  previousStep(): void {
    const current = this.step();
    if (current === 'preview') {
      this.step.set('upload');
    } else if (current === 'options') {
      this.step.set('preview');
    }
  }

  nextStep(): void {
    const current = this.step();
    if (current === 'preview') {
      this.step.set('options');
    } else if (current === 'options') {
      this.startImport();
    }
  }

  private startImport(): void {
    if (!this.selectedFile) return;

    this.step.set('importing');

    this.gedcomService.import(this.selectedFile, {
      createNewTree: true,
      treeName: this.treeName || undefined,
      importNotes: this.importNotes,
      importOccupations: this.importOccupations
    }).subscribe({
      next: (result) => {
        this.result.set(result);
        this.step.set('result');
      },
      error: (err) => {
        this.result.set({
          success: false,
          message: err.error?.message || this.t('gedcom.error.importFailed'),
          individualsImported: 0,
          familiesImported: 0,
          relationshipsCreated: 0,
          warnings: [],
          errors: err.error?.errors || [err.message],
          duration: '0'
        });
        this.step.set('result');
      }
    });
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
