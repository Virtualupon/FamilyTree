import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    @switch (type) {
      @case ('person-card') {
        <div class="skeleton-person-card">
          <div class="ft-skeleton ft-skeleton--avatar"></div>
          <div class="skeleton-person-card__content">
            <div class="ft-skeleton ft-skeleton--title" style="width: 70%"></div>
            <div class="ft-skeleton ft-skeleton--text" style="width: 50%; margin-top: 8px"></div>
          </div>
        </div>
      }
      @case ('text') {
        <div class="ft-skeleton ft-skeleton--text" [style.width]="width"></div>
      }
      @case ('title') {
        <div class="ft-skeleton ft-skeleton--title" [style.width]="width"></div>
      }
      @case ('avatar') {
        <div class="ft-skeleton ft-skeleton--avatar" [style.width]="width" [style.height]="width"></div>
      }
      @case ('card') {
        <div class="skeleton-card">
          <div class="ft-skeleton" style="height: 120px"></div>
          <div style="padding: 16px">
            <div class="ft-skeleton ft-skeleton--title" style="width: 60%"></div>
            <div class="ft-skeleton ft-skeleton--text" style="width: 80%; margin-top: 8px"></div>
            <div class="ft-skeleton ft-skeleton--text" style="width: 40%; margin-top: 8px"></div>
          </div>
        </div>
      }
      @default {
        <div class="ft-skeleton" [style.width]="width" [style.height]="height"></div>
      }
    }
  `,
  styles: [`
    .skeleton-person-card {
      display: flex;
      align-items: flex-start;
      gap: var(--ft-spacing-md);
      padding: var(--ft-spacing-md);
      background: var(--ft-surface);
      border-radius: var(--ft-radius-lg);
      border: 1px solid var(--ft-border);
      
      &__content {
        flex: 1;
      }
    }
    
    .skeleton-card {
      background: var(--ft-surface);
      border-radius: var(--ft-radius-lg);
      border: 1px solid var(--ft-border);
      overflow: hidden;
    }
  `]
})
export class SkeletonComponent {
  @Input() type: 'person-card' | 'text' | 'title' | 'avatar' | 'card' | 'custom' = 'custom';
  @Input() width = '100%';
  @Input() height = '20px';
}
