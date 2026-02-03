import { Component, OnInit, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
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
  selector: 'app-reset-password',
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
            <i class="fa-solid fa-lock" aria-hidden="true"></i>
          </div>
          <h1>{{ 'auth.resetPassword' | translate }}</h1>
          <p>{{ 'auth.enterResetCode' | translate }}</p>
        </div>
        <div class="nubian-auth__content">
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="nubian-auth__form">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'auth.email' | translate }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email">
              <i class="fa-solid fa-envelope" matPrefix aria-hidden="true"></i>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'auth.verificationCode' | translate }}</mat-label>
              <input matInput formControlName="code" maxlength="6" inputmode="numeric">
              <i class="fa-solid fa-key" matPrefix aria-hidden="true"></i>
              <mat-error *ngIf="form.get('code')?.hasError('required')">
                {{ 'validation.codeRequired' | translate }}
              </mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'auth.newPassword' | translate }}</mat-label>
              <input matInput type="password" formControlName="newPassword" autocomplete="new-password">
              <i class="fa-solid fa-lock" matPrefix aria-hidden="true"></i>
              <mat-error *ngIf="form.get('newPassword')?.hasError('required')">
                {{ 'validation.passwordRequired' | translate }}
              </mat-error>
              <mat-error *ngIf="form.get('newPassword')?.hasError('minlength')">
                {{ 'validation.passwordMinLength' | translate }}
              </mat-error>
              <mat-error *ngIf="form.get('newPassword')?.hasError('pattern')">
                {{ 'validation.passwordPattern' | translate }}
              </mat-error>
              <mat-hint>{{ 'auth.passwordHint' | translate }}</mat-hint>
            </mat-form-field>

            <button
              mat-raised-button
              type="submit"
              class="nubian-auth__submit"
              [disabled]="form.invalid || loading">
              @if (loading) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <i class="fa-solid fa-check" aria-hidden="true"></i>
                <span>{{ 'auth.resetPasswordButton' | translate }}</span>
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
export class ResetPasswordComponent implements OnInit {
  form: FormGroup;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private i18n: I18nService
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      newPassword: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
      ]]
    });
  }

  ngOnInit(): void {
    // Pre-fill email from query params if available
    this.route.queryParams.subscribe(params => {
      if (params['email']) {
        this.form.patchValue({ email: params['email'] });
      }
    });
  }

  onSubmit() {
    if (this.form.invalid) return;

    this.loading = true;
    this.authService.resetPassword({
      email: this.form.value.email,
      code: this.form.value.code,
      newPassword: this.form.value.newPassword
    }).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.snackBar.open(
            this.i18n.t('auth.passwordResetSuccess'),
            this.i18n.t('common.close'),
            { duration: 5000 }
          );
          this.router.navigate(['/login']);
        } else {
          this.snackBar.open(
            response.message,
            this.i18n.t('common.close'),
            { duration: 5000, panelClass: ['error-snackbar'] }
          );
        }
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(
          error.error?.message || this.i18n.t('auth.resetFailed'),
          this.i18n.t('common.close'),
          { duration: 5000, panelClass: ['error-snackbar'] }
        );
      }
    });
  }
}
