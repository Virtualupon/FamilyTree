import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';

import { PersonSearchService } from '../../core/services/person-search.service';
import { PersonMediaService } from '../../core/services/person-media.service';
import { TreeService } from '../../core/services/tree.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { Sex } from '../../core/models/person.models';
import { SearchPersonItem, getPrimaryName } from '../../core/models/search.models';
import { TreePersonNode } from '../../core/models/tree.models';
import { RelationshipPathResponse } from '../../core/models/relationship-path.models';

export interface RelationshipFinderDialogData {
  fromPerson: TreePersonNode | SearchPersonItem;
}

export interface RelationshipFinderDialogResult {
  pathData: RelationshipPathResponse;
  fromPerson: TreePersonNode | SearchPersonItem;
  toPerson: SearchPersonItem;
}

@Component({
  selector: 'app-relationship-finder-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    TranslatePipe
  ],
  templateUrl: './relationship-finder-dialog.component.html',
  styleUrls: ['./relationship-finder-dialog.component.scss']
})
export class RelationshipFinderDialogComponent implements OnInit, OnDestroy {
  readonly dialogRef = inject(MatDialogRef<RelationshipFinderDialogComponent>);
  readonly data = inject<RelationshipFinderDialogData>(MAT_DIALOG_DATA);
  private readonly searchService = inject(PersonSearchService);
  private readonly mediaService = inject(PersonMediaService);
  private readonly treeService = inject(TreeService);
  private readonly treeContext = inject(TreeContextService);
  private readonly i18n = inject(I18nService);
  private readonly destroy$ = new Subject<void>();

  readonly Sex = Sex;

  // Avatar for FROM person
  fromPersonAvatarUrl = signal<string | null>(null);

  // From person info
  get fromPersonName(): string {
    const person = this.data.fromPerson;
    const lang = this.i18n.currentLang();
    
    // Get language-appropriate name
    let name: string | null | undefined = null;
    
    if (lang === 'ar') {
      name = person.nameArabic || person.nameEnglish || person.primaryName;
    } else if (lang === 'nob') {
      name = person.nameNobiin || person.nameEnglish || person.primaryName;
    } else {
      // English - prefer English, fallback to Arabic, then primaryName
      name = person.nameEnglish || person.nameArabic || person.primaryName;
    }
    
    return name || '';
  }

  get fromPersonSex(): Sex {
    return this.data.fromPerson.sex;
  }

  // Search state
  searchQuery = '';
  searchResults = signal<SearchPersonItem[]>([]);
  searching = signal(false);
  selectedToPerson = signal<SearchPersonItem | null>(null);
  findingPath = signal(false);

  private searchSubject = new Subject<string>();

  ngOnInit(): void {
    // Load FROM person avatar if available
    const person = this.data.fromPerson;
    const avatarMediaId = (person as any).avatarMediaId;
    if (avatarMediaId) {
      this.mediaService.getMediaById(avatarMediaId).subscribe({
        next: (media) => {
          const objectUrl = this.mediaService.createObjectUrl(
            media.base64Data,
            media.mimeType || 'image/jpeg'
          );
          this.fromPersonAvatarUrl.set(objectUrl);
        }
      });
    }

    // Setup search debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      if (query.trim()) {
        this.search(query);
      } else {
        this.searchResults.set([]);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Revoke avatar object URL
    const avatarUrl = this.fromPersonAvatarUrl();
    if (avatarUrl) {
      URL.revokeObjectURL(avatarUrl);
    }
  }

  onSearchChange(query: string): void {
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults.set([]);
  }

  search(query: string): void {
    this.searching.set(true);

    this.searchService.quickSearch(query, 1, 20).subscribe({
      next: (response) => {
        // DEBUG: Log search results to verify familyName and birthPlaceName
        console.log('Search results:', response.items.map(p => ({
          name: p.primaryName,
          familyName: p.familyName,
          birthPlaceName: p.birthPlaceName
        })));
        
        // Filter out the from person
        const filtered = response.items.filter(p => p.id !== this.data.fromPerson.id);
        this.searchResults.set(filtered);
        this.searching.set(false);
      },
      error: (error) => {
        console.error('Search failed:', error);
        this.searchResults.set([]);
        this.searching.set(false);
      }
    });
  }

  // Helper to get display name from SearchPersonItem
  getPersonDisplayName(person: SearchPersonItem | null): string {
    return person ? getPrimaryName(person) : '';
  }

  // Helper to get full lineage name (Person + Father + Grandfather)
  getPersonLineageName(person: SearchPersonItem | null): string {
    if (!person) return '';

    const lang = this.i18n.currentLang();
    const parts: string[] = [];

    // Get person's name based on current language
    let name: string | null = null;
    let fatherName: string | null = null;
    let grandfatherName: string | null = null;

    if (lang === 'ar') {
      name = person.nameArabic || person.nameEnglish || person.primaryName;
      fatherName = person.fatherNameArabic || person.fatherNameEnglish;
      grandfatherName = person.grandfatherNameArabic || person.grandfatherNameEnglish;
    } else if (lang === 'nob') {
      name = person.nameNobiin || person.nameEnglish || person.primaryName;
      fatherName = person.fatherNameNobiin || person.fatherNameEnglish;
      grandfatherName = person.grandfatherNameNobiin || person.grandfatherNameEnglish;
    } else {
      name = person.nameEnglish || person.nameArabic || person.primaryName;
      fatherName = person.fatherNameEnglish || person.fatherNameArabic;
      grandfatherName = person.grandfatherNameEnglish || person.grandfatherNameArabic;
    }

    // Build the lineage string
    if (name) parts.push(name);
    if (fatherName) parts.push(fatherName);
    if (grandfatherName) parts.push(grandfatherName);

    return parts.join(' ');
  }

  // Helper to get full display with lineage: Name Father Grandfather - (Town)
  getPersonFullDisplayName(person: SearchPersonItem | null): string {
    if (!person) return '';

    let result = this.getPersonLineageName(person);

    // Add tree name if available
    if (person.treeName) {
      result += ` - (${person.treeName})`;
    }

    // Add town name (language-aware) if available
    const locationName = this.getLocationDisplayName(person);
    if (locationName) {
      result += ` - (${locationName})`;
    }

    return result;
  }

  // Get location name (town or country fallback) based on current language
  getLocationDisplayName(person: SearchPersonItem): string {
    const lang = this.i18n.currentLang();

    // Try town first
    let townName = '';
    if (lang === 'ar') {
      townName = person.townNameAr || person.townNameEn || person.townName || '';
    } else if (lang === 'nob') {
      townName = person.townName || person.townNameEn || person.townNameAr || '';
    } else {
      townName = person.townNameEn || person.townName || person.townNameAr || '';
    }

    if (townName) return townName;

    // Fallback to country
    if (lang === 'ar') {
      return person.countryNameAr || person.countryNameEn || '';
    }
    return person.countryNameEn || person.countryNameAr || '';
  }

  selectToPerson(person: SearchPersonItem): void {
    if (person.id === this.data.fromPerson.id) {
      return;
    }
    this.selectedToPerson.set(person);
  }

  clearToPerson(): void {
    this.selectedToPerson.set(null);
  }

  findRelationship(): void {
    const toPerson = this.selectedToPerson();
    if (!toPerson) {
      return;
    }

    this.findingPath.set(true);

    const treeId = this.treeContext.effectiveTreeId();

    this.treeService.findRelationshipPath({
      person1Id: this.data.fromPerson.id,
      person2Id: toPerson.id,
      treeId: treeId || undefined
    }).subscribe({
      next: (pathData) => {
        this.findingPath.set(false);

        const result: RelationshipFinderDialogResult = {
          pathData,
          fromPerson: this.data.fromPerson,
          toPerson
        };

        this.dialogRef.close(result);
      },
      error: (error) => {
        console.error('Failed to find relationship:', error);
        this.findingPath.set(false);
        // TODO: Show error snackbar
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  formatYear(dateStr: string | null): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
    }
  }
}