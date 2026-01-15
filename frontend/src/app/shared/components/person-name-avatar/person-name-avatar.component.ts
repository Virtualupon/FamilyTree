import { Component, Input, inject, signal, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PersonMediaService } from '../../../core/services/person-media.service';
import { I18nService } from '../../../core/i18n';
import { Sex } from '../../../core/models/person.models';

export interface PersonNameAvatarData {
  id: string;
  primaryName?: string | null;
  nameArabic?: string | null;
  nameEnglish?: string | null;
  nameNobiin?: string | null;
  sex?: Sex | number | null;
  avatarMediaId?: string | null;
}

@Component({
  selector: 'app-person-name-avatar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatProgressSpinnerModule],
  template: `
    <span class="person-name-avatar" [class.clickable]="linkToProfile">
      <span
        class="avatar"
        [class.avatar--male]="person?.sex === 1"
        [class.avatar--female]="person?.sex === 2"
        [class.avatar--small]="size === 'small'"
        [class.avatar--medium]="size === 'medium'"
        [class.avatar--large]="size === 'large'">
        @if (avatarUrl()) {
          <img [src]="avatarUrl()" [alt]="displayName" class="avatar__img">
        } @else if (isLoading()) {
          <mat-spinner [diameter]="spinnerSize"></mat-spinner>
        } @else {
          <span class="avatar__initials">{{ initials }}</span>
        }
      </span>
      @if (linkToProfile && person && person.id) {
        <a [routerLink]="['/persons', person.id]" class="name-link">{{ displayName }}</a>
      } @else {
        <span class="name-text">{{ displayName }}</span>
      }
    </span>
  `,
  styles: [`
    .person-name-avatar {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background-color: var(--ft-surface-variant, #e0e0e0);
      overflow: hidden;
      flex-shrink: 0;

      &--small {
        width: 24px;
        height: 24px;
        font-size: 10px;
      }

      &--medium {
        width: 32px;
        height: 32px;
        font-size: 12px;
      }

      &--large {
        width: 40px;
        height: 40px;
        font-size: 14px;
      }

      &--male {
        background-color: var(--ft-male-bg, #e3f2fd);
        color: var(--ft-male-fg, #1565c0);
      }

      &--female {
        background-color: var(--ft-female-bg, #fce4ec);
        color: var(--ft-female-fg, #c2185b);
      }

      &__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      &__initials {
        font-weight: 500;
        text-transform: uppercase;
      }
    }

    .name-link {
      color: var(--ft-primary, #1976d2);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    .name-text {
      color: inherit;
    }
  `]
})
export class PersonNameAvatarComponent implements OnChanges, OnDestroy {
  private mediaService = inject(PersonMediaService);
  private i18n = inject(I18nService);

  @Input() person: PersonNameAvatarData | null = null;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() linkToProfile = false;
  @Input() showFullLineage = false;

  avatarUrl = signal<string | null>(null);
  isLoading = signal(false);

  private lastLoadedMediaId: string | null = null;
  private objectUrl: string | null = null;

  get displayName(): string {
    if (!this.person) return this.i18n.t('common.unknown');

    const lang = this.i18n.currentLang();
    if (lang === 'ar') {
      return this.person.nameArabic || this.person.nameEnglish || this.person.primaryName || '';
    } else if (lang === 'nob') {
      return this.person.nameNobiin || this.person.nameEnglish || this.person.primaryName || '';
    }
    return this.person.nameEnglish || this.person.nameArabic || this.person.primaryName || '';
  }

  get initials(): string {
    const name = this.displayName;
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2);
    return (parts[0][0] + parts[parts.length - 1][0]);
  }

  get spinnerSize(): number {
    const sizes = { small: 12, medium: 16, large: 20 };
    return sizes[this.size] || 16;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['person']) {
      this.loadAvatar();
    }
  }

  ngOnDestroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }

  private loadAvatar(): void {
    const mediaId = this.person?.avatarMediaId;

    if (!mediaId) {
      this.avatarUrl.set(null);
      this.lastLoadedMediaId = null;
      return;
    }

    if (mediaId === this.lastLoadedMediaId && this.avatarUrl()) {
      return;
    }

    this.isLoading.set(true);
    this.mediaService.getMediaById(mediaId).subscribe({
      next: (media) => {
        this.isLoading.set(false);
        this.lastLoadedMediaId = mediaId;

        if (this.objectUrl) {
          URL.revokeObjectURL(this.objectUrl);
        }

        if (media?.base64Data) {
          this.objectUrl = this.mediaService.createObjectUrl(
            media.base64Data,
            media.mimeType || 'image/jpeg'
          );
          this.avatarUrl.set(this.objectUrl);
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.lastLoadedMediaId = mediaId;
      }
    });
  }
}
