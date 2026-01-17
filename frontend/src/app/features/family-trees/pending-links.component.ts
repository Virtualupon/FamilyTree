import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PersonLinkService } from '../../core/services/person-link.service';
import {
  PersonLink,
  PersonLinkType
} from '../../core/models/family-tree.models';
import { I18nService, TranslatePipe } from '../../core/i18n';

@Component({
  selector: 'app-pending-links',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './pending-links.component.html'
})
export class PendingLinksComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  private readonly linkService = inject(PersonLinkService);

  links = signal<PersonLink[]>([]);
  loading = signal(true);

  showReviewModal = false;
  selectedLink = signal<PersonLink | null>(null);
  isApproving = true;
  reviewNotes = '';
  submitting = signal(false);

  ngOnInit() {
    this.loadLinks();
  }

  loadLinks() {
    this.loading.set(true);
    this.linkService.getPendingLinks().subscribe({
      next: (links) => {
        this.links.set(links);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  approveLink(link: PersonLink) {
    this.selectedLink.set(link);
    this.isApproving = true;
    this.reviewNotes = '';
    this.showReviewModal = true;
  }

  rejectLink(link: PersonLink) {
    this.selectedLink.set(link);
    this.isApproving = false;
    this.reviewNotes = '';
    this.showReviewModal = true;
  }

  submitReview() {
    const link = this.selectedLink();
    if (!link) return;

    this.submitting.set(true);

    this.linkService.reviewLink(link.id, {
      approve: this.isApproving,
      notes: this.reviewNotes || undefined
    }).subscribe({
      next: () => {
        this.showReviewModal = false;
        this.selectedLink.set(null);
        this.submitting.set(false);
        this.loadLinks();
      },
      error: (err) => {
        alert(err.error?.message || this.i18n.t('links.failedSubmitReview'));
        this.submitting.set(false);
      }
    });
  }

  getLinkTypeLabel(type: PersonLinkType): string {
    const typeKeys: Record<PersonLinkType, string> = {
      [PersonLinkType.SamePerson]: 'crossTree.samePerson',
      [PersonLinkType.Ancestor]: 'crossTree.ancestor',
      [PersonLinkType.Related]: 'crossTree.related'
    };
    return this.i18n.t(typeKeys[type] || 'common.unknown');
  }
}
