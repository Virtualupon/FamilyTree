import { TreePersonNode } from '../../../core/models/tree.models';

export interface TimelineNode {
  id: string;
  person: TreePersonNode;
  displayName: string;
  birthYear: number;
  deathYear: number | null;
  isLiving: boolean;
  generation: number;
  parentId: string | null;
  descendantCount: number;
  yIndex: number;
  color: string;
  colorLight: string;
  avatarUrl: string | null;
}

export interface TimelineConfig {
  minYear: number;
  maxYear: number;
  currentYear: number;
  totalBars: number;
}

export interface TimelineLegendItem {
  label: string;
  color: string;
}
