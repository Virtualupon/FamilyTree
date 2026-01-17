import { Component, Input, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { PersonMediaService } from '../../core/services/person-media.service';
import { PersonService } from '../../core/services/person.service';
import { PersonSearchService } from '../../core/services/person-search.service';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { PersonListItem } from '../../core/models/person.models';
import { SearchPersonItem, getPrimaryName } from '../../core/models/search.models';
import {
  PersonMediaListItem,
  PersonMediaGrouped,
  MediaKind,
  MediaValidationError,
  LinkedPerson
} from '../../core/models/person-media.models';

@Component({
  selector: 'app-person-media',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatDialogModule,
    TranslatePipe
  ],
  templateUrl: './person-media.component.html',
  styleUrls: ['./person-media.component.scss']
})
export class PersonMediaComponent implements OnInit, OnDestroy {
  @Input({ required: true }) personId!: string;

  private mediaService = inject(PersonMediaService);
  private personService = inject(PersonService);
  private searchService = inject(PersonSearchService);
  private snackBar = inject(MatSnackBar);
  private i18n = inject(I18nService);

  // State
  isLoading = signal(true);
  isUploading = signal(false);
  uploadingFileName = signal('');
  error = signal<string | null>(null);
  mediaGrouped = signal<PersonMediaGrouped | null>(null);

  // Loaded media URLs (for lazy loading) - keyed by mediaId (string)
  loadedImages = signal<Record<string, string>>({});
  loadedAudio = signal<Record<string, string>>({});
  loadedVideos = signal<Record<string, string>>({});

  // Lightbox
  lightboxImage = signal<string | null>(null);

  // Upload dialog state
  showUploadDialog = signal(false);
  selectedFile = signal<File | null>(null);
  selectedPersons = signal<SearchPersonItem[]>([]);
  personSearchQuery = '';
  mediaDescription = '';
  personSearchResults = signal<SearchPersonItem[]>([]);
  isSearching = signal(false);
  private searchSubject = new Subject<string>();

  // Upload state
  private objectUrls: string[] = [];

  // Accept all media types
  acceptTypes = this.mediaService.getAllAllowedMimeTypes();

  hasNoMedia = computed(() => {
    const grouped = this.mediaGrouped();
    if (!grouped) return true;
    return (
      (!grouped.images || grouped.images.length === 0) &&
      (!grouped.audio || grouped.audio.length === 0) &&
      (!grouped.videos || grouped.videos.length === 0)
    );
  });

  ngOnInit() {
    this.loadMedia();
    this.setupSearchDebounce();
  }

  ngOnDestroy() {
    // Clean up object URLs
    this.objectUrls.forEach(url => URL.revokeObjectURL(url));
    this.searchSubject.complete();
  }

  private setupSearchDebounce() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(query => {
      if (query.length >= 2) {
        this.searchPersons(query);
      } else {
        this.personSearchResults.set([]);
      }
    });
  }

  loadMedia() {
    this.isLoading.set(true);
    this.error.set(null);

    this.mediaService.getMediaByPersonGrouped(this.personId).subscribe({
      next: (grouped) => {
        this.mediaGrouped.set(grouped);
        this.isLoading.set(false);
        // Auto-load first few images
        this.preloadImages(grouped.images?.slice(0, 6) || []);
      },
      error: (err) => {
        console.error('Error loading media:', err);
        this.error.set(err.error?.message || this.i18n.t('media.failedLoadMedia'));
        this.isLoading.set(false);
      }
    });
  }

  private preloadImages(images: PersonMediaListItem[]) {
    images.forEach(img => this.loadFullMedia(img));
  }

  triggerUpload() {
    // Open upload dialog and pre-select current person
    this.openUploadDialog();
  }

  // Hidden file input handler (for dialog)
  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate file type
    const mediaKind = this.mediaService.detectMediaKind(file.type);
    if (!mediaKind) {
      this.snackBar.open(this.i18n.t('media.unsupportedFileType', { type: file.type }), this.i18n.t('common.close'), { duration: 5000 });
      input.value = '';
      return;
    }

    this.selectedFile.set(file);
    input.value = '';
  }

  // ========================================================================
  // UPLOAD DIALOG METHODS
  // ========================================================================

  openUploadDialog() {
    this.showUploadDialog.set(true);
    this.selectedFile.set(null);
    this.personSearchQuery = '';
    this.personSearchResults.set([]);

    // Immediately pre-select current person (don't wait for API)
    const currentPersonLabel = this.i18n.t('media.currentPerson');
    const minimalPerson: SearchPersonItem = {
      id: this.personId,
      orgId: '',
      familyId: null,
      familyName: null,
      primaryName: currentPersonLabel,
      nameArabic: null,
      nameEnglish: currentPersonLabel,
      nameNobiin: null,
      fatherId: null,
      fatherNameArabic: null,
      fatherNameEnglish: null,
      fatherNameNobiin: null,
      grandfatherId: null,
      grandfatherNameArabic: null,
      grandfatherNameEnglish: null,
      grandfatherNameNobiin: null,
      sex: 2, // Sex.Unknown
      birthDate: null,
      deathDate: null,
      birthPlaceId: null,
      birthPlaceName: null,
      nationality: null,
      isLiving: false,
      parentsCount: 0,
      childrenCount: 0,
      spousesCount: 0,
      mediaCount: 0,
      avatarMediaId: null
    };
    this.selectedPersons.set([minimalPerson]);

    // Optionally fetch full person details to update the display name
    this.personService.getPerson(this.personId).subscribe({
      next: (person) => {
        const searchItem: SearchPersonItem = {
          id: person.id,
          orgId: '',
          familyId: person.familyId,
          familyName: person.familyName,
          primaryName: person.primaryName,
          nameArabic: person.nameArabic,
          nameEnglish: person.nameEnglish,
          nameNobiin: person.nameNobiin,
          fatherId: null,
          fatherNameArabic: null,
          fatherNameEnglish: null,
          fatherNameNobiin: null,
          grandfatherId: null,
          grandfatherNameArabic: null,
          grandfatherNameEnglish: null,
          grandfatherNameNobiin: null,
          sex: person.sex,
          birthDate: person.birthDate,
          deathDate: person.deathDate,
          birthPlaceId: null,
          birthPlaceName: person.birthPlace,
          nationality: null,
          isLiving: false,
          parentsCount: 0,
          childrenCount: 0,
          spousesCount: 0,
          mediaCount: 0,
          avatarMediaId: (person as any).avatarMediaId || null
        };
        this.selectedPersons.set([searchItem]);
      },
      error: () => {
        // Keep the minimal person object already set above
      }
    });
  }

  closeUploadDialog() {
    this.showUploadDialog.set(false);
    this.selectedFile.set(null);
    this.selectedPersons.set([]);
    this.personSearchQuery = '';
    this.mediaDescription = '';
    this.personSearchResults.set([]);
  }

  triggerFileInput() {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (input) {
      input.click();
    }
  }

  clearSelectedFile() {
    this.selectedFile.set(null);
    this.mediaDescription = '';
  }

  onSearchQueryChange(query: string) {
    this.searchSubject.next(query);
  }

  private searchPersons(query: string) {
    this.isSearching.set(true);
    this.searchService.quickSearch(query, 1, 10).subscribe({
      next: (result) => {
        this.personSearchResults.set(result.items);
        this.isSearching.set(false);
      },
      error: (err) => {
        console.error('Search error:', err);
        this.personSearchResults.set([]);
        this.isSearching.set(false);
      }
    });
  }

  isPersonSelected(personId: string): boolean {
    return this.selectedPersons().some(p => p.id === personId);
  }

  togglePersonSelection(person: SearchPersonItem) {
    // Don't allow deselecting current person
    if (person.id === this.personId) return;

    const current = this.selectedPersons();
    const exists = current.some(p => p.id === person.id);

    if (exists) {
      this.selectedPersons.set(current.filter(p => p.id !== person.id));
    } else {
      this.selectedPersons.set([...current, person]);
    }
  }

  // Helper to get display name
  getSearchPersonName(person: SearchPersonItem): string {
    return getPrimaryName(person);
  }

  async performUpload() {
    const file = this.selectedFile();
    if (!file || this.selectedPersons().length === 0) return;

    try {
      this.isUploading.set(true);
      this.uploadingFileName.set(file.name);

      const personIds = this.selectedPersons().map(p => p.id);

      // Validate and prepare upload
      const payload = await this.mediaService.validateAndPrepareUpload(
        file,
        personIds,
        undefined, // title
        this.mediaDescription.trim() || undefined  // description
      );

      // Upload
      this.mediaService.uploadMedia(payload).subscribe({
        next: () => {
          const linkedCount = personIds.length;
          const message = linkedCount > 1
            ? this.i18n.t('media.uploadedLinked', { count: linkedCount })
            : this.i18n.t('media.uploadedSuccess');
          this.snackBar.open(message, this.i18n.t('common.close'), { duration: 3000 });
          this.isUploading.set(false);
          this.closeUploadDialog();
          this.loadMedia(); // Refresh list
        },
        error: (err) => {
          console.error('Upload error:', err);
          this.snackBar.open(err.error?.message || this.i18n.t('media.uploadFailed'), this.i18n.t('common.close'), { duration: 5000 });
          this.isUploading.set(false);
        }
      });
    } catch (err) {
      if (err instanceof MediaValidationError) {
        this.snackBar.open(err.message, this.i18n.t('common.close'), { duration: 5000 });
      } else {
        this.snackBar.open(this.i18n.t('media.failedProcessFile'), this.i18n.t('common.close'), { duration: 5000 });
      }
      this.isUploading.set(false);
    }
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audiotrack';
    if (mimeType.startsWith('video/')) return 'videocam';
    return 'insert_drive_file';
  }

  getFileIconClass(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'fa-image';
    if (mimeType.startsWith('audio/')) return 'fa-music';
    if (mimeType.startsWith('video/')) return 'fa-video';
    return 'fa-file';
  }

  getLifespan(person: SearchPersonItem): string {
    const birth = person.birthDate ? new Date(person.birthDate).getFullYear() : '?';
    const death = person.deathDate ? new Date(person.deathDate).getFullYear() : '';

    if (birth === '?' && death === '') return '';
    if (death === '') return `b. ${birth}`;
    return `${birth} - ${death}`;
  }

  loadFullMedia(media: PersonMediaListItem) {
    this.mediaService.getMediaById(media.mediaId).subscribe({
      next: (response) => {
        const url = this.mediaService.createObjectUrl(response.base64Data, response.mimeType || 'application/octet-stream');
        this.objectUrls.push(url);

        if (media.mediaKind === 'Image') {
          this.loadedImages.update(imgs => ({ ...imgs, [media.mediaId]: url }));
        } else if (media.mediaKind === 'Audio') {
          this.loadedAudio.update(audio => ({ ...audio, [media.mediaId]: url }));
        } else if (media.mediaKind === 'Video') {
          this.loadedVideos.update(videos => ({ ...videos, [media.mediaId]: url }));
        }
      },
      error: (err) => {
        console.error('Error loading media:', err);
        this.snackBar.open(this.i18n.t('media.failedLoadMedia'), this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }

  openLightbox(media: PersonMediaListItem) {
    const url = this.loadedImages()[media.mediaId];
    if (url) {
      this.lightboxImage.set(url);
    }
  }

  closeLightbox() {
    this.lightboxImage.set(null);
  }

  downloadMedia(media: PersonMediaListItem) {
    this.mediaService.getMediaById(media.mediaId).subscribe({
      next: (response) => {
        const blob = this.mediaService.base64ToBlob(response.base64Data, response.mimeType || 'application/octet-stream');
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = media.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Download error:', err);
        this.snackBar.open(this.i18n.t('media.failedDownloadMedia'), this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }

  deleteMedia(media: PersonMediaListItem) {
    const linkedCount = media.linkedPersons?.length || 0;
    let confirmMessage = this.i18n.t('media.confirmDelete', { name: media.fileName });

    if (linkedCount > 1) {
      confirmMessage += ' ' + this.i18n.t('media.linkedMultiplePeople', { count: linkedCount });
    }
    confirmMessage += ' ' + this.i18n.t('media.cannotBeUndone');

    if (!confirm(confirmMessage)) return;

    this.mediaService.deleteMedia(media.mediaId).subscribe({
      next: () => {
        this.snackBar.open(this.i18n.t('media.deleted'), this.i18n.t('common.close'), { duration: 3000 });
        this.loadMedia(); // Refresh list
      },
      error: (err) => {
        console.error('Delete error:', err);
        this.snackBar.open(err.error?.message || this.i18n.t('media.failedDeleteMedia'), this.i18n.t('common.close'), { duration: 3000 });
      }
    });
  }

  // Helper methods
  formatFileSize(bytes: number): string {
    return this.mediaService.formatFileSize(bytes);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  truncateFileName(name: string, maxLength = 25): string {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const baseName = name.slice(0, name.length - ext.length - 1);
    const truncatedBase = baseName.slice(0, maxLength - ext.length - 4) + '...';
    return `${truncatedBase}.${ext}`;
  }
}
