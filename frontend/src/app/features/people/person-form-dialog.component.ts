import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PersonService } from '../../core/services/person.service';
import { TransliterationService } from '../../core/services/transliteration.service';
import { FamilyService } from '../../core/services/family.service';
import { TreeContextService } from '../../core/services/tree-context.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { FamilyListItem } from '../../core/models/family.models';
import {
  Person,
  PersonListItem,
  Sex,
  NameType,
  DatePrecision,
  PrivacyLevel,
  CreatePersonRequest
} from '../../core/models/person.models';

export interface PersonFormDialogData {
  person?: PersonListItem | Person;
}

@Component({
  selector: 'app-person-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatExpansionModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    TranslatePipe
  ],
  template: `
    <div class="person-form-dialog">
      <!-- Header -->
      <div class="person-form-dialog__header">
        <h2 class="person-form-dialog__title">
          {{ (data.person ? 'people.editPerson' : 'people.addPerson') | translate }}
        </h2>
        <button mat-icon-button (click)="onCancel()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      
      <!-- Form -->
      <form [formGroup]="form" class="person-form-dialog__content">
        <mat-tab-group animationDuration="200ms">
          <!-- Basic Info Tab -->
          <mat-tab [label]="'personForm.basicInfo' | translate">
            <div class="form-tab-content">
              <!-- Primary Name -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.fullName' | translate }} *</mat-label>
                <input matInput formControlName="primaryName" autocomplete="name">
                @if (form.get('primaryName')?.hasError('required')) {
                  <mat-error>{{ 'common.required' | translate }}</mat-error>
                }
              </mat-form-field>
              
              <!-- Sex -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.sex' | translate }}</mat-label>
                <mat-select formControlName="sex">
                  <mat-option [value]="Sex.Male">
                    <i class="fa-solid fa-mars" aria-hidden="true"></i>
                    {{ 'people.male' | translate }}
                  </mat-option>
                  <mat-option [value]="Sex.Female">
                    <i class="fa-solid fa-venus" aria-hidden="true"></i>
                    {{ 'people.female' | translate }}
                  </mat-option>
                  <mat-option [value]="Sex.Unknown">
                    <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
                    {{ 'people.unknown' | translate }}
                  </mat-option>
                </mat-select>
              </mat-form-field>
              
              <!-- Is Living Toggle -->
              <div class="form-field-toggle">
                <mat-slide-toggle formControlName="isLiving" color="primary">
                  {{ 'personForm.isLiving' | translate }}
                </mat-slide-toggle>
              </div>

              <!-- Family Group -->
              @if (families().length > 0) {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>{{ 'personForm.family' | translate }}</mat-label>
                  <mat-select formControlName="familyId">
                    <mat-option [value]="null">
                      <i class="fa-solid fa-circle-minus" aria-hidden="true"></i>
                      {{ 'personForm.noFamily' | translate }}
                    </mat-option>
                    @for (family of families(); track family.id) {
                      <mat-option [value]="family.id">
                        @if (family.color) {
                          <span class="family-color" [style.background-color]="family.color"></span>
                        }
                        {{ getLocalizedFamilyName(family) }}
                      </mat-option>
                    }
                  </mat-select>
                  <i class="fa-solid fa-people-group" matSuffix aria-hidden="true"></i>
                </mat-form-field>
              }

              <!-- Privacy Level -->
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.privacy' | translate }}</mat-label>
                <mat-select formControlName="privacyLevel">
                  <mat-option [value]="PrivacyLevel.Public">
                    <i class="fa-solid fa-globe" aria-hidden="true"></i>
                    {{ 'personForm.privacyPublic' | translate }}
                  </mat-option>
                  <mat-option [value]="PrivacyLevel.Family">
                    <i class="fa-solid fa-people-roof" aria-hidden="true"></i>
                    {{ 'personForm.privacyFamily' | translate }}
                  </mat-option>
                  <mat-option [value]="PrivacyLevel.Private">
                    <i class="fa-solid fa-lock" aria-hidden="true"></i>
                    {{ 'personForm.privacyPrivate' | translate }}
                  </mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          </mat-tab>
          
          <!-- Life Events Tab -->
          <mat-tab [label]="'personForm.lifeEvents' | translate">
            <div class="form-tab-content">
              <!-- Birth Section -->
              <div class="form-section">
                <h4 class="form-section__title">
                  <i class="fa-solid fa-cake-candles" aria-hidden="true"></i>
                  {{ 'people.born' | translate }}
                </h4>
                
                <div class="form-row">
                  <mat-form-field appearance="outline" class="flex-1">
                    <mat-label>{{ 'personForm.birthDate' | translate }}</mat-label>
                    <input matInput [matDatepicker]="birthPicker" formControlName="birthDate">
                    <mat-datepicker-toggle matSuffix [for]="birthPicker"></mat-datepicker-toggle>
                    <mat-datepicker #birthPicker></mat-datepicker>
                  </mat-form-field>
                  
                  <mat-form-field appearance="outline" class="precision-field">
                    <mat-select formControlName="birthPrecision">
                      <mat-option [value]="DatePrecision.Exact">Exact</mat-option>
                      <mat-option [value]="DatePrecision.About">About</mat-option>
                      <mat-option [value]="DatePrecision.Before">Before</mat-option>
                      <mat-option [value]="DatePrecision.After">After</mat-option>
                      <mat-option [value]="DatePrecision.Unknown">Unknown</mat-option>
                    </mat-select>
                  </mat-form-field>
                </div>
                
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>{{ 'personForm.birthPlace' | translate }}</mat-label>
                  <input matInput formControlName="birthPlace" autocomplete="off">
                  <i class="fa-solid fa-location-dot" matSuffix aria-hidden="true"></i>
                </mat-form-field>
              </div>
              
              <!-- Death Section -->
              @if (!form.get('isLiving')?.value) {
                <div class="form-section">
                  <h4 class="form-section__title">
                    <i class="fa-solid fa-clock" aria-hidden="true"></i>
                    {{ 'people.died' | translate }}
                  </h4>
                  
                  <div class="form-row">
                    <mat-form-field appearance="outline" class="flex-1">
                      <mat-label>{{ 'personForm.deathDate' | translate }}</mat-label>
                      <input matInput [matDatepicker]="deathPicker" formControlName="deathDate">
                      <mat-datepicker-toggle matSuffix [for]="deathPicker"></mat-datepicker-toggle>
                      <mat-datepicker #deathPicker></mat-datepicker>
                    </mat-form-field>
                    
                    <mat-form-field appearance="outline" class="precision-field">
                      <mat-select formControlName="deathPrecision">
                        <mat-option [value]="DatePrecision.Exact">Exact</mat-option>
                        <mat-option [value]="DatePrecision.About">About</mat-option>
                        <mat-option [value]="DatePrecision.Before">Before</mat-option>
                        <mat-option [value]="DatePrecision.After">After</mat-option>
                        <mat-option [value]="DatePrecision.Unknown">Unknown</mat-option>
                      </mat-select>
                    </mat-form-field>
                  </div>
                  
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>{{ 'personForm.deathPlace' | translate }}</mat-label>
                    <input matInput formControlName="deathPlace" autocomplete="off">
                    <i class="fa-solid fa-location-dot" matSuffix aria-hidden="true"></i>
                  </mat-form-field>
                </div>
              }
            </div>
          </mat-tab>
          
          <!-- Additional Info Tab -->
          <mat-tab [label]="'personForm.additionalInfo' | translate">
            <div class="form-tab-content">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.occupation' | translate }}</mat-label>
                <input matInput formControlName="occupation">
                <i class="fa-solid fa-briefcase" matSuffix aria-hidden="true"></i>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.education' | translate }}</mat-label>
                <input matInput formControlName="education">
                <i class="fa-solid fa-graduation-cap" matSuffix aria-hidden="true"></i>
              </mat-form-field>
              
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.religion' | translate }}</mat-label>
                <input matInput formControlName="religion">
              </mat-form-field>
              
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.nationality' | translate }}</mat-label>
                <input matInput formControlName="nationality">
                <i class="fa-solid fa-flag" matSuffix aria-hidden="true"></i>
              </mat-form-field>
              
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'personForm.notes' | translate }}</mat-label>
                <textarea matInput formControlName="notes" rows="4"></textarea>
              </mat-form-field>
            </div>
          </mat-tab>
          
          <!-- Names Tab -->
          <mat-tab [label]="'personForm.names' | translate">
            <div class="form-tab-content">
              <div formArrayName="names">
                @for (name of namesArray.controls; track $index; let i = $index) {
                  <mat-expansion-panel [formGroupName]="i" class="name-panel">
                    <mat-expansion-panel-header>
                      <mat-panel-title>
                        {{ getNameTypeLabel(name.get('type')?.value) }}
                      </mat-panel-title>
                      <mat-panel-description>
                        {{ name.get('full')?.value || name.get('given')?.value || ('common.unknown' | translate) }}
                      </mat-panel-description>
                    </mat-expansion-panel-header>
                    
                    <div class="name-form-content">
                      <div class="form-row">
                        <mat-form-field appearance="outline" class="flex-1">
                          <mat-label>{{ 'personForm.nameType' | translate }}</mat-label>
                          <mat-select formControlName="type">
                            <mat-option [value]="NameType.Primary">{{ 'personForm.nameTypePrimary' | translate }}</mat-option>
                            <mat-option [value]="NameType.Birth">{{ 'personForm.nameTypeBirth' | translate }}</mat-option>
                            <mat-option [value]="NameType.Married">{{ 'personForm.nameTypeMarried' | translate }}</mat-option>
                            <mat-option [value]="NameType.Maiden">{{ 'personForm.nameTypeMaiden' | translate }}</mat-option>
                            <mat-option [value]="NameType.Nickname">{{ 'personForm.nameTypeNickname' | translate }}</mat-option>
                            <mat-option [value]="NameType.Alias">{{ 'personForm.nameTypeAlias' | translate }}</mat-option>
                          </mat-select>
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="flex-1">
                          <mat-label>{{ 'personForm.script' | translate }}</mat-label>
                          <mat-select formControlName="script">
                            <mat-option value="Latin">
                              <span class="script-option">🇬🇧 {{ 'personForm.scriptLatin' | translate }}</span>
                            </mat-option>
                            <mat-option value="Arabic">
                              <span class="script-option">🇸🇦 {{ 'personForm.scriptArabic' | translate }}</span>
                            </mat-option>
                            <mat-option value="Coptic">
                              <span class="script-option">🇸🇩 {{ 'personForm.scriptNobiin' | translate }}</span>
                            </mat-option>
                          </mat-select>
                        </mat-form-field>
                      </div>

                      <div class="form-row">
                        <mat-form-field appearance="outline" class="flex-1">
                          <mat-label>{{ 'personForm.firstName' | translate }}</mat-label>
                          <input matInput formControlName="given">
                        </mat-form-field>
                        
                        <mat-form-field appearance="outline" class="flex-1">
                          <mat-label>{{ 'personForm.middleName' | translate }}</mat-label>
                          <input matInput formControlName="middle">
                        </mat-form-field>
                      </div>
                      
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ 'personForm.lastName' | translate }}</mat-label>
                        <input matInput formControlName="family">
                      </mat-form-field>
                      
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>{{ 'personForm.fullName' | translate }}</mat-label>
                        <input matInput formControlName="full">
                      </mat-form-field>
                      
                      <div class="name-actions">
                        <button
                          mat-stroked-button
                          color="primary"
                          type="button"
                          (click)="transliterateName(i)"
                          [disabled]="transliterating() === i">
                          @if (transliterating() === i) {
                            <mat-spinner diameter="18"></mat-spinner>
                          } @else {
                            <i class="fa-solid fa-language" aria-hidden="true"></i>
                          }
                          {{ 'personForm.transliterate' | translate }}
                        </button>
                        <button mat-button color="warn" type="button" (click)="removeName(i)">
                          <i class="fa-solid fa-trash" aria-hidden="true"></i>
                          {{ 'common.delete' | translate }}
                        </button>
                      </div>
                    </div>
                  </mat-expansion-panel>
                }
              </div>
              
              <button mat-stroked-button type="button" (click)="addName()" class="add-name-btn">
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                {{ 'personForm.addName' | translate }}
              </button>
            </div>
          </mat-tab>
        </mat-tab-group>
      </form>
      
      <!-- Actions -->
      <div class="person-form-dialog__actions">
        <button mat-button (click)="onCancel()">
          {{ 'common.cancel' | translate }}
        </button>
        <button 
          mat-flat-button 
          color="primary" 
          (click)="onSave()"
          [disabled]="saving() || form.invalid">
          @if (saving()) {
            <mat-spinner diameter="20"></mat-spinner>
          } @else {
            <ng-container>
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
              {{ 'common.save' | translate }}
            </ng-container>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .person-form-dialog {
      display: flex;
      flex-direction: column;
      height: 100%;
      max-height: 90vh;
      
      &__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ft-spacing-md);
        border-bottom: 1px solid var(--ft-divider);
        position: sticky;
        top: 0;
        background: var(--ft-surface);
        z-index: 1;
      }
      
      &__title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }
      
      &__content {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      
      &__actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--ft-spacing-sm);
        padding: var(--ft-spacing-md);
        border-top: 1px solid var(--ft-divider);
        position: sticky;
        bottom: 0;
        background: var(--ft-surface);
        
        button {
          min-height: var(--ft-touch-target);
        }
      }
    }
    
    .form-tab-content {
      padding: var(--ft-spacing-md);
    }
    
    .full-width {
      width: 100%;
    }
    
    .flex-1 {
      flex: 1;
    }
    
    .form-row {
      display: flex;
      gap: var(--ft-spacing-md);
      
      @media (max-width: 500px) {
        flex-direction: column;
        gap: 0;
      }
    }
    
    .precision-field {
      width: 120px;
      
      @media (max-width: 500px) {
        width: 100%;
      }
    }
    
    .form-field-toggle {
      margin-bottom: var(--ft-spacing-md);
    }
    
    .form-section {
      margin-bottom: var(--ft-spacing-lg);
      
      &__title {
        display: flex;
        align-items: center;
        gap: var(--ft-spacing-sm);
        margin: 0 0 var(--ft-spacing-md);
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--ft-on-surface-variant);
        
        i.fa-solid {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
    }
    
    .name-panel {
      margin-bottom: var(--ft-spacing-md);
    }
    
    .name-form-content {
      padding-top: var(--ft-spacing-md);
    }
    
    .name-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: var(--ft-spacing-sm);
    }
    
    .add-name-btn {
      width: 100%;
      margin-top: var(--ft-spacing-md);
    }

    .script-option {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .family-color {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }

    ::ng-deep .mat-mdc-tab-body-wrapper {
      flex: 1;
    }
    
    mat-spinner {
      display: inline-block;
    }
  `]
})
export class PersonFormDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly personService = inject(PersonService);
  private readonly transliterationService = inject(TransliterationService);
  private readonly familyService = inject(FamilyService);
  private readonly treeContext = inject(TreeContextService);
  private readonly i18n = inject(I18nService);
  private readonly dialogRef = inject(MatDialogRef<PersonFormDialogComponent>);
  readonly data = inject<PersonFormDialogData>(MAT_DIALOG_DATA);

  // Expose enums to template
  readonly Sex = Sex;
  readonly NameType = NameType;
  readonly DatePrecision = DatePrecision;
  readonly PrivacyLevel = PrivacyLevel;

  form!: FormGroup;
  saving = signal(false);
  transliterating = signal<number | null>(null);
  families = signal<FamilyListItem[]>([]);
  
  get namesArray(): FormArray {
    return this.form.get('names') as FormArray;
  }
  
  ngOnInit(): void {
    this.initForm();
    this.loadFamilies();

    if (this.data.person) {
      this.loadPersonDetails();
    }
  }

  private loadFamilies(): void {
    const currentTree = this.treeContext.selectedTree();
    if (currentTree) {
      this.familyService.getFamiliesByTree(currentTree.id).subscribe({
        next: (families) => this.families.set(families),
        error: (err) => console.error('Failed to load families:', err)
      });
    }
  }
  
  private initForm(): void {
    this.form = this.fb.group({
      primaryName: ['', Validators.required],
      sex: [Sex.Unknown],
      isLiving: [true],
      familyId: [null],
      privacyLevel: [PrivacyLevel.Family],
      birthDate: [null],
      birthPrecision: [DatePrecision.Exact],
      birthPlace: [''],
      deathDate: [null],
      deathPrecision: [DatePrecision.Exact],
      deathPlace: [''],
      occupation: [''],
      education: [''],
      religion: [''],
      nationality: [''],
      notes: [''],
      names: this.fb.array([])
    });
  }
  
  private loadPersonDetails(): void {
    if (!this.data.person) return;
    
    // If we only have PersonListItem, load full person
    if (!('names' in this.data.person)) {
      this.personService.getPerson(this.data.person.id).subscribe({
        next: (person) => this.patchForm(person),
        error: (err) => console.error('Failed to load person details:', err)
      });
    } else {
      this.patchForm(this.data.person as Person);
    }
  }
  
  private patchForm(person: Person): void {
    this.form.patchValue({
      primaryName: person.primaryName || '',
      sex: person.sex,
      isLiving: !person.deathDate,
      familyId: person.familyId || null,
      privacyLevel: person.privacyLevel,
      birthDate: person.birthDate ? new Date(person.birthDate) : null,
      birthPrecision: person.birthPrecision,
      birthPlace: person.birthPlace || '',
      deathDate: person.deathDate ? new Date(person.deathDate) : null,
      deathPrecision: person.deathPrecision,
      deathPlace: person.deathPlace || '',
      occupation: person.occupation || '',
      education: person.education || '',
      religion: person.religion || '',
      nationality: person.nationality || '',
      notes: person.notes || ''
    });
    
    // Add names
    if (person.names) {
      person.names.forEach(name => {
        this.namesArray.push(this.createNameFormGroup(name));
      });
    }
  }
  
  private createNameFormGroup(name?: any): FormGroup {
    return this.fb.group({
      type: [name?.type ?? NameType.Primary],
      given: [name?.given ?? ''],
      middle: [name?.middle ?? ''],
      family: [name?.family ?? ''],
      full: [name?.full ?? ''],
      script: [name?.script ?? 'Latin'],
      transliteration: [name?.transliteration ?? '']
    });
  }
  
  addName(): void {
    this.namesArray.push(this.createNameFormGroup());
  }
  
  removeName(index: number): void {
    this.namesArray.removeAt(index);
  }
  
  getNameTypeLabel(type: NameType): string {
    const labels: Record<NameType, string> = {
      [NameType.Primary]: this.i18n.t('personForm.nameTypePrimary'),
      [NameType.Alias]: this.i18n.t('personForm.nameTypeAlias'),
      [NameType.Maiden]: this.i18n.t('personForm.nameTypeMaiden'),
      [NameType.Married]: this.i18n.t('personForm.nameTypeMarried'),
      [NameType.Nickname]: this.i18n.t('personForm.nameTypeNickname'),
      [NameType.Birth]: this.i18n.t('personForm.nameTypeBirth')
    };
    return labels[type] || type.toString();
  }
  
  onCancel(): void {
    this.dialogRef.close(false);
  }
  
  onSave(): void {
    if (this.form.invalid) return;
    
    this.saving.set(true);
    const formValue = this.form.value;
    
    const request: CreatePersonRequest = {
      primaryName: formValue.primaryName,
      sex: formValue.sex,
      familyId: formValue.familyId || undefined,
      privacyLevel: formValue.privacyLevel,
      birthDate: formValue.birthDate ? this.formatDateForApi(formValue.birthDate) : undefined,
      birthPrecision: formValue.birthPrecision,
      deathDate: !formValue.isLiving && formValue.deathDate
        ? this.formatDateForApi(formValue.deathDate)
        : undefined,
      deathPrecision: formValue.deathPrecision,
      occupation: formValue.occupation || undefined,
      education: formValue.education || undefined,
      religion: formValue.religion || undefined,
      nationality: formValue.nationality || undefined,
      notes: formValue.notes || undefined,
      names: formValue.names.length > 0 ? formValue.names : undefined
    };
    
    const operation = this.data.person
      ? this.personService.updatePerson(this.data.person.id, request)
      : this.personService.createPerson(request);
    
    operation.subscribe({
      next: (person) => {
        this.saving.set(false);
        this.dialogRef.close(person);
      },
      error: (error) => {
        console.error('Failed to save person:', error);
        this.saving.set(false);
      }
    });
  }
  
  private formatDateForApi(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  transliterateName(index: number): void {
    const nameGroup = this.namesArray.at(index);
    if (!nameGroup) return;

    const fullName = nameGroup.get('full')?.value;
    const given = nameGroup.get('given')?.value;
    const family = nameGroup.get('family')?.value;
    const script = nameGroup.get('script')?.value || 'Latin';
    const nameType = nameGroup.get('type')?.value || NameType.Primary;

    // Build the name to transliterate (prefer full name, otherwise combine parts)
    const nameToTransliterate = fullName || [given, family].filter(Boolean).join(' ');

    if (!nameToTransliterate.trim()) {
      return; // No name to transliterate
    }

    // Map script to source language
    const sourceLanguageMap: Record<string, 'en' | 'ar' | 'nob'> = {
      'Latin': 'en',
      'Arabic': 'ar',
      'Coptic': 'nob'
    };
    const sourceLanguage = sourceLanguageMap[script] || 'en';

    this.transliterating.set(index);

    this.transliterationService.transliterate({
      inputName: nameToTransliterate,
      sourceLanguage: sourceLanguage,
      displayLanguage: this.i18n.currentLang() as 'en' | 'ar' | 'nob'
    }).subscribe({
      next: (result) => {
        this.transliterating.set(null);

        // Add transliterated names for other scripts
        const scriptTargets: Array<{ script: string; value: string }> = [];

        if (script !== 'Arabic' && result.arabic) {
          scriptTargets.push({ script: 'Arabic', value: result.arabic });
        }
        if (script !== 'Latin' && result.english?.best) {
          scriptTargets.push({ script: 'Latin', value: result.english.best });
        }
        if (script !== 'Coptic' && result.nobiin?.value) {
          scriptTargets.push({ script: 'Coptic', value: result.nobiin.value });
        }

        // Add new name entries for each transliterated version
        scriptTargets.forEach(target => {
          // Check if we already have a name with this script
          const existingIndex = this.namesArray.controls.findIndex(
            ctrl => ctrl.get('script')?.value === target.script
          );

          if (existingIndex === -1) {
            // Add new name entry
            this.namesArray.push(this.fb.group({
              type: [nameType],
              given: [''],
              middle: [''],
              family: [''],
              full: [target.value],
              script: [target.script],
              transliteration: [nameToTransliterate]
            }));
          } else {
            // Update existing entry
            this.namesArray.at(existingIndex).patchValue({
              full: target.value,
              transliteration: nameToTransliterate
            });
          }
        });
      },
      error: (error) => {
        console.error('Transliteration failed:', error);
        this.transliterating.set(null);
      }
    });
  }

  getLocalizedFamilyName(family: FamilyListItem): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return family.nameAr || family.name;
      case 'nob':
        return family.nameLocal || family.name;
      case 'en':
      default:
        return family.nameEn || family.name;
    }
  }
}