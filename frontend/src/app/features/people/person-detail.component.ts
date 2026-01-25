import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';

import type { Person } from '../../core/models/person.models';
import { Sex, NameType } from '../../core/models/person.models';
import { getDisplayName, DisplayLanguage } from '../../core/models/search.models';
import { PersonService } from '../../core/services/person.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import {
  RelationshipService,
  ParentChildResponse,
  UnionResponse,
  SiblingResponse,
  UnionMemberDto
} from '../../core/services/relationship.service';
import {
  AddRelationshipDialogComponent,
  RelationshipDialogType,
  ParentInfo
} from './add-relationship-dialog.component';
import { PersonMediaComponent } from './person-media.component';
import { PersonFormDialogComponent, PersonFormDialogData } from './person-form-dialog.component';
import { PersonAvatarComponent } from '../../shared/components/person-avatar/person-avatar.component';

@Component({
  selector: 'app-person-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatTabsModule,
    MatListModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatMenuModule,
    MatSnackBarModule,
    PersonMediaComponent,
    PersonAvatarComponent,
    TranslatePipe
  ],
  templateUrl: './person-detail.component.html',
  styleUrls: ['./person-detail.component.scss']
})
export class PersonDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private personService = inject(PersonService);
  private relationshipService = inject(RelationshipService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private i18n = inject(I18nService);

  personId = signal<string | null>(null);
  person = signal<Person | null>(null);
  parents = signal<ParentChildResponse[]>([]);
  children = signal<ParentChildResponse[]>([]);
  siblings = signal<SiblingResponse[]>([]);
  unions = signal<UnionResponse[]>([]);

  isLoading = signal(true);
  error = signal<string | null>(null);
  selectedTabIndex = signal(0);

  // Tab name to index mapping: Details=0, Relationships=1, Media=2
  private readonly tabMap: Record<string, number> = {
    'details': 0,
    'relationships': 1,
    'media': 2
  };

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.personId.set(params['id']);
      this.loadPerson();
    });

    // Handle tab query param
    this.route.queryParams.subscribe(params => {
      const tabName = params['tab']?.toLowerCase();
      if (tabName && this.tabMap[tabName] !== undefined) {
        this.selectedTabIndex.set(this.tabMap[tabName]);
      }
    });
  }

  onTabChange(index: number): void {
    this.selectedTabIndex.set(index);
  }

  loadPerson() {
    const id = this.personId();
    if (!id) return;

    this.isLoading.set(true);
    this.error.set(null);

    // Load person and relationships in parallel
    forkJoin({
      person: this.personService.getPerson(id),
      parents: this.relationshipService.getParents(id),
      children: this.relationshipService.getChildren(id),
      siblings: this.relationshipService.getSiblings(id),
      unions: this.relationshipService.getPersonUnions(id)
    }).subscribe({
      next: (result) => {
        this.person.set(result.person);
        this.parents.set(result.parents);
        this.children.set(result.children);
        this.siblings.set(result.siblings);
        this.unions.set(result.unions.items);
        this.isLoading.set(false);
      },
      error: (err: any) => {
        console.error('Error loading person:', err);
        this.error.set(err.error?.message || this.i18n.t('personDetail.errors.loadFailed'));
        this.isLoading.set(false);
      }
    });
  }

  getLifespan(): string {
    const p = this.person();
    if (!p) return '';
    return this.personService.getLifespan(p);
  }

  getPersonDisplayName(): string {
    const p = this.person();
    if (!p) return this.i18n.t('common.unknown');
    const lang = this.i18n.currentLang() as DisplayLanguage;
    return getDisplayName(p, lang);
  }

  hasAnyName(): boolean {
    const p = this.person();
    return !!(p?.nameArabic || p?.nameEnglish || p?.nameNobiin);
  }

  hasAnyNotes(): boolean {
    const p = this.person();
    return !!(p?.notes || p?.notesAr || p?.notesNob);
  }

  getParentDisplayName(parent: ParentChildResponse): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') return parent.parentNameArabic || parent.parentNameEnglish || parent.parentName || unknown;
    if (lang === 'nob') return parent.parentNameNobiin || parent.parentNameEnglish || parent.parentName || unknown;
    return parent.parentNameEnglish || parent.parentNameArabic || parent.parentName || unknown;
  }

  getChildDisplayName(child: ParentChildResponse): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') return child.childNameArabic || child.childNameEnglish || child.childName || unknown;
    if (lang === 'nob') return child.childNameNobiin || child.childNameEnglish || child.childName || unknown;
    return child.childNameEnglish || child.childNameArabic || child.childName || unknown;
  }

  getSiblingDisplayName(sibling: SiblingResponse): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') return sibling.personNameArabic || sibling.personNameEnglish || sibling.personName || unknown;
    if (lang === 'nob') return sibling.personNameNobiin || sibling.personNameEnglish || sibling.personName || unknown;
    return sibling.personNameEnglish || sibling.personNameArabic || sibling.personName || unknown;
  }

  getSpouseDisplayName(member: UnionMemberDto): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') return member.personNameArabic || member.personNameEnglish || member.personName || unknown;
    if (lang === 'nob') return member.personNameNobiin || member.personNameEnglish || member.personName || unknown;
    return member.personNameEnglish || member.personNameArabic || member.personName || unknown;
  }

  formatDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString();
  }

  getSexClass(sex?: Sex | null): string {
    if (sex === null || sex === undefined) return '';
    if (sex === Sex.Male) return 'male';
    if (sex === Sex.Female) return 'female';
    return '';
  }

  getSexIcon(sex?: Sex | null): string {
    if (sex === null || sex === undefined) return 'person';
    if (sex === Sex.Male) return 'male';
    if (sex === Sex.Female) return 'female';
    return 'person';
  }

  getSexIconClass(sex?: Sex | null): string {
    if (sex === null || sex === undefined) return 'fa-user';
    if (sex === Sex.Male) return 'fa-mars';
    if (sex === Sex.Female) return 'fa-venus';
    return 'fa-user';
  }

  getNameTypeLabel(type: NameType): string {
    return this.personService.getNameTypeLabel(type);
  }

  buildFullName(name: any): string {
    const parts = [name.given, name.middle, name.family].filter(Boolean);
    return parts.join(' ');
  }

  getRelationshipTypeLabel(type: number): string {
    return this.relationshipService.getRelationshipTypeName(type);
  }

  getUnionTypeLabel(type: number): string {
    return this.relationshipService.getUnionTypeName(type);
  }

  getOtherMembers(union: UnionResponse) {
    return union.members.filter(m => m.personId !== this.personId());
  }

  navigateToPerson(personId: string) {
    this.router.navigate(['/people', personId]);
  }

  addRelationship(type: RelationshipDialogType) {
    // Build parent info for sibling type
    let parentsData: ParentInfo[] | undefined;
    if (type === 'sibling') {
      parentsData = this.parents().map(p => ({
        id: p.parentId,
        name: p.parentName || '',
        nameArabic: p.parentNameArabic,
        nameEnglish: p.parentNameEnglish,
        nameNobiin: p.parentNameNobiin,
        sex: p.parentSex
      }));
    }

    const dialogRef = this.dialog.open(AddRelationshipDialogComponent, {
      data: {
        personId: this.personId(),
        personName: this.person()?.primaryName,
        type,
        parents: parentsData,
        treeId: this.person()?.orgId  // Pass tree ID for suggestions
      },
      panelClass: 'add-relationship-dialog',
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadPerson(); // Reload to show new relationship
        this.snackBar.open(this.i18n.t('personDetail.messages.relationshipAdded'), this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }

  removeParent(parent: ParentChildResponse, event: Event) {
    event.stopPropagation();
    if (confirm(this.i18n.t('personActions.confirmRemoveParent', { name: this.getParentDisplayName(parent) }))) {
      this.relationshipService.removeParent(this.personId()!, parent.parentId).subscribe({
        next: () => {
          this.loadPerson();
          this.snackBar.open(this.i18n.t('personDetail.messages.parentRemoved'), this.i18n.t('common.close'), { duration: 3000 });
        },
        error: (err: any) => {
          this.snackBar.open(err.error?.message || this.i18n.t('personDetail.errors.removeParentFailed'), this.i18n.t('common.close'), { duration: 3000 });
        }
      });
    }
  }

  removeChild(child: ParentChildResponse, event: Event) {
    event.stopPropagation();
    if (confirm(this.i18n.t('personActions.confirmRemoveChild', { name: this.getChildDisplayName(child) }))) {
      this.relationshipService.removeChild(this.personId()!, child.childId).subscribe({
        next: () => {
          this.loadPerson();
          this.snackBar.open(this.i18n.t('personDetail.messages.childRemoved'), this.i18n.t('common.close'), { duration: 3000 });
        },
        error: (err: any) => {
          this.snackBar.open(err.error?.message || this.i18n.t('personDetail.errors.removeChildFailed'), this.i18n.t('common.close'), { duration: 3000 });
        }
      });
    }
  }

  removeUnion(union: UnionResponse, event: Event) {
    event.stopPropagation();
    if (confirm(this.i18n.t('personActions.confirmRemoveSpouse'))) {
      this.relationshipService.deleteUnion(union.id).subscribe({
        next: () => {
          this.loadPerson();
          this.snackBar.open(this.i18n.t('personDetail.messages.relationshipRemoved'), this.i18n.t('common.close'), { duration: 3000 });
        },
        error: (err: any) => {
          this.snackBar.open(err.error?.message || this.i18n.t('personDetail.errors.removeRelationshipFailed'), this.i18n.t('common.close'), { duration: 3000 });
        }
      });
    }
  }

  editPerson() {
    const person = this.person();
    if (!person) return;

    const dialogRef = this.dialog.open(PersonFormDialogComponent, {
      width: '600px',
      maxHeight: '90vh',
      disableClose: true,
      data: { person } as PersonFormDialogData
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadPerson();
        this.snackBar.open(this.i18n.t('personActions.updatedSuccess'), this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }

  viewInTree() {
    this.router.navigate(['/tree'], { queryParams: { personId: this.personId() } });
  }

  deletePerson() {
    if (confirm(this.i18n.t('personActions.confirmDelete'))) {
      this.personService.deletePerson(this.personId()!).subscribe({
        next: () => {
          this.snackBar.open(this.i18n.t('personActions.deleted'), this.i18n.t('common.close'), { duration: 3000 });
          this.router.navigate(['/people']);
        },
        error: (err: any) => {
          this.snackBar.open(err.error?.message || this.i18n.t('personActions.failedDelete'), this.i18n.t('common.close'), { duration: 3000 });
        }
      });
    }
  }
}