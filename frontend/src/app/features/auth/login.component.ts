import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';

import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { I18nService, Language } from '../../core/i18n';

@Component({
  selector: 'app-login',
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
    MatSelectModule,
    
    TranslateModule
  ],
  template: `
    <div class="login-container">
      <!-- Language Selector -->
      <div class="language-selector-top">
        <mat-form-field appearance="outline" class="language-select">
          <mat-label>{{ 'auth.selectLanguage' | translate }}</mat-label>
          <mat-select [value]="i18n.currentLang()" (selectionChange)="onLanguageChange($event.value)">
            @for (lang of i18n.supportedLanguages; track lang.code) {
              <mat-option [value]="lang.code">{{ lang.nativeName }}</mat-option>
            }
          </mat-select>
          <i class="fa-solid fa-globe" matPrefix aria-hidden="true" style="margin-right: 8px;"></i>
        </mat-form-field>
      </div>

      <mat-card class="login-card">
        <mat-card-header>
          <mat-card-title>Family Tree Platform</mat-card-title>
          <mat-card-subtitle>{{ 'auth.loginSubtitle' | translate }}</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'auth.username' | translate }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email">
              <mat-error *ngIf="loginForm.get('email')?.hasError('required')">
                {{ 'validation.required' | translate }}
              </mat-error>
              <mat-error *ngIf="loginForm.get('email')?.hasError('email')">
                {{ 'validation.email' | translate }}
              </mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'auth.password' | translate }}</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="current-password">
              <mat-error *ngIf="loginForm.get('password')?.hasError('required')">
                {{ 'validation.required' | translate }}
              </mat-error>
            </mat-form-field>

            <button
              mat-raised-button
              color="primary"
              type="submit"
              class="full-width"
              [disabled]="loginForm.invalid || loading">
              <mat-spinner diameter="20" *ngIf="loading"></mat-spinner>
              <span *ngIf="!loading">{{ 'auth.loginButton' | translate }}</span>
            </button>
          </form>

          <div class="register-link">
            <p>Don't have an account? <a routerLink="/register">Register here</a></p>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding-top: 20px;
    }

    .language-selector-top {
      position: absolute;
      top: 20px;
      right: 20px;
    }

    :host-context([dir="rtl"]) .language-selector-top {
      right: auto;
      left: 20px;
    }

    .language-select {
      min-width: 150px;
    }

    .language-select ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .language-select ::ng-deep .mat-mdc-text-field-wrapper {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 8px;
    }

    .login-card {
      width: 100%;
      max-width: 400px;
      margin: 20px;
    }

    mat-card-header {
      margin-bottom: 24px;
      text-align: center;
    }

    mat-card-title {
      font-size: 24px;
      margin-bottom: 8px;
    }

    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }

    button {
      margin-top: 8px;
      height: 48px;
    }

    .register-link {
      text-align: center;
      margin-top: 16px;
    }

    .register-link a {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
    }

    .register-link a:hover {
      text-decoration: underline;
    }
  `]
})
export class LoginComponent {
  readonly i18n = inject(I18nService);
  loginForm: FormGroup;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  onLanguageChange(langCode: string): void {
    this.i18n.setLanguage(langCode as Language);
  }

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading = true;
    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(error.error?.message || 'Login failed', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }
}
