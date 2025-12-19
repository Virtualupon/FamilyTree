import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
import { PersonService } from '../../core/services/person.service';
import { 
  RelationshipService, 
  ParentChildResponse, 
  UnionResponse,
  SiblingResponse 
} from '../../core/services/relationship.service';
import { 
  AddRelationshipDialogComponent, 
  RelationshipDialogType 
} from './add-relationship-dialog.component';

@Component({
  selector: 'app-person-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatListModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatMenuModule,
    MatSnackBarModule
  ],
  template: `
    <div class="person-detail-container">
      @if (isLoading()) {
        <div class="loading">
          <mat-spinner></mat-spinner>
          <p>Loading person...</p>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <mat-icon>error</mat-icon>
            <h3>Error loading person</h3>
            <p>{{ error() }}</p>
            <button mat-raised-button color="primary" (click)="loadPerson()">Retry</button>
          </mat-card-content>
        </mat-card>
      } @else if (person()) {
        <!-- Header Card -->
        <mat-card class="header-card">
          <div class="person-header">
            <div class="avatar" [class]="getSexClass(person()!.sex)">
              <mat-icon>{{ getSexIcon(person()!.sex) }}</mat-icon>
            </div>
            <div class="info">
              <h1>{{ person()!.primaryName || 'Unknown' }}</h1>
              <p class="lifespan">{{ getLifespan() }}</p>
              @if (person()!.occupation) {
                <p class="occupation">{{ person()!.occupation }}</p>
              }
            </div>
            <div class="actions">
              <button mat-icon-button [matMenuTriggerFor]="actionsMenu">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #actionsMenu="matMenu">
                <button mat-menu-item (click)="editPerson()">
                  <mat-icon>edit</mat-icon>
                  <span>Edit</span>
                </button>
                <button mat-menu-item (click)="viewInTree()">
                  <mat-icon>account_tree</mat-icon>
                  <span>View in Tree</span>
                </button>
                <button mat-menu-item (click)="deletePerson()" class="delete-action">
                  <mat-icon>delete</mat-icon>
                  <span>Delete</span>
                </button>
              </mat-menu>
            </div>
          </div>
        </mat-card>

        <!-- Tabs for different sections -->
        <mat-tab-group>
          <!-- Details Tab -->
          <mat-tab label="Details">
            <mat-card class="tab-content">
              <mat-card-content>
                <div class="details-grid">
                  @if (person()!.birthDate) {
                    <div class="detail-item">
                      <span class="label">Birth</span>
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
                      <span class="label">Death</span>
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
                      <span class="label">Gender</span>
                      <span class="value">{{ person()!.gender }}</span>
                    </div>
                  }
                  @if (person()!.nationality) {
                    <div class="detail-item">
                      <span class="label">Nationality</span>
                      <span class="value">{{ person()!.nationality }}</span>
                    </div>
                  }
                  @if (person()!.religion) {
                    <div class="detail-item">
                      <span class="label">Religion</span>
                      <span class="value">{{ person()!.religion }}</span>
                    </div>
                  }
                  @if (person()!.education) {
                    <div class="detail-item">
                      <span class="label">Education</span>
                      <span class="value">{{ person()!.education }}</span>
                    </div>
                  }
                </div>

                @if (person()!.notes) {
                  <div class="notes-section">
                    <h4>Notes</h4>
                    <p>{{ person()!.notes }}</p>
                  </div>
                }

                <!-- Alternative Names -->
                @if (person()!.names && person()!.names.length > 0) {
                  <div class="names-section">
                    <h4>Names</h4>
                    @for (name of person()!.names; track name.id) {
                      <div class="name-item">
                        <mat-chip>{{ getNameTypeLabel(name.type) }}</mat-chip>
                        <span>{{ name.full || buildFullName(name) }}</span>
                        @if (name.transliteration) {
                          <span class="transliteration">({{ name.transliteration }})</span>
                        }
                      </div>
                    }
                  </div>
                }
              </mat-card-content>
            </mat-card>
          </mat-tab>

          <!-- Family Tab -->
          <mat-tab label="Family">
            <mat-card class="tab-content">
              <mat-card-content>
                <!-- Parents Section -->
                <div class="family-section">
                  <div class="section-header">
                    <h3>Parents</h3>
                    <button mat-stroked-button (click)="addRelationship('parent')">
                      <mat-icon>add</mat-icon> Add Parent
                    </button>
                  </div>
                  @if (parents().length > 0) {
                    <mat-list>
                      @for (parent of parents(); track parent.id) {
                        <mat-list-item class="clickable" (click)="navigateToPerson(parent.parentId)">
                          <mat-icon matListItemIcon [class]="getSexClass(parent.parentSex)">
                            {{ getSexIcon(parent.parentSex) }}
                          </mat-icon>
                          <span matListItemTitle>{{ parent.parentName || 'Unknown' }}</span>
                          <span matListItemLine>
                            {{ getRelationshipTypeLabel(parent.relationshipType) }}
                            @if (parent.isAdopted) { (Adopted) }
                          </span>
                          <button mat-icon-button matListItemMeta (click)="removeParent(parent, $event)">
                            <mat-icon>close</mat-icon>
                          </button>
                        </mat-list-item>
                      }
                    </mat-list>
                  } @else {
                    <p class="no-data">No parents recorded</p>
                  }
                </div>

                <!-- Siblings Section -->
                <div class="family-section">
                  <div class="section-header">
                    <h3>Siblings</h3>
                  </div>
                  @if (siblings().length > 0) {
                    <mat-list>
                      @for (sibling of siblings(); track sibling.personId) {
                        <mat-list-item class="clickable" (click)="navigateToPerson(sibling.personId)">
                          <mat-icon matListItemIcon [class]="getSexClass(sibling.personSex)">
                            {{ getSexIcon(sibling.personSex) }}
                          </mat-icon>
                          <span matListItemTitle>{{ sibling.personName || 'Unknown' }}</span>
                          <span matListItemLine>
                            {{ sibling.isFullSibling ? 'Full sibling' : 'Half sibling' }}
                          </span>
                        </mat-list-item>
                      }
                    </mat-list>
                  } @else {
                    <p class="no-data">No siblings found</p>
                  }
                </div>

                <!-- Spouses Section -->
                <div class="family-section">
                  <div class="section-header">
                    <h3>Spouses/Partners</h3>
                    <button mat-stroked-button (click)="addRelationship('spouse')">
                      <mat-icon>add</mat-icon> Add Spouse
                    </button>
                  </div>
                  @if (unions().length > 0) {
                    <mat-list>
                      @for (union of unions(); track union.id) {
                        @for (member of getOtherMembers(union); track member.id) {
                          <mat-list-item class="clickable" (click)="navigateToPerson(member.personId)">
                            <mat-icon matListItemIcon [class]="getSexClass(member.personSex)">
                              {{ getSexIcon(member.personSex) }}
                            </mat-icon>
                            <span matListItemTitle>{{ member.personName || 'Unknown' }}</span>
                            <span matListItemLine>
                              {{ getUnionTypeLabel(union.type) }}
                              @if (union.startDate) {
                                - {{ formatDate(union.startDate) }}
                              }
                            </span>
                            <button mat-icon-button matListItemMeta (click)="removeUnion(union, $event)">
                              <mat-icon>close</mat-icon>
                            </button>
                          </mat-list-item>
                        }
                      }
                    </mat-list>
                  } @else {
                    <p class="no-data">No spouses/partners recorded</p>
                  }
                </div>

                <!-- Children Section -->
                <div class="family-section">
                  <div class="section-header">
                    <h3>Children</h3>
                    <button mat-stroked-button (click)="addRelationship('child')">
                      <mat-icon>add</mat-icon> Add Child
                    </button>
                  </div>
                  @if (children().length > 0) {
                    <mat-list>
                      @for (child of children(); track child.id) {
                        <mat-list-item class="clickable" (click)="navigateToPerson(child.childId)">
                          <mat-icon matListItemIcon [class]="getSexClass(child.childSex)">
                            {{ getSexIcon(child.childSex) }}
                          </mat-icon>
                          <span matListItemTitle>{{ child.childName || 'Unknown' }}</span>
                          <span matListItemLine>
                            {{ getRelationshipTypeLabel(child.relationshipType) }}
                            @if (child.isAdopted) { (Adopted) }
                          </span>
                          <button mat-icon-button matListItemMeta (click)="removeChild(child, $event)">
                            <mat-icon>close</mat-icon>
                          </button>
                        </mat-list-item>
                      }
                    </mat-list>
                  } @else {
                    <p class="no-data">No children recorded</p>
                  }
                </div>
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

    .error-card mat-icon {
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

    .avatar mat-icon {
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

    mat-icon.male {
      color: #1565c0;
    }

    mat-icon.female {
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

  personId = signal<string | null>(null);
  person = signal<Person | null>(null);
  parents = signal<ParentChildResponse[]>([]);
  children = signal<ParentChildResponse[]>([]);
  siblings = signal<SiblingResponse[]>([]);
  unions = signal<UnionResponse[]>([]);
  
  isLoading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.personId.set(params['id']);
      this.loadPerson();
    });
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
    const dialogRef = this.dialog.open(AddRelationshipDialogComponent, {
      data: {
        personId: this.personId(),
        personName: this.person()?.primaryName,
        type
      }
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
    if (confirm(`Remove ${parent.parentName || 'this person'} as a parent?`)) {
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
    if (confirm(`Remove ${child.childName || 'this person'} as a child?`)) {
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
    // TODO: Navigate to edit page or open edit dialog
    this.snackBar.open('Edit feature coming soon', 'Close', { duration: 3000 });
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