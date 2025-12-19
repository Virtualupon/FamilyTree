import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Language = 'en' | 'ar' | 'nob';

export interface LanguageConfig {
  code: Language;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  flag: string;
}

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private readonly STORAGE_KEY = 'family_tree_language';
  
  readonly supportedLanguages: LanguageConfig[] = [
    { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', flag: '🇬🇧' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', flag: '🇸🇦' },
    { code: 'nob', name: 'Norwegian', nativeName: 'Norsk Bokmål', direction: 'ltr', flag: '🇳🇴' }
  ];

  private currentLangSubject = new BehaviorSubject<Language>(this.loadLanguage());
  currentLang$ = this.currentLangSubject.asObservable();
  
  currentLang = signal<Language>(this.loadLanguage());
  
  direction = computed(() => {
    const lang = this.currentLang();
    return this.supportedLanguages.find(l => l.code === lang)?.direction || 'ltr';
  });

  isRtl = computed(() => this.direction() === 'rtl');

  private translations: Record<Language, Record<string, string>> = {
    en: {},
    ar: {},
    nob: {}
  };

  constructor() {
    this.loadTranslations();
    this.applyDirection();
  }

  private loadLanguage(): Language {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored && this.supportedLanguages.some(l => l.code === stored)) {
      return stored as Language;
    }
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'ar') return 'ar';
    if (browserLang === 'no' || browserLang === 'nb') return 'nob';
    return 'en';
  }

  setLanguage(lang: Language): void {
    localStorage.setItem(this.STORAGE_KEY, lang);
    this.currentLang.set(lang);
    this.currentLangSubject.next(lang);
    this.applyDirection();
  }

  private applyDirection(): void {
    const dir = this.direction();
    document.documentElement.dir = dir;
    document.documentElement.lang = this.currentLang();
    document.body.classList.toggle('rtl', dir === 'rtl');
  }

  t(key: string, params?: Record<string, string | number>): string {
    const lang = this.currentLang();
    let translation = this.translations[lang][key] || this.translations['en'][key] || key;

    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        translation = translation.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(value));
      });
    }

    return translation;
  }

  /**
   * Get localized town name based on current language
   */
  getTownName(town: { name: string; nameEn?: string | null; nameAr?: string | null; nameLocal?: string | null }): string {
    const lang = this.currentLang();
    if (lang === 'ar' && town.nameAr) return town.nameAr;
    if (lang === 'en' && town.nameEn) return town.nameEn;
    return town.nameLocal || town.name;
  }

  private loadTranslations(): void {
    // English translations
    this.translations.en = {
      // Common
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.add': 'Add',
      'common.search': 'Search',
      'common.filter': 'Filter',
      'common.loading': 'Loading...',
      'common.noResults': 'No results found',
      'common.confirm': 'Confirm',
      'common.back': 'Back',
      'common.next': 'Next',
      'common.close': 'Close',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.all': 'All',
      'common.none': 'None',
      'common.unknown': 'Unknown',
      'common.optional': 'Optional',
      'common.required': 'Required',
      
      // Navigation
      'nav.dashboard': 'Dashboard',
      'nav.people': 'People',
      'nav.familyTree': 'Family Tree',
      'nav.media': 'Media',
      'nav.settings': 'Settings',
      'nav.logout': 'Logout',
      
      // People
      'people.title': 'Family Members',
      'people.addPerson': 'Add Person',
      'people.searchPlaceholder': 'Search by name...',
      'people.filterBySex': 'Filter by sex',
      'people.filterByStatus': 'Filter by status',
      'people.living': 'Living',
      'people.deceased': 'Deceased',
      'people.male': 'Male',
      'people.female': 'Female',
      'people.unknown': 'Unknown',
      'people.noPeople': 'No family members yet',
      'people.addFirst': 'Add your first family member to get started',
      'people.totalCount': '{{count}} family members',
      'people.born': 'Born',
      'people.died': 'Died',
      'people.age': 'Age',
      'people.viewProfile': 'View Profile',
      'people.editPerson': 'Edit Person',
      'people.deletePerson': 'Delete Person',
      'people.deleteConfirm': 'Are you sure you want to delete this person? This action cannot be undone.',
      
      // Person Form
      'personForm.basicInfo': 'Basic Information',
      'personForm.names': 'Names',
      'personForm.lifeEvents': 'Life Events',
      'personForm.additionalInfo': 'Additional Information',
      'personForm.firstName': 'First Name',
      'personForm.middleName': 'Middle Name',
      'personForm.lastName': 'Last Name',
      'personForm.fullName': 'Full Name',
      'personForm.sex': 'Sex',
      'personForm.birthDate': 'Birth Date',
      'personForm.birthPlace': 'Birth Place',
      'personForm.deathDate': 'Death Date',
      'personForm.deathPlace': 'Death Place',
      'personForm.isLiving': 'Is Living',
      'personForm.occupation': 'Occupation',
      'personForm.education': 'Education',
      'personForm.religion': 'Religion',
      'personForm.nationality': 'Nationality',
      'personForm.notes': 'Notes',
      'personForm.privacy': 'Privacy Level',
      'personForm.privacyPublic': 'Public',
      'personForm.privacyFamily': 'Family Only',
      'personForm.privacyPrivate': 'Private',
      'personForm.addName': 'Add Alternative Name',
      'personForm.nameType': 'Name Type',
      'personForm.nameTypePrimary': 'Primary',
      'personForm.nameTypeAlias': 'Alias',
      'personForm.nameTypeMaiden': 'Maiden',
      'personForm.nameTypeMarried': 'Married',
      'personForm.nameTypeNickname': 'Nickname',
      'personForm.nameTypeBirth': 'Birth',
      'personForm.createSuccess': 'Person created successfully',
      'personForm.updateSuccess': 'Person updated successfully',
      'personForm.deleteSuccess': 'Person deleted successfully',
      
      // Tree
      'tree.title': 'Family Tree',
      'tree.selectPerson': 'Select a person to view their family tree',
      'tree.pedigree': 'Pedigree',
      'tree.descendants': 'Descendants',
      'tree.hourglass': 'Hourglass',
      'tree.generations': 'Generations',
      'tree.includeSpouses': 'Include Spouses',
      'tree.zoomIn': 'Zoom In',
      'tree.zoomOut': 'Zoom Out',
      'tree.resetView': 'Reset View',
      'tree.fitToScreen': 'Fit to Screen',
      'tree.downloadImage': 'Download Image',
      'tree.noParents': 'No parents recorded',
      'tree.noChildren': 'No children recorded',
      'tree.noSpouse': 'No spouse recorded',
      'tree.addParent': 'Add Parent',
      'tree.addChild': 'Add Child',
      'tree.addSpouse': 'Add Spouse',
      'tree.relationship': 'Relationship',
      'tree.calculateRelationship': 'Calculate Relationship',
      
      // Relationships
      'relationship.parent': 'Parent',
      'relationship.child': 'Child',
      'relationship.spouse': 'Spouse',
      'relationship.sibling': 'Sibling',
      'relationship.biological': 'Biological',
      'relationship.adopted': 'Adopted',
      'relationship.foster': 'Foster',
      'relationship.step': 'Step',
      
      // Dashboard
      'dashboard.welcome': 'Welcome to Family Tree Platform',
      'dashboard.quickStats': 'Quick Statistics',
      'dashboard.totalPeople': 'Total People',
      'dashboard.totalFamilies': 'Total Families',
      'dashboard.recentActivity': 'Recent Activity',
      'dashboard.quickActions': 'Quick Actions',
      'dashboard.getStarted': 'Get Started',
      'dashboard.noTreesMessage': 'Create your first family tree to start adding family members and building your genealogy.',
      'dashboard.createTree': 'Create Family Tree',

      // Errors
      'error.generic': 'An error occurred. Please try again.',
      'error.network': 'Network error. Please check your connection.',
      'error.unauthorized': 'You are not authorized to perform this action.',
      'error.notFound': 'The requested resource was not found.',
      'error.validation': 'Please check your input and try again.',

      // Trees
      'trees.title': 'Family Trees',
      'trees.subtitle': 'Manage and explore your family trees',
      'trees.create': 'Create Tree',
      'trees.createTitle': 'Create New Family Tree',
      'trees.searchPlaceholder': 'Search trees...',
      'trees.allTowns': 'All Towns',
      'trees.treesFound': 'trees found',
      'trees.public': 'Public',
      'trees.people': 'people',
      'trees.open': 'Open',
      'trees.settings': 'Settings',
      'trees.noResults': 'No trees found',
      'trees.tryDifferentSearch': 'Try a different search term or clear filters',
      'trees.clearFilters': 'Clear Filters',
      'trees.noTrees': 'No family trees yet',
      'trees.createFirst': 'Create your first family tree to get started',
      'trees.createFirstButton': 'Create Your First Tree',
      'trees.name': 'Tree Name',
      'trees.namePlaceholder': 'e.g., Smith Family Tree',
      'trees.description': 'Description',
      'trees.descriptionPlaceholder': 'Optional description...',
      'trees.town': 'Town/City',
      'trees.noTown': '-- No town selected --',
      'trees.townHint': 'Associate this tree with a town or city',
      'trees.makePublic': 'Make this tree public',
      'trees.allowLinking': 'Allow cross-tree linking',
      'trees.linkingHint': 'Allows other trees to link to people in this tree',
      'trees.import': 'Import GEDCOM',

      // GEDCOM Import
      'gedcom.title': 'Import GEDCOM File',
      'gedcom.steps.upload': 'Upload',
      'gedcom.steps.preview': 'Preview',
      'gedcom.steps.options': 'Options',
      'gedcom.steps.result': 'Result',
      'gedcom.upload.dragDrop': 'Drag and drop your GEDCOM file here',
      'gedcom.upload.or': 'or',
      'gedcom.upload.browse': 'Browse Files',
      'gedcom.upload.hint': 'Supports .ged files (GEDCOM 5.5.1, UTF-8)',
      'gedcom.preview.analyzing': 'Analyzing file...',
      'gedcom.preview.individuals': 'Individuals',
      'gedcom.preview.families': 'Families',
      'gedcom.preview.fileSize': 'File Size',
      'gedcom.preview.encoding': 'Encoding',
      'gedcom.preview.sampleData': 'Sample Data',
      'gedcom.preview.name': 'Name',
      'gedcom.preview.sex': 'Sex',
      'gedcom.preview.birth': 'Birth',
      'gedcom.preview.death': 'Death',
      'gedcom.preview.warnings': 'Warnings',
      'gedcom.options.treeName': 'Tree Name',
      'gedcom.options.treeNamePlaceholder': 'Enter a name for the new tree',
      'gedcom.options.importNotes': 'Import notes and comments',
      'gedcom.options.importOccupations': 'Import occupations',
      'gedcom.options.info': 'A new family tree will be created with the imported data. You can edit the tree after import.',
      'gedcom.importing.message': 'Importing your family tree...',
      'gedcom.importing.patience': 'This may take a few moments for large files',
      'gedcom.import': 'Start Import',
      'gedcom.result.success': 'Import Successful!',
      'gedcom.result.failed': 'Import Failed',
      'gedcom.result.individuals': 'Individuals',
      'gedcom.result.families': 'Families',
      'gedcom.result.relationships': 'Relationships',
      'gedcom.result.warnings': 'Warnings',
      'gedcom.result.errors': 'Errors',
      'gedcom.result.moreWarnings': '...and {count} more warnings',
      'gedcom.error.invalidFile': 'Please select a valid GEDCOM file (.ged)',
      'gedcom.error.fileTooLarge': 'File is too large (max 100 MB)',
      'gedcom.error.previewFailed': 'Failed to analyze file',
      'gedcom.error.importFailed': 'Import failed. Please try again.',

      // Towns
      'towns.title': 'Towns & Cities',
      'towns.create': 'Create Town',
      'towns.import': 'Import CSV',
      'towns.searchPlaceholder': 'Search towns...',
      'towns.allCountries': 'All Countries',
      'towns.trees': 'trees',
      'towns.noTowns': 'No towns yet',
      'towns.noTownsDesc': 'Create your first town to organize family trees by location.',
      'towns.createFirst': 'Create First Town',
      'towns.createTitle': 'Create New Town',
      'towns.editTitle': 'Edit Town',
      'towns.name': 'Name',
      'towns.nameEn': 'English Name',
      'towns.nameAr': 'Arabic Name',
      'towns.nameLocal': 'Local Name',
      'towns.country': 'Country',
      'towns.description': 'Description',
      'towns.backToList': 'Back to Towns',
      'towns.treesInTown': 'Family Trees',
      'towns.openTree': 'Open Tree',
      'towns.noTrees': 'No family trees in this town',
      'towns.noTreesDesc': 'Family trees can be associated with this town when created.',

      // Families
      'families.title': 'Families',
      'families.totalFamilies': 'families',
      'families.noFamilies': 'No families found',
      'families.noFamiliesDesc': 'Families will appear here when you add marriages and partnerships.',
      'families.filterType': 'Filter by type',
      'towns.confirmDelete': 'Are you sure you want to delete this town?',
      'towns.importTitle': 'Import Towns from CSV',
      'towns.importDesc': 'Upload a CSV file with town data. Required format:',
      'towns.dropFile': 'Drag and drop a CSV file here, or',
      'towns.browseFile': 'browse to select',
      'towns.importResult': 'Import Results:',
      'towns.importCreated': '{{count}} towns created',
      'towns.importSkipped': '{{count}} towns skipped (duplicates)',
      'towns.importErrors': '{{count}} errors',

      // Cross-Tree Links
      'crossTree.badge': 'Cross-Tree Links',
      'crossTree.navigatingTo': 'Navigating to {person} in {tree}',
      'crossTree.samePerson': 'Same Person',
      'crossTree.ancestor': 'Ancestor',
      'crossTree.related': 'Related',
      'crossTree.jumpTo': 'Jump to linked person',

      // Common additions
      'common.previous': 'Previous',
      'common.pageOf': 'Page {{page}} of {{total}}',
      'common.create': 'Create',
      'common.creating': 'Creating...',
      'common.importing': 'Importing...',
      'common.saving': 'Saving...',
      'common.public': 'Public',
      'common.people': 'people',
    };

    // Arabic translations
    this.translations.ar = {
      // Common
      'common.save': 'حفظ',
      'common.cancel': 'إلغاء',
      'common.delete': 'حذف',
      'common.edit': 'تعديل',
      'common.add': 'إضافة',
      'common.search': 'بحث',
      'common.filter': 'تصفية',
      'common.loading': 'جاري التحميل...',
      'common.noResults': 'لا توجد نتائج',
      'common.confirm': 'تأكيد',
      'common.back': 'رجوع',
      'common.next': 'التالي',
      'common.close': 'إغلاق',
      'common.yes': 'نعم',
      'common.no': 'لا',
      'common.all': 'الكل',
      'common.none': 'لا شيء',
      'common.unknown': 'غير معروف',
      'common.optional': 'اختياري',
      'common.required': 'مطلوب',
      
      // Navigation
      'nav.dashboard': 'لوحة التحكم',
      'nav.people': 'الأشخاص',
      'nav.familyTree': 'شجرة العائلة',
      'nav.media': 'الوسائط',
      'nav.settings': 'الإعدادات',
      'nav.logout': 'تسجيل الخروج',
      
      // People
      'people.title': 'أفراد العائلة',
      'people.addPerson': 'إضافة شخص',
      'people.searchPlaceholder': 'البحث بالاسم...',
      'people.filterBySex': 'تصفية حسب الجنس',
      'people.filterByStatus': 'تصفية حسب الحالة',
      'people.living': 'على قيد الحياة',
      'people.deceased': 'متوفى',
      'people.male': 'ذكر',
      'people.female': 'أنثى',
      'people.unknown': 'غير معروف',
      'people.noPeople': 'لا يوجد أفراد بعد',
      'people.addFirst': 'أضف أول فرد من العائلة للبدء',
      'people.totalCount': '{{count}} فرد من العائلة',
      'people.born': 'ولد',
      'people.died': 'توفي',
      'people.age': 'العمر',
      'people.viewProfile': 'عرض الملف',
      'people.editPerson': 'تعديل الشخص',
      'people.deletePerson': 'حذف الشخص',
      'people.deleteConfirm': 'هل أنت متأكد من حذف هذا الشخص؟ لا يمكن التراجع عن هذا الإجراء.',
      
      // Person Form
      'personForm.basicInfo': 'المعلومات الأساسية',
      'personForm.names': 'الأسماء',
      'personForm.lifeEvents': 'أحداث الحياة',
      'personForm.additionalInfo': 'معلومات إضافية',
      'personForm.firstName': 'الاسم الأول',
      'personForm.middleName': 'الاسم الأوسط',
      'personForm.lastName': 'اسم العائلة',
      'personForm.fullName': 'الاسم الكامل',
      'personForm.sex': 'الجنس',
      'personForm.birthDate': 'تاريخ الميلاد',
      'personForm.birthPlace': 'مكان الميلاد',
      'personForm.deathDate': 'تاريخ الوفاة',
      'personForm.deathPlace': 'مكان الوفاة',
      'personForm.isLiving': 'على قيد الحياة',
      'personForm.occupation': 'المهنة',
      'personForm.education': 'التعليم',
      'personForm.religion': 'الديانة',
      'personForm.nationality': 'الجنسية',
      'personForm.notes': 'ملاحظات',
      'personForm.privacy': 'مستوى الخصوصية',
      'personForm.privacyPublic': 'عام',
      'personForm.privacyFamily': 'العائلة فقط',
      'personForm.privacyPrivate': 'خاص',
      'personForm.addName': 'إضافة اسم بديل',
      'personForm.nameType': 'نوع الاسم',
      'personForm.nameTypePrimary': 'أساسي',
      'personForm.nameTypeAlias': 'اسم مستعار',
      'personForm.nameTypeMaiden': 'اسم قبل الزواج',
      'personForm.nameTypeMarried': 'اسم بعد الزواج',
      'personForm.nameTypeNickname': 'لقب',
      'personForm.nameTypeBirth': 'اسم الميلاد',
      'personForm.createSuccess': 'تم إنشاء الشخص بنجاح',
      'personForm.updateSuccess': 'تم تحديث الشخص بنجاح',
      'personForm.deleteSuccess': 'تم حذف الشخص بنجاح',
      
      // Tree
      'tree.title': 'شجرة العائلة',
      'tree.selectPerson': 'اختر شخصًا لعرض شجرة عائلته',
      'tree.pedigree': 'النسب',
      'tree.descendants': 'الأحفاد',
      'tree.hourglass': 'الساعة الرملية',
      'tree.generations': 'الأجيال',
      'tree.includeSpouses': 'تضمين الأزواج',
      'tree.zoomIn': 'تكبير',
      'tree.zoomOut': 'تصغير',
      'tree.resetView': 'إعادة تعيين العرض',
      'tree.fitToScreen': 'ملاءمة للشاشة',
      'tree.downloadImage': 'تحميل الصورة',
      'tree.noParents': 'لا يوجد والدين مسجلين',
      'tree.noChildren': 'لا يوجد أطفال مسجلين',
      'tree.noSpouse': 'لا يوجد زوج مسجل',
      'tree.addParent': 'إضافة والد',
      'tree.addChild': 'إضافة طفل',
      'tree.addSpouse': 'إضافة زوج',
      'tree.relationship': 'العلاقة',
      'tree.calculateRelationship': 'حساب العلاقة',
      
      // Relationships
      'relationship.parent': 'والد',
      'relationship.child': 'طفل',
      'relationship.spouse': 'زوج',
      'relationship.sibling': 'أخ/أخت',
      'relationship.biological': 'بيولوجي',
      'relationship.adopted': 'متبنى',
      'relationship.foster': 'حضانة',
      'relationship.step': 'زوج الأم/الأب',
      
      // Dashboard
      'dashboard.welcome': 'مرحبًا بك في منصة شجرة العائلة',
      'dashboard.quickStats': 'إحصائيات سريعة',
      'dashboard.totalPeople': 'إجمالي الأشخاص',
      'dashboard.totalFamilies': 'إجمالي العائلات',
      'dashboard.recentActivity': 'النشاط الأخير',
      'dashboard.quickActions': 'إجراءات سريعة',
      'dashboard.getStarted': 'ابدأ الآن',
      'dashboard.noTreesMessage': 'أنشئ شجرة عائلتك الأولى لبدء إضافة أفراد العائلة وبناء نسبك.',
      'dashboard.createTree': 'إنشاء شجرة العائلة',

      // Errors
      'error.generic': 'حدث خطأ. يرجى المحاولة مرة أخرى.',
      'error.network': 'خطأ في الشبكة. يرجى التحقق من اتصالك.',
      'error.unauthorized': 'غير مصرح لك بتنفيذ هذا الإجراء.',
      'error.notFound': 'المورد المطلوب غير موجود.',
      'error.validation': 'يرجى التحقق من المدخلات والمحاولة مرة أخرى.',

      // Trees
      'trees.title': 'أشجار العائلة',
      'trees.subtitle': 'إدارة واستكشاف أشجار عائلتك',
      'trees.create': 'إنشاء شجرة',
      'trees.createTitle': 'إنشاء شجرة عائلة جديدة',
      'trees.searchPlaceholder': 'البحث في الأشجار...',
      'trees.allTowns': 'جميع المدن',
      'trees.treesFound': 'شجرة موجودة',
      'trees.public': 'عام',
      'trees.people': 'شخص',
      'trees.open': 'فتح',
      'trees.settings': 'الإعدادات',
      'trees.noResults': 'لم يتم العثور على أشجار',
      'trees.tryDifferentSearch': 'جرب مصطلح بحث مختلف أو امسح الفلاتر',
      'trees.clearFilters': 'مسح الفلاتر',
      'trees.noTrees': 'لا توجد أشجار عائلة بعد',
      'trees.createFirst': 'أنشئ أول شجرة عائلة للبدء',
      'trees.createFirstButton': 'إنشاء أول شجرة',
      'trees.name': 'اسم الشجرة',
      'trees.namePlaceholder': 'مثال: شجرة عائلة سميث',
      'trees.description': 'الوصف',
      'trees.descriptionPlaceholder': 'وصف اختياري...',
      'trees.town': 'المدينة/البلدة',
      'trees.noTown': '-- لم يتم اختيار مدينة --',
      'trees.townHint': 'ربط هذه الشجرة بمدينة أو بلدة',
      'trees.makePublic': 'جعل هذه الشجرة عامة',
      'trees.allowLinking': 'السماح بالربط بين الأشجار',
      'trees.linkingHint': 'يسمح للأشجار الأخرى بالربط بأشخاص في هذه الشجرة',
      'trees.import': 'استيراد GEDCOM',

      // GEDCOM Import
      'gedcom.title': 'استيراد ملف GEDCOM',
      'gedcom.steps.upload': 'رفع',
      'gedcom.steps.preview': 'معاينة',
      'gedcom.steps.options': 'خيارات',
      'gedcom.steps.result': 'النتيجة',
      'gedcom.upload.dragDrop': 'اسحب وأفلت ملف GEDCOM هنا',
      'gedcom.upload.or': 'أو',
      'gedcom.upload.browse': 'تصفح الملفات',
      'gedcom.upload.hint': 'يدعم ملفات .ged (GEDCOM 5.5.1, UTF-8)',
      'gedcom.preview.analyzing': 'جاري تحليل الملف...',
      'gedcom.preview.individuals': 'الأفراد',
      'gedcom.preview.families': 'العائلات',
      'gedcom.preview.fileSize': 'حجم الملف',
      'gedcom.preview.encoding': 'الترميز',
      'gedcom.preview.sampleData': 'عينة البيانات',
      'gedcom.preview.name': 'الاسم',
      'gedcom.preview.sex': 'الجنس',
      'gedcom.preview.birth': 'الميلاد',
      'gedcom.preview.death': 'الوفاة',
      'gedcom.preview.warnings': 'تحذيرات',
      'gedcom.options.treeName': 'اسم الشجرة',
      'gedcom.options.treeNamePlaceholder': 'أدخل اسماً للشجرة الجديدة',
      'gedcom.options.importNotes': 'استيراد الملاحظات والتعليقات',
      'gedcom.options.importOccupations': 'استيراد المهن',
      'gedcom.options.info': 'سيتم إنشاء شجرة عائلة جديدة بالبيانات المستوردة. يمكنك تعديل الشجرة بعد الاستيراد.',
      'gedcom.importing.message': 'جاري استيراد شجرة عائلتك...',
      'gedcom.importing.patience': 'قد يستغرق هذا بعض الوقت للملفات الكبيرة',
      'gedcom.import': 'بدء الاستيراد',
      'gedcom.result.success': 'تم الاستيراد بنجاح!',
      'gedcom.result.failed': 'فشل الاستيراد',
      'gedcom.result.individuals': 'الأفراد',
      'gedcom.result.families': 'العائلات',
      'gedcom.result.relationships': 'العلاقات',
      'gedcom.result.warnings': 'تحذيرات',
      'gedcom.result.errors': 'أخطاء',
      'gedcom.result.moreWarnings': '...و {count} تحذيرات أخرى',
      'gedcom.error.invalidFile': 'يرجى اختيار ملف GEDCOM صالح (.ged)',
      'gedcom.error.fileTooLarge': 'الملف كبير جداً (الحد الأقصى 100 ميجابايت)',
      'gedcom.error.previewFailed': 'فشل في تحليل الملف',
      'gedcom.error.importFailed': 'فشل الاستيراد. يرجى المحاولة مرة أخرى.',

      // Towns
      'towns.title': 'المدن والبلدات',
      'towns.create': 'إنشاء مدينة',
      'towns.import': 'استيراد CSV',
      'towns.searchPlaceholder': 'البحث عن المدن...',
      'towns.allCountries': 'جميع الدول',
      'towns.trees': 'أشجار',
      'towns.noTowns': 'لا توجد مدن بعد',
      'towns.noTownsDesc': 'أنشئ أول مدينة لتنظيم أشجار العائلة حسب الموقع.',
      'towns.createFirst': 'إنشاء أول مدينة',
      'towns.createTitle': 'إنشاء مدينة جديدة',
      'towns.editTitle': 'تعديل المدينة',
      'towns.name': 'الاسم',
      'towns.nameEn': 'الاسم بالإنجليزية',
      'towns.nameAr': 'الاسم بالعربية',
      'towns.nameLocal': 'الاسم المحلي',
      'towns.country': 'الدولة',
      'towns.description': 'الوصف',
      'towns.backToList': 'العودة إلى المدن',
      'towns.treesInTown': 'أشجار العائلة',
      'towns.openTree': 'فتح الشجرة',
      'towns.noTrees': 'لا توجد أشجار عائلة في هذه المدينة',
      'towns.noTreesDesc': 'يمكن ربط أشجار العائلة بهذه المدينة عند إنشائها.',

      // Families
      'families.title': 'العائلات',
      'families.totalFamilies': 'عائلة',
      'families.noFamilies': 'لا توجد عائلات',
      'families.noFamiliesDesc': 'ستظهر العائلات هنا عند إضافة الزيجات والشراكات.',
      'families.filterType': 'تصفية حسب النوع',
      'towns.confirmDelete': 'هل أنت متأكد من حذف هذه المدينة؟',
      'towns.importTitle': 'استيراد المدن من ملف CSV',
      'towns.importDesc': 'ارفع ملف CSV ببيانات المدن. التنسيق المطلوب:',
      'towns.dropFile': 'اسحب وأفلت ملف CSV هنا، أو',
      'towns.browseFile': 'تصفح للاختيار',
      'towns.importResult': 'نتائج الاستيراد:',
      'towns.importCreated': 'تم إنشاء {{count}} مدينة',
      'towns.importSkipped': 'تم تخطي {{count}} مدينة (مكررة)',
      'towns.importErrors': '{{count}} أخطاء',

      // Cross-Tree Links
      'crossTree.badge': 'روابط بين الأشجار',
      'crossTree.navigatingTo': 'الانتقال إلى {person} في {tree}',
      'crossTree.samePerson': 'نفس الشخص',
      'crossTree.ancestor': 'سلف',
      'crossTree.related': 'قريب',
      'crossTree.jumpTo': 'الانتقال إلى الشخص المرتبط',

      // Common additions
      'common.previous': 'السابق',
      'common.pageOf': 'صفحة {{page}} من {{total}}',
      'common.create': 'إنشاء',
      'common.creating': 'جاري الإنشاء...',
      'common.importing': 'جاري الاستيراد...',
      'common.saving': 'جاري الحفظ...',
      'common.public': 'عام',
      'common.people': 'شخص',
    };

    // Norwegian Bokmål translations
    this.translations.nob = {
      // Common
      'common.save': 'Lagre',
      'common.cancel': 'Avbryt',
      'common.delete': 'Slett',
      'common.edit': 'Rediger',
      'common.add': 'Legg til',
      'common.search': 'Søk',
      'common.filter': 'Filter',
      'common.loading': 'Laster...',
      'common.noResults': 'Ingen resultater funnet',
      'common.confirm': 'Bekreft',
      'common.back': 'Tilbake',
      'common.next': 'Neste',
      'common.close': 'Lukk',
      'common.yes': 'Ja',
      'common.no': 'Nei',
      'common.all': 'Alle',
      'common.none': 'Ingen',
      'common.unknown': 'Ukjent',
      'common.optional': 'Valgfritt',
      'common.required': 'Påkrevd',
      
      // Navigation
      'nav.dashboard': 'Dashbord',
      'nav.people': 'Personer',
      'nav.familyTree': 'Slektstre',
      'nav.media': 'Media',
      'nav.settings': 'Innstillinger',
      'nav.logout': 'Logg ut',
      
      // People
      'people.title': 'Familiemedlemmer',
      'people.addPerson': 'Legg til person',
      'people.searchPlaceholder': 'Søk etter navn...',
      'people.filterBySex': 'Filtrer etter kjønn',
      'people.filterByStatus': 'Filtrer etter status',
      'people.living': 'Levende',
      'people.deceased': 'Avdød',
      'people.male': 'Mann',
      'people.female': 'Kvinne',
      'people.unknown': 'Ukjent',
      'people.noPeople': 'Ingen familiemedlemmer ennå',
      'people.addFirst': 'Legg til ditt første familiemedlem for å komme i gang',
      'people.totalCount': '{{count}} familiemedlemmer',
      'people.born': 'Født',
      'people.died': 'Død',
      'people.age': 'Alder',
      'people.viewProfile': 'Vis profil',
      'people.editPerson': 'Rediger person',
      'people.deletePerson': 'Slett person',
      'people.deleteConfirm': 'Er du sikker på at du vil slette denne personen? Denne handlingen kan ikke angres.',
      
      // Person Form
      'personForm.basicInfo': 'Grunnleggende informasjon',
      'personForm.names': 'Navn',
      'personForm.lifeEvents': 'Livshendelser',
      'personForm.additionalInfo': 'Tilleggsinformasjon',
      'personForm.firstName': 'Fornavn',
      'personForm.middleName': 'Mellomnavn',
      'personForm.lastName': 'Etternavn',
      'personForm.fullName': 'Fullt navn',
      'personForm.sex': 'Kjønn',
      'personForm.birthDate': 'Fødselsdato',
      'personForm.birthPlace': 'Fødested',
      'personForm.deathDate': 'Dødsdato',
      'personForm.deathPlace': 'Dødssted',
      'personForm.isLiving': 'Er i live',
      'personForm.occupation': 'Yrke',
      'personForm.education': 'Utdanning',
      'personForm.religion': 'Religion',
      'personForm.nationality': 'Nasjonalitet',
      'personForm.notes': 'Notater',
      'personForm.privacy': 'Personvernnivå',
      'personForm.privacyPublic': 'Offentlig',
      'personForm.privacyFamily': 'Kun familie',
      'personForm.privacyPrivate': 'Privat',
      'personForm.addName': 'Legg til alternativt navn',
      'personForm.nameType': 'Navnetype',
      'personForm.nameTypePrimary': 'Primær',
      'personForm.nameTypeAlias': 'Alias',
      'personForm.nameTypeMaiden': 'Pikenavn',
      'personForm.nameTypeMarried': 'Giftenavn',
      'personForm.nameTypeNickname': 'Kallenavn',
      'personForm.nameTypeBirth': 'Fødselsnavn',
      'personForm.createSuccess': 'Person opprettet',
      'personForm.updateSuccess': 'Person oppdatert',
      'personForm.deleteSuccess': 'Person slettet',
      
      // Tree
      'tree.title': 'Slektstre',
      'tree.selectPerson': 'Velg en person for å se slektstreet',
      'tree.pedigree': 'Stamtavle',
      'tree.descendants': 'Etterkommere',
      'tree.hourglass': 'Timeglass',
      'tree.generations': 'Generasjoner',
      'tree.includeSpouses': 'Inkluder ektefeller',
      'tree.zoomIn': 'Zoom inn',
      'tree.zoomOut': 'Zoom ut',
      'tree.resetView': 'Tilbakestill visning',
      'tree.fitToScreen': 'Tilpass til skjerm',
      'tree.downloadImage': 'Last ned bilde',
      'tree.noParents': 'Ingen foreldre registrert',
      'tree.noChildren': 'Ingen barn registrert',
      'tree.noSpouse': 'Ingen ektefelle registrert',
      'tree.addParent': 'Legg til forelder',
      'tree.addChild': 'Legg til barn',
      'tree.addSpouse': 'Legg til ektefelle',
      'tree.relationship': 'Relasjon',
      'tree.calculateRelationship': 'Beregn slektskap',
      
      // Relationships
      'relationship.parent': 'Forelder',
      'relationship.child': 'Barn',
      'relationship.spouse': 'Ektefelle',
      'relationship.sibling': 'Søsken',
      'relationship.biological': 'Biologisk',
      'relationship.adopted': 'Adoptert',
      'relationship.foster': 'Foster',
      'relationship.step': 'Ste-',
      
      // Dashboard
      'dashboard.welcome': 'Velkommen til Slektstre-plattformen',
      'dashboard.quickStats': 'Rask statistikk',
      'dashboard.totalPeople': 'Totalt antall personer',
      'dashboard.totalFamilies': 'Totalt antall familier',
      'dashboard.recentActivity': 'Nylig aktivitet',
      'dashboard.quickActions': 'Hurtighandlinger',
      'dashboard.getStarted': 'Kom i gang',
      'dashboard.noTreesMessage': 'Opprett ditt første slektstre for å begynne å legge til familiemedlemmer og bygge din slektshistorie.',
      'dashboard.createTree': 'Opprett slektstre',

      // Errors
      'error.generic': 'En feil oppstod. Vennligst prøv igjen.',
      'error.network': 'Nettverksfeil. Sjekk tilkoblingen din.',
      'error.unauthorized': 'Du har ikke tillatelse til å utføre denne handlingen.',
      'error.notFound': 'Den forespurte ressursen ble ikke funnet.',
      'error.validation': 'Vennligst sjekk inndataene og prøv igjen.',

      // Trees
      'trees.title': 'Slektstrær',
      'trees.subtitle': 'Administrer og utforsk slektstrærne dine',
      'trees.create': 'Opprett tre',
      'trees.createTitle': 'Opprett nytt slektstre',
      'trees.searchPlaceholder': 'Søk i trær...',
      'trees.allTowns': 'Alle byer',
      'trees.treesFound': 'trær funnet',
      'trees.public': 'Offentlig',
      'trees.people': 'personer',
      'trees.open': 'Åpne',
      'trees.settings': 'Innstillinger',
      'trees.noResults': 'Ingen trær funnet',
      'trees.tryDifferentSearch': 'Prøv et annet søkeord eller fjern filtre',
      'trees.clearFilters': 'Fjern filtre',
      'trees.noTrees': 'Ingen slektstrær ennå',
      'trees.createFirst': 'Opprett ditt første slektstre for å komme i gang',
      'trees.createFirstButton': 'Opprett ditt første tre',
      'trees.name': 'Trenavn',
      'trees.namePlaceholder': 'f.eks. Hansens slektstre',
      'trees.description': 'Beskrivelse',
      'trees.descriptionPlaceholder': 'Valgfri beskrivelse...',
      'trees.town': 'By/sted',
      'trees.noTown': '-- Ingen by valgt --',
      'trees.townHint': 'Knytt dette treet til en by eller et sted',
      'trees.makePublic': 'Gjør dette treet offentlig',
      'trees.allowLinking': 'Tillat krysskobling',
      'trees.linkingHint': 'Tillater andre trær å koble til personer i dette treet',
      'trees.import': 'Importer GEDCOM',

      // GEDCOM Import
      'gedcom.title': 'Importer GEDCOM-fil',
      'gedcom.steps.upload': 'Last opp',
      'gedcom.steps.preview': 'Forhåndsvis',
      'gedcom.steps.options': 'Alternativer',
      'gedcom.steps.result': 'Resultat',
      'gedcom.upload.dragDrop': 'Dra og slipp GEDCOM-filen din her',
      'gedcom.upload.or': 'eller',
      'gedcom.upload.browse': 'Bla gjennom filer',
      'gedcom.upload.hint': 'Støtter .ged-filer (GEDCOM 5.5.1, UTF-8)',
      'gedcom.preview.analyzing': 'Analyserer fil...',
      'gedcom.preview.individuals': 'Personer',
      'gedcom.preview.families': 'Familier',
      'gedcom.preview.fileSize': 'Filstørrelse',
      'gedcom.preview.encoding': 'Koding',
      'gedcom.preview.sampleData': 'Eksempeldata',
      'gedcom.preview.name': 'Navn',
      'gedcom.preview.sex': 'Kjønn',
      'gedcom.preview.birth': 'Fødsel',
      'gedcom.preview.death': 'Død',
      'gedcom.preview.warnings': 'Advarsler',
      'gedcom.options.treeName': 'Trenavn',
      'gedcom.options.treeNamePlaceholder': 'Skriv inn et navn for det nye treet',
      'gedcom.options.importNotes': 'Importer notater og kommentarer',
      'gedcom.options.importOccupations': 'Importer yrker',
      'gedcom.options.info': 'Et nytt slektstre vil bli opprettet med de importerte dataene. Du kan redigere treet etter import.',
      'gedcom.importing.message': 'Importerer slektstreet ditt...',
      'gedcom.importing.patience': 'Dette kan ta litt tid for store filer',
      'gedcom.import': 'Start import',
      'gedcom.result.success': 'Import vellykket!',
      'gedcom.result.failed': 'Import mislyktes',
      'gedcom.result.individuals': 'Personer',
      'gedcom.result.families': 'Familier',
      'gedcom.result.relationships': 'Relasjoner',
      'gedcom.result.warnings': 'Advarsler',
      'gedcom.result.errors': 'Feil',
      'gedcom.result.moreWarnings': '...og {count} flere advarsler',
      'gedcom.error.invalidFile': 'Vennligst velg en gyldig GEDCOM-fil (.ged)',
      'gedcom.error.fileTooLarge': 'Filen er for stor (maks 100 MB)',
      'gedcom.error.previewFailed': 'Kunne ikke analysere filen',
      'gedcom.error.importFailed': 'Import mislyktes. Prøv igjen.',

      // Towns
      'towns.title': 'Byer og tettsteder',
      'towns.create': 'Opprett by',
      'towns.import': 'Importer CSV',
      'towns.searchPlaceholder': 'Søk i byer...',
      'towns.allCountries': 'Alle land',
      'towns.trees': 'trær',
      'towns.noTowns': 'Ingen byer ennå',
      'towns.noTownsDesc': 'Opprett din første by for å organisere slektstrær etter sted.',
      'towns.createFirst': 'Opprett første by',
      'towns.createTitle': 'Opprett ny by',
      'towns.editTitle': 'Rediger by',
      'towns.name': 'Navn',
      'towns.nameEn': 'Engelsk navn',
      'towns.nameAr': 'Arabisk navn',
      'towns.nameLocal': 'Lokalt navn',
      'towns.country': 'Land',
      'towns.description': 'Beskrivelse',
      'towns.backToList': 'Tilbake til byer',
      'towns.treesInTown': 'Slektstrær',
      'towns.openTree': 'Åpne tre',
      'towns.noTrees': 'Ingen slektstrær i denne byen',
      'towns.noTreesDesc': 'Slektstrær kan knyttes til denne byen når de opprettes.',
      'towns.confirmDelete': 'Er du sikker på at du vil slette denne byen?',
      'towns.importTitle': 'Importer byer fra CSV',
      'towns.importDesc': 'Last opp en CSV-fil med bydata. Påkrevd format:',
      'towns.dropFile': 'Dra og slipp en CSV-fil her, eller',
      'towns.browseFile': 'bla for å velge',
      'towns.importResult': 'Importresultater:',
      'towns.importCreated': '{{count}} byer opprettet',
      'towns.importSkipped': '{{count}} byer hoppet over (duplikater)',
      'towns.importErrors': '{{count}} feil',

      // Cross-Tree Links
      'crossTree.badge': 'Koblinger mellom trær',
      'crossTree.navigatingTo': 'Navigerer til {person} i {tree}',
      'crossTree.samePerson': 'Samme person',
      'crossTree.ancestor': 'Forfader',
      'crossTree.related': 'Beslektet',
      'crossTree.jumpTo': 'Gå til koblet person',

      // Common additions
      'common.previous': 'Forrige',
      'common.pageOf': 'Side {{page}} av {{total}}',
      'common.create': 'Opprett',
      'common.creating': 'Oppretter...',
      'common.importing': 'Importerer...',
      'common.saving': 'Lagrer...',
      'common.public': 'Offentlig',
      'common.people': 'personer',
    };
  }
}