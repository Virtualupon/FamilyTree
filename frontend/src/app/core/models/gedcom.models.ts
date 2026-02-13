export interface GedcomImportResult {
  success: boolean;
  message: string;
  individualsImported: number;
  familiesImported: number;
  relationshipsCreated: number;
  warnings: string[];
  errors: string[];
  duration: string;
}

export interface GedcomImportOptions {
  createNewTree?: boolean;
  treeName?: string;
  existingTreeId?: string;
  townId?: string;
  importNotes?: boolean;
  importOccupations?: boolean;
}

// ============================================================================
// PREVIEW DTOs
// ============================================================================

export interface GedcomPreviewResult {
  fileName: string;
  fileSize: number;
  encoding: string;
  individualCount: number;
  familyCount: number;
  warnings: string[];
  warningCount: number;
  linkageStatistics: GedcomLinkageStatistics;
  familyGroups: GedcomPreviewFamilyGroup[];
  familyGroupsTruncated: boolean;
  orphanedIndividuals: GedcomPreviewIndividual[];
  allIndividuals: GedcomPreviewIndividual[];
  allIndividualsTruncated: boolean;
  dataQualityIssues: GedcomDataQualityIssue[];
}

export interface GedcomLinkageStatistics {
  totalIndividuals: number;
  individualsWithFAMC: number;
  individualsWithFAMS: number;
  individualsInFamilies: number;
  orphanedCount: number;
  totalFamilies: number;
  familiesWithBothSpouses: number;
  familiesWithChildren: number;
  familiesWithNoChildren: number;
  linkingMethod: 'FAMC_FAMS' | 'FAM_ONLY' | 'MIXED' | 'NONE';
  linkingMethodDescription: string;
}

export interface GedcomPreviewFamilyGroup {
  familyId: string;
  husband: GedcomPreviewIndividual | null;
  wife: GedcomPreviewIndividual | null;
  children: GedcomPreviewIndividual[];
  marriageDate: string | null;
  marriagePlace: string | null;
  divorceDate: string | null;
  issues: string[];
}

export interface GedcomPreviewIndividual {
  id: string;
  givenName: string | null;
  surname: string | null;
  fullName: string | null;
  sex: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  occupation: string | null;
  familyChildIds: string[];
  familySpouseIds: string[];
  hasFAMC: boolean;
  hasFAMS: boolean;
  isInFamily: boolean;
  isOrphaned: boolean;
}

export interface GedcomDataQualityIssue {
  severity: 'Error' | 'Warning' | 'Info';
  category: 'Linkage' | 'Data' | 'Structure';
  message: string;
  affectedIds: string[];
}
