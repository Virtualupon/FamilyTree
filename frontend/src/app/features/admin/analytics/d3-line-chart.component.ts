import {
  Component, ElementRef, Input, ViewChild,
  AfterViewInit, OnChanges, OnDestroy, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { LineChartSeries } from '../../../core/models/analytics.models';

@Component({
  selector: 'app-d3-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #container class="chart-container">
      <svg #svgElement></svg>
      <div #tooltipEl class="chart-tooltip" [style.display]="'none'">
        <div class="tooltip-label"></div>
        <div class="tooltip-value"></div>
      </div>
      <div class="chart-legend">
        @for (series of dataSeries; track series.label) {
          <div class="legend-item">
            <span class="legend-color" [style.background]="series.color"></span>
            <span>{{ series.label }}</span>
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['./chart-styles.scss']
})
export class D3LineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svgElement') svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltipEl') tooltipRef!: ElementRef<HTMLDivElement>;

  @Input() dataSeries: LineChartSeries[] = [];
  @Input() height = 300;

  private resizeObserver?: ResizeObserver;
  private margin = { top: 20, right: 30, bottom: 40, left: 50 };

  ngAfterViewInit(): void {
    this.render();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.containerRef.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['dataSeries'] || changes['height']) && this.svgRef) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private render(): void {
    if (!this.svgRef || !this.dataSeries?.length) return;

    const svg = d3.select(this.svgRef.nativeElement);
    svg.selectAll('*').remove();

    const containerWidth = this.containerRef.nativeElement.clientWidth;
    if (containerWidth <= 0) return;

    const width = containerWidth - this.margin.left - this.margin.right;
    const height = this.height - this.margin.top - this.margin.bottom;

    svg.attr('viewBox', `0 0 ${containerWidth} ${this.height}`);

    const g = svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Collect all dates and values
    const allData = this.dataSeries.flatMap(s =>
      s.data.map(d => ({ date: new Date(d.date), count: d.count }))
    );

    if (allData.length === 0) return;

    const x = d3.scaleTime()
      .domain(d3.extent(allData, d => d.date) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(allData, d => d.count) || 1])
      .nice()
      .range([height, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid-line')
      .call(d3.axisLeft(y)
        .ticks(5)
        .tickSize(-width)
        .tickFormat(() => '')
      )
      .select('.domain').remove();

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d => d3.timeFormat('%b %d')(d as Date)));

    // Y axis
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(y).ticks(5));

    // Lines
    const line = d3.line<{ date: Date; count: number }>()
      .x(d => x(d.date))
      .y(d => y(d.count))
      .curve(d3.curveMonotoneX);

    const tooltip = this.tooltipRef.nativeElement;

    this.dataSeries.forEach(series => {
      const seriesData = series.data.map(d => ({
        date: new Date(d.date),
        count: d.count
      }));

      // Line path
      g.append('path')
        .datum(seriesData)
        .attr('fill', 'none')
        .attr('stroke', series.color)
        .attr('stroke-width', 2.5)
        .attr('d', line);

      // Dots
      g.selectAll(`.dot-${series.label.replace(/\s/g, '')}`)
        .data(seriesData)
        .join('circle')
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.count))
        .attr('r', 3.5)
        .attr('fill', series.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .on('mouseenter', (event: MouseEvent, d) => {
          tooltip.style.display = 'block';
          tooltip.querySelector('.tooltip-label')!.textContent =
            `${series.label} — ${d3.timeFormat('%b %d, %Y')(d.date)}`;
          tooltip.querySelector('.tooltip-value')!.textContent = d.count.toLocaleString();
        })
        .on('mousemove', (event: MouseEvent) => {
          tooltip.style.left = `${event.clientX + 12}px`;
          tooltip.style.top = `${event.clientY - 28}px`;
        })
        .on('mouseleave', () => {
          tooltip.style.display = 'none';
        });
    });
  }
}
