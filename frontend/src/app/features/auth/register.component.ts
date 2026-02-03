import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n';
import { TownInfo, InitiateRegistrationRequest } from '../../core/models/auth.models';

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
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslateModule
  ],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  registerForm: FormGroup;
  loading = false;
  towns: TownInfo[] = [];
  townsLoading = true;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private i18n: I18nService
  ) {
    this.registerForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        // Match backend requirements: uppercase, lowercase, digit
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
      ]],
      homeTownId: [null]  // Optional
    });
  }

  ngOnInit(): void {
    this.loadTowns();
  }

  private loadTowns(): void {
    this.authService.getTownsForRegistration().subscribe({
      next: (towns) => {
        this.towns = towns;
        this.townsLoading = false;
      },
      error: () => {
        this.townsLoading = false;
        // Don't block registration if towns fail to load
      }
    });
  }

  onSubmit() {
    if (this.registerForm.invalid) return;

    this.loading = true;

    const request: InitiateRegistrationRequest = {
      email: this.registerForm.value.email,
      password: this.registerForm.value.password,
      firstName: this.registerForm.value.firstName,
      lastName: this.registerForm.value.lastName,
      homeTownId: this.registerForm.value.homeTownId || undefined
    };

    // Use two-phase registration
    this.authService.initiateRegistration(request).subscribe({
      next: (response) => {
        this.loading = false;

        if (response.success && response.registrationToken) {
          // Navigate to verification page
          this.router.navigate(['/verify-email']);
        } else {
          // Show message (could be rate limit or other issue)
          this.snackBar.open(
            response.message,
            this.i18n.t('common.close'),
            { duration: 5000 }
          );
        }
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(
          error.error?.message || this.i18n.t('auth.registerFailed'),
          this.i18n.t('common.close'),
          { duration: 3000, panelClass: ['error-snackbar'] }
        );
      }
    });
  }
}
