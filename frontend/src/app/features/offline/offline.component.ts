import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { NetworkService } from '../../core/services/network.service';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../core/i18n';

@Component({
  selector: 'app-offline',
  standalone: true,
  imports: [CommonModule, MatButtonModule, TranslatePipe],
  templateUrl: './offline.component.html',
  styleUrls: ['./offline.component.scss']
})
export class OfflineComponent {
  readonly networkService = inject(NetworkService);
  private readonly router = inject(Router);

  tryAgain(): void {
    window.location.reload();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
