import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PersonLinkService } from '../../core/services/person-link.service';
import {
  PersonLink,
  PersonLinkSearchResult,
  CreatePersonLinkRequest,
  PersonLinkType,
  PersonLinkStatus
} from '../../core/models/family-tree.models';
import { I18nService, TranslatePipe } from '../../core/i18n';

@Component({
  selector: 'app-person-links',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './person-links.component.html'
})
export class PersonLinksComponent implements OnInit {
  @Input() personId!: string;
  @Input() treeId!: string;
  @Input() personName?: string;

  private readonly i18n = inject(I18nService);
  private readonly linkService = inject(PersonLinkService);

  links = signal<PersonLink[]>([]);

  showSearchModal = false;
  searchName = '';
  searchResults = signal<PersonLinkSearchResult[]>([]);
  searching = signal(false);
  hasSearched = signal(false);

  showCreateModal = false;
  selectedMatch = signal<PersonLinkSearchResult | null>(null);
  newLink: Partial<CreatePersonLinkRequest> = {
    linkType: PersonLinkType.SamePerson,
    confidence: 100
  };
  creating = signal(false);
  createError = signal<string | null>(null);

  PersonLinkType = PersonLinkType;

  ngOnInit() {
    this.loadLinks();
    if (this.personName) {
      this.searchName = this.personName;
    }
  }

  loadLinks() {
    this.linkService.getPersonLinks(this.personId).subscribe({
      next: (links) => this.links.set(links)
    });
  }

  search() {
    if (!this.searchName.trim() || this.searchName.length < 2) return;

    this.searching.set(true);
    this.hasSearched.set(false);

    this.linkService.searchForMatches(this.searchName, undefined, this.treeId).subscribe({
      next: (results) => {
        this.searchResults.set(results);
        this.searching.set(false);
        this.hasSearched.set(true);
      },
      error: () => {
        this.searching.set(false);
        this.hasSearched.set(true);
      }
    });
  }

  selectMatch(result: PersonLinkSearchResult) {
    this.selectedMatch.set(result);
    this.showSearchModal = false;
    this.showCreateModal = true;
  }

  createLink() {
    const match = this.selectedMatch();
    if (!match) return;

    this.creating.set(true);
    this.createError.set(null);

    const request: CreatePersonLinkRequest = {
      sourcePersonId: this.personId,
      targetPersonId: match.id,
      linkType: this.newLink.linkType || PersonLinkType.SamePerson,
      confidence: this.newLink.confidence || 100
    };

    this.linkService.createLink(request).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.selectedMatch.set(null);
        this.creating.set(false);
        this.loadLinks();
      },
      error: (err) => {
        this.createError.set(err.error?.message || this.i18n.t('links.failedCreateLink'));
        this.creating.set(false);
      }
    });
  }

  deleteLink(link: PersonLink) {
    if (!confirm(this.i18n.t('links.confirmDelete'))) return;

    this.linkService.deleteLink(link.id).subscribe({
      next: () => this.loadLinks()
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

  getStatusLabel(status: PersonLinkStatus): string {
    const statusKeys: Record<PersonLinkStatus, string> = {
      [PersonLinkStatus.Pending]: 'links.statusPending',
      [PersonLinkStatus.Approved]: 'links.statusApproved',
      [PersonLinkStatus.Rejected]: 'links.statusRejected'
    };
    return this.i18n.t(statusKeys[status] || 'common.unknown');
  }

  getStatusClass(status: PersonLinkStatus): string {
    switch (status) {
      case PersonLinkStatus.Approved: return 'bg-green-100 text-green-800';
      case PersonLinkStatus.Pending: return 'bg-yellow-100 text-yellow-800';
      case PersonLinkStatus.Rejected: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
}
