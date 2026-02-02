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
import { firstValueFrom } from 'rxjs';
import { TreePersonNode } from '../../core/models/tree.models';
import { Sex } from '../../core/models/person.models';
import { TreeLinksSummary, PersonLinkSummary, PersonLinkType, PersonLinkTypeLabels } from '../../core/models/family-tree.models';
import { I18nService } from '../../core/i18n';
import { PersonMediaService } from '../../core/services/person-media.service';

interface D3Node {
  id: string;
  name: string;
  sex: Sex;
  birthYear?: number;
  deathYear?: number;
  isLiving: boolean;
  x: number;
  y: number;
  data: TreePersonNode;
  spouses?: D3Node[];
  generation: number;
  crossTreeLinks?: PersonLinkSummary[];
}

interface D3Link {
  source: D3Node;
  target: D3Node;
  type: 'parent-child' | 'spouse';
}

@Component({
  selector: 'app-d3-family-tree',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './d3-family-tree.component.html',
  styleUrls: ['./d3-family-tree.component.scss']
})
export class D3FamilyTreeComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly i18n = inject(I18nService);
  private readonly mediaService = inject(PersonMediaService);

  // Avatar cache: mediaId -> dataUrl
  private avatarCache = new Map<string, string>();

  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svg') svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('tooltip') tooltipRef!: ElementRef<HTMLDivElement>;

  @Input() treeData: TreePersonNode | null = null;
  @Input() viewMode: 'pedigree' | 'descendants' | 'hourglass' = 'pedigree';
  @Input() generations = 3;
  @Input() includeSpouses = true;
  @Input() selectedPersonId: string | null = null;
  @Input() crossTreeLinks: TreeLinksSummary | null = null;

  @Output() personSelected = new EventEmitter<TreePersonNode>();
  @Output() personDoubleClicked = new EventEmitter<TreePersonNode>();
  @Output() crossTreeLinkClicked = new EventEmitter<PersonLinkSummary>();
  @Output() findRelationshipClicked = new EventEmitter<TreePersonNode>();
  @Output() addRelationshipClicked = new EventEmitter<TreePersonNode>();

  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
  private container: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private currentLinks: D3Link[] = [];
  private currentNodes: D3Node[] = [];

  private readonly nodeWidth = 160;
  private readonly nodeHeight = 80;
  private readonly horizontalSpacing = 40;
  private readonly verticalSpacing = 180; // Increased for better level separation

  // Track collapsed generations (by generation number)
  private collapsedGenerations = new Set<number>();

  constructor() {
    // Watch for language changes and re-render the tree
    effect(() => {
      const lang = this.i18n.currentLang();
      // Only re-render if SVG is initialized and we have data
      if (this.svg && this.treeData) {
        this.renderTree();
      }
    });
  }

  ngAfterViewInit(): void {
    this.initSvg();
    if (this.treeData) {
      this.renderTree();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['treeData'] || changes['viewMode'] || changes['generations'] || changes['includeSpouses'] || changes['crossTreeLinks']) && this.svg) {
      this.renderTree();
    }
    if (changes['selectedPersonId'] && this.svg) {
      this.updateSelection();
    }
  }

  ngOnDestroy(): void {
    // Cleanup
  }

  private initSvg(): void {
    this.svg = d3.select(this.svgRef.nativeElement);
    this.container = this.svg.select<SVGGElement>('.tree-content');

    // Setup zoom behavior
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        this.container?.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Initial center
    this.centerTree();
  }

  private centerTree(): void {
    if (!this.svg || !this.zoom) return;

    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    this.svg.call(
      this.zoom.transform,
      d3.zoomIdentity.translate(centerX, centerY).scale(0.8)
    );
  }

  private renderTree(): void {
    if (!this.treeData || !this.container) return;

    // Clear previous content
    this.container.selectAll('*').remove();

    // Build node and link data
    const { nodes, links } = this.buildTreeData(this.treeData);

    // Store for later updates (during drag)
    this.currentLinks = links;
    this.currentNodes = nodes;

    // Load avatars then render
    this.loadAvatarsForNodes(nodes).then(() => {
      // Draw generation bands first (behind everything)
      this.drawGenerationBands(nodes);

      // Draw links (behind nodes)
      this.drawLinks(links);

      // Draw nodes
      this.drawNodes(nodes);

      // Draw generation labels (on top, fixed position)
      this.drawGenerationLabels(nodes);

      // Center the view
      setTimeout(() => this.centerTree(), 100);
    });
  }

  /**
   * Load avatar images for nodes that have avatarMediaId
   * Converts to data URLs for use in SVG
   */
  private async loadAvatarsForNodes(nodes: D3Node[]): Promise<void> {
    const nodesToLoad = nodes.filter(n =>
      n.data.avatarMediaId &&
      !this.avatarCache.has(n.data.avatarMediaId)
    );

    // Load avatars in parallel (with concurrency limit)
    const loadPromises = nodesToLoad.slice(0, 20).map(async (node) => {
      const mediaId = node.data.avatarMediaId;
      if (!mediaId) return;

      try {
        const media = await firstValueFrom(this.mediaService.getMediaById(mediaId));
        if (media?.base64Data) {
          const dataUrl = `data:${media.mimeType || 'image/jpeg'};base64,${media.base64Data}`;
          this.avatarCache.set(mediaId, dataUrl);
        }
      } catch (err) {
        console.error('Failed to load avatar for node:', node.id, err);
      }
    });

    await Promise.all(loadPromises);
  }

  private buildTreeData(root: TreePersonNode): { nodes: D3Node[]; links: D3Link[] } {
    const nodes: D3Node[] = [];
    const links: D3Link[] = [];
    const nodeMap = new Map<string, D3Node>();

    // Process root node
    const rootNode = this.createD3Node(root, 0, 0, 0);
    nodes.push(rootNode);
    nodeMap.set(root.id, rootNode);

    // Process ancestors (pedigree and hourglass modes)
    if (this.viewMode === 'pedigree' || this.viewMode === 'hourglass') {
      this.processAncestors(root, rootNode, nodes, links, nodeMap, 1);
    }

    // Process descendants (descendants and hourglass modes)
    if (this.viewMode === 'descendants' || this.viewMode === 'hourglass') {
      this.processDescendants(root, rootNode, nodes, links, nodeMap, 1);
    }

    // Process spouses
    if (this.includeSpouses) {
      this.processSpouses(root, rootNode, nodes, links, nodeMap);
    }

    // Resolve any remaining overlaps
    this.resolveOverlaps(nodes);

    return { nodes, links };
  }

  /**
   * Detect and resolve overlapping nodes by pushing them apart
   */
  private resolveOverlaps(nodes: D3Node[]): void {
    const padding = 20; // Minimum space between nodes
    const maxIterations = 50;
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let hasOverlap = false;
      
      // Check each pair of nodes at the same generation level
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i];
          const nodeB = nodes[j];
          
          // Only check nodes at the same Y level (same generation)
          if (Math.abs(nodeA.y - nodeB.y) > this.nodeHeight / 2) continue;
          
          // Calculate overlap
          const overlapX = (this.nodeWidth + padding) - Math.abs(nodeA.x - nodeB.x);
          
          if (overlapX > 0) {
            hasOverlap = true;
            // Push nodes apart
            const pushAmount = overlapX / 2 + 5;
            if (nodeA.x < nodeB.x) {
              nodeA.x -= pushAmount;
              nodeB.x += pushAmount;
            } else {
              nodeA.x += pushAmount;
              nodeB.x -= pushAmount;
            }
          }
        }
      }
      
      if (!hasOverlap) break;
    }
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

  private createD3Node(person: TreePersonNode, x: number, y: number, generation: number): D3Node {
    return {
      id: person.id,
      name: this.getDisplayName(person),
      sex: person.sex,
      birthYear: person.birthDate ? new Date(person.birthDate).getFullYear() : undefined,
      deathYear: person.deathDate ? new Date(person.deathDate).getFullYear() : undefined,
      isLiving: person.isLiving,
      x,
      y,
      data: person,
      generation,
      crossTreeLinks: this.crossTreeLinks?.[person.id] || undefined
    };
  }

  private processAncestors(
    person: TreePersonNode,
    personNode: D3Node,
    nodes: D3Node[],
    links: D3Link[],
    nodeMap: Map<string, D3Node>,
    depth: number
  ): void {
    if (!person.parents || person.parents.length === 0 || depth > this.generations) return;

    // Check if this generation is collapsed (ancestors have negative generation numbers)
    const generationNumber = -depth;
    if (this.collapsedGenerations.has(generationNumber)) return;

    const parentY = personNode.y - this.verticalSpacing;
    const parentSpacing = (this.nodeWidth + this.horizontalSpacing) * Math.pow(2, depth - 1);
    const startX = personNode.x - (parentSpacing / 2) * (person.parents.length - 1);

    person.parents.forEach((parent, index) => {
      if (nodeMap.has(parent.id)) return;

      const parentX = startX + index * parentSpacing;
      const parentNode = this.createD3Node(parent, parentX, parentY, -depth);
      nodes.push(parentNode);
      nodeMap.set(parent.id, parentNode);

      links.push({
        source: parentNode,
        target: personNode,
        type: 'parent-child'
      });

      // Recursively process grandparents
      this.processAncestors(parent, parentNode, nodes, links, nodeMap, depth + 1);

      // Process spouses of ancestors
      if (this.includeSpouses) {
        this.processSpouses(parent, parentNode, nodes, links, nodeMap);
      }
    });
  }

  private processDescendants(
    person: TreePersonNode,
    personNode: D3Node,
    nodes: D3Node[],
    links: D3Link[],
    nodeMap: Map<string, D3Node>,
    depth: number
  ): void {
    if (!person.children || person.children.length === 0 || depth > this.generations) return;

    // Check if this generation is collapsed (descendants have positive generation numbers)
    if (this.collapsedGenerations.has(depth)) return;

    const childY = personNode.y + this.verticalSpacing;

    // Calculate width needed for all children including their descendants
    const childWidths = person.children.map(child => this.calculateSubtreeWidth(child, depth + 1));
    const totalWidth = childWidths.reduce((sum, w) => sum + w, 0) + (person.children.length - 1) * this.horizontalSpacing;

    let currentX = personNode.x - totalWidth / 2;

    person.children.forEach((child, index) => {
      if (nodeMap.has(child.id)) return;

      const childWidth = childWidths[index];
      const childX = currentX + childWidth / 2;
      currentX += childWidth + this.horizontalSpacing;

      const childNode = this.createD3Node(child, childX, childY, depth);
      nodes.push(childNode);
      nodeMap.set(child.id, childNode);

      links.push({
        source: personNode,
        target: childNode,
        type: 'parent-child'
      });

      // Recursively process grandchildren
      this.processDescendants(child, childNode, nodes, links, nodeMap, depth + 1);

      // Process spouses of descendants
      if (this.includeSpouses) {
        this.processSpouses(child, childNode, nodes, links, nodeMap);
      }
    });
  }

  /**
   * Calculate the width needed for a person and all their descendants
   */
  private calculateSubtreeWidth(person: TreePersonNode, depth: number): number {
    if (depth > this.generations || !person.children || person.children.length === 0) {
      // Leaf node: just the node width plus space for spouse
      const spouseCount = person.unions?.reduce((count, u) => count + (u.partners?.length || 0), 0) || 0;
      return this.nodeWidth + (spouseCount * (this.nodeWidth + 20));
    }

    // Sum of children's widths
    const childrenWidth = person.children
      .map(child => this.calculateSubtreeWidth(child, depth + 1))
      .reduce((sum, w) => sum + w, 0);
    
    // Add spacing between children
    const spacingWidth = (person.children.length - 1) * this.horizontalSpacing;
    
    // Return the larger of: node width or children total width
    const spouseCount = person.unions?.reduce((count, u) => count + (u.partners?.length || 0), 0) || 0;
    const nodeWithSpouse = this.nodeWidth + (spouseCount * (this.nodeWidth + 20));
    
    return Math.max(nodeWithSpouse, childrenWidth + spacingWidth);
  }

  private processSpouses(
    person: TreePersonNode,
    personNode: D3Node,
    nodes: D3Node[],
    links: D3Link[],
    nodeMap: Map<string, D3Node>
  ): void {
    if (!person.unions) return;

    let spouseOffset = 1;
    person.unions.forEach(union => {
      union.partners?.forEach(partner => {
        if (partner.id === person.id || nodeMap.has(partner.id)) return;

        const spouseX = personNode.x + (this.nodeWidth + 20) * spouseOffset;
        const spouseNode = this.createD3Node(partner, spouseX, personNode.y, personNode.generation);
        nodes.push(spouseNode);
        nodeMap.set(partner.id, spouseNode);

        links.push({
          source: personNode,
          target: spouseNode,
          type: 'spouse'
        });

        personNode.spouses = personNode.spouses || [];
        personNode.spouses.push(spouseNode);
        spouseOffset++;
      });
    });
  }

  private drawLinks(links: D3Link[]): void {
    if (!this.container) return;

    const linkGroup = this.container.append('g').attr('class', 'links');

    links.forEach(link => {
      if (link.type === 'parent-child') {
        // Draw parent-child connection with curved line
        const path = d3.path();
        const midY = (link.source.y + link.target.y) / 2;

        path.moveTo(link.source.x, link.source.y + this.nodeHeight / 2);
        path.bezierCurveTo(
          link.source.x, midY,
          link.target.x, midY,
          link.target.x, link.target.y - this.nodeHeight / 2
        );

        linkGroup.append('path')
          .attr('d', path.toString())
          .attr('class', 'link-parent-child');
      } else if (link.type === 'spouse') {
        // Draw spouse connection with horizontal dashed line
        linkGroup.append('line')
          .attr('x1', link.source.x + this.nodeWidth / 2)
          .attr('y1', link.source.y)
          .attr('x2', link.target.x - this.nodeWidth / 2)
          .attr('y2', link.target.y)
          .attr('class', 'link-spouse');
      }
    });
  }

  /**
   * Update all links connected to a specific node (called during drag)
   */
  private updateLinksForNode(node: D3Node): void {
    if (!this.container) return;

    // Find all links connected to this node
    const connectedLinks = this.currentLinks.filter(
      link => link.source.id === node.id || link.target.id === node.id
    );

    // Update each connected link
    connectedLinks.forEach(link => {
      if (link.type === 'parent-child') {
        const path = d3.path();
        const midY = (link.source.y + link.target.y) / 2;

        path.moveTo(link.source.x, link.source.y + this.nodeHeight / 2);
        path.bezierCurveTo(
          link.source.x, midY,
          link.target.x, midY,
          link.target.x, link.target.y - this.nodeHeight / 2
        );

        // Find and update the path element
        this.container?.selectAll('.link-parent-child')
          .filter((d, i, elements) => {
            const el = elements[i] as SVGPathElement;
            const currentPath = el.getAttribute('d') || '';
            // Check if this path connects these nodes (approximate check)
            return currentPath.includes(`${link.source.x},`) || currentPath.includes(`${link.target.x},`);
          })
          .attr('d', path.toString());
      } else if (link.type === 'spouse') {
        // Update spouse line
        this.container?.selectAll('.link-spouse')
          .filter(function() {
            const el = this as SVGLineElement;
            const x1 = parseFloat(el.getAttribute('x1') || '0');
            const y1 = parseFloat(el.getAttribute('y1') || '0');
            return Math.abs(x1 - (link.source.x + 80)) < 100 && Math.abs(y1 - link.source.y) < 50;
          })
          .attr('x1', link.source.x + this.nodeWidth / 2)
          .attr('y1', link.source.y)
          .attr('x2', link.target.x - this.nodeWidth / 2)
          .attr('y2', link.target.y);
      }
    });

    // Simpler approach: redraw all links
    this.container?.select('.links').remove();
    this.drawLinks(this.currentLinks);
  }

  private drawNodes(nodes: D3Node[]): void {
    if (!this.container) return;

    const nodeGroup = this.container.append('g').attr('class', 'nodes');
    const self = this;

    // Create drag behavior
    const drag = d3.drag<SVGGElement, D3Node>()
      .on('start', function(event, d) {
        d3.select(this).raise().classed('dragging', true);
      })
      .on('drag', function(event, d) {
        d.x = event.x + self.nodeWidth / 2;
        d.y = event.y + self.nodeHeight / 2;
        d3.select(this)
          .attr('transform', `translate(${event.x}, ${event.y})`);
        // Update connected links
        self.updateLinksForNode(d);
      })
      .on('end', function(event, d) {
        d3.select(this).classed('dragging', false);
      });

    nodes.forEach(node => {
      const g = nodeGroup.append('g')
        .datum(node) // Bind data for drag
        .attr('class', `person-node ${node.id === this.selectedPersonId ? 'selected' : ''}`)
        .attr('transform', `translate(${node.x - this.nodeWidth / 2}, ${node.y - this.nodeHeight / 2})`)
        .attr('data-id', node.id)
        .on('click', (event) => {
          // Only trigger click if not dragging
          if (!event.defaultPrevented) {
            this.onNodeClick(node);
          }
        })
        .on('dblclick', () => this.onNodeDoubleClick(node))
        .call(drag as any); // Enable dragging

      // Node rectangle
      const rectClass = node.sex === Sex.Male ? 'node-rect-male'
        : node.sex === Sex.Female ? 'node-rect-female'
        : 'node-rect-unknown';

      g.append('rect')
        .attr('class', `node-rect ${rectClass}`)
        .attr('width', this.nodeWidth)
        .attr('height', this.nodeHeight)
        .attr('rx', 12)
        .attr('ry', 12);

      // Avatar - show image if available, otherwise initials
      const avatarColor = node.sex === Sex.Male ? '#1976d2'
        : node.sex === Sex.Female ? '#c2185b'
        : '#757575';

      const avatarUrl = node.data.avatarMediaId
        ? this.avatarCache.get(node.data.avatarMediaId)
        : null;

      if (avatarUrl) {
        // Clip path for circular avatar
        g.append('clipPath')
          .attr('id', `avatar-clip-${node.id}`)
          .append('circle')
          .attr('cx', 30)
          .attr('cy', this.nodeHeight / 2)
          .attr('r', 20);

        // Avatar image
        g.append('image')
          .attr('x', 10)
          .attr('y', this.nodeHeight / 2 - 20)
          .attr('width', 40)
          .attr('height', 40)
          .attr('clip-path', `url(#avatar-clip-${node.id})`)
          .attr('href', avatarUrl)
          .attr('preserveAspectRatio', 'xMidYMid slice');
      } else {
        // Fallback to initials
        g.append('circle')
          .attr('cx', 30)
          .attr('cy', this.nodeHeight / 2)
          .attr('r', 20)
          .attr('fill', avatarColor)
          .attr('opacity', 0.2);

        g.append('text')
          .attr('class', 'node-avatar')
          .attr('x', 30)
          .attr('y', this.nodeHeight / 2)
          .attr('fill', avatarColor)
          .text(this.getInitials(node.name));
      }

      // Name - position after avatar (avatar ends at x=50, add padding)
      const textStartX = 58;
      const maxTextWidth = this.nodeWidth - textStartX - 12; // Leave padding on right
      const avgCharWidth = 7.5; // ~7.5px per char for 12px bold font
      const maxChars = Math.floor(maxTextWidth / avgCharWidth);
      const displayName = node.name.length > maxChars ? node.name.substring(0, maxChars - 1) + '…' : node.name;
      g.append('text')
        .attr('class', 'node-name')
        .attr('x', textStartX)
        .attr('y', this.nodeHeight / 2 - 8)
        .text(displayName);

      // Dates
      let dateText = '';
      if (node.birthYear) {
        dateText = node.birthYear.toString();
        if (node.deathYear) {
          dateText += ` - ${node.deathYear}`;
        } else if (!node.isLiving) {
          dateText += ' - ?';
        }
      }

      if (dateText) {
        g.append('text')
          .attr('class', 'node-dates')
          .attr('x', textStartX)
          .attr('y', this.nodeHeight / 2 + 12)
          .text(dateText);
      }

      // Living indicator
      if (node.isLiving) {
        g.append('circle')
          .attr('class', 'living-indicator')
          .attr('cx', this.nodeWidth - 12)
          .attr('cy', 12)
          .attr('r', 5);
      }

      // Cross-tree link badge
      if (node.crossTreeLinks && node.crossTreeLinks.length > 0) {
        this.drawCrossTreeBadge(g, node);
      }

      // Find relationship button (top-left corner, appears on hover)
      this.drawFindRelationshipButton(g, node);

      // Add relationship button (top-right corner, appears on hover)
      this.drawAddRelationshipButton(g, node);
    });
  }

  /**
   * Draw horizontal bands for each generation level to visually separate them
   */
  private drawGenerationBands(nodes: D3Node[]): void {
    if (!this.container || nodes.length === 0) return;

    // Get unique generation levels and their Y positions
    const generationMap = new Map<number, number>();
    nodes.forEach(node => {
      if (!generationMap.has(node.generation)) {
        generationMap.set(node.generation, node.y);
      }
    });

    // Sort generations by their Y position
    const generations = Array.from(generationMap.entries())
      .sort((a, b) => a[1] - b[1]);

    if (generations.length === 0) return;

    // Calculate bounds for the bands
    const minX = Math.min(...nodes.map(n => n.x)) - this.nodeWidth - 100;
    const maxX = Math.max(...nodes.map(n => n.x)) + this.nodeWidth + 100;
    const bandWidth = maxX - minX + 200;

    // Create bands group (behind everything)
    const bandsGroup = this.container.insert('g', ':first-child')
      .attr('class', 'generation-bands');

    generations.forEach(([gen, y], index) => {
      // Calculate band boundaries
      const bandTop = y - this.verticalSpacing / 2;
      const bandHeight = this.verticalSpacing;

      // Alternate colors for visual distinction
      const isEven = index % 2 === 0;
      const fillColor = isEven ? 'rgba(206, 197, 176, 0.15)' : 'rgba(206, 197, 176, 0.05)'; // Nubian sand with opacity

      bandsGroup.append('rect')
        .attr('class', `generation-band gen-${gen}`)
        .attr('x', minX - 100)
        .attr('y', bandTop)
        .attr('width', bandWidth)
        .attr('height', bandHeight)
        .attr('fill', fillColor)
        .attr('stroke', 'none');
    });
  }

  /**
   * Draw generation labels on the left side of the tree
   * Labels are larger and clickable to collapse/expand generations
   */
  private drawGenerationLabels(nodes: D3Node[]): void {
    if (!this.container || nodes.length === 0) return;

    // Get unique generation levels and their Y positions
    const generationMap = new Map<number, number>();
    const generationCounts = new Map<number, number>();
    nodes.forEach(node => {
      if (!generationMap.has(node.generation)) {
        generationMap.set(node.generation, node.y);
      }
      generationCounts.set(node.generation, (generationCounts.get(node.generation) || 0) + 1);
    });

    // Calculate leftmost position - move further left to accommodate larger labels
    const minX = Math.min(...nodes.map(n => n.x)) - this.nodeWidth / 2 - 130;

    // Create labels group
    const labelsGroup = this.container.append('g')
      .attr('class', 'generation-labels');

    const self = this;

    generationMap.forEach((y, gen) => {
      // Count people in this generation
      const count = generationCounts.get(gen) || 0;
      const isCollapsed = this.collapsedGenerations.has(gen);
      const isRoot = gen === 0;

      // Determine label text based on generation
      let labelText: string;
      if (gen === 0) {
        labelText = this.i18n.t('tree.generation.root') || 'Root';
      } else if (gen < 0) {
        const absGen = Math.abs(gen);
        if (absGen === 1) {
          labelText = this.i18n.t('tree.generation.parents') || 'Parents';
        } else if (absGen === 2) {
          labelText = this.i18n.t('tree.generation.grandparents') || 'Grandparents';
        } else {
          labelText = `Gen -${absGen}`;
        }
      } else {
        if (gen === 1) {
          labelText = this.i18n.t('tree.generation.children') || 'Children';
        } else if (gen === 2) {
          labelText = this.i18n.t('tree.generation.grandchildren') || 'Grandchildren';
        } else {
          labelText = `Gen +${gen}`;
        }
      }

      // Draw label with background - LARGER SIZE
      const labelGroup = labelsGroup.append('g')
        .attr('class', `generation-label-group ${!isRoot ? 'clickable' : ''}`)
        .attr('transform', `translate(${minX}, ${y})`)
        .style('cursor', isRoot ? 'default' : 'pointer');

      // Background pill - larger
      const pillWidth = 110;
      const pillHeight = 44;
      labelGroup.append('rect')
        .attr('class', `generation-label-bg ${isCollapsed ? 'collapsed' : ''}`)
        .attr('x', 0)
        .attr('y', -pillHeight / 2)
        .attr('width', pillWidth)
        .attr('height', pillHeight)
        .attr('rx', 8)
        .attr('ry', 8)
        .attr('fill', isCollapsed ? 'rgba(206, 197, 176, 0.4)' : 'rgba(255, 255, 255, 0.95)')
        .attr('stroke', isRoot ? '#187573' : '#CEC5B0')
        .attr('stroke-width', isRoot ? 2 : 1);

      // Label text - larger font
      labelGroup.append('text')
        .attr('class', 'generation-label')
        .attr('x', pillWidth / 2)
        .attr('y', -6)
        .attr('text-anchor', 'middle')
        .style('font-size', '13px')
        .style('font-weight', '600')
        .text(labelText);

      // Count badge
      labelGroup.append('text')
        .attr('class', 'generation-count')
        .attr('x', pillWidth / 2)
        .attr('y', 12)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .style('fill', '#6B6B6B')
        .text(`(${count})`);

      // Collapse/expand indicator (not for root)
      if (!isRoot) {
        const indicator = isCollapsed ? '▶' : '▼';
        labelGroup.append('text')
          .attr('class', 'collapse-indicator')
          .attr('x', pillWidth - 12)
          .attr('y', 0)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .style('font-size', '10px')
          .style('fill', '#9CA3AF')
          .text(indicator);

        // Click handler to toggle collapse
        labelGroup.on('click', function() {
          self.toggleGenerationCollapse(gen);
        });

        // Hover effect
        labelGroup.on('mouseenter', function() {
          d3.select(this).select('.generation-label-bg')
            .attr('stroke', '#187573')
            .attr('stroke-width', 2);
        });

        labelGroup.on('mouseleave', function() {
          d3.select(this).select('.generation-label-bg')
            .attr('stroke', '#CEC5B0')
            .attr('stroke-width', 1);
        });
      }
    });
  }

  /**
   * Toggle collapse state for a generation and re-render
   */
  private toggleGenerationCollapse(generation: number): void {
    if (this.collapsedGenerations.has(generation)) {
      this.collapsedGenerations.delete(generation);
    } else {
      this.collapsedGenerations.add(generation);
    }
    this.renderTree();
  }

  private drawFindRelationshipButton(
    g: d3.Selection<SVGGElement, D3Node, null, undefined>,
    node: D3Node
  ): void {
    const buttonX = 5;
    const buttonY = 5;

    const button = g.append('g')
      .attr('class', 'find-relationship-btn')
      .attr('transform', `translate(${buttonX}, ${buttonY})`)
      .style('opacity', 0)
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent) => {
        event.stopPropagation();
        this.findRelationshipClicked.emit(node.data);
      });

    // Button background
    button.append('circle')
      .attr('r', 12)
      .attr('fill', '#1976d2')
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

    // Link icon using Font Awesome Unicode glyph
    button.append('text')
      .attr('class', 'node-icon-solid')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', '10px')
      .text('\uf0c1'); // fa-link Unicode

    // Show button on node hover
    g.on('mouseenter', function() {
      d3.select(this).select('.find-relationship-btn')
        .transition()
        .duration(200)
        .style('opacity', 1);
    });

    g.on('mouseleave', function() {
      d3.select(this).select('.find-relationship-btn')
        .transition()
        .duration(200)
        .style('opacity', 0);
    });
  }

  private drawAddRelationshipButton(
    g: d3.Selection<SVGGElement, D3Node, null, undefined>,
    node: D3Node
  ): void {
    // Position at top-right corner
    const buttonX = this.nodeWidth - 25;
    const buttonY = 5;

    const button = g.append('g')
      .attr('class', 'add-relationship-btn')
      .attr('transform', `translate(${buttonX}, ${buttonY})`)
      .style('opacity', 0)
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent) => {
        event.stopPropagation();
        this.addRelationshipClicked.emit(node.data);
      });

    // Button background (green for add)
    button.append('circle')
      .attr('r', 12)
      .attr('fill', '#2D7A3E')  // Nubian green
      .attr('stroke', 'white')
      .attr('stroke-width', 2);

    // Plus icon
    button.append('text')
      .attr('class', 'node-icon-solid')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text('+');

    // Show button on node hover (integrate with existing handlers)
    const existingMouseEnter = g.on('mouseenter');
    g.on('mouseenter', function(this: SVGGElement, event: MouseEvent, d: any) {
      if (existingMouseEnter) {
        (existingMouseEnter as any).call(this, event, d);
      }
      d3.select(this).select('.add-relationship-btn')
        .transition()
        .duration(200)
        .style('opacity', 1);
    });

    const existingMouseLeave = g.on('mouseleave');
    g.on('mouseleave', function(this: SVGGElement, event: MouseEvent, d: any) {
      if (existingMouseLeave) {
        (existingMouseLeave as any).call(this, event, d);
      }
      d3.select(this).select('.add-relationship-btn')
        .transition()
        .duration(200)
        .style('opacity', 0);
    });
  }

  private drawCrossTreeBadge(
    g: d3.Selection<SVGGElement, D3Node, null, undefined>,
    node: D3Node
  ): void {
    if (!node.crossTreeLinks || node.crossTreeLinks.length === 0) return;

    // Determine the predominant link type for badge color
    const linkTypes = node.crossTreeLinks.map(l => l.linkType);
    const hasSamePerson = linkTypes.includes(PersonLinkType.SamePerson);
    const hasAncestor = linkTypes.includes(PersonLinkType.Ancestor);

    let badgeClass = 'badge-circle-related';
    if (hasSamePerson) {
      badgeClass = 'badge-circle-same';
    } else if (hasAncestor) {
      badgeClass = 'badge-circle-ancestor';
    }

    // Badge position: bottom-right corner of the node
    const badgeX = this.nodeWidth - 15;
    const badgeY = this.nodeHeight - 15;

    const badge = g.append('g')
      .attr('class', 'cross-tree-badge')
      .attr('transform', `translate(${badgeX}, ${badgeY})`)
      .on('click', (event: MouseEvent) => {
        event.stopPropagation();
        this.showCrossTreeTooltip(event, node);
      })
      .on('mouseenter', (event: MouseEvent) => {
        this.showCrossTreeTooltip(event, node);
      })
      .on('mouseleave', () => {
        // Delay hiding to allow clicking on tooltip items
        setTimeout(() => this.hideCrossTreeTooltip(), 200);
      });

    // Badge circle
    badge.append('circle')
      .attr('class', `badge-circle ${badgeClass}`)
      .attr('r', 12)
      .attr('cx', 0)
      .attr('cy', 0);

    // Badge count
    const count = node.crossTreeLinks.length;
    badge.append('text')
      .attr('class', 'badge-count')
      .attr('x', 0)
      .attr('y', 0)
      .text(count > 9 ? '9+' : count.toString());
  }

  private showCrossTreeTooltip(event: MouseEvent, node: D3Node): void {
    if (!this.tooltipRef || !node.crossTreeLinks) return;

    const tooltip = this.tooltipRef.nativeElement;
    const content = tooltip.querySelector('.tooltip-content') as HTMLElement;

    // Build tooltip content
    let html = `<div class="tooltip-header">Cross-Tree Links (${node.crossTreeLinks.length})</div>`;

    node.crossTreeLinks.forEach(link => {
      const typeClass = link.linkType === PersonLinkType.SamePerson ? 'same'
        : link.linkType === PersonLinkType.Ancestor ? 'ancestor' : 'related';
      const typeLabel = PersonLinkTypeLabels[link.linkType];

      html += `
        <div class="tooltip-link-item" data-link-id="${link.linkId}" data-person-id="${link.linkedPersonId}" data-tree-id="${link.linkedTreeId}">
          <span class="link-type-badge ${typeClass}">${typeLabel}</span>
          <div class="link-info">
            <div class="link-person">${link.linkedPersonName}</div>
            <div class="link-tree">${link.linkedTreeName}</div>
            ${link.linkedTownName ? `<div class="link-town">${link.linkedTownName}</div>` : ''}
          </div>
          <span class="jump-icon">→</span>
        </div>
      `;
    });

    content.innerHTML = html;

    // Add click handlers to link items
    content.querySelectorAll('.tooltip-link-item').forEach(item => {
      item.addEventListener('click', () => {
        const linkId = item.getAttribute('data-link-id');
        const link = node.crossTreeLinks?.find(l => l.linkId === linkId);
        if (link) {
          this.crossTreeLinkClicked.emit(link);
          this.hideCrossTreeTooltip();
        }
      });
    });

    // Position tooltip near the click
    const containerRect = this.containerRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - containerRect.left + 10;
    const y = event.clientY - containerRect.top + 10;

    tooltip.style.display = 'block';
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;

    // Adjust if tooltip goes off-screen
    setTimeout(() => {
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.right > containerRect.right) {
        tooltip.style.left = `${x - tooltipRect.width - 20}px`;
      }
      if (tooltipRect.bottom > containerRect.bottom) {
        tooltip.style.top = `${y - tooltipRect.height - 20}px`;
      }
    }, 0);
  }

  private hideCrossTreeTooltip(): void {
    if (!this.tooltipRef) return;
    const tooltip = this.tooltipRef.nativeElement;

    // Check if mouse is over the tooltip
    if (tooltip.matches(':hover')) return;

    tooltip.style.display = 'none';
  }

  private updateSelection(): void {
    if (!this.container) return;

    const selectedId = this.selectedPersonId;
    this.container.selectAll('.person-node')
      .classed('selected', (_d, i, nodes) => {
        return d3.select(nodes[i]).attr('data-id') === selectedId;
      });
  }

  private onNodeClick(node: D3Node): void {
    this.personSelected.emit(node.data);
  }

  private onNodeDoubleClick(node: D3Node): void {
    this.personDoubleClicked.emit(node.data);
  }

  private getInitials(name: string): string {
    if (!name || name === this.i18n.t('common.unknown')) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // Public methods for external control
  public zoomIn(): void {
    if (!this.svg || !this.zoom) return;
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3);
  }

  public zoomOut(): void {
    if (!this.svg || !this.zoom) return;
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7);
  }

  public resetZoom(): void {
    this.centerTree();
  }

  public fitToScreen(): void {
    if (!this.svg || !this.zoom || !this.container) return;

    const bounds = (this.container.node() as SVGGElement)?.getBBox();
    if (!bounds) return;

    const rect = this.containerRef.nativeElement.getBoundingClientRect();
    const fullWidth = rect.width;
    const fullHeight = rect.height;

    const width = bounds.width;
    const height = bounds.height;
    const midX = bounds.x + width / 2;
    const midY = bounds.y + height / 2;

    const scale = 0.9 / Math.max(width / fullWidth, height / fullHeight);
    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

    this.svg.transition().duration(500).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
  }
}