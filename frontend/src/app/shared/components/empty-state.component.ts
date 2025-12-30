import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  template: `
    <div class="ft-empty-state">
      @if (icon) {
        <i class="fa-solid ft-empty-state__icon" [ngClass]="icon" aria-hidden="true"></i>
      }
      @if (title) {
        <h3 class="ft-empty-state__title">{{ title }}</h3>
      }
      @if (description) {
        <p class="ft-empty-state__description">{{ description }}</p>
      }
      <ng-content></ng-content>
    </div>
  `
})
export class EmptyStateComponent {
  @Input() icon?: string;
  @Input() title?: string;
  @Input() description?: string;
}
