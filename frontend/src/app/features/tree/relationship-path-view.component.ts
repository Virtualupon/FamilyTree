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

import * as d3 from 'd3';

import { I18nService, TranslatePipe } from '../../core/i18n';
import {
  RelationshipPathResponse,
  PathPersonNode,
  RelationshipEdgeType
} from '../../core/models/relationship-path.models';
import { Sex } from '../../core/models/person.models';

@Component({
  selector: 'app-relationship-path-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatTooltipModule,
    TranslatePipe
  ],
  template: `
    <div class="relationship-path-overlay" [@fadeIn]>
      <!-- Backdrop -->
      <div class="relationship-path-overlay__backdrop" (click)="onClose()"></div>

      <!-- Content -->
      <div class="relationship-path-overlay__content">
        <!-- Header -->
        <header class="relationship-path-overlay__header">
          <div class="relationship-path-overlay__header-content">
            <button mat-icon-button class="relationship-path-overlay__close" (click)="onClose()">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
            <div class="relationship-path-overlay__title-group">
              <h2 class="relationship-path-overlay__title">
                {{ pathData.relationshipNameKey | translate }}
              </h2>
              <p class="relationship-path-overlay__description">
                {{ pathData.relationshipDescription }}
              </p>
            </div>
          </div>
        </header>

        @if (!pathData.pathFound) {
          <!-- No Path Found -->
          <div class="relationship-path-overlay__no-path">
            <i class="fa-solid fa-link-slash" aria-hidden="true"></i>
            <h3>{{ 'relationship.noPathFound' | translate }}</h3>
            <p>{{ pathData.errorMessage || ('relationship.noPathFoundMessage' | translate) }}</p>
            <button mat-flat-button color="primary" (click)="tryAnother.emit()">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              {{ 'relationship.tryAnother' | translate }}
            </button>
          </div>
        } @else {
          <!-- Chart Container -->
          <div class="relationship-path-overlay__chart" #chartContainer>
            <svg #svg></svg>
          </div>

          <!-- Controls -->
          <div class="relationship-path-overlay__controls">
            <button mat-icon-button (click)="zoomIn()" [matTooltip]="'common.zoomIn' | translate">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
            <button mat-icon-button (click)="zoomOut()" [matTooltip]="'common.zoomOut' | translate">
              <i class="fa-solid fa-minus" aria-hidden="true"></i>
            </button>
            <button mat-icon-button (click)="fitToScreen()" [matTooltip]="'common.fitToScreen' | translate">
              <i class="fa-solid fa-expand" aria-hidden="true"></i>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .relationship-path-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;

      &__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      }

      &__content {
        position: relative;
        width: 95vw;
        height: 90vh;
        max-width: 1400px;
        background: var(--ft-surface);
        border-radius: var(--ft-radius-xl);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: var(--ft-shadow-xl);
        animation: slideUp 0.3s ease-out;
      }

      &__header {
        background: var(--ft-primary);
        color: white;
        padding: var(--ft-spacing-lg) var(--ft-spacing-xl);
        text-align: center;
      }

      &__header-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--ft-spacing-md);
        position: relative;
      }

      &__close {
        color: white;
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
      }

      &__title-group {
        text-align: center;
      }

      &__title {
        margin: 0;
        font-size: 2rem;
        font-weight: 700;
      }

      &__description {
        margin: var(--ft-spacing-sm) 0 0;
        opacity: 0.95;
        font-size: 1rem;
      }

      &__chart {
        flex: 1;
        overflow: hidden;
        position: relative;

        svg {
          width: 100%;
          height: 100%;
          cursor: grab;

          &:active {
            cursor: grabbing;
          }
        }
      }

      &__controls {
        position: absolute;
        bottom: var(--ft-spacing-lg);
        right: var(--ft-spacing-lg);
        display: flex;
        flex-direction: column;
        gap: var(--ft-spacing-xs);
        background: var(--ft-surface);
        border-radius: var(--ft-radius-lg);
        padding: var(--ft-spacing-xs);
        box-shadow: var(--ft-shadow-lg);
      }

      &__no-path {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--ft-spacing-xxl);
        color: var(--ft-on-surface-variant);

        > i.fa-solid {
          font-size: 64px;
          width: 64px;
          height: 64px;
          margin-bottom: var(--ft-spacing-lg);
          opacity: 0.5;
        }

        h3 {
          margin: 0 0 var(--ft-spacing-sm);
          font-size: 1.25rem;
          color: var(--ft-on-surface);
        }

        p {
          margin: 0 0 var(--ft-spacing-lg);
          max-width: 400px;
        }

        button {
          i.fa-solid {
            font-size: 20px;
            width: 20px;
            height: 20px;
            margin-right: var(--ft-spacing-xs);
            opacity: 1;
          }
        }
      }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* D3 Node Styles */
    :host ::ng-deep {
      .path-node {
        cursor: pointer;

        &:hover .node-rect {
          filter: brightness(0.95);
        }
      }

      .node-rect {
        transition: filter 0.2s ease;
      }

      .node-rect-male {
        fill: var(--ft-male-light);
        stroke: var(--ft-male);
        stroke-width: 2px;
      }

      .node-rect-female {
        fill: var(--ft-female-light);
        stroke: var(--ft-female);
        stroke-width: 2px;
      }

      .node-rect-unknown {
        fill: var(--ft-unknown-light);
        stroke: var(--ft-unknown);
        stroke-width: 2px;
      }

      .node-name {
        font-size: 13px;
        font-weight: 600;
        fill: #333;
      }

      .node-dates {
        font-size: 11px;
        fill: #666;
      }

      .node-place {
        font-size: 10px;
        fill: #888;
      }

      .edge-line {
        stroke: #666;
        stroke-width: 2px;
        fill: none;
      }

      .edge-line-spouse {
        stroke: var(--ft-female);
        stroke-dasharray: 5,5;
      }

      .edge-line-parent {
        stroke: var(--ft-male);
      }

      .edge-label {
        font-size: 10px;
        fill: #666;
        text-anchor: middle;
      }

      .edge-label-bg {
        fill: white;
      }
    }
  `]
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

  // Node dimensions
  private readonly nodeWidth = 160;
  private readonly nodeHeight = 80;
  private readonly nodeSpacing = 80;

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

  zoomIn(): void {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3);
  }

  zoomOut(): void {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7);
  }

  fitToScreen(): void {
    const container = this.containerRef.nativeElement;
    const pathLength = this.pathData.path.length;

    const totalWidth = pathLength * (this.nodeWidth + this.nodeSpacing);
    const totalHeight = this.nodeHeight + 100;

    const scaleX = container.clientWidth / totalWidth;
    const scaleY = container.clientHeight / totalHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 0.9;

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

    // Draw the path
    this.drawPath();

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

  private drawNode(person: PathPersonNode, x: number, y: number, isEndpoint: boolean): void {
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
