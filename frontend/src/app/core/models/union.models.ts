import { DatePrecision } from './person.models';

export interface Union {
  id: string;
  orgId: string;
  type: UnionType;
  startDate?: string;
  startPrecision?: DatePrecision;
  startPlace?: string;
  endDate?: string;
  endPrecision?: DatePrecision;
  endPlace?: string;
  members: UnionMember[];
  createdAt: string;
  updatedAt: string;
}

export interface UnionMember {
  personId: string;
  personName: string;
  sex: number;
  birthDate?: string;
  deathDate?: string;
}

export enum UnionType {
  Marriage = 0,
  CivilUnion = 1,
  DomesticPartnership = 2,
  Engagement = 3,
  Informal = 4
}

export interface CreateUnionRequest {
  type: UnionType;
  startDate?: string;
  startPrecision?: DatePrecision;
  startPlaceId?: string;
  endDate?: string;
  endPrecision?: DatePrecision;
  endPlaceId?: string;
  memberIds: string[];
}

export interface UnionSearchRequest {
  type?: UnionType;
  personId?: string;
  startDateFrom?: string;
  startDateTo?: string;
  placeId?: string;
  page: number;
  pageSize: number;
}
