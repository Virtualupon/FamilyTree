import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

import { TreePersonNode, TreeUnionNode } from '../../core/models/tree.models';
import { Sex } from '../../core/models/person.models';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { PersonMediaService } from '../../core/services/person-media.service';

/**
 * Represents a couple (two partners) and their children
 */
interface CoupleData {
  partner1: TreePersonNode | null;  // First partner (could be either sex)
  partner2: TreePersonNode | null;  // Second partner (spouse)
  union: TreeUnionNode | null;
  children: TreePersonNode[];
}

@Component({
  selector: 'app-family-sheet',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule,
    TranslatePipe
  ],
  templateUrl: './family-sheet.component.html',
  styleUrls: ['./family-sheet.component.scss']
})
export class FamilySheetComponent implements OnChanges, OnDestroy {
  private readonly i18n = inject(I18nService);
  private readonly mediaService = inject(PersonMediaService);

  // Avatar cache: personId -> objectUrl (must be revoked on destroy)
  private avatarCache = new Map<string, string>();

  @Input() person: TreePersonNode | null = null;
  @Input() selectedPersonId: string | null = null;

  @Output() personSelected = new EventEmitter<TreePersonNode>();
  @Output() personDoubleClicked = new EventEmitter<TreePersonNode>();
  @Output() personEdit = new EventEmitter<TreePersonNode>();

  readonly Sex = Sex;

  // Family data signals
  ownFamily = signal<CoupleData | null>(null);
  parentFamily = signal<CoupleData | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['person'] && this.person) {
      this.buildFamilyData();
      this.loadAvatars();
    }
  }

  ngOnDestroy(): void {
    // Revoke all object URLs to prevent memory leaks
    this.avatarCache.forEach(url => {
      URL.revokeObjectURL(url);
    });
    this.avatarCache.clear();
  }

  /**
   * Check if a person is male
   */
  isMale(person: TreePersonNode | null | undefined): boolean {
    if (!person) return false;
    return person.sex === Sex.Male;
  }

  /**
   * Check if a person is female
   */
  isFemale(person: TreePersonNode | null | undefined): boolean {
    if (!person) return false;
    return person.sex === Sex.Female;
  }

  /**
   * Get the role label for a person (Husband/Wife/Father/Mother)
   */
  getRoleLabel(person: TreePersonNode | null | undefined, isParentContext: boolean): string {
    if (!person) return '';

    if (isParentContext) {
      return this.isMale(person)
        ? this.i18n.t('familySheet.father')
        : this.i18n.t('familySheet.mother');
    }
    return this.isMale(person)
      ? this.i18n.t('familySheet.husband')
      : this.i18n.t('familySheet.wife');
  }

  private buildFamilyData(): void {
    if (!this.person) {
      this.ownFamily.set(null);
      this.parentFamily.set(null);
      return;
    }

    // Build person's own family (with spouse and children)
    this.buildOwnFamily();

    // Build parent's family (where this person is a child)
    this.buildParentFamily();
  }

  private buildOwnFamily(): void {
    if (!this.person) return;

    // Get children from person.children (populated in descendants/hourglass mode)
    const children = this.person.children || [];

    if (this.person.unions && this.person.unions.length > 0) {
      // Find the first union that has partners (spouse data)
      const union = this.person.unions.find(u => u.partners && u.partners.length > 0) || this.person.unions[0];
      const spouse = union.partners.find(p => p.id !== this.person!.id) || null;

      // Order: Male first, then Female (for consistent display)
      let partner1: TreePersonNode | null = null;
      let partner2: TreePersonNode | null = null;

      if (this.isMale(this.person)) {
        partner1 = this.person;
        partner2 = spouse;
      } else if (this.isMale(spouse)) {
        partner1 = spouse;
        partner2 = this.person;
      } else {
        // Neither is male, or unknown - put selected person first
        partner1 = this.person;
        partner2 = spouse;
      }

      this.ownFamily.set({
        partner1,
        partner2,
        union,
        children
      });
    } else {
      // No union - just show the person alone
      this.ownFamily.set({
        partner1: this.person,
        partner2: null,
        union: null,
        children
      });
    }
  }

  private buildParentFamily(): void {
    if (!this.person || !this.person.parents || this.person.parents.length === 0) {
      this.parentFamily.set(null);
      return;
    }

    // Find father and mother from parents
    const father = this.person.parents.find(p => this.isMale(p)) || null;
    const mother = this.person.parents.find(p => this.isFemale(p)) || null;

    // If we can't determine sex, just use the first two parents
    let parent1 = father;
    let parent2 = mother;

    if (!parent1 && !parent2 && this.person.parents.length > 0) {
      parent1 = this.person.parents[0];
      parent2 = this.person.parents.length > 1 ? this.person.parents[1] : null;
    } else if (!parent1 && parent2) {
      // Only mother found, swap to show in first position
      parent1 = parent2;
      parent2 = null;
    }

    // Try to find siblings from parents' children
    let siblings: TreePersonNode[] = [];
    if (father?.children && father.children.length > 0) {
      siblings = father.children;
    } else if (mother?.children && mother.children.length > 0) {
      siblings = mother.children;
    }

    // Get union from either parent
    let parentUnion: TreeUnionNode | null = null;
    if (father?.unions && father.unions.length > 0) {
      parentUnion = father.unions.find(u =>
        u.partners.some(p => p.id === mother?.id)
      ) || father.unions[0];
    } else if (mother?.unions && mother.unions.length > 0) {
      parentUnion = mother.unions.find(u =>
        u.partners.some(p => p.id === father?.id)
      ) || mother.unions[0];
    }

    this.parentFamily.set({
      partner1: parent1,
      partner2: parent2,
      union: parentUnion,
      children: siblings
    });
  }

  private async loadAvatars(): Promise<void> {
    const people: TreePersonNode[] = [];

    const ownFamily = this.ownFamily();
    const parentFamily = this.parentFamily();

    if (ownFamily?.partner1) people.push(ownFamily.partner1);
    if (ownFamily?.partner2) people.push(ownFamily.partner2);
    if (ownFamily?.children) people.push(...ownFamily.children);
    if (parentFamily?.partner1) people.push(parentFamily.partner1);
    if (parentFamily?.partner2) people.push(parentFamily.partner2);
    if (parentFamily?.children) people.push(...parentFamily.children);

    for (const person of people) {
      if (person.avatarMediaId && !this.avatarCache.has(person.id)) {
        try {
          const media = await this.mediaService.getMediaById(person.avatarMediaId).toPromise();
          if (media) {
            const objectUrl = this.mediaService.createObjectUrl(
              media.base64Data,
              media.mimeType || 'image/jpeg'
            );
            this.avatarCache.set(person.id, objectUrl);
          }
        } catch (err) {
          console.error('Failed to load avatar for', person.id);
        }
      }
    }
  }

  getDisplayName(person: TreePersonNode | null | undefined): string {
    if (!person) return '';
    const lang = this.i18n.currentLang();
    if (lang === 'ar') {
      return person.nameArabic || person.nameEnglish || person.primaryName || '';
    }
    if (lang === 'nob') {
      return person.nameNobiin || person.nameEnglish || person.primaryName || '';
    }
    return person.nameEnglish || person.nameArabic || person.primaryName || '';
  }

  getInitials(person: TreePersonNode | null | undefined): string {
    const name = this.getDisplayName(person);
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(this.i18n.currentLang() === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  formatYear(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
    }
  }

  getAvatarUrl(personId: string): string | null {
    return this.avatarCache.get(personId) || null;
  }

  calculateAge(birthDate: string | undefined, deathDate: string | undefined): number | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const death = deathDate ? new Date(deathDate) : new Date();
    const age = Math.floor((death.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= 0 ? age : null;
  }

  onPersonClick(person: TreePersonNode): void {
    this.personSelected.emit(person);
  }

  onPersonDoubleClick(person: TreePersonNode): void {
    this.personDoubleClicked.emit(person);
  }

  onPersonEdit(person: TreePersonNode, event: Event): void {
    event.stopPropagation();
    this.personEdit.emit(person);
  }
}
