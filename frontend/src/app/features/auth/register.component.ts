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

@Component({
  selector: 'app-register',
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
      <!-- Animated Background Pattern -->
      <div class="nubian-auth__pattern"></div>

      <div class="nubian-auth__card">
        <!-- Header with Logo -->
        <div class="nubian-auth__header">
          <div class="nubian-auth__logo">
            <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
          </div>
          <h1>{{ 'app.title' | translate }} {{ 'app.platform' | translate }}</h1>
          <p>Create your account</p>
        </div>

        <!-- Register Form -->
        <div class="nubian-auth__content">
          <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="nubian-auth__form">
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>First Name</mat-label>
                <input matInput formControlName="firstName" autocomplete="given-name">
                <i class="fa-solid fa-user" matPrefix aria-hidden="true"></i>
                <mat-error *ngIf="registerForm.get('firstName')?.hasError('required')">
                  First name is required
                </mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Last Name</mat-label>
                <input matInput formControlName="lastName" autocomplete="family-name">
                <i class="fa-solid fa-user" matPrefix aria-hidden="true"></i>
                <mat-error *ngIf="registerForm.get('lastName')?.hasError('required')">
                  Last name is required
                </mat-error>
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email">
              <i class="fa-solid fa-envelope" matPrefix aria-hidden="true"></i>
              <mat-error *ngIf="registerForm.get('email')?.hasError('required')">
                Email is required
              </mat-error>
              <mat-error *ngIf="registerForm.get('email')?.hasError('email')">
                Invalid email format
              </mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Password</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="new-password">
              <i class="fa-solid fa-lock" matPrefix aria-hidden="true"></i>
              <mat-error *ngIf="registerForm.get('password')?.hasError('required')">
                Password is required
              </mat-error>
              <mat-error *ngIf="registerForm.get('password')?.hasError('minlength')">
                Password must be at least 6 characters
              </mat-error>
            </mat-form-field>

            <button 
              mat-raised-button 
              type="submit" 
              class="nubian-auth__submit"
              [disabled]="registerForm.invalid || loading">
              @if (loading) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
                <span>Create Account</span>
              }
            </button>
          </form>

          <div class="nubian-auth__footer">
            <p>Already have an account? <a routerLink="/login">Login here</a></p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ============================================
       NUBIAN REGISTER PAGE STYLES
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

    .nubian-auth__card {
      width: 100%;
      max-width: 480px;
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
        margin-bottom: 0.25rem;
      }
      
      i[matPrefix] {
        color: #C17E3E;
        margin-right: 8px;
      }
      
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        
        @media (max-width: 480px) {
          grid-template-columns: 1fr;
          gap: 0;
        }
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
export class RegisterComponent {
  registerForm: FormGroup;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.registerForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit() {
    if (this.registerForm.invalid) return;

    this.loading = true;
    this.authService.register(this.registerForm.value).subscribe({
      next: () => {
        this.snackBar.open('Registration successful!', 'Close', {
          duration: 3000
        });
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(error.error?.message || 'Registration failed', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }
}