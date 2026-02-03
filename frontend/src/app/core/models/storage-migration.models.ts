export interface MigrationRequest {
  orgId?: string;
  mediaKind?: string;
  dryRun: boolean;
  renameFiles: boolean;
  deleteLocalAfter: boolean;
  batchSize: number;
  maxFiles: number;
  maxConcurrency: number;
}

export interface MigrationProgress {
  totalFiles: number;
  processedFiles: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalBytesTransferred: number;
  resultOverflowCount: number;
  currentFile: string | null;
  fileResults: MigrationFileResult[];
  errors: MigrationError[];
  startedAt: string;
  completedAt: string | null;
  isComplete: boolean;
  isRunning: boolean;
  progressPercent: number;
  duration: string | null;
}

export interface MigrationFileResult {
  mediaId: string;
  oldPath: string;
  newPath: string;
  fileSize: number;
}

export interface MigrationError {
  mediaId: string;
  fileName: string;
  oldPath: string;
  errorMessage: string;
  occurredAt: string;
}

export interface MigrationResult {
  success: boolean;
  progress: MigrationProgress;
  message: string;
}

export interface MigrationPendingCount {
  totalLocalFiles: number;
  totalBytes: number;
  byMediaKind: { [key: string]: number };
  byOrg: { [key: string]: number };
}

export interface MigrationStatusResponse {
  isRunning: boolean;
  message: string;
  progress: MigrationProgress | null;
}
