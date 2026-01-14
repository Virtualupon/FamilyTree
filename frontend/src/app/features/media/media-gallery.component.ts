import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../core/i18n';

@Component({
  selector: 'app-media-gallery',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `<h1>{{ 'media.galleryComingSoon' | translate }}</h1>`
})
export class MediaGalleryComponent {}
