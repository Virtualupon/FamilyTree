import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslateModule
  ],
  template: `
    <div class="nubian-auth">
      <div class="nubian-auth__pattern"></div>
      <div class="nubian-auth__card">
        <div class="nubian-auth__header">
          <div class="nubian-auth__logo">
            <i class="fa-solid fa-key" aria-hidden="true"></i>
          </div>
          <h1>{{ 'auth.forgotPasswordTitle' | translate }}</h1>
          <p>{{ 'auth.forgotPasswordInstructions' | translate }}</p>
        </div>
        <div class="nubian-auth__content">
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="nubian-auth__form">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'auth.email' | translate }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email">
              <i class="fa-solid fa-envelope" matPrefix aria-hidden="true"></i>
              <mat-error *ngIf="form.get('email')?.hasError('required')">
                {{ 'validation.emailRequired' | translate }}
              </mat-error>
              <mat-error *ngIf="form.get('email')?.hasError('email')">
                {{ 'validation.invalidEmail' | translate }}
              </mat-error>
            </mat-form-field>
            <button
              mat-raised-button
              type="submit"
              class="nubian-auth__submit"
              [disabled]="form.invalid || loading">
              @if (loading) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                <span>{{ 'auth.sendResetCode' | translate }}</span>
              }
            </button>
          </form>
          <div class="nubian-auth__footer">
            <p><a routerLink="/login">{{ 'auth.backToLogin' | translate }}</a></p>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./register.component.scss']
})
export class ForgotPasswordComponent {
  form: FormGroup;
  loading = false;
  submitted = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private i18n: I18nService
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit() {
    if (this.form.invalid) return;

    this.loading = true;
    this.authService.forgotPassword(this.form.value.email).subscribe({
      next: (response) => {
        this.loading = false;
        this.snackBar.open(
          response.message,
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
        // Navigate to reset password page
        this.router.navigate(['/reset-password'], {
          queryParams: { email: this.form.value.email }
        });
      },
      error: () => {
        this.loading = false;
        // Still show success message to prevent enumeration
        this.snackBar.open(
          this.i18n.t('auth.checkYourEmail'),
          this.i18n.t('common.close'),
          { duration: 5000 }
        );
      }
    });
  }
}
