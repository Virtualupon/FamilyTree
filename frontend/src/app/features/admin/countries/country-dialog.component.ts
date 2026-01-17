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
  templateUrl: './country-dialog.component.html',
  styleUrls: ['./country-dialog.component.scss']
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
