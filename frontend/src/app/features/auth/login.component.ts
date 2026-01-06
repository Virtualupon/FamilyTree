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
    <div class="nubian-auth">
      <!-- Animated Background Pattern -->
      <div class="nubian-auth__pattern"></div>
      
      <!-- Language Selector -->
      <div class="nubian-auth__language">
        <mat-form-field appearance="outline" class="language-select">
          <mat-select [value]="i18n.currentLang()" (selectionChange)="onLanguageChange($event.value)">
            @for (lang of i18n.supportedLanguages; track lang.code) {
              <mat-option [value]="lang.code">{{ lang.nativeName }}</mat-option>
            }
          </mat-select>
          <i class="fa-solid fa-globe" matPrefix aria-hidden="true"></i>
        </mat-form-field>
      </div>

      <div class="nubian-auth__card">
        <!-- Header with Logo -->
        <div class="nubian-auth__header">
          <div class="nubian-auth__logo">
            <i class="fa-solid fa-tree" aria-hidden="true"></i>
          </div>
          <h1>Family Tree Platform</h1>
          <p>{{ 'auth.loginSubtitle' | translate }}</p>
        </div>

        <!-- Login Form -->
        <div class="nubian-auth__content">
          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="nubian-auth__form">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'auth.username' | translate }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email">
              <i class="fa-solid fa-envelope" matPrefix aria-hidden="true"></i>
              <mat-error *ngIf="loginForm.get('email')?.hasError('required')">
                {{ 'validation.required' | translate }}
              </mat-error>
              <mat-error *ngIf="loginForm.get('email')?.hasError('email')">
                {{ 'validation.email' | translate }}
              </mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'auth.password' | translate }}</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="current-password">
              <i class="fa-solid fa-lock" matPrefix aria-hidden="true"></i>
              <mat-error *ngIf="loginForm.get('password')?.hasError('required')">
                {{ 'validation.required' | translate }}
              </mat-error>
            </mat-form-field>

            <button
              mat-raised-button
              type="submit"
              class="nubian-auth__submit"
              [disabled]="loginForm.invalid || loading">
              @if (loading) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>
                <span>{{ 'auth.loginButton' | translate }}</span>
              }
            </button>
          </form>

          <div class="nubian-auth__footer">
            <p>Don't have an account? <a routerLink="/register">Register here</a></p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ============================================
       NUBIAN LOGIN PAGE STYLES
       ============================================ */
    
    .nubian-auth {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #FFF9F5 0%, #FFF5EB 50%, #F4E4D7 100%);
      padding: 1rem;
      position: relative;
      overflow: hidden;
      
      /* Animated pattern background */
      &::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.06;
        background-image: 
          repeating-linear-gradient(45deg, transparent, transparent 35px, #C17E3E 35px, #C17E3E 37px),
          repeating-linear-gradient(-45deg, transparent, transparent 35px, #187573 35px, #187573 37px);
        background-size: 80px 80px;
        animation: floatPattern 60s linear infinite;
        z-index: 0;
      }
      
      > * {
        position: relative;
        z-index: 1;
      }
    }
    
    @keyframes floatPattern {
      0% { transform: translate(0, 0) rotate(0deg); }
      100% { transform: translate(-50px, -50px) rotate(360deg); }
    }

    .nubian-auth__language {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
    }

    :host-context([dir="rtl"]) .nubian-auth__language {
      right: auto;
      left: 1.5rem;
    }

    .language-select {
      min-width: 140px;
      
      ::ng-deep .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }
      
      ::ng-deep .mat-mdc-text-field-wrapper {
        background: rgba(255, 255, 255, 0.9);
        border-radius: 12px;
      }
      
      i {
        color: #C17E3E;
        margin-right: 8px;
      }
    }

    .nubian-auth__card {
      width: 100%;
      max-width: 440px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      box-shadow: 0 20px 40px rgba(45, 45, 45, 0.15);
      overflow: hidden;
      animation: scaleIn 0.5s ease-out;
    }
    
    @keyframes scaleIn {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .nubian-auth__header {
      background: linear-gradient(135deg, #187573, #2B9A97);
      padding: 2rem 1.5rem;
      text-align: center;
      
      h1 {
        font-family: 'Cinzel', 'Playfair Display', serif;
        color: white;
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0 0 0.5rem;
        letter-spacing: 0.5px;
      }
      
      p {
        color: rgba(255, 255, 255, 0.85);
        margin: 0;
        font-size: 1rem;
      }
    }

    .nubian-auth__logo {
      width: 80px;
      height: 80px;
      margin: 0 auto 1rem;
      background: linear-gradient(135deg, #C17E3E, #D4A574);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 30px rgba(193, 126, 62, 0.4);
      
      i {
        font-size: 2.5rem;
        color: white;
      }
    }

    .nubian-auth__content {
      padding: 2rem 1.5rem;
    }

    .nubian-auth__form {
      mat-form-field {
        width: 100%;
        margin-bottom: 0.5rem;
      }
      
      i[matPrefix] {
        color: #C17E3E;
        margin-right: 8px;
      }
    }

    .nubian-auth__submit {
      width: 100%;
      height: 52px;
      margin-top: 1rem;
      background: linear-gradient(135deg, #187573, #2B9A97) !important;
      color: white !important;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 12px !important;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: all 0.3s ease;
      
      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(24, 117, 115, 0.35);
      }
      
      &:disabled {
        opacity: 0.7;
      }
      
      mat-spinner {
        margin-right: 0.5rem;
      }
    }

    .nubian-auth__footer {
      text-align: center;
      padding-top: 1.5rem;
      border-top: 1px solid #F4E4D7;
      margin-top: 1.5rem;
      
      p {
        color: #6B6B6B;
        margin: 0;
      }
      
      a {
        color: #187573;
        font-weight: 600;
        text-decoration: none;
        transition: color 0.2s;
        
        &:hover {
          color: #C17E3E;
          text-decoration: underline;
        }
      }
    }
    
    /* Responsive adjustments */
    @media (max-width: 480px) {
      .nubian-auth__card {
        border-radius: 16px;
      }
      
      .nubian-auth__header {
        padding: 1.5rem 1rem;
        
        h1 {
          font-size: 1.5rem;
        }
      }
      
      .nubian-auth__logo {
        width: 64px;
        height: 64px;
        
        i {
          font-size: 2rem;
        }
      }
      
      .nubian-auth__content {
        padding: 1.5rem 1rem;
      }
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