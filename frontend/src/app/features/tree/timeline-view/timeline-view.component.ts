import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  AfterViewInit,
  SimpleChanges,
  inject,
  signal,
  ViewChild,
  ElementRef,
  DestroyRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { from, mergeMap, of } from 'rxjs';

import * as d3 from 'd3';

import { TreePersonNode } from '../../../core/models/tree.models';
import { Sex } from '../../../core/models/person.models';
import { I18nService, TranslatePipe } from '../../../core/i18n';
import { PersonMediaService } from '../../../core/services/person-media.service';
import { TimelineNode, TimelineConfig, TimelineLegendItem } from './timeline.models';

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSelectModule,
    MatTooltipModule,
    MatButtonModule,
    TranslatePipe
  ],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.scss']
})
export class TimelineViewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svgElement') svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltip') tooltipRef!: ElementRef<HTMLDivElement>;

  @Input() treeData: TreePersonNode | null = null;
  @Input() selectedPersonId: string | null = null;

  @Output() personSelected = new EventEmitter<TreePersonNode>();
  @Output() personDoubleClicked = new EventEmitter<TreePersonNode>();

  private readonly i18n = inject(I18nService);
  private readonly mediaService = inject(PersonMediaService);
  private readonly destroyRef = inject(DestroyRef);

  // Avatar loading concurrency limit
  private readonly AVATAR_CONCURRENCY = 5;

  // Unique counter for SVG element IDs to prevent collisions
  private svgIdCounter = 0;

  // Configuration
  selectedGeneration = signal<number | 'all'>('all');
  generationOptions = signal<Array<{ value: number | 'all'; label: string }>>([]);
  legendItems = signal<TimelineLegendItem[]>([]);

  // D3 elements
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private mainGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private xScale: d3.ScaleLinear<number, number> | null = null;

  // Data
  private timelineNodes: TimelineNode[] = [];
  private avatarCache = new Map<string, string>();

  // Layout constants
  private readonly barHeight = 28;
  private readonly barSpacing = 8;
  private readonly avatarRadius = 14;
  private readonly leftMargin = 180;
  private readonly rightMargin = 60;
  private readonly topMargin = 50;
  private readonly bottomMargin = 30;

  /**
   * Maximum ancestor generations to display (negative direction from root).
   * Prevents performance issues with very deep family trees.
   */
  private readonly MAX_ANCESTOR_GENERATIONS = 4;

  /**
   * Maximum descendant generations to display (positive direction from root).
   * Prevents performance issues with very deep family trees.
   */
  private readonly MAX_DESCENDANT_GENERATIONS = 5;

  // Color for root person (generation 0)
  private readonly rootColor = { main: '#187573', light: '#B3E0DF' };  // Nubian teal

  // Ancestor colors (warm tones: gold/brown) - for parents, grandparents, etc.
  private readonly ancestorColors: Array<{ main: string; light: string }> = [
    { main: '#C17E3E', light: '#FFEDD5' },  // parents (gen -1)
    { main: '#B5651D', light: '#FFE4C4' },  // grandparents (gen -2)
    { main: '#8B4513', light: '#DEB887' },  // great-grandparents (gen -3)
    { main: '#6B4423', light: '#D2B48C' },  // gen -4+
  ];

  // Descendant colors (cool tones: green) - for children, grandchildren, etc.
  private readonly descendantColors: Array<{ main: string; light: string }> = [
    { main: '#2D7A3E', light: '#C9E9CF' },  // children (gen 1)
    { main: '#228B22', light: '#90EE90' },  // grandchildren (gen 2)
    { main: '#006400', light: '#98FB98' },  // great-grandchildren (gen 3)
    { main: '#004D00', light: '#7CFC00' },  // gen 4+
  ];

  private containerWidth = 1200;
  private isInitialized = false;

  ngAfterViewInit(): void {
    this.isInitialized = true;
    if (this.treeData) {
      this.initializeTimeline();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['treeData'] && this.treeData && this.isInitialized) {
      this.initializeTimeline();
    }
    if (changes['selectedPersonId'] && this.isInitialized && this.svg) {
      this.updateSelection();
    }
  }

  ngOnDestroy(): void {
    // Revoke object URLs
    this.avatarCache.forEach(url => URL.revokeObjectURL(url));
    this.avatarCache.clear();
  }

  private initializeTimeline(): void {
    if (!this.treeData || !this.containerRef?.nativeElement) return;

    // Build timeline data
    this.timelineNodes = this.buildTimelineData(this.treeData);

    // Build generation options
    this.buildGenerationOptions();

    // Build legend
    this.buildLegend();

    // Get container width
    this.containerWidth = this.containerRef.nativeElement.clientWidth || 1200;

    // Initialize D3
    this.setupSvg();
    this.renderTimeline();

    // Load avatars
    this.loadAvatars();
  }

  private buildTimelineData(root: TreePersonNode): TimelineNode[] {
    const nodes: TimelineNode[] = [];
    const currentYear = new Date().getFullYear();

    // Process root
    const rootNode = this.createTimelineNode(root, 0, null, 0);
    nodes.push(rootNode);

    // Process ancestors (negative generations)
    this.processAncestors(root.parents, nodes, -1, root.id, 0);

    // Process descendants (positive generations)
    this.processDescendants(root.children, nodes, 1, root.id, 0);

    // Sort by birth year for consistent ordering
    nodes.sort((a, b) => {
      // First by generation (ancestors first, then root, then descendants)
      if (a.generation !== b.generation) {
        return a.generation - b.generation;
      }
      // Then by birth year
      return a.birthYear - b.birthYear;
    });

    // Assign yIndex for vertical positioning
    let yIndex = 0;
    let lastGeneration = nodes[0]?.generation;

    nodes.forEach(node => {
      if (node.generation !== lastGeneration) {
        yIndex += 0.5; // Add gap between generations
        lastGeneration = node.generation;
      }
      node.yIndex = yIndex;
      yIndex++;
    });

    return nodes;
  }

  /**
   * Get the color set for a given generation.
   * Root (0) uses teal, ancestors (negative) use warm tones, descendants (positive) use cool tones.
   */
  private getColorForGeneration(generation: number): { main: string; light: string } {
    if (generation === 0) {
      return this.rootColor;
    }
    if (generation < 0) {
      // Ancestors: index 0 = parents (-1), index 1 = grandparents (-2), etc.
      const index = Math.min(Math.abs(generation) - 1, this.ancestorColors.length - 1);
      return this.ancestorColors[index];
    }
    // Descendants: index 0 = children (1), index 1 = grandchildren (2), etc.
    const index = Math.min(generation - 1, this.descendantColors.length - 1);
    return this.descendantColors[index];
  }

  private createTimelineNode(
    person: TreePersonNode,
    generation: number,
    parentId: string | null,
    colorIndex: number
  ): TimelineNode {
    const currentYear = new Date().getFullYear();
    const birthYear = this.parseYear(person.birthDate) ?? (currentYear - 50);

    let deathYear: number | null = null;
    if (person.deathDate) {
      deathYear = this.parseYear(person.deathDate);
    }
    if (deathYear === null && !person.isLiving) {
      deathYear = birthYear + 70;
    }

    // Use generation-based color (ancestors = warm, descendants = cool)
    const colorSet = this.getColorForGeneration(generation);

    return {
      id: person.id,
      person,
      displayName: this.getDisplayName(person),
      birthYear,
      deathYear,
      isLiving: person.isLiving,
      generation,
      parentId,
      descendantCount: this.countDescendants(person),
      yIndex: 0,
      color: colorSet.main,
      colorLight: colorSet.light,
      avatarUrl: null
    };
  }

  /**
   * Safely parse a date string to extract year.
   * Returns null if invalid or unparseable.
   */
  private parseYear(dateStr: string | undefined | null): number | null {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      // Check for Invalid Date (NaN) and unreasonable years
      if (isNaN(year) || year < 1000 || year > 2200) {
        return null;
      }
      return year;
    } catch {
      return null;
    }
  }

  private processAncestors(
    parents: TreePersonNode[] | undefined,
    nodes: TimelineNode[],
    generation: number,
    childId: string,
    colorIndex: number
  ): void {
    if (!parents || generation < -this.MAX_ANCESTOR_GENERATIONS) return;

    parents.forEach((parent, index) => {
      const node = this.createTimelineNode(parent, generation, childId, Math.abs(generation));
      nodes.push(node);

      // Recurse to grandparents
      this.processAncestors(parent.parents, nodes, generation - 1, parent.id, Math.abs(generation) + 1);
    });
  }

  private processDescendants(
    children: TreePersonNode[] | undefined,
    nodes: TimelineNode[],
    generation: number,
    parentId: string,
    colorIndex: number
  ): void {
    if (!children || generation > this.MAX_DESCENDANT_GENERATIONS) return;

    children.forEach((child, index) => {
      const node = this.createTimelineNode(child, generation, parentId, generation);
      nodes.push(node);

      // Recurse to grandchildren
      this.processDescendants(child.children, nodes, generation + 1, child.id, generation + 1);
    });
  }

  private countDescendants(person: TreePersonNode): number {
    if (!person.children || person.children.length === 0) return 0;

    let count = person.children.length;
    person.children.forEach(child => {
      count += this.countDescendants(child);
    });
    return count;
  }

  private buildGenerationOptions(): void {
    const generations = new Set(this.timelineNodes.map(n => n.generation));
    const options: Array<{ value: number | 'all'; label: string }> = [
      { value: 'all', label: this.i18n.t('timeline.allGenerations') }
    ];

    const sortedGens = Array.from(generations).sort((a, b) => a - b);
    sortedGens.forEach(gen => {
      let label: string;
      if (gen < 0) {
        label = this.i18n.t('timeline.ancestors') + ` (${Math.abs(gen)})`;
      } else if (gen === 0) {
        label = this.i18n.t('timeline.root');
      } else {
        label = this.i18n.t('timeline.descendants') + ` (${gen})`;
      }
      options.push({ value: gen, label });
    });

    this.generationOptions.set(options);
  }

  private buildLegend(): void {
    // Determine which generations are present in the data
    const generations = new Set(this.timelineNodes.map(n => n.generation));
    const hasAncestors = Array.from(generations).some(g => g < 0);
    const hasDescendants = Array.from(generations).some(g => g > 0);

    const items: TimelineLegendItem[] = [
      { label: this.i18n.t('timeline.selectedPerson'), color: this.rootColor.main }
    ];

    // Add ancestor labels if present (warm colors: gold/brown)
    if (hasAncestors) {
      if (generations.has(-1)) {
        items.push({ label: this.i18n.t('timeline.parents'), color: this.ancestorColors[0].main });
      }
      if (generations.has(-2)) {
        items.push({ label: this.i18n.t('timeline.grandparents'), color: this.ancestorColors[1].main });
      }
      const hasGreatGrandparents = Array.from(generations).some(g => g <= -3);
      if (hasGreatGrandparents) {
        items.push({ label: this.i18n.t('timeline.greatGrandparents'), color: this.ancestorColors[2].main });
      }
    }

    // Add descendant labels if present (cool colors: green)
    if (hasDescendants) {
      if (generations.has(1)) {
        items.push({ label: this.i18n.t('timeline.children'), color: this.descendantColors[0].main });
      }
      if (generations.has(2)) {
        items.push({ label: this.i18n.t('timeline.grandchildren'), color: this.descendantColors[1].main });
      }
      const hasGreatGrandchildren = Array.from(generations).some(g => g >= 3);
      if (hasGreatGrandchildren) {
        items.push({ label: this.i18n.t('timeline.greatGrandchildren'), color: this.descendantColors[2].main });
      }
    }

    this.legendItems.set(items);
  }

  private setupSvg(): void {
    if (!this.svgRef?.nativeElement) return;

    // Clear previous and reset ID counter
    d3.select(this.svgRef.nativeElement).selectAll('*').remove();
    this.svgIdCounter = 0;

    const config = this.calculateTimelineConfig();
    const height = this.topMargin +
      (this.timelineNodes.length * (this.barHeight + this.barSpacing)) +
      this.bottomMargin + 100; // Extra space for generation gaps

    this.svg = d3.select(this.svgRef.nativeElement)
      .attr('width', '100%')
      .attr('height', height);

    // Create main group
    this.mainGroup = this.svg.append('g')
      .attr('class', 'timeline-content');

    // Create X scale
    this.xScale = d3.scaleLinear()
      .domain([config.minYear - 10, config.maxYear + 10])
      .range([this.leftMargin, Math.max(this.containerWidth, 1000) - this.rightMargin]);

    // Setup zoom
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        this.mainGroup?.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);
  }

  private calculateTimelineConfig(): TimelineConfig {
    const currentYear = new Date().getFullYear();
    let minYear = currentYear;
    let maxYear = currentYear;

    this.timelineNodes.forEach(node => {
      if (node.birthYear < minYear) minYear = node.birthYear;
      const endYear = node.deathYear || currentYear;
      if (endYear > maxYear) maxYear = endYear;
    });

    return {
      minYear: Math.floor(minYear / 10) * 10, // Round to decade
      maxYear: Math.ceil(maxYear / 10) * 10,
      currentYear,
      totalBars: this.timelineNodes.length
    };
  }

  private renderTimeline(): void {
    if (!this.timelineNodes.length || !this.mainGroup || !this.xScale) return;

    const config = this.calculateTimelineConfig();

    // Draw year axis
    this.drawYearAxis(config);

    // Draw connection lines first (behind bars)
    this.drawConnectionLines();

    // Draw lifespan bars
    this.drawLifespanBars(config);
  }

  private drawYearAxis(config: TimelineConfig): void {
    if (!this.mainGroup || !this.xScale) return;

    const axisGroup = this.mainGroup.append('g')
      .attr('class', 'timeline-axis')
      .attr('transform', `translate(0, ${this.topMargin - 15})`);

    // Generate tick values (decades)
    const tickValues: number[] = [];
    for (let year = config.minYear; year <= config.maxYear; year += 10) {
      tickValues.push(year);
    }

    // Draw axis line
    axisGroup.append('line')
      .attr('class', 'axis-line')
      .attr('x1', this.leftMargin - 10)
      .attr('x2', this.xScale(config.maxYear) + 10)
      .attr('y1', 15)
      .attr('y2', 15);

    // Draw tick marks and labels
    tickValues.forEach(year => {
      const x = this.xScale!(year);

      axisGroup.append('line')
        .attr('class', 'axis-tick')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', 10)
        .attr('y2', 20);

      axisGroup.append('text')
        .attr('class', 'axis-label')
        .attr('x', x)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .text(year.toString());
    });

    // Current year marker line
    const currentX = this.xScale(config.currentYear);
    const totalHeight = this.topMargin + (this.timelineNodes.length * (this.barHeight + this.barSpacing)) + 50;

    this.mainGroup.append('line')
      .attr('class', 'current-year-line')
      .attr('x1', currentX)
      .attr('x2', currentX)
      .attr('y1', this.topMargin - 5)
      .attr('y2', totalHeight);
  }

  private drawLifespanBars(config: TimelineConfig): void {
    if (!this.mainGroup || !this.xScale) return;

    const barsGroup = this.mainGroup.append('g').attr('class', 'lifespan-bars');

    // Filter by selected generation
    const filteredNodes = this.selectedGeneration() === 'all'
      ? this.timelineNodes
      : this.timelineNodes.filter(n => n.generation === this.selectedGeneration());

    filteredNodes.forEach(node => {
      const y = this.topMargin + (node.yIndex * (this.barHeight + this.barSpacing));
      const startX = this.xScale!(node.birthYear);
      const endX = node.deathYear
        ? this.xScale!(node.deathYear)
        : this.xScale!(config.currentYear);
      const barWidth = Math.max(endX - startX, 20);

      const barGroup = barsGroup.append('g')
        .attr('class', `lifespan-bar ${node.id === this.selectedPersonId ? 'selected' : ''}`)
        .attr('data-id', node.id)
        .style('cursor', 'pointer')
        .on('click', () => this.onBarClick(node))
        .on('dblclick', () => this.onBarDoubleClick(node))
        .on('mouseenter', (event) => this.showTooltip(event, node))
        .on('mouseleave', () => this.hideTooltip());

      // Person name (left side)
      barGroup.append('text')
        .attr('class', 'person-name')
        .attr('x', this.leftMargin - 10)
        .attr('y', y + this.barHeight / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'central')
        .text(this.truncateName(node.displayName, 18));

      // Lifespan bar with rounded ends
      barGroup.append('rect')
        .attr('class', 'bar')
        .attr('x', startX)
        .attr('y', y)
        .attr('width', barWidth)
        .attr('height', this.barHeight)
        .attr('rx', this.barHeight / 2)
        .attr('ry', this.barHeight / 2)
        .attr('fill', node.color);

      // Living indicator (fade at end)
      if (node.isLiving) {
        const gradientId = `living-gradient-${this.svgIdCounter++}`;

        const defs = this.svg!.select('defs').empty()
          ? this.svg!.append('defs')
          : this.svg!.select('defs');

        const gradient = defs.append('linearGradient')
          .attr('id', gradientId)
          .attr('x1', '0%')
          .attr('x2', '100%');

        gradient.append('stop')
          .attr('offset', '0%')
          .attr('stop-color', node.color)
          .attr('stop-opacity', 1);

        gradient.append('stop')
          .attr('offset', '100%')
          .attr('stop-color', node.color)
          .attr('stop-opacity', 0.3);

        barGroup.append('rect')
          .attr('x', endX - 40)
          .attr('y', y)
          .attr('width', 40)
          .attr('height', this.barHeight)
          .attr('rx', this.barHeight / 2)
          .attr('fill', `url(#${gradientId})`);
      }

      // Avatar circle at start
      const avatarGroup = barGroup.append('g')
        .attr('transform', `translate(${startX}, ${y + this.barHeight / 2})`);

      avatarGroup.append('circle')
        .attr('class', 'avatar-bg')
        .attr('r', this.avatarRadius + 2)
        .attr('fill', 'white');

      avatarGroup.append('circle')
        .attr('class', 'avatar-circle')
        .attr('r', this.avatarRadius)
        .attr('fill', node.colorLight)
        .attr('stroke', node.color)
        .attr('stroke-width', 2);

      // Initials (will be replaced by image if avatar loaded)
      avatarGroup.append('text')
        .attr('class', 'avatar-initials')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', node.color)
        .attr('font-size', '10px')
        .attr('font-weight', '600')
        .text(this.getInitials(node.displayName));

      // Descendant count badge (if > 0)
      if (node.descendantCount > 0) {
        const badgeX = endX + 15;
        const badgeGroup = barGroup.append('g')
          .attr('transform', `translate(${badgeX}, ${y + this.barHeight / 2})`);

        badgeGroup.append('circle')
          .attr('class', 'count-badge')
          .attr('r', 10)
          .attr('fill', node.color);

        badgeGroup.append('text')
          .attr('class', 'count-text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', 'white')
          .attr('font-size', '9px')
          .attr('font-weight', '700')
          .text(node.descendantCount > 99 ? '99+' : node.descendantCount.toString());
      }
    });
  }

  private drawConnectionLines(): void {
    if (!this.mainGroup || !this.xScale) return;

    const linesGroup = this.mainGroup.append('g').attr('class', 'connection-lines');
    const nodeMap = new Map(this.timelineNodes.map(n => [n.id, n]));
    const config = this.calculateTimelineConfig();

    this.timelineNodes.forEach(node => {
      if (!node.parentId) return;

      const parent = nodeMap.get(node.parentId);
      if (!parent) return;

      const parentY = this.topMargin + (parent.yIndex * (this.barHeight + this.barSpacing)) + this.barHeight / 2;
      const childY = this.topMargin + (node.yIndex * (this.barHeight + this.barSpacing)) + this.barHeight / 2;

      const parentEndX = parent.deathYear
        ? this.xScale!(parent.deathYear)
        : this.xScale!(config.currentYear);
      const childStartX = this.xScale!(node.birthYear);

      // Draw curved connection line
      const midX = (parentEndX + childStartX) / 2;

      const path = d3.path();
      path.moveTo(parentEndX, parentY);
      path.bezierCurveTo(
        midX, parentY,
        midX, childY,
        childStartX, childY
      );

      linesGroup.append('path')
        .attr('class', 'connection-line')
        .attr('d', path.toString())
        .attr('fill', 'none')
        .attr('stroke', node.color)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,3')
        .attr('opacity', 0.4);
    });
  }

  private updateSelection(): void {
    if (!this.mainGroup) return;

    this.mainGroup.selectAll('.lifespan-bar')
      .classed('selected', (d: any) => {
        const id = d3.select(d).attr('data-id');
        return id === this.selectedPersonId;
      });
  }

  /**
   * Load avatars with concurrency limiting to prevent HTTP connection exhaustion.
   * Uses mergeMap with concurrency parameter and takeUntilDestroyed for cleanup.
   */
  private loadAvatars(): void {
    const nodesToLoad = this.timelineNodes.filter(
      node => node.person.avatarMediaId && !this.avatarCache.has(node.id)
    );

    if (nodesToLoad.length === 0) return;

    from(nodesToLoad).pipe(
      mergeMap(node => {
        if (!node.person.avatarMediaId) {
          return of(null);
        }
        return this.mediaService.getMediaById(node.person.avatarMediaId).pipe(
          mergeMap(media => {
            const objectUrl = this.mediaService.createObjectUrl(
              media.base64Data,
              media.mimeType || 'image/jpeg'
            );
            this.avatarCache.set(node.id, objectUrl);
            node.avatarUrl = objectUrl;
            this.updateAvatarInSvg(node);
            return of(node);
          })
        );
      }, this.AVATAR_CONCURRENCY), // Limit concurrent requests
      takeUntilDestroyed(this.destroyRef) // Auto-unsubscribe on destroy
    ).subscribe({
      error: (err) => {
        // Log warning but keep initials as fallback
        console.warn('Failed to load timeline avatars:', err?.message || err);
      }
    });
  }

  private updateAvatarInSvg(node: TimelineNode): void {
    if (!this.mainGroup || !node.avatarUrl) return;

    const barGroup = this.mainGroup.select(`[data-id="${node.id}"]`);
    if (barGroup.empty()) return;

    // Find the avatar group and add image
    const y = this.topMargin + (node.yIndex * (this.barHeight + this.barSpacing));
    const startX = this.xScale!(node.birthYear);

    // Add clip path with unique ID
    const clipId = `avatar-clip-${this.svgIdCounter++}`;
    const defs = this.svg!.select('defs').empty()
      ? this.svg!.append('defs')
      : this.svg!.select('defs');

    // Always create new clip path with unique ID
    defs.append('clipPath')
      .attr('id', clipId)
      .append('circle')
      .attr('r', this.avatarRadius - 2);

    // Remove initials and add image
    barGroup.select('.avatar-initials').remove();

    barGroup.select('g')
      .append('image')
      .attr('x', -(this.avatarRadius - 2))
      .attr('y', -(this.avatarRadius - 2))
      .attr('width', (this.avatarRadius - 2) * 2)
      .attr('height', (this.avatarRadius - 2) * 2)
      .attr('clip-path', `url(#${clipId})`)
      .attr('href', node.avatarUrl)
      .attr('preserveAspectRatio', 'xMidYMid slice');
  }

  private onBarClick(node: TimelineNode): void {
    this.personSelected.emit(node.person);
  }

  private onBarDoubleClick(node: TimelineNode): void {
    this.personDoubleClicked.emit(node.person);
  }

  /**
   * Show tooltip with safe text content (prevents XSS).
   * Uses textContent instead of innerHTML to prevent script injection.
   */
  private showTooltip(event: MouseEvent, node: TimelineNode): void {
    if (!this.tooltipRef?.nativeElement) return;

    const tooltip = this.tooltipRef.nativeElement;
    const lifespan = node.deathYear
      ? `${node.birthYear} - ${node.deathYear} (${node.deathYear - node.birthYear} ${this.i18n.t('timeline.yearsOld')})`
      : `${node.birthYear} - (${this.i18n.t('timeline.living')})`;

    // Clear previous content safely
    tooltip.textContent = '';

    // Create elements safely using DOM APIs (prevents XSS)
    const nameDiv = document.createElement('div');
    nameDiv.className = 'tooltip-name';
    nameDiv.textContent = node.displayName; // Safe: textContent escapes HTML
    tooltip.appendChild(nameDiv);

    const datesDiv = document.createElement('div');
    datesDiv.className = 'tooltip-dates';
    datesDiv.textContent = lifespan;
    tooltip.appendChild(datesDiv);

    if (node.descendantCount > 0) {
      const descendantsDiv = document.createElement('div');
      descendantsDiv.className = 'tooltip-descendants';

      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-users';
      icon.setAttribute('aria-hidden', 'true');
      descendantsDiv.appendChild(icon);

      const text = document.createTextNode(
        ` ${node.descendantCount} ${this.i18n.t('timeline.totalDescendants')}`
      );
      descendantsDiv.appendChild(text);
      tooltip.appendChild(descendantsDiv);
    }

    tooltip.style.display = 'block';
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
  }

  private hideTooltip(): void {
    if (!this.tooltipRef?.nativeElement) return;
    this.tooltipRef.nativeElement.style.display = 'none';
  }

  onGenerationChange(value: number | 'all'): void {
    this.selectedGeneration.set(value);
    if (this.isInitialized) {
      this.setupSvg();
      this.renderTimeline();
    }
  }

  zoomIn(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().duration(300).call(
        this.zoom.scaleBy, 1.3
      );
    }
  }

  zoomOut(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().duration(300).call(
        this.zoom.scaleBy, 0.7
      );
    }
  }

  resetZoom(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().duration(300).call(
        this.zoom.transform,
        d3.zoomIdentity
      );
    }
  }

  getDisplayName(person: TreePersonNode): string {
    const lang = this.i18n.currentLang();

    if (lang === 'ar') {
      return person.nameArabic || person.nameEnglish || person.primaryName || '';
    }
    if (lang === 'nob') {
      return person.nameNobiin || person.nameEnglish || person.primaryName || '';
    }
    return person.nameEnglish || person.nameArabic || person.primaryName || '';
  }

  private getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  private truncateName(name: string, maxLength: number): string {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength - 1) + '…';
  }
}
