import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PersonLinkService } from '../../core/services/person-link.service';
import { 
  PersonLink, 
  PersonLinkSearchResult,
  CreatePersonLinkRequest,
  PersonLinkType,
  PersonLinkStatus,
  PersonLinkTypeLabels,
  PersonLinkStatusLabels
} from '../../core/models/family-tree.models';

@Component({
  selector: 'app-person-links',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-white rounded-lg shadow p-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold">Cross-Tree Links</h3>
        <button 
          (click)="showSearchModal = true"
          class="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          Find Matches
        </button>
      </div>

      <!-- Existing Links -->
      @if (links().length > 0) {
        <div class="space-y-3">
          @for (link of links(); track link.id) {
            <div class="border rounded-lg p-3">
              <div class="flex justify-between items-start">
                <div>
                  <div class="font-medium">
                    {{ link.targetPersonName || 'Unknown' }}
                  </div>
                  <div class="text-sm text-gray-500">
                    in {{ link.targetTreeName }}
                  </div>
                  <div class="text-xs text-gray-400 mt-1">
                    {{ getLinkTypeLabel(link.linkType) }} · {{ link.confidence }}% confidence
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span 
                    [class]="getStatusClass(link.status)"
                    class="text-xs px-2 py-1 rounded">
                    {{ getStatusLabel(link.status) }}
                  </span>
                  <button 
                    (click)="deleteLink(link)"
                    class="text-red-600 hover:text-red-800">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <p class="text-gray-500 text-sm">No cross-tree links yet.</p>
      }

      <!-- Search Modal -->
      @if (showSearchModal) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="showSearchModal = false">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col" 
               (click)="$event.stopPropagation()">
            <div class="p-4 border-b">
              <h2 class="text-xl font-semibold">Find Matching Person</h2>
              <p class="text-sm text-gray-500 mt-1">Search for the same person in other trees</p>
            </div>
            
            <div class="p-4 border-b">
              <div class="flex gap-2">
                <input 
                  type="text"
                  [(ngModel)]="searchName"
                  placeholder="Search by name..."
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  (keyup.enter)="search()">
                <button 
                  (click)="search()"
                  [disabled]="searching()"
                  class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {{ searching() ? '...' : 'Search' }}
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto p-4">
              @if (searchResults().length > 0) {
                <div class="space-y-2">
                  @for (result of searchResults(); track result.id) {
                    <div 
                      class="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                      (click)="selectMatch(result)">
                      <div class="flex justify-between items-start">
                        <div>
                          <div class="font-medium">{{ result.primaryName || 'Unknown' }}</div>
                          <div class="text-sm text-gray-500">{{ result.treeName }}</div>
                          @if (result.birthDate) {
                            <div class="text-xs text-gray-400">Born: {{ result.birthDate | date:'yyyy' }}</div>
                          }
                        </div>
                        <button class="text-blue-600 text-sm hover:underline">
                          Link
                        </button>
                      </div>
                    </div>
                  }
                </div>
              } @else if (hasSearched()) {
                <p class="text-center text-gray-500 py-4">No matches found</p>
              }
            </div>

            <div class="p-4 border-t">
              <button 
                (click)="showSearchModal = false"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Create Link Modal -->
      @if (showCreateModal && selectedMatch()) {
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="showCreateModal = false">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" (click)="$event.stopPropagation()">
            <div class="p-6">
              <h2 class="text-xl font-semibold mb-4">Create Link</h2>
              
              <div class="bg-gray-50 rounded-lg p-3 mb-4">
                <div class="font-medium">{{ selectedMatch()!.primaryName }}</div>
                <div class="text-sm text-gray-500">in {{ selectedMatch()!.treeName }}</div>
              </div>

              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Link Type</label>
                <select 
                  [(ngModel)]="newLink.linkType"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option [value]="PersonLinkType.SamePerson">Same Person</option>
                  <option [value]="PersonLinkType.Ancestor">Ancestor</option>
                  <option [value]="PersonLinkType.Related">Related</option>
                </select>
              </div>

              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Confidence (%)</label>
                <input 
                  type="number"
                  [(ngModel)]="newLink.confidence"
                  min="1"
                  max="100"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg">
              </div>

              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea 
                  [(ngModel)]="newLink.notes"
                  rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Optional notes about this link..."></textarea>
              </div>

              @if (createError()) {
                <div class="bg-red-50 text-red-700 px-3 py-2 rounded mb-4 text-sm">{{ createError() }}</div>
              }

              <div class="flex gap-3">
                <button 
                  type="button"
                  (click)="showCreateModal = false"
                  class="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button 
                  (click)="createLink()"
                  [disabled]="creating()"
                  class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {{ creating() ? 'Creating...' : 'Create Link' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class PersonLinksComponent implements OnInit {
  @Input() personId!: string;
  @Input() treeId!: string;
  @Input() personName?: string;

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
    confidence: 100,
    notes: ''
  };
  creating = signal(false);
  createError = signal<string | null>(null);

  PersonLinkType = PersonLinkType;

  constructor(private linkService: PersonLinkService) {}

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
      confidence: this.newLink.confidence || 100,
      notes: this.newLink.notes
    };

    this.linkService.createLink(request).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.selectedMatch.set(null);
        this.creating.set(false);
        this.loadLinks();
      },
      error: (err) => {
        this.createError.set(err.error?.message || 'Failed to create link');
        this.creating.set(false);
      }
    });
  }

  deleteLink(link: PersonLink) {
    if (!confirm('Delete this link?')) return;

    this.linkService.deleteLink(link.id).subscribe({
      next: () => this.loadLinks()
    });
  }

  getLinkTypeLabel(type: PersonLinkType): string {
    return PersonLinkTypeLabels[type];
  }

  getStatusLabel(status: PersonLinkStatus): string {
    return PersonLinkStatusLabels[status];
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
