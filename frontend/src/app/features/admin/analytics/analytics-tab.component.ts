import { Component, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';

import { AnalyticsService } from '../../../core/services/analytics.service';
import { TranslatePipe } from '../../../core/i18n';
import {
  AnalyticsDashboard,
  AnalyticsPeriod,
  LineChartSeries,
  BarChartItem,
  DonutChartItem,
  RecentAuditLog
} from '../../../core/models/analytics.models';

import { D3LineChartComponent } from './d3-line-chart.component';
import { D3BarChartComponent } from './d3-bar-chart.component';
import { D3DonutChartComponent } from './d3-donut-chart.component';

@Component({
  selector: 'app-analytics-tab',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonToggleModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatPaginatorModule,
    TranslatePipe,
    D3LineChartComponent,
    D3BarChartComponent,
    D3DonutChartComponent
  ],
  templateUrl: './analytics-tab.component.html',
  styleUrls: ['./analytics-tab.component.scss']
})
export class AnalyticsTabComponent implements OnInit {
  private analyticsService = inject(AnalyticsService);

  // State signals
  loading = signal(true);
  error = signal<string | null>(null);
  dashboard = signal<AnalyticsDashboard | null>(null);
  selectedPeriod = signal<AnalyticsPeriod>(30);
  growthLoading = signal(false);

  // Pagination for recent activity
  activityPageIndex = signal(0);
  activityPageSize = signal(5);

  // Table columns
  contributorColumns = ['rank', 'user', 'peopleAdded', 'treesOwned'];
  auditColumns = ['timestamp', 'actor', 'action', 'entityType'];

  // Paginated audit logs
  paginatedLogs = computed<RecentAuditLog[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    const start = this.activityPageIndex() * this.activityPageSize();
    const end = start + this.activityPageSize();
    return d.systemActivity.recentLogs.slice(start, end);
  });

  totalLogs = computed(() => {
    const d = this.dashboard();
    return d?.systemActivity.recentLogs.length ?? 0;
  });

  // Computed chart data
  growthChartData = computed<LineChartSeries[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    return [
      { label: 'Users', color: '#187573', data: d.growth.userRegistrations },
      { label: 'Trees', color: '#2D7A3E', data: d.growth.treeCreations },
      { label: 'People', color: '#C17E3E', data: d.growth.peopleAdded }
    ];
  });

  townChartData = computed<BarChartItem[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    return d.content.treesByTown.slice(0, 10).map(t => ({
      label: t.townName,
      value: t.treeCount
    }));
  });

  treeSizeChartData = computed<BarChartItem[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    return d.content.treeSizeDistribution.map(b => ({
      label: b.label,
      value: b.count,
      color: '#187573'
    }));
  });

  roleDonutData = computed<DonutChartItem[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    const colors: Record<string, string> = {
      'Developer': '#E85D35',
      'SuperAdmin': '#C17E3E',
      'Admin': '#187573',
      'User': '#2D7A3E'
    };
    return d.engagement.roleDistribution.map(r => ({
      label: r.role,
      value: r.count,
      color: colors[r.role] || '#888'
    }));
  });

  privacyDonutData = computed<DonutChartItem[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    const colors: Record<string, string> = {
      'Public': '#2D7A3E',
      'FamilyOnly': '#187573',
      'Private': '#C17E3E',
      'InitialsOnly': '#E85D35'
    };
    return d.dataQuality.privacyDistribution.map(p => ({
      label: p.level,
      value: p.count,
      color: colors[p.level] || '#888'
    }));
  });

  suggestionDonutData = computed<DonutChartItem[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    return [
      { label: 'Pending', value: d.suggestions.pending, color: '#C17E3E' },
      { label: 'Approved', value: d.suggestions.approved, color: '#2D7A3E' },
      { label: 'Rejected', value: d.suggestions.rejected, color: '#E85D35' },
      { label: 'Needs Info', value: d.suggestions.needsInfo, color: '#187573' }
    ].filter(item => item.value > 0);
  });

  actionSummaryChartData = computed<BarChartItem[]>(() => {
    const d = this.dashboard();
    if (!d) return [];
    return d.systemActivity.actionSummary.map(a => ({
      label: `${a.action} (${a.entityType})`,
      value: a.count,
      color: '#187573'
    }));
  });

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.loading.set(true);
    this.error.set(null);
    this.analyticsService.getDashboard(this.selectedPeriod()).subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load analytics data');
        this.loading.set(false);
      }
    });
  }

  onPeriodChange(period: AnalyticsPeriod): void {
    this.selectedPeriod.set(period);
    this.growthLoading.set(true);
    this.analyticsService.getGrowthMetrics(period).subscribe({
      next: (growth) => {
        this.dashboard.update(d => d ? { ...d, growth } : null);
        this.growthLoading.set(false);
      },
      error: () => this.growthLoading.set(false)
    });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  onActivityPageChange(event: PageEvent): void {
    this.activityPageIndex.set(event.pageIndex);
    this.activityPageSize.set(event.pageSize);
  }
}
