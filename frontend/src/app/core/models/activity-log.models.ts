export interface ActivityLogQuery {
  page?: number;
  pageSize?: number;
  actorId?: number;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface ActivityLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  changeDescription: string | null;
  timestamp: string;
  actorId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
}

export interface ActivityLogResponse {
  items: ActivityLogItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ActivityLogFilters {
  actions: string[];
  entityTypes: string[];
}
