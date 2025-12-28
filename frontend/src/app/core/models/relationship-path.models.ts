import { Sex } from './person.models';

/**
 * Request to find relationship path between two people
 */
export interface RelationshipPathRequest {
  person1Id: string;
  person2Id: string;
  treeId?: string;
  maxSearchDepth?: number;
}

/**
 * Response containing the relationship path and description
 */
export interface RelationshipPathResponse {
  /** Whether a path was found between the two people */
  pathFound: boolean;
  /** The i18n key for the relationship name (e.g., "relationship.father") */
  relationshipNameKey: string;
  /** Human-readable relationship description template */
  relationshipDescription: string;
  /** The complete path from Person1 to Person2 */
  path: PathPersonNode[];
  /** Common ancestors between the two people (if blood-related) */
  commonAncestors: CommonAncestorInfo[];
  /** Number of people in the path */
  pathLength: number;
  /** Error message if path finding failed */
  errorMessage?: string;
}

/**
 * A person node in the relationship path with full details
 */
export interface PathPersonNode {
  id: string;
  primaryName: string;
  sex: Sex;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  occupation?: string;
  isLiving: boolean;
  thumbnailUrl?: string;
  /** The type of edge connecting this person to the next in the path */
  edgeToNext: RelationshipEdgeType;
  /** The i18n key for the relationship to the next person */
  relationshipToNextKey: string;
}

/**
 * Type of edge in the relationship graph
 */
export enum RelationshipEdgeType {
  None = 0,
  Parent = 1,   // This person is the parent of the next
  Child = 2,    // This person is the child of the next
  Spouse = 3    // This person is the spouse of the next
}

/**
 * Information about a common ancestor
 */
export interface CommonAncestorInfo {
  personId: string;
  primaryName: string;
  generationsFromPerson1: number;
  generationsFromPerson2: number;
}
