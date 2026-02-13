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
  templateUrl: './person-name-avatar.component.html',
  styleUrls: ['./person-name-avatar.component.scss']
})
export class PersonNameAvatarComponent implements OnChanges, OnDestroy {
  private mediaService = inject(PersonMediaService);
  private i18n = inject(I18nService);

  // Expose Sex enum to template
  readonly Sex = Sex;

  @Input() person: PersonNameAvatarData | null = null;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() linkToProfile = false;
  @Input() showFullLineage = false;

  avatarUrl = signal<string | null>(null);
  isLoading = signal(false);

  private lastLoadedMediaId: string | null = null;

  get displayName(): string {
    if (!this.person) return '';

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
    // No cleanup needed - browser manages signed URL cache
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

    // Fetch signed URL for avatar - browser will cache the image
    this.isLoading.set(true);
    this.mediaService.getSignedUrl(mediaId).subscribe({
      next: (signedUrl) => {
        this.isLoading.set(false);
        this.lastLoadedMediaId = mediaId;
        // Use signed URL directly - browser handles caching via HTTP headers
        this.avatarUrl.set(signedUrl.url);
      },
      error: () => {
        this.isLoading.set(false);
        this.lastLoadedMediaId = mediaId;
      }
    });
  }
}
