import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  inject,
  computed,
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

interface FamilyData {
  husband: TreePersonNode | null;
  wife: TreePersonNode | null;
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
export class FamilySheetComponent implements OnChanges {
  private readonly i18n = inject(I18nService);
  private readonly mediaService = inject(PersonMediaService);

  // Avatar cache: personId -> dataUrl
  private avatarCache = new Map<string, string>();

  @Input() person: TreePersonNode | null = null;
  @Input() selectedPersonId: string | null = null;

  @Output() personSelected = new EventEmitter<TreePersonNode>();
  @Output() personDoubleClicked = new EventEmitter<TreePersonNode>();

  readonly Sex = Sex;

  // Computed family data
  familyData = signal<FamilyData | null>(null);
  parentFamilyData = signal<FamilyData | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['person'] && this.person) {
      this.buildFamilyData();
      this.loadAvatars();
    }
  }

  private buildFamilyData(): void {
    if (!this.person) {
      this.familyData.set(null);
      this.parentFamilyData.set(null);
      return;
    }

    // Build person's own family (with spouse and children)
    if (this.person.unions && this.person.unions.length > 0) {
      const union = this.person.unions[0]; // Primary union
      const spouse = union.partners.find(p => p.id !== this.person!.id) || null;

      let husband: TreePersonNode | null = null;
      let wife: TreePersonNode | null = null;

      if (this.person.sex === Sex.Male) {
        husband = this.person;
        wife = spouse;
      } else {
        wife = this.person;
        husband = spouse;
      }

      this.familyData.set({
        husband,
        wife,
        union,
        children: union.children || []
      });
    } else {
      // No union, just show the person
      this.familyData.set({
        husband: this.person.sex === Sex.Male ? this.person : null,
        wife: this.person.sex === Sex.Female ? this.person : null,
        union: null,
        children: this.person.children || []
      });
    }

    // Build parent's family (the family where this person is a child)
    if (this.person.parents && this.person.parents.length > 0) {
      const father = this.person.parents.find(p => p.sex === Sex.Male) || null;
      const mother = this.person.parents.find(p => p.sex === Sex.Female) || null;

      // Try to find siblings from parents' children
      let siblings: TreePersonNode[] = [];
      if (father && father.children) {
        siblings = father.children;
      } else if (mother && mother.children) {
        siblings = mother.children;
      }

      // Get union from father or mother
      let parentUnion: TreeUnionNode | null = null;
      if (father && father.unions && father.unions.length > 0) {
        parentUnion = father.unions.find(u =>
          u.partners.some(p => p.id === mother?.id)
        ) || father.unions[0];
      } else if (mother && mother.unions && mother.unions.length > 0) {
        parentUnion = mother.unions.find(u =>
          u.partners.some(p => p.id === father?.id)
        ) || mother.unions[0];
      }

      this.parentFamilyData.set({
        husband: father,
        wife: mother,
        union: parentUnion,
        children: siblings
      });
    } else {
      this.parentFamilyData.set(null);
    }
  }

  private async loadAvatars(): Promise<void> {
    const people: TreePersonNode[] = [];

    const familyData = this.familyData();
    const parentFamilyData = this.parentFamilyData();

    if (familyData?.husband) people.push(familyData.husband);
    if (familyData?.wife) people.push(familyData.wife);
    if (familyData?.children) people.push(...familyData.children);
    if (parentFamilyData?.husband) people.push(parentFamilyData.husband);
    if (parentFamilyData?.wife) people.push(parentFamilyData.wife);
    if (parentFamilyData?.children) people.push(...parentFamilyData.children);

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

  getDisplayName(person: TreePersonNode | null): string {
    if (!person) return this.i18n.t('common.unknown');
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') {
      return person.nameArabic || person.nameEnglish || person.primaryName || unknown;
    }
    if (lang === 'nob') {
      return person.nameNobiin || person.nameEnglish || person.primaryName || unknown;
    }
    return person.nameEnglish || person.nameArabic || person.primaryName || unknown;
  }

  getInitials(person: TreePersonNode | null): string {
    const name = this.getDisplayName(person);
    if (!name || name === this.i18n.t('common.unknown')) return '?';
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
}
