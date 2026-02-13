import {
  Component, ElementRef, Input, ViewChild,
  AfterViewInit, OnChanges, OnDestroy, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { DonutChartItem } from '../../../core/models/analytics.models';

@Component({
  selector: 'app-d3-donut-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #container class="chart-container donut-container">
      <svg #svgElement></svg>
      <div class="donut-center">
        <span class="donut-total">{{ total }}</span>
        <span class="donut-label">{{ centerLabel }}</span>
      </div>
      <div #tooltipEl class="chart-tooltip" [style.display]="'none'">
        <div class="tooltip-label"></div>
        <div class="tooltip-value"></div>
      </div>
      <div class="chart-legend">
        @for (item of data; track item.label) {
          <div class="legend-item">
            <span class="legend-color" [style.background]="item.color"></span>
            <span>{{ item.label }} ({{ item.value }})</span>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./chart-styles.scss']
})
export class D3DonutChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svgElement') svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltipEl') tooltipRef!: ElementRef<HTMLDivElement>;

  @Input() data: DonutChartItem[] = [];
  @Input() centerLabel = '';
  @Input() size = 200;

  total = 0;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.render();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.containerRef.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] || changes['size']) {
      this.total = this.data?.reduce((sum, d) => sum + d.value, 0) || 0;
      if (this.svgRef) {
        this.render();
      }
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private render(): void {
    if (!this.svgRef || !this.data?.length) return;

    const svg = d3.select(this.svgRef.nativeElement);
    svg.selectAll('*').remove();

    const svgSize = this.size;
    const radius = svgSize / 2;
    const innerRadius = radius * 0.6;

    svg.attr('viewBox', `0 0 ${svgSize} ${svgSize}`)
      .attr('width', svgSize)
      .attr('height', svgSize);

    const g = svg.append('g')
      .attr('transform', `translate(${radius},${radius})`);

    const pie = d3.pie<DonutChartItem>()
      .value(d => d.value)
      .sort(null)
      .padAngle(0.02);

    const arc = d3.arc<d3.PieArcDatum<DonutChartItem>>()
      .innerRadius(innerRadius)
      .outerRadius(radius - 4);

    const arcHover = d3.arc<d3.PieArcDatum<DonutChartItem>>()
      .innerRadius(innerRadius)
      .outerRadius(radius);

    const tooltip = this.tooltipRef.nativeElement;

    g.selectAll('.arc')
      .data(pie(this.data))
      .join('path')
      .attr('class', 'arc')
      .attr('d', arc)
      .attr('fill', d => d.data.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', function(event: MouseEvent, d) {
        d3.select(this).transition().duration(150).attr('d', arcHover(d) as string);
        tooltip.style.display = 'block';
        tooltip.querySelector('.tooltip-label')!.textContent = d.data.label;
        tooltip.querySelector('.tooltip-value')!.textContent =
          `${d.data.value.toLocaleString()}`;
      })
      .on('mousemove', (event: MouseEvent) => {
        tooltip.style.left = `${event.clientX + 12}px`;
        tooltip.style.top = `${event.clientY - 28}px`;
      })
      .on('mouseleave', function(event: MouseEvent, d) {
        d3.select(this).transition().duration(150).attr('d', arc(d) as string);
        tooltip.style.display = 'none';
      });

    this.total = this.data.reduce((sum, d) => sum + d.value, 0);
  }
}
