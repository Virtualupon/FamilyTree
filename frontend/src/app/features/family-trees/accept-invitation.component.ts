import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FamilyTreeService } from '../../core/services/family-tree.service';
import { AuthService } from '../../core/services/auth.service';
import { FamilyTree } from '../../core/models/family-tree.models';
import { I18nService, TranslatePipe } from '../../core/i18n';

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './accept-invitation.component.html'
})
export class AcceptInvitationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly treeService = inject(FamilyTreeService);
  private readonly authService = inject(AuthService);
  private readonly i18n = inject(I18nService);

  loading = signal(true);
  error = signal<string | null>(null);
  success = signal(false);
  tree = signal<FamilyTree | null>(null);
  needsLogin = signal(false);
  currentUrl = '';

  ngOnInit() {
    this.currentUrl = this.router.url;
    const token = this.route.snapshot.queryParamMap.get('token');
    
    if (!token) {
      this.error.set(this.i18n.t('invitation.invalidLink'));
      this.loading.set(false);
      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.needsLogin.set(true);
      this.loading.set(false);
      return;
    }

    this.acceptInvitation(token);
  }

  acceptInvitation(token: string) {
    this.treeService.acceptInvitation({ token }).subscribe({
      next: (tree) => {
        this.tree.set(tree);
        this.success.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || this.i18n.t('invitation.failedAccept'));
        this.loading.set(false);
      }
    });
  }
}
