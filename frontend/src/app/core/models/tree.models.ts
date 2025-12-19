import { Sex } from './person.models';
import { UnionType } from './union.models';

export interface TreePersonNode {
  id: string;
  primaryName: string;
  sex: Sex;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  isLiving: boolean;
  thumbnailUrl?: string;
  parents: TreePersonNode[];
  children: TreePersonNode[];
  unions: TreeUnionNode[];
  hasMoreAncestors: boolean;
  hasMoreDescendants: boolean;
}

export interface TreeUnionNode {
  id: string;
  type: UnionType;
  startDate?: string;
  endDate?: string;
  startPlace?: string;
  partners: TreePersonNode[];
  children: TreePersonNode[];
}

export interface PedigreeRequest {
  personId: string;
  treeId?: string;  // For SuperAdmin/Admin to specify which tree
  generations: number;
  includeSpouses: boolean;
}

export interface DescendantRequest {
  personId: string;
  treeId?: string;  // For SuperAdmin/Admin to specify which tree
  generations: number;
  includeSpouses: boolean;
}

export interface HourglassRequest {
  personId: string;
  treeId?: string;  // For SuperAdmin/Admin to specify which tree
  ancestorGenerations: number;
  descendantGenerations: number;
  includeSpouses: boolean;
}

export interface RelationshipCalculationRequest {
  person1Id: string;
  person2Id: string;
}

export interface RelationshipCalculationResponse {
  relationship: string;
  commonAncestorCount: number;
  commonAncestors: CommonAncestor[];
}

export interface CommonAncestor {
  personId: string;
  primaryName: string;
  generationsFromPerson1: number;
  generationsFromPerson2: number;
}