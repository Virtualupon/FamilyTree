import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../core/i18n';

@Component({
  selector: 'app-media-gallery',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './media-gallery.component.html'
})
export class MediaGalleryComponent {}
