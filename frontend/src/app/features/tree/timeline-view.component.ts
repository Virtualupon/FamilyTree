import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  AfterViewInit,
  inject,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { TreePersonNode } from '../../core/models/tree.models';
import { Sex } from '../../core/models/person.models';
import { I18nService, TranslatePipe } from '../../core/i18n';
import { PersonMediaService } from '../../core/services/person-media.service';

interface TimelineNode {
  id: string;
  name: string;
  sex: Sex;
  birthYear: number | null;
  deathYear: number | null;
  isLiving: boolean;
  generation: number;
  data: TreePersonNode;
  avatarUrl?: string;
}

// Color for root person
const ROOT_COLOR = '#187573'; // Nubian teal

// Ancestor colors (warm tones) - for parents, grandparents, etc.
const ANCESTOR_COLORS = [
  '#C17E3E', // Gen -1: Parents (Nubian gold)
  '#B5651D', // Gen -2: Grandparents
  '#8B4513', // Gen -3: Great-grandparents
  '#6B4423', // Gen -4+
];

// Descendant colors (cool tones) - for children, grandchildren, etc.
const DESCENDANT_COLORS = [
  '#2D7A3E', // Gen 1: Children (Nubian green)
  '#228B22', // Gen 2: Grandchildren
  '#006400', // Gen 3: Great-grandchildren
  '#004D00', // Gen 4+
];

/**
 * Get color for a generation.
 * Root (0) = teal, ancestors (negative) = warm, descendants (positive) = cool
 */
function getColorForGeneration(generation: number): string {
  if (generation === 0) {
    return ROOT_COLOR;
  }
  if (generation < 0) {
    const index = Math.min(Math.abs(generation) - 1, ANCESTOR_COLORS.length - 1);
    return ANCESTOR_COLORS[index];
  }
  const index = Math.min(generation - 1, DESCENDANT_COLORS.length - 1);
  return DESCENDANT_COLORS[index];
}

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.scss']
})
export class TimelineViewComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly i18n = inject(I18nService);
  private readonly mediaService = inject(PersonMediaService);

  // Avatar cache: mediaId -> dataUrl
  private avatarCache = new Map<string, string>();

  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svg') svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltip') tooltipRef!: ElementRef<HTMLDivElement>;

  @Input() treeData: TreePersonNode | null = null;
  @Input() selectedPersonId: string | null = null;

  @Output() personSelected = new EventEmitter<TreePersonNode>();
  @Output() personDoubleClicked = new EventEmitter<TreePersonNode>();

  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private container: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private nodes: TimelineNode[] = [];

  // Layout constants
  private readonly rowHeight = 60;
  private readonly barHeight = 32;
  private readonly avatarSize = 40;
  private readonly leftPadding = 200; // Space for names
  private readonly rightPadding = 50;
  private readonly topPadding = 60;

  // Time scale
  private minYear = 1800;
  private maxYear = new Date().getFullYear() + 10;
  private xScale: d3.ScaleLinear<number, number> | null = null;

  constructor() {
    effect(() => {
      const lang = this.i18n.currentLang();
      if (this.svg && this.treeData) {
        this.renderTimeline();
      }
    });
  }

  ngAfterViewInit(): void {
    this.initSvg();
    if (this.treeData) {
      this.renderTimeline();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['treeData']) && this.svg) {
      this.renderTimeline();
    }
    if (changes['selectedPersonId'] && this.svg) {
      this.updateSelection();
    }
  }

  ngOnDestroy(): void {
    // Cleanup avatar URLs
    this.avatarCache.forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    this.avatarCache.clear();
  }

  private initSvg(): void {
    this.svg = d3.select(this.svgRef.nativeElement);
    this.container = this.svg.select<SVGGElement>('.timeline-content');

    // Setup zoom behavior
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        this.container?.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);
  }

  private renderTimeline(): void {
    if (!this.treeData || !this.container) return;

    // Clear previous content
    this.container.selectAll('*').remove();

    // Flatten tree and collect all nodes
    this.nodes = [];
    this.collectNodes(this.treeData, 0);

    // Calculate year range
    this.calculateYearRange();

    // Get container dimensions
    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const width = Math.max(rect.width, 800);
    const height = Math.max(this.nodes.length * this.rowHeight + this.topPadding * 2, rect.height);

    // Update SVG size
    this.svg?.attr('viewBox', `0 0 ${width} ${height}`);

    // Create time scale
    this.xScale = d3.scaleLinear()
      .domain([this.minYear, this.maxYear])
      .range([this.leftPadding, width - this.rightPadding]);

    // Draw components
    this.drawTimeAxis(width);
    this.drawGenerationConnectors();
    this.drawLifespanBars();
    this.drawLegend(width);

    // Load avatars
    this.loadAvatars();

    // Center the view
    this.fitToScreen();
  }

  private collectNodes(node: TreePersonNode, generation: number): void {
    const birthYear = node.birthDate ? new Date(node.birthDate).getFullYear() : null;
    const deathYear = node.deathDate ? new Date(node.deathDate).getFullYear() : null;

    const timelineNode: TimelineNode = {
      id: node.id,
      name: this.getDisplayName(node),
      sex: node.sex,
      birthYear,
      deathYear,
      isLiving: node.isLiving,
      generation,
      data: node,
      avatarUrl: undefined
    };

    this.nodes.push(timelineNode);

    // Collect ancestors (parents, grandparents, etc.) - negative generations
    if (node.parents) {
      for (const parent of node.parents) {
        this.collectNodes(parent, generation - 1);
      }
    }

    // Collect descendants (children, grandchildren, etc.) - positive generations
    if (node.children) {
      for (const child of node.children) {
        this.collectNodes(child, generation + 1);
      }
    }
  }

  private calculateYearRange(): void {
    const years: number[] = [];
    const currentYear = new Date().getFullYear();

    for (const node of this.nodes) {
      if (node.birthYear) years.push(node.birthYear);
      if (node.deathYear) years.push(node.deathYear);
      if (node.isLiving && node.birthYear) {
        years.push(currentYear); // Extend to current year for living people
      }
    }

    if (years.length > 0) {
      this.minYear = Math.min(...years) - 10;
      this.maxYear = Math.max(...years, currentYear) + 10;
    } else {
      this.minYear = 1900;
      this.maxYear = currentYear + 10;
    }
  }

  private drawTimeAxis(width: number): void {
    if (!this.container || !this.xScale) return;

    const axisGroup = this.container.append('g')
      .attr('class', 'time-axis')
      .attr('transform', `translate(0, ${this.topPadding - 30})`);

    // Draw axis line
    axisGroup.append('line')
      .attr('x1', this.leftPadding)
      .attr('x2', width - this.rightPadding)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#CEC5B0')
      .attr('stroke-width', 1);

    // Draw decade markers
    const startDecade = Math.floor(this.minYear / 10) * 10;
    const endDecade = Math.ceil(this.maxYear / 10) * 10;

    for (let year = startDecade; year <= endDecade; year += 10) {
      const x = this.xScale(year);

      // Tick mark
      axisGroup.append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', -5)
        .attr('y2', 5)
        .attr('stroke', '#6B6B6B')
        .attr('stroke-width', 1);

      // Year label
      axisGroup.append('text')
        .attr('x', x)
        .attr('y', -15)
        .attr('text-anchor', 'middle')
        .attr('fill', '#6B6B6B')
        .attr('font-size', '11px')
        .attr('font-family', 'Inter, sans-serif')
        .text(year.toString());

      // Vertical grid line
      this.container?.append('line')
        .attr('class', 'grid-line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', this.topPadding)
        .attr('y2', this.topPadding + this.nodes.length * this.rowHeight)
        .attr('stroke', '#F4E4D7')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2,2');
    }
  }

  private drawGenerationConnectors(): void {
    if (!this.container || !this.xScale) return;

    // Sort nodes by generation for vertical positioning
    this.nodes.sort((a, b) => b.generation - a.generation);

    // Draw vertical connectors between parent-child relationships
    const connectorsGroup = this.container.append('g').attr('class', 'connectors');

    for (const node of this.nodes) {
      if (node.data.parents) {
        for (const parent of node.data.parents) {
          const parentNode = this.nodes.find(n => n.id === parent.id);
          if (parentNode && node.birthYear && parentNode.birthYear) {
            const nodeIndex = this.nodes.indexOf(node);
            const parentIndex = this.nodes.indexOf(parentNode);

            const nodeY = this.topPadding + nodeIndex * this.rowHeight + this.barHeight / 2;
            const parentY = this.topPadding + parentIndex * this.rowHeight + this.barHeight / 2;
            const x = this.xScale(node.birthYear);

            // Draw vertical connector line
            connectorsGroup.append('line')
              .attr('x1', x)
              .attr('x2', x)
              .attr('y1', nodeY)
              .attr('y2', parentY)
              .attr('stroke', '#CEC5B0')
              .attr('stroke-width', 1.5)
              .attr('stroke-dasharray', '3,3');
          }
        }
      }
    }
  }

  private drawLifespanBars(): void {
    if (!this.container || !this.xScale) return;

    const currentYear = new Date().getFullYear();
    const barsGroup = this.container.append('g').attr('class', 'lifespan-bars');

    this.nodes.forEach((node, index) => {
      const y = this.topPadding + index * this.rowHeight;
      const color = getColorForGeneration(node.generation);

      // Row group
      const rowGroup = barsGroup.append('g')
        .attr('class', `timeline-row ${node.id === this.selectedPersonId ? 'selected' : ''}`)
        .attr('data-id', node.id)
        .style('cursor', 'pointer')
        .on('click', () => this.onNodeClick(node))
        .on('dblclick', () => this.onNodeDoubleClick(node));

      // Row background (for hover effect)
      rowGroup.append('rect')
        .attr('class', 'row-bg')
        .attr('x', 0)
        .attr('y', y - 5)
        .attr('width', '100%')
        .attr('height', this.rowHeight)
        .attr('fill', 'transparent');

      // Avatar placeholder
      rowGroup.append('circle')
        .attr('class', 'avatar-bg')
        .attr('cx', 30)
        .attr('cy', y + this.barHeight / 2)
        .attr('r', this.avatarSize / 2)
        .attr('fill', node.sex === Sex.Male ? '#E3F2FD' : '#FCE4EC')
        .attr('stroke', node.sex === Sex.Male ? '#64B5F6' : '#F48FB1')
        .attr('stroke-width', 2);

      // Avatar initials (fallback)
      rowGroup.append('text')
        .attr('class', 'avatar-initials')
        .attr('x', 30)
        .attr('y', y + this.barHeight / 2 + 5)
        .attr('text-anchor', 'middle')
        .attr('fill', node.sex === Sex.Male ? '#1976D2' : '#C2185B')
        .attr('font-size', '14px')
        .attr('font-weight', '500')
        .attr('font-family', 'Inter, sans-serif')
        .text(this.getInitials(node.name));

      // Name label
      rowGroup.append('text')
        .attr('class', 'person-name')
        .attr('x', 60)
        .attr('y', y + this.barHeight / 2 + 5)
        .attr('fill', '#2D2D2D')
        .attr('font-size', '13px')
        .attr('font-weight', '500')
        .attr('font-family', 'Inter, sans-serif')
        .text(node.name.length > 20 ? node.name.substring(0, 18) + '...' : node.name);

      // Lifespan bar
      if (node.birthYear) {
        const startX = this.xScale!(node.birthYear);
        const endYear = node.isLiving ? currentYear : (node.deathYear || node.birthYear + 70);
        const endX = this.xScale!(endYear);
        const barWidth = Math.max(endX - startX, 4);

        // Bar shadow
        rowGroup.append('rect')
          .attr('class', 'bar-shadow')
          .attr('x', startX + 2)
          .attr('y', y + 3)
          .attr('width', barWidth)
          .attr('height', this.barHeight)
          .attr('rx', 4)
          .attr('fill', 'rgba(0,0,0,0.1)');

        // Main bar
        rowGroup.append('rect')
          .attr('class', 'lifespan-bar')
          .attr('x', startX)
          .attr('y', y)
          .attr('width', barWidth)
          .attr('height', this.barHeight)
          .attr('rx', 4)
          .attr('fill', color)
          .attr('opacity', node.isLiving ? 1 : 0.8);

        // Living indicator (pulsing dot)
        if (node.isLiving) {
          rowGroup.append('circle')
            .attr('class', 'living-indicator')
            .attr('cx', endX - 8)
            .attr('cy', y + this.barHeight / 2)
            .attr('r', 5)
            .attr('fill', '#4CAF50');
        }

        // Birth year label
        rowGroup.append('text')
          .attr('class', 'year-label birth-year')
          .attr('x', startX + 8)
          .attr('y', y + this.barHeight / 2 + 4)
          .attr('fill', '#fff')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .attr('font-family', 'Inter, sans-serif')
          .text(node.birthYear.toString());

        // Death year or age label
        if (!node.isLiving && node.deathYear) {
          rowGroup.append('text')
            .attr('class', 'year-label death-year')
            .attr('x', endX - 8)
            .attr('y', y + this.barHeight / 2 + 4)
            .attr('text-anchor', 'end')
            .attr('fill', '#fff')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('font-family', 'Inter, sans-serif')
            .text(node.deathYear.toString());
        } else if (node.isLiving) {
          const age = currentYear - node.birthYear;
          rowGroup.append('text')
            .attr('class', 'year-label age-label')
            .attr('x', endX + 10)
            .attr('y', y + this.barHeight / 2 + 4)
            .attr('fill', '#6B6B6B')
            .attr('font-size', '11px')
            .attr('font-family', 'Inter, sans-serif')
            .text(`${age} ${this.i18n.t('timeline.yearsOld')}`);
        }
      } else {
        // No birth year - show placeholder
        rowGroup.append('text')
          .attr('class', 'no-dates')
          .attr('x', this.leftPadding + 20)
          .attr('y', y + this.barHeight / 2 + 4)
          .attr('fill', '#9CA3AF')
          .attr('font-size', '11px')
          .attr('font-style', 'italic')
          .attr('font-family', 'Inter, sans-serif')
          .text(this.i18n.t('timeline.noDates'));
      }
    });
  }

  private drawLegend(width: number): void {
    if (!this.container) return;

    // Build legend items based on generations present in data
    const presentGenerations = new Set(this.nodes.map(n => n.generation));
    const hasAncestors = Array.from(presentGenerations).some(g => g < 0);
    const hasDescendants = Array.from(presentGenerations).some(g => g > 0);

    const generations: Array<{ label: string; color: string }> = [
      { label: this.i18n.t('timeline.selectedPerson'), color: ROOT_COLOR },
    ];

    // Add ancestor labels if present
    if (hasAncestors) {
      if (presentGenerations.has(-1)) {
        generations.push({ label: this.i18n.t('timeline.parents'), color: ANCESTOR_COLORS[0] });
      }
      if (presentGenerations.has(-2)) {
        generations.push({ label: this.i18n.t('timeline.grandparents'), color: ANCESTOR_COLORS[1] });
      }
    }

    // Add descendant labels if present
    if (hasDescendants) {
      if (presentGenerations.has(1)) {
        generations.push({ label: this.i18n.t('timeline.children'), color: DESCENDANT_COLORS[0] });
      }
      if (presentGenerations.has(2)) {
        generations.push({ label: this.i18n.t('timeline.grandchildren'), color: DESCENDANT_COLORS[1] });
      }
    }

    // Calculate dynamic legend height
    const legendHeight = 35 + generations.length * 18;

    const legendGroup = this.container.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - 200}, 10)`);

    // Legend background (dynamic height)
    legendGroup.append('rect')
      .attr('x', -10)
      .attr('y', -5)
      .attr('width', 190)
      .attr('height', legendHeight)
      .attr('rx', 8)
      .attr('fill', 'rgba(255,255,255,0.95)')
      .attr('stroke', '#F4E4D7')
      .attr('stroke-width', 1);

    // Legend title
    legendGroup.append('text')
      .attr('x', 0)
      .attr('y', 12)
      .attr('fill', '#2D2D2D')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('font-family', 'Inter, sans-serif')
      .text(this.i18n.t('timeline.legend'));

    generations.forEach((gen, i) => {
      const y = 30 + i * 18;

      legendGroup.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', 20)
        .attr('height', 12)
        .attr('rx', 2)
        .attr('fill', gen.color);

      legendGroup.append('text')
        .attr('x', 28)
        .attr('y', y + 10)
        .attr('fill', '#6B6B6B')
        .attr('font-size', '11px')
        .attr('font-family', 'Inter, sans-serif')
        .text(gen.label);
    });
  }

  private async loadAvatars(): Promise<void> {
    for (const node of this.nodes) {
      if (node.data.avatarMediaId) {
        try {
          const media = await this.mediaService.getMediaById(node.data.avatarMediaId).toPromise();
          if (media) {
            const objectUrl = this.mediaService.createObjectUrl(
              media.base64Data,
              media.mimeType || 'image/jpeg'
            );
            this.avatarCache.set(node.id, objectUrl);
            node.avatarUrl = objectUrl;

            // Update avatar in SVG
            this.updateNodeAvatar(node);
          }
        } catch (err) {
          console.error('Failed to load avatar for', node.id);
        }
      }
    }
  }

  private updateNodeAvatar(node: TimelineNode): void {
    if (!this.container || !node.avatarUrl) return;

    const nodeIndex = this.nodes.indexOf(node);
    const y = this.topPadding + nodeIndex * this.rowHeight;

    const rowGroup = this.container.select(`[data-id="${node.id}"]`);
    if (rowGroup.empty()) return;

    // Add clip path for circular avatar
    const clipId = `avatar-clip-${node.id}`;

    rowGroup.append('clipPath')
      .attr('id', clipId)
      .append('circle')
      .attr('cx', 30)
      .attr('cy', y + this.barHeight / 2)
      .attr('r', this.avatarSize / 2 - 2);

    // Add image
    rowGroup.append('image')
      .attr('class', 'avatar-image')
      .attr('x', 30 - this.avatarSize / 2 + 2)
      .attr('y', y + this.barHeight / 2 - this.avatarSize / 2 + 2)
      .attr('width', this.avatarSize - 4)
      .attr('height', this.avatarSize - 4)
      .attr('clip-path', `url(#${clipId})`)
      .attr('href', node.avatarUrl);

    // Hide initials
    rowGroup.select('.avatar-initials').attr('opacity', 0);
  }

  private updateSelection(): void {
    if (!this.container) return;

    this.container.selectAll('.timeline-row')
      .classed('selected', false);

    if (this.selectedPersonId) {
      this.container.select(`[data-id="${this.selectedPersonId}"]`)
        .classed('selected', true);
    }
  }

  private onNodeClick(node: TimelineNode): void {
    this.personSelected.emit(node.data);
  }

  private onNodeDoubleClick(node: TimelineNode): void {
    this.personDoubleClicked.emit(node.data);
  }

  private getDisplayName(person: TreePersonNode): string {
    const lang = this.i18n.currentLang();
    const unknown = this.i18n.t('common.unknown');
    if (lang === 'ar') {
      return person.nameArabic || person.nameEnglish || person.primaryName || unknown;
    }
    if (lang === 'nob') {
      return person.nameNobiin || person.nameEnglish || person.primaryName || unknown;
    }
    return person.nameEnglish || person.nameArabic || person.primaryName || unknown;
  }

  private getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // Public zoom methods
  zoomIn(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3);
    }
  }

  zoomOut(): void {
    if (this.svg && this.zoom) {
      this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7);
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

  fitToScreen(): void {
    if (!this.svg || !this.zoom || !this.containerRef) return;

    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const contentHeight = this.nodes.length * this.rowHeight + this.topPadding * 2;
    const scale = Math.min(1, rect.height / contentHeight);

    this.svg.transition().duration(300).call(
      this.zoom.transform,
      d3.zoomIdentity.scale(scale)
    );
  }
}
