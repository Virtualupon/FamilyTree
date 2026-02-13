import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService } from '../../core/i18n';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    TranslateModule
  ],
  template: `
    <div class="nubian-help">
      <div class="nubian-help__pattern"></div>

      <div class="nubian-help__card">
        <!-- Header -->
        <div class="nubian-help__header">
          <div class="nubian-help__logo">
            <i class="fa-solid fa-tree" aria-hidden="true"></i>
          </div>
          <h1>{{ 'help.title' | translate }}</h1>
          <p>{{ 'help.subtitle' | translate }}</p>
        </div>

        <!-- Content -->
        <div class="nubian-help__content">
          <!-- What is this platform -->
          <section class="nubian-help__section">
            <div class="nubian-help__section-icon">
              <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
            </div>
            <h2>{{ 'help.whatIsTitle' | translate }}</h2>
            <p>{{ 'help.whatIsDescription' | translate }}</p>
          </section>

          <!-- How to get started -->
          <section class="nubian-help__section">
            <div class="nubian-help__section-icon">
              <i class="fa-solid fa-rocket" aria-hidden="true"></i>
            </div>
            <h2>{{ 'help.getStartedTitle' | translate }}</h2>
            <div class="nubian-help__steps">
              <div class="nubian-help__step">
                <span class="step-number">1</span>
                <div>
                  <strong>{{ 'help.step1Title' | translate }}</strong>
                  <p>{{ 'help.step1Description' | translate }}</p>
                </div>
              </div>
              <div class="nubian-help__step">
                <span class="step-number">2</span>
                <div>
                  <strong>{{ 'help.step2Title' | translate }}</strong>
                  <p>{{ 'help.step2Description' | translate }}</p>
                </div>
              </div>
              <div class="nubian-help__step">
                <span class="step-number">3</span>
                <div>
                  <strong>{{ 'help.step3Title' | translate }}</strong>
                  <p>{{ 'help.step3Description' | translate }}</p>
                </div>
              </div>
              <div class="nubian-help__step">
                <span class="step-number">4</span>
                <div>
                  <strong>{{ 'help.step4Title' | translate }}</strong>
                  <p>{{ 'help.step4Description' | translate }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Registration info -->
          <section class="nubian-help__section">
            <div class="nubian-help__section-icon">
              <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
            </div>
            <h2>{{ 'help.registrationTitle' | translate }}</h2>
            <p>{{ 'help.registrationDescription' | translate }}</p>
            <ul class="nubian-help__list">
              <li><i class="fa-solid fa-user" aria-hidden="true"></i> {{ 'help.regFieldName' | translate }}</li>
              <li><i class="fa-solid fa-envelope" aria-hidden="true"></i> {{ 'help.regFieldEmail' | translate }}</li>
              <li><i class="fa-solid fa-lock" aria-hidden="true"></i> {{ 'help.regFieldPassword' | translate }}</li>
              <li><i class="fa-solid fa-location-dot" aria-hidden="true"></i> {{ 'help.regFieldHometown' | translate }}</li>
            </ul>
          </section>

          <!-- Features -->
          <section class="nubian-help__section">
            <div class="nubian-help__section-icon">
              <i class="fa-solid fa-star" aria-hidden="true"></i>
            </div>
            <h2>{{ 'help.featuresTitle' | translate }}</h2>
            <div class="nubian-help__features">
              <div class="feature-item">
                <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
                <span>{{ 'help.featureTree' | translate }}</span>
              </div>
              <div class="feature-item">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <span>{{ 'help.featureSearch' | translate }}</span>
              </div>
              <div class="feature-item">
                <i class="fa-solid fa-images" aria-hidden="true"></i>
                <span>{{ 'help.featureMedia' | translate }}</span>
              </div>
              <div class="feature-item">
                <i class="fa-solid fa-language" aria-hidden="true"></i>
                <span>{{ 'help.featureMultilingual' | translate }}</span>
              </div>
            </div>
          </section>

          <!-- Actions -->
          <div class="nubian-help__actions">
            <a mat-raised-button class="nubian-help__btn-primary" routerLink="/register">
              <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
              {{ 'help.createAccount' | translate }}
            </a>
            <a mat-stroked-button class="nubian-help__btn-secondary" routerLink="/login">
              <i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>
              {{ 'help.signIn' | translate }}
            </a>
          </div>
        </div>
      </div>

      <!-- Language switcher -->
      <div class="nubian-help__lang-switcher">
        @for (lang of i18n.supportedLanguages; track lang.code) {
          <button
            class="lang-btn"
            [class.active]="i18n.currentLang() === lang.code"
            (click)="i18n.setLanguage(lang.code)">
            <img [src]="'assets/flags/' + lang.flag + '.svg'" [alt]="lang.name" class="lang-flag">
            <span>{{ lang.nativeName }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .nubian-help {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
      background: linear-gradient(135deg, #FFF9F5 0%, #FFF5EB 50%, #F4E4D7 100%);
      position: relative;
      overflow: hidden;
    }

    .nubian-help::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.06;
      background-image:
        repeating-linear-gradient(45deg, transparent, transparent 35px, #C17E3E 35px, #C17E3E 37px),
        repeating-linear-gradient(-45deg, transparent, transparent 35px, #187573 35px, #187573 37px);
      background-size: 80px 80px;
      z-index: 0;
    }

    .nubian-help > * {
      position: relative;
      z-index: 1;
    }

    .nubian-help__card {
      width: 100%;
      max-width: 640px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      box-shadow: 0 20px 40px rgba(45, 45, 45, 0.15);
      overflow: hidden;
      animation: scaleIn 0.5s ease-out;
    }

    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.9); }
      to { opacity: 1; transform: scale(1); }
    }

    .nubian-help__header {
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

    .nubian-help__logo {
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

    .nubian-help__content {
      padding: 2rem 1.5rem;
    }

    .nubian-help__section {
      margin-bottom: 2rem;

      &:last-of-type {
        margin-bottom: 1.5rem;
      }

      h2 {
        color: #187573;
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0 0 0.75rem;
      }

      p {
        color: #2D2D2D;
        line-height: 1.6;
        margin: 0 0 0.5rem;
      }
    }

    .nubian-help__section-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: rgba(24, 117, 115, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 0.75rem;

      i {
        color: #187573;
        font-size: 1.1rem;
      }
    }

    .nubian-help__steps {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .nubian-help__step {
      display: flex;
      gap: 1rem;
      align-items: flex-start;

      .step-number {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: linear-gradient(135deg, #187573, #2B9A97);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 0.875rem;
        flex-shrink: 0;
      }

      strong {
        color: #2D2D2D;
        display: block;
        margin-bottom: 0.25rem;
      }

      p {
        color: #6B6B6B;
        font-size: 0.875rem;
        margin: 0;
      }
    }

    .nubian-help__list {
      list-style: none;
      padding: 0;
      margin: 0.75rem 0 0;

      li {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0;
        color: #2D2D2D;
        border-bottom: 1px solid #F4E4D7;

        &:last-child {
          border-bottom: none;
        }

        i {
          color: #C17E3E;
          width: 20px;
          text-align: center;
        }
      }
    }

    .nubian-help__features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-top: 0.75rem;

      @media (max-width: 480px) {
        grid-template-columns: 1fr;
      }
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 12px;
      background: rgba(24, 117, 115, 0.05);
      border: 1px solid rgba(24, 117, 115, 0.1);

      i {
        color: #187573;
      }

      span {
        font-size: 0.875rem;
        color: #2D2D2D;
      }
    }

    .nubian-help__actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #F4E4D7;
    }

    .nubian-help__btn-primary {
      background: linear-gradient(135deg, #187573, #2B9A97) !important;
      color: white !important;
      border-radius: 12px !important;
      height: 48px;
      font-weight: 600;
      font-size: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      text-decoration: none;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(24, 117, 115, 0.35);
      }
    }

    .nubian-help__btn-secondary {
      border-color: #187573 !important;
      color: #187573 !important;
      border-radius: 12px !important;
      height: 48px;
      font-weight: 600;
      font-size: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      text-decoration: none;

      &:hover {
        background: rgba(24, 117, 115, 0.06) !important;
      }
    }

    .nubian-help__lang-switcher {
      display: flex;
      gap: 0.5rem;
      margin-top: 1.5rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .lang-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      border: 1px solid #CEC5B0;
      background: rgba(255, 255, 255, 0.8);
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 0.875rem;
      color: #2D2D2D;

      &:hover {
        border-color: #187573;
        background: rgba(255, 255, 255, 0.95);
      }

      &.active {
        border-color: #187573;
        background: rgba(24, 117, 115, 0.1);
        font-weight: 600;
      }
    }

    .lang-flag {
      width: 20px;
      height: 14px;
      object-fit: cover;
      border-radius: 2px;
    }

    @media (max-width: 480px) {
      .nubian-help__card {
        border-radius: 16px;
      }

      .nubian-help__header {
        padding: 1.5rem 1rem;

        h1 { font-size: 1.5rem; }
      }

      .nubian-help__logo {
        width: 64px;
        height: 64px;

        i { font-size: 2rem; }
      }

      .nubian-help__content {
        padding: 1.5rem 1rem;
      }
    }
  `]
})
export class HelpComponent {
  readonly i18n = inject(I18nService);
}
