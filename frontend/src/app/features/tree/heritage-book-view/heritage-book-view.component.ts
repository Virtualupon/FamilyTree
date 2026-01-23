import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TreePersonNode, TreeUnionNode } from '../../../core/models/tree.models';
import { Sex } from '../../../core/models/person.models';
import { I18nService, TranslatePipe } from '../../../core/i18n';
import { PersonMediaService } from '../../../core/services/person-media.service';

interface HeritagePerson {
  node: TreePersonNode;
  index: number;
  displayName: string;
  lifespan: string;
  avatarUrl: string | null;
}

interface HeritageFamilyUnit {
  father: TreePersonNode | null;
  mother: TreePersonNode | null;
  marriageDate: string | null;
  marriagePlace: string | null;
  children: HeritagePerson[];
  familyName: string;
}

@Component({
  selector: 'app-heritage-book-view',
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe
  ],
  templateUrl: './heritage-book-view.component.html',
  styleUrls: ['./heritage-book-view.component.scss']
})
export class HeritageBookViewComponent implements OnChanges {
  @Input() treeData: TreePersonNode | null = null;
  @Input() selectedPersonId: string | null = null;

  @Output() personSelected = new EventEmitter<TreePersonNode>();
  @Output() personDoubleClicked = new EventEmitter<TreePersonNode>();

  private readonly i18n = inject(I18nService);
  private readonly mediaService = inject(PersonMediaService);

  readonly Sex = Sex;

  familyUnit = signal<HeritageFamilyUnit | null>(null);
  fatherAvatarUrl = signal<string | null>(null);
  motherAvatarUrl = signal<string | null>(null);

  private avatarCache = new Map<string, string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['treeData'] && this.treeData) {
      this.processTreeData();
    }
  }

  private processTreeData(): void {
    if (!this.treeData) {
      this.familyUnit.set(null);
      return;
    }

    const unit = this.buildFamilyUnit(this.treeData);
    this.familyUnit.set(unit);

    // Load avatars for parents
    if (unit.father?.avatarMediaId) {
      this.loadAvatar(unit.father.id, unit.father.avatarMediaId, 'father');
    } else {
      this.fatherAvatarUrl.set(null);
    }

    if (unit.mother?.avatarMediaId) {
      this.loadAvatar(unit.mother.id, unit.mother.avatarMediaId, 'mother');
    } else {
      this.motherAvatarUrl.set(null);
    }
  }

  private buildFamilyUnit(root: TreePersonNode): HeritageFamilyUnit {
    // If root has parents, show parents + root's siblings
    if (root.parents && root.parents.length > 0) {
      const father = root.parents.find(p => p.sex === Sex.Male) || (root.parents.length > 0 ? root.parents[0] : null);
      const mother = root.parents.find(p => p.sex === Sex.Female) || (root.parents.length > 1 ? root.parents[1] : null);

      // Get all children from both parents
      const allChildren = this.getAllChildrenOfParents(root, father, mother);
      const marriageInfo = this.extractMarriageInfo(father, mother);

      return {
        father,
        mother,
        marriageDate: marriageInfo.date,
        marriagePlace: marriageInfo.place,
        children: allChildren.map((child, i) => ({
          node: child,
          index: i + 1,
          displayName: this.getDisplayName(child),
          lifespan: this.formatLifespan(child),
          avatarUrl: null
        })),
        familyName: this.extractFamilyName(father, mother, root)
      };
    } else {
      // Root has no parents, show root + spouse + children
      const spouse = root.unions?.[0]?.partners?.find(p => p.id !== root.id) || null;
      const isFather = root.sex === Sex.Male;

      const marriageInfo = root.unions?.[0] ? {
        date: root.unions[0].startDate || null,
        place: root.unions[0].startPlace || null
      } : { date: null, place: null };

      const children = root.children || [];

      return {
        father: isFather ? root : spouse,
        mother: isFather ? spouse : root,
        marriageDate: marriageInfo.date,
        marriagePlace: marriageInfo.place,
        children: children.map((child, i) => ({
          node: child,
          index: i + 1,
          displayName: this.getDisplayName(child),
          lifespan: this.formatLifespan(child),
          avatarUrl: null
        })),
        familyName: this.extractFamilyName(isFather ? root : spouse, isFather ? spouse : root, root)
      };
    }
  }

  private getAllChildrenOfParents(root: TreePersonNode, father: TreePersonNode | null, mother: TreePersonNode | null): TreePersonNode[] {
    // Start with the root person
    const childrenSet = new Map<string, TreePersonNode>();
    childrenSet.set(root.id, root);

    // Add children from father's unions
    if (father?.unions) {
      father.unions.forEach(union => {
        union.children?.forEach(child => {
          if (!childrenSet.has(child.id)) {
            childrenSet.set(child.id, child);
          }
        });
      });
    }

    // Add children from mother's unions
    if (mother?.unions) {
      mother.unions.forEach(union => {
        union.children?.forEach(child => {
          if (!childrenSet.has(child.id)) {
            childrenSet.set(child.id, child);
          }
        });
      });
    }

    // If root has children directly (from tree data), include siblings from same generation
    // Sort by birth date
    const children = Array.from(childrenSet.values());
    children.sort((a, b) => {
      const aYear = a.birthDate ? new Date(a.birthDate).getFullYear() : 9999;
      const bYear = b.birthDate ? new Date(b.birthDate).getFullYear() : 9999;
      return aYear - bYear;
    });

    return children;
  }

  private extractMarriageInfo(father: TreePersonNode | null, mother: TreePersonNode | null): { date: string | null; place: string | null } {
    if (!father || !mother) {
      return { date: null, place: null };
    }

    // Look for union between father and mother
    const union = father.unions?.find(u =>
      u.partners?.some(p => p.id === mother.id)
    );

    if (union) {
      return {
        date: union.startDate || null,
        place: union.startPlace || null
      };
    }

    // Try mother's unions
    const motherUnion = mother.unions?.find(u =>
      u.partners?.some(p => p.id === father.id)
    );

    if (motherUnion) {
      return {
        date: motherUnion.startDate || null,
        place: motherUnion.startPlace || null
      };
    }

    return { date: null, place: null };
  }

  private extractFamilyName(father: TreePersonNode | null, mother: TreePersonNode | null, root: TreePersonNode): string {
    // Try to extract family name from father first, then mother, then root
    const person = father || mother || root;
    const name = this.getDisplayName(person);

    // Try to get the last part of the name as family name
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length > 1) {
        return parts[parts.length - 1];
      }
      return name;
    }

    return this.i18n.t('common.unknown');
  }

  getDisplayName(person: TreePersonNode | null | undefined): string {
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

  formatLifespan(person: TreePersonNode): string {
    const birthYear = person.birthDate ? this.formatYear(person.birthDate) : '?';
    const deathYear = person.deathDate ? this.formatYear(person.deathDate) : (person.isLiving ? '' : '?');

    if (person.isLiving) {
      return `${birthYear} -`;
    }

    return `${birthYear} - ${deathYear}`;
  }

  formatYear(dateStr: string | undefined): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).getFullYear().toString();
    } catch {
      return '';
    }
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const day = date.getDate();
      const month = date.toLocaleDateString(this.i18n.currentLang() === 'ar' ? 'ar-EG' : 'en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
    } catch {
      return dateStr;
    }
  }

  getInitials(person: TreePersonNode | null | undefined): string {
    if (!person) return '?';
    const name = this.getDisplayName(person);
    if (!name || name === this.i18n.t('common.unknown')) return '?';

    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  private loadAvatar(personId: string, avatarMediaId: string, target: 'father' | 'mother'): void {
    // Check cache first
    if (this.avatarCache.has(personId)) {
      const url = this.avatarCache.get(personId)!;
      if (target === 'father') {
        this.fatherAvatarUrl.set(url);
      } else {
        this.motherAvatarUrl.set(url);
      }
      return;
    }

    this.mediaService.getMediaById(avatarMediaId).subscribe({
      next: (media) => {
        const objectUrl = this.mediaService.createObjectUrl(
          media.base64Data,
          media.mimeType || 'image/jpeg'
        );
        this.avatarCache.set(personId, objectUrl);

        if (target === 'father') {
          this.fatherAvatarUrl.set(objectUrl);
        } else {
          this.motherAvatarUrl.set(objectUrl);
        }
      },
      error: () => {
        // Silently fail - will show initials instead
      }
    });
  }

  onPersonClick(person: TreePersonNode | null | undefined): void {
    if (person) {
      this.personSelected.emit(person);
    }
  }

  onPersonDoubleClick(person: TreePersonNode | null | undefined): void {
    if (person) {
      this.personDoubleClicked.emit(person);
    }
  }

  ngOnDestroy(): void {
    // Revoke object URLs to prevent memory leaks
    this.avatarCache.forEach(url => URL.revokeObjectURL(url));
    this.avatarCache.clear();
  }
}
