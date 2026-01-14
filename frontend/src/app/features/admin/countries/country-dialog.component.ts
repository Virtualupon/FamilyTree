import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AdminCountriesService, AdminCountry } from './admin-countries.service';
import { TranslatePipe, I18nService } from '../../../core/i18n';

export interface CountryDialogData {
  mode: 'create' | 'edit';
  country?: AdminCountry;
}

@Component({
  selector: 'app-country-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="flag-preview">{{ getFlag() }}</span>
      {{ isEdit ? ('admin.countries.edit' | translate) : ('admin.countries.add' | translate) }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="country-form">

        <!-- Code (2 letters) -->
        <mat-form-field appearance="outline" class="code-field">
          <mat-label>{{ 'admin.countries.code' | translate }} *</mat-label>
          <input matInput formControlName="code" maxlength="2"
                 [readonly]="isEdit" style="text-transform: uppercase;">
          <mat-hint>ISO 3166-1 alpha-2 (e.g., EG, US, SA)</mat-hint>
          @if (form.get('code')?.hasError('required')) {
            <mat-error>{{ 'common.required' | translate }}</mat-error>
          }
          @if (form.get('code')?.hasError('pattern')) {
            <mat-error>{{ 'admin.countries.lettersOnly' | translate }}</mat-error>
          }
          @if (form.get('code')?.hasError('minlength') || form.get('code')?.hasError('maxlength')) {
            <mat-error>{{ 'admin.countries.exactTwoChars' | translate }}</mat-error>
          }
        </mat-form-field>

        <!-- Name English -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'admin.countries.nameEn' | translate }} *</mat-label>
          <input matInput formControlName="nameEn" placeholder="Egypt">
          @if (form.get('nameEn')?.hasError('required')) {
            <mat-error>{{ 'common.required' | translate }}</mat-error>
          }
        </mat-form-field>

        <!-- Name Arabic -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'admin.countries.nameAr' | translate }}</mat-label>
          <input matInput formControlName="nameAr" placeholder="مصر" dir="rtl">
        </mat-form-field>

        <!-- Name Local (Nobiin) -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'admin.countries.nameLocal' | translate }}</mat-label>
          <input matInput formControlName="nameLocal" [placeholder]="'admin.countries.localNamePlaceholder' | translate">
        </mat-form-field>

        <!-- Region -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ 'admin.countries.region' | translate }}</mat-label>
          <mat-select formControlName="region">
            <mat-option value="">{{ 'common.none' | translate }}</mat-option>
            @for (region of regions; track region) {
              <mat-option [value]="region">{{ region }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="row">
          <!-- Display Order -->
          <mat-form-field appearance="outline" class="order-field">
            <mat-label>{{ 'admin.countries.order' | translate }}</mat-label>
            <input matInput type="number" formControlName="displayOrder" min="0">
            <mat-hint>{{ 'admin.countries.orderHint' | translate }}</mat-hint>
          </mat-form-field>

          <!-- Is Active -->
          <mat-checkbox formControlName="isActive" class="active-checkbox">
            {{ 'admin.countries.isActive' | translate }}
          </mat-checkbox>
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="saving()">
        {{ 'common.cancel' | translate }}
      </button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="form.invalid || saving()">
        @if (saving()) {
          <mat-spinner diameter="20"></mat-spinner>
        }
        {{ isEdit ? ('common.save' | translate) : ('common.create' | translate) }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .country-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 400px;
    }

    .full-width {
      width: 100%;
    }

    .code-field {
      width: 150px;
    }

    .order-field {
      width: 120px;
    }

    .row {
      display: flex;
      gap: 24px;
      align-items: center;
    }

    .active-checkbox {
      margin-top: -8px;
    }

    .flag-preview {
      font-size: 1.5em;
      margin-right: 8px;
    }

    mat-dialog-content {
      padding-top: 16px;
    }

    mat-dialog-actions button mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }

    input[style*="text-transform: uppercase"] {
      text-transform: uppercase;
    }
  `]
})
export class CountryDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly countriesService = inject(AdminCountriesService);
  private readonly dialogRef = inject(MatDialogRef<CountryDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);
  readonly data: CountryDialogData = inject(MAT_DIALOG_DATA);

  form!: FormGroup;
  isEdit: boolean;
  saving = signal(false);

  regions = [
    'Africa',
    'Asia',
    'Europe',
    'Middle East',
    'North America',
    'South America',
    'Oceania'
  ];

  constructor() {
    this.isEdit = this.data.mode === 'edit';
  }

  ngOnInit() {
    this.form = this.fb.group({
      code: [
        { value: this.data.country?.code || '', disabled: this.isEdit },
        [Validators.required, Validators.minLength(2), Validators.maxLength(2), Validators.pattern(/^[A-Za-z]+$/)]
      ],
      nameEn: [this.data.country?.nameEn || '', [Validators.required, Validators.maxLength(100)]],
      nameAr: [this.data.country?.nameAr || '', [Validators.maxLength(100)]],
      nameLocal: [this.data.country?.nameLocal || '', [Validators.maxLength(100)]],
      region: [this.data.country?.region || ''],
      isActive: [this.data.country?.isActive ?? true],
      displayOrder: [this.data.country?.displayOrder || 0]
    });
  }

  getFlag(): string {
    const code = this.form?.get('code')?.value;
    if (!code || code.length !== 2) return '';
    const codePoints = code.toUpperCase().split('').map((c: string) => 127397 + c.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  save() {
    if (this.form.invalid) return;

    this.saving.set(true);
    const formValue = this.form.getRawValue();

    const request = this.isEdit
      ? this.countriesService.update(this.data.country!.code, formValue)
      : this.countriesService.create(formValue);

    request.subscribe({
      next: () => {
        this.snackBar.open(
          this.isEdit ? this.i18n.t('admin.countries.updated') : this.i18n.t('admin.countries.created'),
          this.i18n.t('common.close'),
          { duration: 2000 }
        );
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.snackBar.open(
          err.error?.message || this.i18n.t('admin.countries.saveFailed'),
          this.i18n.t('common.close'),
          { duration: 3000 }
        );
        this.saving.set(false);
      }
    });
  }
}
