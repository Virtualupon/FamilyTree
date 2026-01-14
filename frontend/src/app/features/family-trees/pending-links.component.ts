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
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-2xl font-bold mb-6">{{ 'links.pendingRequests' | translate }}</h1>

      @if (loading()) {
        <div class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }

      @if (!loading() && links().length > 0) {
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <div class="divide-y">
            @for (link of links(); track link.id) {
              <div class="p-4">
                <div class="flex justify-between items-start">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                        {{ getLinkTypeLabel(link.linkType) }}
                      </span>
                      <span class="text-sm text-gray-500">
                        {{ 'links.confidence' | translate: { value: link.confidence } }}
                      </span>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <div class="text-xs text-gray-500 uppercase">{{ 'links.source' | translate }}</div>
                        <div class="font-medium">{{ link.sourcePersonName || ('common.unknown' | translate) }}</div>
                        <div class="text-sm text-gray-500">{{ link.sourceTreeName }}</div>
                      </div>
                      <div>
                        <div class="text-xs text-gray-500 uppercase">{{ 'links.target' | translate }}</div>
                        <div class="font-medium">{{ link.targetPersonName || ('common.unknown' | translate) }}</div>
                        <div class="text-sm text-gray-500">{{ link.targetTreeName }}</div>
                      </div>
                    </div>

                    @if (link.notes) {
                      <div class="text-sm text-gray-600 bg-gray-50 rounded p-2 mb-3">
                        {{ link.notes }}
                      </div>
                    }

                    <div class="text-xs text-gray-400">
                      {{ 'links.requestedBy' | translate: { name: link.createdByName || '', date: (link.createdAt | date:'short') || '' } }}
                    </div>
                  </div>

                  <div class="flex gap-2 ml-4">
                    <button
                      (click)="approveLink(link)"
                      class="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700">
                      {{ 'links.approve' | translate }}
                    </button>
                    <button
                      (click)="rejectLink(link)"
                      class="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700">
                      {{ 'links.reject' | translate }}
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      }

      @if (!loading() && links().length === 0) {
        <div class="bg-white rounded-lg shadow p-8 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <h3 class="text-lg font-medium text-gray-900 mb-2">{{ 'links.noPendingRequests' | translate }}</h3>
          <p class="text-gray-500">{{ 'links.allReviewed' | translate }}</p>
        </div>
      }

      <!-- Review Modal -->
      @if (showReviewModal && selectedLink()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="showReviewModal = false">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" (click)="$event.stopPropagation()">
            <div class="p-6">
              <h2 class="text-xl font-semibold mb-4">
                {{ isApproving ? ('links.approveLinkRequest' | translate) : ('links.rejectLinkRequest' | translate) }}
              </h2>

              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ 'common.notesOptional' | translate }}</label>
                <textarea
                  [(ngModel)]="reviewNotes"
                  rows="3"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  [placeholder]="'links.decisionNotesPlaceholder' | translate"></textarea>
              </div>

              <div class="flex gap-3">
                <button
                  type="button"
                  (click)="showReviewModal = false"
                  class="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  {{ 'common.cancel' | translate }}
                </button>
                <button
                  (click)="submitReview()"
                  [disabled]="submitting()"
                  [class]="isApproving ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'"
                  class="flex-1 text-white px-4 py-2 rounded-lg disabled:opacity-50">
                  {{ submitting() ? ('common.submitting' | translate) : (isApproving ? ('links.approve' | translate) : ('links.reject' | translate)) }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
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
