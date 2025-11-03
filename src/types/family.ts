export type PersonSex = 'male' | 'female' | 'unknown'

export interface Person {
  id: string
  numericId: number
  firstName: string
  lastName: string
  fullName: string
  suffix?: string
  sex: PersonSex
  generation: number
  spouseId?: string
  divorced: boolean
  motherId?: string
  fatherId?: string
  dob?: string
  dod?: string
  branch: string
}

export type SpouseBondType = 'married' | 'divorced'

export interface SpouseBond {
  type: SpouseBondType
  partnerIds: [string, string]
}

export interface FamilyUnit {
  id: string
  members: Person[]
  memberIds: string[]
  branch: string
  generation: number
  parentId?: string
  childIds: string[]
  spouseBond?: SpouseBond
}

export interface FamilyGraph {
  people: Person[]
  units: FamilyUnit[]
  roots: FamilyUnit[]
  peopleById: Record<string, Person>
  unitsById: Record<string, FamilyUnit>
  personToUnitId: Record<string, string>
}

