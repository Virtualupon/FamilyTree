import { Component, OnInit, OnDestroy, ViewChildren, QueryList, ElementRef } from '@angular/core';
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
  selector: 'app-verify-email',
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
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.scss']
})
export class VerifyEmailComponent implements OnInit, OnDestroy {
  @ViewChildren('codeInput') codeInputs!: QueryList<ElementRef>;

  codeForm: FormGroup;
  maskedEmail: string = '';
  loading = false;
  resendLoading = false;
  resendCountdown = 0;
  private countdownInterval?: ReturnType<typeof setInterval>;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private i18n: I18nService
  ) {
    this.codeForm = this.fb.group({
      digit1: ['', [Validators.required, Validators.pattern(/^\d$/)]],
      digit2: ['', [Validators.required, Validators.pattern(/^\d$/)]],
      digit3: ['', [Validators.required, Validators.pattern(/^\d$/)]],
      digit4: ['', [Validators.required, Validators.pattern(/^\d$/)]],
      digit5: ['', [Validators.required, Validators.pattern(/^\d$/)]],
      digit6: ['', [Validators.required, Validators.pattern(/^\d$/)]]
    });
  }

  ngOnInit(): void {
    // Check if we have a pending registration
    if (!this.authService.hasPendingRegistration()) {
      // No registration context, redirect to register
      this.router.navigate(['/register']);
      return;
    }

    // Get masked email for display
    this.maskedEmail = this.authService.getVerifyEmail() || '';

    // Start initial cooldown (user just initiated registration)
    this.startCountdown(60);
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  onDigitInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Only allow digits
    if (value && !/^\d$/.test(value)) {
      input.value = '';
      return;
    }

    if (value && index < 5) {
      // Auto-focus next input
      const inputs = this.codeInputs.toArray();
      inputs[index + 1]?.nativeElement.focus();
    }

    // Auto-submit when all digits entered
    if (this.getCode().length === 6 && this.codeForm.valid) {
      this.onSubmit();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pastedData = event.clipboardData?.getData('text') || '';
    const digits = pastedData.replace(/\D/g, '').slice(0, 6);

    if (digits.length >= 1) {
      const controls = ['digit1', 'digit2', 'digit3', 'digit4', 'digit5', 'digit6'];
      controls.forEach((control, i) => {
        this.codeForm.get(control)?.setValue(digits[i] || '');
      });

      // Focus last filled input or first empty
      const inputs = this.codeInputs.toArray();
      const focusIndex = Math.min(digits.length, 5);
      inputs[focusIndex]?.nativeElement.focus();

      // Auto-submit if complete
      if (digits.length === 6) {
        this.onSubmit();
      }
    }
  }

  onKeydown(event: KeyboardEvent, index: number): void {
    const input = event.target as HTMLInputElement;

    if (event.key === 'Backspace') {
      if (!input.value && index > 0) {
        // Move to previous input
        const inputs = this.codeInputs.toArray();
        inputs[index - 1]?.nativeElement.focus();
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      const inputs = this.codeInputs.toArray();
      inputs[index - 1]?.nativeElement.focus();
    } else if (event.key === 'ArrowRight' && index < 5) {
      const inputs = this.codeInputs.toArray();
      inputs[index + 1]?.nativeElement.focus();
    }
  }

  getCode(): string {
    return Object.values(this.codeForm.value).join('');
  }

  onSubmit(): void {
    if (this.codeForm.invalid || this.loading) return;

    this.loading = true;
    this.authService.completeRegistration(this.getCode()).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.snackBar.open(
            this.i18n.t('auth.emailVerified'),
            this.i18n.t('common.close'),
            { duration: 3000 }
          );
          this.router.navigate(['/']);  // Goes to onboarding via guard
        } else {
          this.snackBar.open(
            response.message,
            this.i18n.t('common.close'),
            { duration: 5000, panelClass: ['error-snackbar'] }
          );
          this.clearCode();
        }
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(
          error.error?.message || this.i18n.t('auth.invalidCode'),
          this.i18n.t('common.close'),
          { duration: 5000, panelClass: ['error-snackbar'] }
        );
        this.clearCode();
      }
    });
  }

  resendCode(): void {
    if (this.resendCountdown > 0 || this.resendLoading) return;

    // We need the email for resend - extract from masked email or use stored value
    // For now, we'll trigger a new registration initiation error which will tell user to restart
    this.resendLoading = true;

    // Use the stored email (we only have masked version, so user needs to restart if needed)
    this.snackBar.open(
      this.i18n.t('auth.resendNotAvailable'),
      this.i18n.t('common.close'),
      { duration: 5000 }
    );
    this.resendLoading = false;

    // Start cooldown anyway to prevent spam
    this.startCountdown(60);
  }

  cancelRegistration(): void {
    this.authService.clearRegistrationData();
    this.router.navigate(['/register']);
  }

  private clearCode(): void {
    this.codeForm.reset();
    const inputs = this.codeInputs.toArray();
    inputs[0]?.nativeElement.focus();
  }

  private startCountdown(seconds: number): void {
    this.resendCountdown = seconds;

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    this.countdownInterval = setInterval(() => {
      this.resendCountdown--;
      if (this.resendCountdown <= 0 && this.countdownInterval) {
        clearInterval(this.countdownInterval);
      }
    }, 1000);
  }
}
