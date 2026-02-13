// ============================================================================
// ANALYTICS MODELS
// ============================================================================

export interface TimeSeriesPoint {
  date: string;   // ISO date string from backend
  count: number;
}

// Growth Metrics
export interface GrowthMetrics {
  userRegistrations: TimeSeriesPoint[];
  treeCreations: TimeSeriesPoint[];
  peopleAdded: TimeSeriesPoint[];
  totalUsersInPeriod: number;
  totalTreesInPeriod: number;
  totalPeopleInPeriod: number;
}

// User Engagement
export interface ActiveUsers {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
}

export interface RoleDistribution {
  role: string;
  count: number;
}

export interface TopContributor {
  userId: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  peopleAdded: number;
  treesOwned: number;
}

export interface UserEngagement {
  activeUsers: ActiveUsers;
  roleDistribution: RoleDistribution[];
  topContributors: TopContributor[];
}

// Content Analytics
export interface TownContent {
  townId: string;
  townName: string;
  townNameAr: string | null;
  treeCount: number;
  personCount: number;
}

export interface TreeSizeBucket {
  label: string;
  count: number;
}

export interface ContentAnalytics {
  treesByTown: TownContent[];
  averageTreeSize: number;
  largestTreeSize: number;
  treeSizeDistribution: TreeSizeBucket[];
  totalRelationships: number;
  totalParentChild: number;
  totalUnions: number;
}

// Data Quality
export interface PrivacyDistribution {
  level: string;
  count: number;
}

export interface DataQuality {
  peopleWithNoName: number;
  peopleWithNoBirthDate: number;
  peopleWithUnknownSex: number;
  peopleWithNoRelationships: number;
  profileCompletenessPercent: number;
  privacyDistribution: PrivacyDistribution[];
}

// System Activity
export interface AuditActionSummary {
  action: string;
  entityType: string;
  count: number;
}

export interface RecentAuditLog {
  id: string;
  action: string;
  entityType: string;
  timestamp: string;
  actorId: number | null;
  actorName: string | null;
}

export interface SystemActivity {
  actionSummary: AuditActionSummary[];
  recentLogs: RecentAuditLog[];
  totalActionsLast24Hours: number;
  totalActionsLast7Days: number;
}

// Suggestions
export interface AnalyticsSuggestionStats {
  totalSuggestions: number;
  pending: number;
  approved: number;
  rejected: number;
  needsInfo: number;
  averageReviewTimeHours: number;
  submissionsOverTime: TimeSeriesPoint[];
}

// Combined Dashboard
export interface AnalyticsDashboard {
  growth: GrowthMetrics;
  engagement: UserEngagement;
  content: ContentAnalytics;
  dataQuality: DataQuality;
  systemActivity: SystemActivity;
  suggestions: AnalyticsSuggestionStats;
}

export type AnalyticsPeriod = 30 | 90 | 365;

// Chart data types for D3 components
export interface LineChartSeries {
  label: string;
  color: string;
  data: TimeSeriesPoint[];
}

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
}

export interface DonutChartItem {
  label: string;
  value: number;
  color: string;
}
