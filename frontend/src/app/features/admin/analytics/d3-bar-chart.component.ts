import {
  Component, ElementRef, Input, ViewChild,
  AfterViewInit, OnChanges, OnDestroy, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import { BarChartItem } from '../../../core/models/analytics.models';

@Component({
  selector: 'app-d3-bar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div #container class="chart-container">
      <svg #svgElement></svg>
      <div #tooltipEl class="chart-tooltip" [style.display]="'none'">
        <div class="tooltip-label"></div>
        <div class="tooltip-value"></div>
      </div>
    </div>
  `,
  styleUrls: ['./chart-styles.scss']
})
export class D3BarChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svgElement') svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltipEl') tooltipRef!: ElementRef<HTMLDivElement>;

  @Input() data: BarChartItem[] = [];
  @Input() height = 300;
  @Input() horizontal = false;
  @Input() barColor = '#187573';

  private resizeObserver?: ResizeObserver;
  private margin = { top: 20, right: 30, bottom: 50, left: 60 };

  ngAfterViewInit(): void {
    this.render();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.containerRef.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['data'] || changes['height'] || changes['horizontal']) && this.svgRef) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private render(): void {
    if (!this.svgRef || !this.data?.length) return;

    const svg = d3.select(this.svgRef.nativeElement);
    svg.selectAll('*').remove();

    const containerWidth = this.containerRef.nativeElement.clientWidth;
    if (containerWidth <= 0) return;

    if (this.horizontal) {
      this.margin.left = 120; // More space for labels
    }

    const width = containerWidth - this.margin.left - this.margin.right;
    const height = this.height - this.margin.top - this.margin.bottom;

    svg.attr('viewBox', `0 0 ${containerWidth} ${this.height}`);

    const g = svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    const tooltip = this.tooltipRef.nativeElement;
    const maxValue = d3.max(this.data, d => d.value) || 1;

    if (this.horizontal) {
      this.renderHorizontal(g, width, height, maxValue, tooltip);
    } else {
      this.renderVertical(g, width, height, maxValue, tooltip);
    }
  }

  private renderVertical(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number, height: number, maxValue: number,
    tooltip: HTMLDivElement
  ): void {
    const x = d3.scaleBand()
      .domain(this.data.map(d => d.label))
      .range([0, width])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, maxValue])
      .nice()
      .range([height, 0]);

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-25)')
      .style('text-anchor', 'end')
      .style('font-size', '11px');

    // Y axis
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(y).ticks(5));

    // Bars
    g.selectAll('.bar')
      .data(this.data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.label) || 0)
      .attr('y', d => y(d.value))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.value))
      .attr('fill', d => d.color || this.barColor)
      .attr('rx', 4)
      .on('mouseenter', (event: MouseEvent, d) => {
        tooltip.style.display = 'block';
        tooltip.querySelector('.tooltip-label')!.textContent = d.label;
        tooltip.querySelector('.tooltip-value')!.textContent = d.value.toLocaleString();
      })
      .on('mousemove', (event: MouseEvent) => {
        tooltip.style.left = `${event.clientX + 12}px`;
        tooltip.style.top = `${event.clientY - 28}px`;
      })
      .on('mouseleave', () => {
        tooltip.style.display = 'none';
      });

    // Value labels on bars
    g.selectAll('.bar-label')
      .data(this.data)
      .join('text')
      .attr('class', 'bar-label')
      .attr('x', d => (x(d.label) || 0) + x.bandwidth() / 2)
      .attr('y', d => y(d.value) - 5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#555')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text(d => d.value > 0 ? d.value.toLocaleString() : '');
  }

  private renderHorizontal(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number, height: number, maxValue: number,
    tooltip: HTMLDivElement
  ): void {
    const y = d3.scaleBand()
      .domain(this.data.map(d => d.label))
      .range([0, height])
      .padding(0.3);

    const x = d3.scaleLinear()
      .domain([0, maxValue])
      .nice()
      .range([0, width]);

    // Y axis (labels)
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .style('font-size', '11px');

    // X axis
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5));

    // Bars
    g.selectAll('.bar')
      .data(this.data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', d => y(d.label) || 0)
      .attr('width', d => x(d.value))
      .attr('height', y.bandwidth())
      .attr('fill', d => d.color || this.barColor)
      .attr('rx', 4)
      .on('mouseenter', (event: MouseEvent, d) => {
        tooltip.style.display = 'block';
        tooltip.querySelector('.tooltip-label')!.textContent = d.label;
        tooltip.querySelector('.tooltip-value')!.textContent = d.value.toLocaleString();
      })
      .on('mousemove', (event: MouseEvent) => {
        tooltip.style.left = `${event.clientX + 12}px`;
        tooltip.style.top = `${event.clientY - 28}px`;
      })
      .on('mouseleave', () => {
        tooltip.style.display = 'none';
      });

    // Value labels
    g.selectAll('.bar-label')
      .data(this.data)
      .join('text')
      .attr('class', 'bar-label')
      .attr('x', d => x(d.value) + 5)
      .attr('y', d => (y(d.label) || 0) + y.bandwidth() / 2 + 4)
      .attr('fill', '#555')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .text(d => d.value > 0 ? d.value.toLocaleString() : '');
  }
}
