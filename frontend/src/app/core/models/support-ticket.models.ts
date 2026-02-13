// ============================================
// Support Ticket Models
// Platform-level support system (no OrgId)
// ============================================

/**
 * Ticket category
 */
export enum TicketCategory {
  Bug = 0,
  Enhancement = 1
}

/**
 * Ticket priority
 */
export enum TicketPriority {
  Low = 0,
  Medium = 1,
  High = 2
}

/**
 * Ticket status
 */
export enum TicketStatus {
  Open = 0,
  WorkingOnIt = 1,
  Resolved = 2,
  Closed = 3
}

// ============================================================================
// Label maps for i18n keys
// ============================================================================

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  [TicketCategory.Bug]: 'support.category.bug',
  [TicketCategory.Enhancement]: 'support.category.enhancement'
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  [TicketPriority.Low]: 'support.priority.low',
  [TicketPriority.Medium]: 'support.priority.medium',
  [TicketPriority.High]: 'support.priority.high'
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  [TicketStatus.Open]: 'support.status.open',
  [TicketStatus.WorkingOnIt]: 'support.status.workingOnIt',
  [TicketStatus.Resolved]: 'support.status.resolved',
  [TicketStatus.Closed]: 'support.status.closed'
};

// ============================================================================
// Request interfaces
// ============================================================================

export interface CreateSupportTicketRequest {
  category: TicketCategory;
  subject: string;
  description: string;
  stepsToReproduce?: string;
  pageUrl?: string;
  browserInfo?: string;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
  resolutionNotes?: string;
}

export interface AssignTicketRequest {
  assignedToUserId: number;
}

export interface UpdateTicketPriorityRequest {
  priority: TicketPriority;
}

export interface AddTicketCommentRequest {
  content: string;
}

export interface UpdateAdminNotesRequest {
  adminNotes?: string;
}

export interface SupportTicketQueryParams {
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  assignedToUserId?: number;
  searchTerm?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDesc?: boolean;
}

// ============================================================================
// Response interfaces
// ============================================================================

export interface SupportTicketSummary {
  id: string;
  ticketNumber: number;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  submittedAt: string;
  submittedByUserId: number;
  submitterName: string;
  submitterEmail?: string;
  assignedToUserId?: number;
  assignedToName?: string;
  attachmentCount: number;
  commentCount: number;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketDetail {
  id: string;
  ticketNumber: number;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description: string;
  stepsToReproduce?: string;
  pageUrl?: string;
  browserInfo?: string;
  submittedAt: string;
  submittedByUserId: number;
  submitterName: string;
  submitterEmail?: string;
  assignedToUserId?: number;
  assignedToName?: string;
  adminNotes?: string;
  resolvedAt?: string;
  resolvedByUserId?: number;
  resolvedByName?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
  attachments: TicketAttachment[];
  comments: TicketComment[];
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  url: string;
  mimeType?: string;
  fileSize: number;
  uploadedByUserId: number;
  createdAt: string;
}

export interface TicketComment {
  id: string;
  content: string;
  isAdminResponse: boolean;
  authorUserId: number;
  authorName: string;
  createdAt: string;
}

export interface SupportTicketStats {
  totalCount: number;
  openCount: number;
  workingOnItCount: number;
  resolvedCount: number;
  closedCount: number;
  avgResolutionTimeHours?: number;
}

export interface PagedTicketResult {
  items: SupportTicketSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
