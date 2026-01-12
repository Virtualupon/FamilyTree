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
    TranslatePipe
  ],
  template: `
    <div class="person-detail-container">
      @if (isLoading()) {
        <div class="loading">
          <mat-spinner></mat-spinner>
          <p>{{ 'personDetail.loading' | translate }}</p>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
            <h3>{{ 'personDetail.errorLoading' | translate }}</h3>
            <p>{{ error() }}</p>
            <button mat-raised-button color="primary" (click)="loadPerson()">{{ 'personDetail.retry' | translate }}</button>
          </mat-card-content>
        </mat-card>
      } @else if (person()) {
        <!-- Header Card -->
        <mat-card class="header-card">
          <div class="person-header">
            <div class="avatar" [class]="getSexClass(person()!.sex)">
              <i class="fa-solid" [ngClass]="getSexIconClass(person()!.sex)" aria-hidden="true"></i>
            </div>
            <div class="info">
              <h1>{{ getPersonDisplayName() }}</h1>
              <p class="lifespan">{{ getLifespan() }}</p>
              @if (person()!.occupation) {
                <p class="occupation">{{ person()!.occupation }}</p>
              }
            </div>
            <div class="actions">
              <button mat-icon-button [matMenuTriggerFor]="actionsMenu">
                <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
              </button>
              <mat-menu #actionsMenu="matMenu">
                <button mat-menu-item (click)="editPerson()">
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                  <span>{{ 'personDetail.actions.edit' | translate }}</span>
                </button>
                <button mat-menu-item (click)="viewInTree()">
                  <i class="fa-solid fa-sitemap" aria-hidden="true"></i>
                  <span>{{ 'personDetail.actions.viewInTree' | translate }}</span>
                </button>
                <button mat-menu-item (click)="deletePerson()" class="delete-action">
                  <i class="fa-solid fa-trash" aria-hidden="true"></i>
                  <span>{{ 'personDetail.actions.delete' | translate }}</span>
                </button>
              </mat-menu>
            </div>
          </div>
        </mat-card>

        <!-- Tabs for different sections -->
        <mat-tab-group [selectedIndex]="selectedTabIndex()"
                       (selectedIndexChange)="onTabChange($event)">
          <!-- Details Tab -->
          <mat-tab [label]="'personDetail.tabs.details' | translate">
            <mat-card class="tab-content">
              <mat-card-content>
                <div class="details-grid">
                  @if (person()!.birthDate) {
                    <div class="detail-item">
                      <span class="label">{{ 'personDetail.labels.birth' | translate }}</span>
                      <span class="value">
                        {{ formatDate(person()!.birthDate) }}
                        @if (person()!.birthPlace) {
                          <br><small>{{ person()!.birthPlace }}</small>
                        }
                      </span>
                    </div>
                  }
                  @if (person()!.deathDate) {
                    <div class="detail-item">
                      <span class="label">{{ 'personDetail.labels.death' | translate }}</span>
                      <span class="value">
                        {{ formatDate(person()!.deathDate) }}
                        @if (person()!.deathPlace) {
                          <br><small>{{ person()!.deathPlace }}</small>
                        }
                      </span>
                    </div>
                  }
                  @if (person()!.gender) {
                    <div class="detail-item">
                      <span class="label">{{ 'personDetail.labels.gender' | translate }}</span>
                      <span class="value">{{ person()!.gender }}</span>
                    </div>
                  }
                  @if (person()!.nationality) {
                    <div class="detail-item">
                      <span class="label">{{ 'personDetail.labels.nationality' | translate }}</span>
                      <span class="value">{{ person()!.nationality }}</span>
                    </div>
                  }
                  @if (person()!.religion) {
                    <div class="detail-item">
                      <span class="label">{{ 'personDetail.labels.religion' | translate }}</span>
                      <span class="value">{{ person()!.religion }}</span>
                    </div>
                  }
                  @if (person()!.education) {
                    <div class="detail-item">
                      <span class="label">{{ 'personDetail.labels.education' | translate }}</span>
                      <span class="value">{{ person()!.education }}</span>
                    </div>
                  }
                </div>

                @if (person()!.notes) {
                  <div class="notes-section">
                    <h4>{{ 'personDetail.labels.notes' | translate }}</h4>
                    <p>{{ person()!.notes }}</p>
                  </div>
                }

                <!-- Names in Different Scripts -->
                @if (hasAnyName()) {
                  <div class="names-section">
                    <h4>{{ 'personDetail.labels.names' | translate }}</h4>
                    @if (person()!.nameArabic) {
                      <div class="name-item">
                        <mat-chip>العربية</mat-chip>
                        <span class="name-arabic">{{ person()!.nameArabic }}</span>
                      </div>
                    }
                    @if (person()!.nameEnglish) {
                      <div class="name-item">
                        <mat-chip>English</mat-chip>
                        <span>{{ person()!.nameEnglish }}</span>
                      </div>
                    }
                    @if (person()!.nameNobiin) {
                      <div class="name-item">
                        <mat-chip>ⲛⲟⲃⲓⲓⲛ</mat-chip>
                        <span>{{ person()!.nameNobiin }}</span>
                      </div>
                    }
                  </div>
                }
              </mat-card-content>
            </mat-card>
          </mat-tab>

          <!-- Family Tab -->
          <mat-tab [label]="'personDetail.tabs.family' | translate">
            <mat-card class="tab-content">
              <mat-card-content>
                <!-- Parents Section -->
                <div class="family-section">
                  <div class="section-header">
                    <h3>{{ 'personDetail.sections.parents' | translate }}</h3>
                    <button mat-stroked-button (click)="addRelationship('parent')">
                      <i class="fa-solid fa-plus" aria-hidden="true"></i> {{ 'personDetail.actions.addParent' | translate }}
                    </button>
                  </div>
                  @if (parents().length > 0) {
                    <mat-list>
                      @for (parent of parents(); track parent.id) {
                        <mat-list-item class="clickable" (click)="navigateToPerson(parent.parentId)">
                          <i matListItemIcon class="fa-solid" [ngClass]="[getSexIconClass(parent.parentSex), getSexClass(parent.parentSex)]" aria-hidden="true"></i>
                          <span matListItemTitle>{{ getParentDisplayName(parent) }}</span>
                          <span matListItemLine>
                            {{ getRelationshipTypeLabel(parent.relationshipType) }}
                            @if (parent.isAdopted) { ({{ 'personDetail.relationshipTypes.adopted' | translate }}) }
                          </span>
                          <button mat-icon-button matListItemMeta (click)="removeParent(parent, $event)">
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                          </button>
                        </mat-list-item>
                      }
                    </mat-list>
                  } @else {
                    <p class="no-data">{{ 'personDetail.noData.parents' | translate }}</p>
                  }
                </div>

                <!-- Siblings Section -->
                <div class="family-section">
                  <div class="section-header">
                    <h3>{{ 'personDetail.sections.siblings' | translate }}</h3>
                    <button mat-stroked-button (click)="addRelationship('sibling')">
                      <i class="fa-solid fa-plus" aria-hidden="true"></i> {{ 'personDetail.actions.addSibling' | translate }}
                    </button>
                  </div>
                  @if (siblings().length > 0) {
                    <mat-list>
                      @for (sibling of siblings(); track sibling.personId) {
                        <mat-list-item class="clickable" (click)="navigateToPerson(sibling.personId)">
                          <i matListItemIcon class="fa-solid" [ngClass]="[getSexIconClass(sibling.personSex), getSexClass(sibling.personSex)]" aria-hidden="true"></i>
                          <span matListItemTitle>{{ getSiblingDisplayName(sibling) }}</span>
                          <span matListItemLine>
                            {{ sibling.isFullSibling ? ('personDetail.siblingTypes.full' | translate) : ('personDetail.siblingTypes.half' | translate) }}
                          </span>
                        </mat-list-item>
                      }
                    </mat-list>
                  } @else {
                    <p class="no-data">{{ 'personDetail.noData.siblings' | translate }}</p>
                  }
                </div>

                <!-- Spouses Section -->
                <div class="family-section">
                  <div class="section-header">
                    <h3>{{ 'personDetail.sections.spouses' | translate }}</h3>
                    <button mat-stroked-button (click)="addRelationship('spouse')">
                      <i class="fa-solid fa-plus" aria-hidden="true"></i> {{ 'personDetail.actions.addSpouse' | translate }}
                    </button>
                  </div>
                  @if (unions().length > 0) {
                    <mat-list>
                      @for (union of unions(); track union.id) {
                        @for (member of getOtherMembers(union); track member.id) {
                          <mat-list-item class="clickable" (click)="navigateToPerson(member.personId)">
                            <i matListItemIcon class="fa-solid" [ngClass]="[getSexIconClass(member.personSex), getSexClass(member.personSex)]" aria-hidden="true"></i>
                            <span matListItemTitle>{{ getSpouseDisplayName(member) }}</span>
                            <span matListItemLine>
                              {{ getUnionTypeLabel(union.type) }}
                              @if (union.startDate) {
                                - {{ formatDate(union.startDate) }}
                              }
                            </span>
                            <button mat-icon-button matListItemMeta (click)="removeUnion(union, $event)">
                              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                            </button>
                          </mat-list-item>
                        }
                      }
                    </mat-list>
                  } @else {
                    <p class="no-data">{{ 'personDetail.noData.spouses' | translate }}</p>
                  }
                </div>

                <!-- Children Section -->
                <div class="family-section">
                  <div class="section-header">
                    <h3>{{ 'personDetail.sections.children' | translate }}</h3>
                    <button mat-stroked-button (click)="addRelationship('child')">
                      <i class="fa-solid fa-plus" aria-hidden="true"></i> {{ 'personDetail.actions.addChild' | translate }}
                    </button>
                  </div>
                  @if (children().length > 0) {
                    <mat-list>
                      @for (child of children(); track child.id) {
                        <mat-list-item class="clickable" (click)="navigateToPerson(child.childId)">
                          <i matListItemIcon class="fa-solid" [ngClass]="[getSexIconClass(child.childSex), getSexClass(child.childSex)]" aria-hidden="true"></i>
                          <span matListItemTitle>{{ getChildDisplayName(child) }}</span>
                          <span matListItemLine>
                            {{ getRelationshipTypeLabel(child.relationshipType) }}
                            @if (child.isAdopted) { ({{ 'personDetail.relationshipTypes.adopted' | translate }}) }
                          </span>
                          <button mat-icon-button matListItemMeta (click)="removeChild(child, $event)">
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                          </button>
                        </mat-list-item>
                      }
                    </mat-list>
                  } @else {
                    <p class="no-data">{{ 'personDetail.noData.children' | translate }}</p>
                  }
                </div>
              </mat-card-content>
            </mat-card>
          </mat-tab>

          <!-- Media Tab -->
          <mat-tab [label]="'personDetail.tabs.media' | translate">
            <mat-card class="tab-content">
              <mat-card-content>
                <app-person-media [personId]="personId()!" />
              </mat-card-content>
            </mat-card>
          </mat-tab>
        </mat-tab-group>
      }
    </div>
  `,
  styles: [`
    .person-detail-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
    }

    .error-card {
      text-align: center;
      padding: 24px;
    }

    .error-card i.fa-solid {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #f44336;
    }

    .header-card {
      margin-bottom: 24px;
    }

    .person-header {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 24px;
    }

    .avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e0e0e0;
    }

    .avatar i.fa-solid {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .avatar.male {
      background: #bbdefb;
      color: #1565c0;
    }

    .avatar.female {
      background: #f8bbd9;
      color: #c2185b;
    }

    .info {
      flex: 1;
    }

    .info h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
    }

    .info .lifespan {
      margin: 0;
      color: rgba(0, 0, 0, 0.6);
      font-size: 16px;
    }

    .info .occupation {
      margin: 4px 0 0 0;
      color: rgba(0, 0, 0, 0.6);
    }

    .tab-content {
      margin-top: 16px;
    }

    .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .detail-item {
      display: flex;
      flex-direction: column;
    }

    .detail-item .label {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .detail-item .value {
      font-size: 14px;
    }

    .detail-item .value small {
      color: rgba(0, 0, 0, 0.6);
    }

    .notes-section,
    .names-section {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .notes-section h4,
    .names-section h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
      color: rgba(0, 0, 0, 0.6);
    }

    .name-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .name-item .transliteration {
      color: rgba(0, 0, 0, 0.6);
      font-style: italic;
    }

    .name-item .name-arabic {
      font-family: 'Noto Naskh Arabic', 'Arabic Typesetting', serif;
      font-size: 1.1em;
      direction: rtl;
    }

    .family-section {
      margin-bottom: 24px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .section-header h3 {
      margin: 0;
      font-size: 18px;
    }

    .clickable {
      cursor: pointer;
    }

    .clickable:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    .no-data {
      color: rgba(0, 0, 0, 0.5);
      font-style: italic;
      padding: 16px;
      text-align: center;
    }

    .delete-action {
      color: #f44336;
    }

    i.fa-solid.male {
      color: #1565c0;
    }

    i.fa-solid.female {
      color: #c2185b;
    }
  `]
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
        this.error.set(err.error?.message || 'Failed to load person');
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
    if (!p) return 'Unknown';
    const lang = this.i18n.currentLang() as DisplayLanguage;
    return getDisplayName(p, lang);
  }

  hasAnyName(): boolean {
    const p = this.person();
    return !!(p?.nameArabic || p?.nameEnglish || p?.nameNobiin);
  }

  getParentDisplayName(parent: ParentChildResponse): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') return parent.parentNameArabic || parent.parentNameEnglish || parent.parentName || 'Unknown';
    if (lang === 'nob') return parent.parentNameNobiin || parent.parentNameEnglish || parent.parentName || 'Unknown';
    return parent.parentNameEnglish || parent.parentNameArabic || parent.parentName || 'Unknown';
  }

  getChildDisplayName(child: ParentChildResponse): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') return child.childNameArabic || child.childNameEnglish || child.childName || 'Unknown';
    if (lang === 'nob') return child.childNameNobiin || child.childNameEnglish || child.childName || 'Unknown';
    return child.childNameEnglish || child.childNameArabic || child.childName || 'Unknown';
  }

  getSiblingDisplayName(sibling: SiblingResponse): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') return sibling.personNameArabic || sibling.personNameEnglish || sibling.personName || 'Unknown';
    if (lang === 'nob') return sibling.personNameNobiin || sibling.personNameEnglish || sibling.personName || 'Unknown';
    return sibling.personNameEnglish || sibling.personNameArabic || sibling.personName || 'Unknown';
  }

  getSpouseDisplayName(member: UnionMemberDto): string {
    const lang = this.i18n.currentLang();
    if (lang === 'ar') return member.personNameArabic || member.personNameEnglish || member.personName || 'Unknown';
    if (lang === 'nob') return member.personNameNobiin || member.personNameEnglish || member.personName || 'Unknown';
    return member.personNameEnglish || member.personNameArabic || member.personName || 'Unknown';
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
        parents: parentsData
      },
      panelClass: 'add-relationship-dialog',
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadPerson(); // Reload to show new relationship
        this.snackBar.open('Relationship added successfully', 'Close', { duration: 3000 });
      }
    });
  }

  removeParent(parent: ParentChildResponse, event: Event) {
    event.stopPropagation();
    if (confirm(`Remove ${this.getParentDisplayName(parent)} as a parent?`)) {
      this.relationshipService.removeParent(this.personId()!, parent.parentId).subscribe({
        next: () => {
          this.loadPerson();
          this.snackBar.open('Parent removed', 'Close', { duration: 3000 });
        },
        error: (err: any) => {
          this.snackBar.open(err.error?.message || 'Failed to remove parent', 'Close', { duration: 3000 });
        }
      });
    }
  }

  removeChild(child: ParentChildResponse, event: Event) {
    event.stopPropagation();
    if (confirm(`Remove ${this.getChildDisplayName(child)} as a child?`)) {
      this.relationshipService.removeChild(this.personId()!, child.childId).subscribe({
        next: () => {
          this.loadPerson();
          this.snackBar.open('Child removed', 'Close', { duration: 3000 });
        },
        error: (err: any) => {
          this.snackBar.open(err.error?.message || 'Failed to remove child', 'Close', { duration: 3000 });
        }
      });
    }
  }

  removeUnion(union: UnionResponse, event: Event) {
    event.stopPropagation();
    if (confirm('Remove this spouse/partner relationship?')) {
      this.relationshipService.deleteUnion(union.id).subscribe({
        next: () => {
          this.loadPerson();
          this.snackBar.open('Relationship removed', 'Close', { duration: 3000 });
        },
        error: (err: any) => {
          this.snackBar.open(err.error?.message || 'Failed to remove relationship', 'Close', { duration: 3000 });
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
        this.snackBar.open('Person updated successfully', 'Close', { duration: 3000 });
      }
    });
  }

  viewInTree() {
    this.router.navigate(['/tree'], { queryParams: { personId: this.personId() } });
  }

  deletePerson() {
    if (confirm('Are you sure you want to delete this person? This cannot be undone.')) {
      this.personService.deletePerson(this.personId()!).subscribe({
        next: () => {
          this.snackBar.open('Person deleted', 'Close', { duration: 3000 });
          this.router.navigate(['/people']);
        },
        error: (err: any) => {
          this.snackBar.open(err.error?.message || 'Failed to delete person', 'Close', { duration: 3000 });
        }
      });
    }
  }
}