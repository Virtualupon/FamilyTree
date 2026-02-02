import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import * as d3 from 'd3';

import { I18nService, TranslatePipe } from '../../core/i18n';
import {
  RelationshipPathResponse,
  PathPersonNode,
  RelationshipEdgeType
} from '../../core/models/relationship-path.models';
import { Sex } from '../../core/models/person.models';

type ViewMode = 'linear' | 'tree';

@Component({
  selector: 'app-relationship-path-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatTooltipModule,
    MatButtonToggleModule,
    TranslatePipe
  ],
  templateUrl: './relationship-path-view.component.html',
  styleUrls: ['./relationship-path-view.component.scss']
})
export class RelationshipPathViewComponent implements AfterViewInit, OnDestroy {
  @Input() pathData!: RelationshipPathResponse;
  @Output() closed = new EventEmitter<void>();
  @Output() tryAnother = new EventEmitter<void>();

  @ViewChild('chartContainer') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svg') svgRef!: ElementRef<SVGSVGElement>;

  private readonly i18n = inject(I18nService);

  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private g!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;

  // View mode
  viewMode = signal<ViewMode>('linear');

  // Node dimensions
  private readonly nodeWidth = 160;
  private readonly nodeHeight = 80;
  private readonly nodeSpacing = 80;
  private readonly verticalSpacing = 120;

  ngAfterViewInit(): void {
    if (this.pathData.pathFound && this.pathData.path.length > 0) {
      setTimeout(() => this.initChart(), 0);
    }
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  onClose(): void {
    this.closed.emit();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.initChart();
  }

  zoomIn(): void {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3);
  }

  zoomOut(): void {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7);
  }

  fitToScreen(): void {
    const container = this.containerRef.nativeElement;
    const pathLength = this.pathData.path.length;

    let totalWidth: number;
    let totalHeight: number;

    if (this.viewMode() === 'tree') {
      // Tree view: width based on spread, height based on levels
      const peakIndex = Math.floor(pathLength / 2);
      const maxSpread = Math.max(peakIndex, pathLength - peakIndex - 1);
      totalWidth = (maxSpread * 2 + 1) * (this.nodeWidth + 40) + 200;
      totalHeight = (maxSpread + 1) * this.verticalSpacing + this.nodeHeight + 100;
    } else {
      // Linear view: width based on path length
      totalWidth = pathLength * (this.nodeWidth + this.nodeSpacing);
      totalHeight = this.nodeHeight + 100;
    }

    const scaleX = container.clientWidth / totalWidth;
    const scaleY = container.clientHeight / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 0.85;

    const translateX = (container.clientWidth - totalWidth * scale) / 2;
    const translateY = (container.clientHeight - totalHeight * scale) / 2;

    this.svg.transition().duration(500).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale)
    );
  }

  private initChart(): void {
    const container = this.containerRef.nativeElement;
    const svgElement = this.svgRef.nativeElement;

    // Setup SVG
    this.svg = d3.select(svgElement);
    this.svg.selectAll('*').remove();

    // Add zoom behavior
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Create main group
    this.g = this.svg.append('g');

    // Add defs for gradients and shadows
    this.addDefs();

    // Draw based on view mode
    if (this.viewMode() === 'tree') {
      this.drawTreeDiagram();
    } else {
      this.drawPath();
    }

    // Fit to screen initially
    setTimeout(() => this.fitToScreen(), 100);
  }

  private addDefs(): void {
    const defs = this.svg.append('defs');

    // Male gradient
    const maleGradient = defs.append('linearGradient')
      .attr('id', 'maleGradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    maleGradient.append('stop').attr('offset', '0%').attr('stop-color', '#e3f2fd');
    maleGradient.append('stop').attr('offset', '100%').attr('stop-color', '#bbdefb');

    // Female gradient
    const femaleGradient = defs.append('linearGradient')
      .attr('id', 'femaleGradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    femaleGradient.append('stop').attr('offset', '0%').attr('stop-color', '#fce4ec');
    femaleGradient.append('stop').attr('offset', '100%').attr('stop-color', '#f8bbd9');

    // Unknown gradient
    const unknownGradient = defs.append('linearGradient')
      .attr('id', 'unknownGradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    unknownGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f5f5f5');
    unknownGradient.append('stop').attr('offset', '100%').attr('stop-color', '#e0e0e0');

    // Drop shadow filter
    const dropShadow = defs.append('filter')
      .attr('id', 'dropShadow')
      .attr('x', '-20%').attr('y', '-20%')
      .attr('width', '140%').attr('height', '140%');
    dropShadow.append('feDropShadow')
      .attr('dx', '0').attr('dy', '2')
      .attr('stdDeviation', '3')
      .attr('flood-opacity', '0.15');
  }

  private drawPath(): void {
    const path = this.pathData.path;
    const startY = 50;

    // Draw edges first (behind nodes)
    for (let i = 0; i < path.length - 1; i++) {
      const x1 = i * (this.nodeWidth + this.nodeSpacing) + this.nodeWidth;
      const x2 = (i + 1) * (this.nodeWidth + this.nodeSpacing);
      const y = startY + this.nodeHeight / 2;

      const edgeType = path[i].edgeToNext;
      const edgeClass = edgeType === RelationshipEdgeType.Spouse ? 'edge-line-spouse' : 'edge-line-parent';

      // Draw line
      this.g.append('line')
        .attr('class', `edge-line ${edgeClass}`)
        .attr('x1', x1)
        .attr('y1', y)
        .attr('x2', x2)
        .attr('y2', y);

      // Draw edge label
      const labelX = (x1 + x2) / 2;
      const labelY = y - 10;
      const labelText = this.getEdgeLabel(path[i].relationshipToNextKey);

      // Label background
      this.g.append('rect')
        .attr('class', 'edge-label-bg')
        .attr('x', labelX - 30)
        .attr('y', labelY - 8)
        .attr('width', 60)
        .attr('height', 16)
        .attr('rx', 4);

      // Label text
      this.g.append('text')
        .attr('class', 'edge-label')
        .attr('x', labelX)
        .attr('y', labelY + 3)
        .text(labelText);
    }

    // Draw nodes
    path.forEach((person, i) => {
      const x = i * (this.nodeWidth + this.nodeSpacing);
      const y = startY;

      this.drawNode(person, x, y, i === 0 || i === path.length - 1);
    });
  }

  /**
   * Draw the relationship as a tree diagram with common ancestor at top
   * This creates a V-shaped or inverted-V diagram showing the connection
   */
  private drawTreeDiagram(): void {
    const path = this.pathData.path;
    if (path.length < 2) return;

    // Find the "peak" of the path - where we go from going up (parent) to going down (child)
    // This represents the common ancestor or connection point
    let peakIndex = 0;
    let goingUp = true;

    for (let i = 0; i < path.length - 1; i++) {
      const edge = path[i].edgeToNext;
      if (goingUp && (edge === RelationshipEdgeType.Child || edge === RelationshipEdgeType.Spouse)) {
        peakIndex = i;
        goingUp = false;
      } else if (goingUp && edge === RelationshipEdgeType.Parent) {
        peakIndex = i + 1;
      }
    }

    // If no clear peak found (direct parent-child), use midpoint
    if (peakIndex === 0 && path.length > 2) {
      peakIndex = Math.floor(path.length / 2);
    }

    // Calculate positions for tree layout
    interface TreeNode {
      person: PathPersonNode;
      x: number;
      y: number;
      level: number;
    }

    const treeNodes: TreeNode[] = [];
    const centerX = 400; // Will be adjusted by fitToScreen
    const topY = 50;

    // Position nodes in a tree structure
    // Left branch: from person1 up to common ancestor
    // Right branch: from common ancestor down to person2

    // Calculate levels (distance from peak)
    path.forEach((person, i) => {
      const level = Math.abs(i - peakIndex);
      const isLeftBranch = i < peakIndex;
      const isRightBranch = i > peakIndex;
      const isPeak = i === peakIndex;

      let x: number;
      let y: number;

      if (isPeak) {
        // Common ancestor at top center
        x = centerX;
        y = topY;
      } else if (isLeftBranch) {
        // Left branch goes down and left
        const distFromPeak = peakIndex - i;
        x = centerX - (distFromPeak * (this.nodeWidth + 40));
        y = topY + (distFromPeak * this.verticalSpacing);
      } else {
        // Right branch goes down and right
        const distFromPeak = i - peakIndex;
        x = centerX + (distFromPeak * (this.nodeWidth + 40));
        y = topY + (distFromPeak * this.verticalSpacing);
      }

      treeNodes.push({ person, x, y, level });
    });

    // Draw connecting lines first (behind nodes)
    for (let i = 0; i < treeNodes.length - 1; i++) {
      const from = treeNodes[i];
      const to = treeNodes[i + 1];
      const edgeType = path[i].edgeToNext;

      // Draw curved line connecting nodes
      const pathData = this.createCurvedPath(
        from.x + this.nodeWidth / 2,
        from.y + this.nodeHeight,
        to.x + this.nodeWidth / 2,
        to.y
      );

      const edgeClass = edgeType === RelationshipEdgeType.Spouse ? 'edge-line-spouse' : 'edge-line-parent';

      this.g.append('path')
        .attr('class', `edge-line ${edgeClass}`)
        .attr('d', pathData)
        .attr('fill', 'none');

      // Edge label
      const midX = (from.x + to.x) / 2 + this.nodeWidth / 2;
      const midY = (from.y + to.y) / 2 + this.nodeHeight / 2;
      const labelText = this.getEdgeLabel(path[i].relationshipToNextKey);

      // Label background
      this.g.append('rect')
        .attr('class', 'edge-label-bg')
        .attr('x', midX - 35)
        .attr('y', midY - 10)
        .attr('width', 70)
        .attr('height', 20)
        .attr('rx', 10);

      // Label text
      this.g.append('text')
        .attr('class', 'edge-label')
        .attr('x', midX)
        .attr('y', midY + 4)
        .text(labelText);
    }

    // Draw nodes
    treeNodes.forEach((node, i) => {
      const isEndpoint = i === 0 || i === treeNodes.length - 1;
      const isPeak = i === peakIndex;
      this.drawNode(node.person, node.x, node.y, isEndpoint, isPeak);
    });

    // Add generation level labels
    const levels = new Map<number, number>();
    treeNodes.forEach(node => {
      if (!levels.has(node.level)) {
        levels.set(node.level, node.y);
      }
    });

    levels.forEach((y, level) => {
      const labelText = level === 0 ?
        (this.i18n.t('relationship.commonAncestor') || 'Common Ancestor') :
        `${this.i18n.t('relationship.generation') || 'Gen'} ${level}`;

      this.g.append('text')
        .attr('class', 'tree-level-label')
        .attr('x', 20)
        .attr('y', y + this.nodeHeight / 2)
        .text(labelText);
    });
  }

  /**
   * Create a curved SVG path between two points
   */
  private createCurvedPath(x1: number, y1: number, x2: number, y2: number): string {
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  }

  private drawNode(person: PathPersonNode, x: number, y: number, isEndpoint: boolean, isPeak: boolean = false): void {
    const nodeGroup = this.g.append('g')
      .attr('class', 'path-node')
      .attr('transform', `translate(${x}, ${y})`);

    // Node rectangle
    const rectClass = person.sex === Sex.Male ? 'node-rect-male' :
                      person.sex === Sex.Female ? 'node-rect-female' : 'node-rect-unknown';

    const fill = person.sex === Sex.Male ? 'url(#maleGradient)' :
                 person.sex === Sex.Female ? 'url(#femaleGradient)' : 'url(#unknownGradient)';

    nodeGroup.append('rect')
      .attr('class', `node-rect ${rectClass}`)
      .attr('width', this.nodeWidth)
      .attr('height', this.nodeHeight)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', fill)
      .attr('filter', 'url(#dropShadow)');

    // Endpoint indicator (thicker border for first/last person)
    if (isEndpoint) {
      nodeGroup.select('.node-rect')
        .attr('stroke-width', 3);
    }

    // Peak/common ancestor indicator
    if (isPeak) {
      nodeGroup.select('.node-rect')
        .attr('stroke', '#187573')
        .attr('stroke-width', 3);

      // Add crown/star icon for common ancestor
      nodeGroup.append('text')
        .attr('class', 'peak-indicator')
        .attr('x', this.nodeWidth / 2)
        .attr('y', -8)
        .attr('text-anchor', 'middle')
        .attr('fill', '#187573')
        .attr('font-size', '16px')
        .text('★');
    }

    // Avatar circle
    const avatarX = 20;
    const avatarY = this.nodeHeight / 2;
    const avatarColor = person.sex === Sex.Male ? '#1976d2' :
                        person.sex === Sex.Female ? '#c2185b' : '#757575';

    nodeGroup.append('circle')
      .attr('cx', avatarX)
      .attr('cy', avatarY)
      .attr('r', 16)
      .attr('fill', avatarColor);

    nodeGroup.append('text')
      .attr('x', avatarX)
      .attr('y', avatarY + 5)
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(this.getInitials(person.primaryName));

    // Name - use language-appropriate name
    const displayName = this.getDisplayName(person);
    nodeGroup.append('text')
      .attr('class', 'node-name')
      .attr('x', 45)
      .attr('y', 28)
      .text(this.truncateName(displayName, 14));

    // Dates
    const dates = this.formatDates(person);
    if (dates) {
      nodeGroup.append('text')
        .attr('class', 'node-dates')
        .attr('x', 45)
        .attr('y', 44)
        .text(dates);
    }

    // Place
    const place = person.birthPlace || person.deathPlace;
    if (place) {
      nodeGroup.append('text')
        .attr('class', 'node-place')
        .attr('x', 45)
        .attr('y', 58)
        .text(this.truncateName(place, 16));
    }

    // Living indicator
    if (person.isLiving) {
      nodeGroup.append('circle')
        .attr('cx', this.nodeWidth - 12)
        .attr('cy', 12)
        .attr('r', 5)
        .attr('fill', '#4caf50');
    }
  }

  private getEdgeLabel(key: string): string {
    // Use i18n service to translate, fallback to simple labels
    const translations: Record<string, string> = {
      'relationship.fatherOf': 'Father',
      'relationship.motherOf': 'Mother',
      'relationship.sonOf': 'Son',
      'relationship.daughterOf': 'Daughter',
      'relationship.parentOf': 'Parent',
      'relationship.childOf': 'Child',
      'relationship.spouseOf': 'Spouse'
    };

    return translations[key] || key.replace('relationship.', '');
  }

  private getInitials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  private truncateName(name: string, maxLength: number): string {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength - 1) + '...';
  }

  private formatDates(person: PathPersonNode): string {
    const birth = person.birthDate ? new Date(person.birthDate).getFullYear() : null;
    const death = person.deathDate ? new Date(person.deathDate).getFullYear() : null;

    if (birth && death) {
      return `${birth} - ${death}`;
    } else if (birth) {
      return `b. ${birth}`;
    } else if (death) {
      return `d. ${death}`;
    }
    return '';
  }

  private getDisplayName(person: PathPersonNode): string {
    const lang = this.i18n.currentLang();
    switch (lang) {
      case 'ar':
        return person.nameArabic || person.primaryName;
      case 'nob':
        return person.nameNobiin || person.primaryName;
      default:
        return person.nameEnglish || person.primaryName;
    }
  }
}
