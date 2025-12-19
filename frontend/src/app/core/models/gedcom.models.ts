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
  importNotes?: boolean;
  importOccupations?: boolean;
}

export interface GedcomPreviewResult {
  fileName: string;
  fileSize: number;
  encoding: string;
  individualCount: number;
  familyCount: number;
  warnings: string[];
  warningCount: number;
  sampleIndividuals: GedcomPreviewIndividual[];
}

export interface GedcomPreviewIndividual {
  id: string;
  name: string | null;
  sex: string | null;
  birthDate: string | null;
  deathDate: string | null;
}
