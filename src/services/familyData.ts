import { csvParse } from 'd3-dsv'

import type { FamilyGraph, FamilyUnit, Person, PersonSex, SpouseBond } from '../types/family'

const DATA_URL = '/data.csv'

interface RawRow {
  ID?: string
  First?: string
  Last?: string
  Sex?: string
  Gen?: string
  Spouse?: string
  Divorced?: string
  Mother?: string
  Father?: string
  DOB?: string
  DOD?: string
  Branch?: string
}

const parseBoolean = (value?: string): boolean => {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === 'yes'
}

const cleanValue = (value?: string): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const parseSex = (value?: string): PersonSex => {
  if (!value) return 'unknown'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'm' || normalized === 'male') return 'male'
  if (normalized === 'f' || normalized === 'female') return 'female'
  return 'unknown'
}

const toPerson = (row: RawRow): Person | null => {
  const id = cleanValue(row.ID)
  if (!id) return null

  const firstName = cleanValue(row.First) ?? 'Unknown'
  const lastName = cleanValue(row.Last) ?? ''
  const generation = Number.parseInt(row.Gen ?? '', 10)

  const spouseId = cleanValue(row.Spouse)
  const motherId = cleanValue(row.Mother)
  const fatherId = cleanValue(row.Father)
  const dob = cleanValue(row.DOB)
  const dod = cleanValue(row.DOD)
  const branch = cleanValue(row.Branch) ?? 'Unknown'
  const sex = parseSex(row.Sex)

  return {
    id,
    numericId: Number.parseInt(id, 10),
    firstName,
    lastName,
    fullName: `${firstName}${lastName ? ` ${lastName}` : ''}`.trim(),
    sex,
    generation: Number.isFinite(generation) ? generation : 0,
    spouseId,
    divorced: parseBoolean(row.Divorced),
    motherId,
    fatherId,
    dob,
    dod,
    branch,
  }
}

const coupleKey = (a: string, b: string): string => {
  const sorted = [a, b].map((value) => Number.parseInt(value, 10)).sort((left, right) => left - right)
  return `unit-${sorted[0]}-${sorted[1]}`
}

const ensureUnit = (
  person: Person,
  units: Map<string, FamilyUnit>,
  personToUnit: Map<string, string>,
): FamilyUnit => {
  const createBaseUnit = (id: string): FamilyUnit => ({
    id,
    members: [],
    memberIds: [],
    branch: person.branch,
    generation: person.generation,
    childIds: [],
  })

  let unitId: string

  if (person.spouseId) {
    unitId = coupleKey(person.id, person.spouseId)
  } else {
    unitId = `unit-${person.id}`
  }

  let unit = units.get(unitId)
  if (!unit) {
    unit = createBaseUnit(unitId)
    units.set(unitId, unit)
  }

  if (!unit.memberIds.includes(person.id)) {
    unit.memberIds.push(person.id)
    unit.members.push(person)
    unit.members.sort((a, b) => a.numericId - b.numericId)
    unit.memberIds.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
  }

  if (!unit.branch || unit.branch === 'Unknown') {
    unit.branch = person.branch
  }

  unit.generation = Math.min(unit.generation, person.generation)
  personToUnit.set(person.id, unit.id)

  return unit
}

const assignSpouseBond = (unit: FamilyUnit): SpouseBond | undefined => {
  if (unit.memberIds.length !== 2) return undefined
  const [left, right] = unit.memberIds as [string, string]
  const divorced = unit.members.some((member) => member.divorced)
  return {
    type: divorced ? 'divorced' : 'married',
    partnerIds: [left, right],
  }
}

const getParentUnitId = (
  person: Person,
  personToUnit: Map<string, string>,
): string | undefined => {
  const motherUnit = person.motherId ? personToUnit.get(person.motherId) : undefined
  const fatherUnit = person.fatherId ? personToUnit.get(person.fatherId) : undefined

  if (motherUnit && fatherUnit && motherUnit !== fatherUnit) {
    // Prefer the unit that contains both parents if possible
    return motherUnit
  }

  return motherUnit ?? fatherUnit
}

const finalizeUnit = (unit: FamilyUnit): void => {
  unit.childIds = Array.from(new Set(unit.childIds))
  unit.childIds.sort((a, b) => {
    const left = Number.parseInt(a.replace(/^unit-/, ''), 10)
    const right = Number.parseInt(b.replace(/^unit-/, ''), 10)
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return a.localeCompare(b)
    }
    return left - right
  })
}

export const loadFamilyGraph = async (url = DATA_URL): Promise<FamilyGraph> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Unable to fetch family data (${response.status})`)
  }

  const text = await response.text()
  const rows = csvParse(text) as RawRow[]

  const people: Person[] = []
  const peopleById: Record<string, Person> = {}

  for (const raw of rows) {
    const person = toPerson(raw)
    if (!person) continue
    people.push(person)
    peopleById[person.id] = person
  }

  const units = new Map<string, FamilyUnit>()
  const personToUnit = new Map<string, string>()

  for (const person of people) {
    const unit = ensureUnit(person, units, personToUnit)
    // Update branch if spouse contributes a non-unknown branch
    if (unit.branch === 'Unknown' && person.branch !== 'Unknown') {
      unit.branch = person.branch
    }
  }

  for (const unit of units.values()) {
    unit.spouseBond = assignSpouseBond(unit)
  }

  for (const person of people) {
    const unitId = personToUnit.get(person.id)
    if (!unitId) continue
    const unit = units.get(unitId)
    if (!unit) continue

    const parentUnitId = getParentUnitId(person, personToUnit)
    if (!parentUnitId) continue
    if (parentUnitId === unitId) continue

    const parentUnit = units.get(parentUnitId)
    if (!parentUnit) continue

    if (!unit.parentId) {
      unit.parentId = parentUnitId
    }

    parentUnit.childIds.push(unitId)
  }

  for (const unit of units.values()) {
    if (unit.parentId) continue

    const candidateScores = new Map<
      string,
      { score: number; branchMatches: number; generationDelta: number; descendantCount: number }
    >()

    for (const member of unit.members) {
      const parentUnitIds = [member.motherId, member.fatherId]
        .map((parentId) => (parentId ? personToUnit.get(parentId) : undefined))
        .filter((value): value is string => Boolean(value))

      for (const parentUnitId of parentUnitIds) {
        if (parentUnitId === unit.id) continue
        const parentUnit = units.get(parentUnitId)
        if (!parentUnit) continue

        let entry = candidateScores.get(parentUnitId)
        if (!entry) {
          entry = {
            score: 0,
            branchMatches: 0,
            generationDelta: Number.POSITIVE_INFINITY,
            descendantCount: parentUnit.childIds.length,
          }
          candidateScores.set(parentUnitId, entry)
        }

        entry.score += 1
        if (parentUnit.branch === unit.branch) {
          entry.branchMatches += 1
        }

        const rawDelta = unit.generation - parentUnit.generation
        const normalizedDelta = rawDelta > 0 ? rawDelta : Number.POSITIVE_INFINITY
        if (normalizedDelta < entry.generationDelta) {
          entry.generationDelta = normalizedDelta
        }
      }
    }

    if (candidateScores.size === 0) continue

    const bestParentId = Array.from(candidateScores.entries())
      .sort((left, right) => {
        const [leftId, leftScore] = left
        const [rightId, rightScore] = right

        if (rightScore.score !== leftScore.score) {
          return rightScore.score - leftScore.score
        }

        if (rightScore.branchMatches !== leftScore.branchMatches) {
          return rightScore.branchMatches - leftScore.branchMatches
        }

        if (leftScore.generationDelta !== rightScore.generationDelta) {
          return leftScore.generationDelta - rightScore.generationDelta
        }

        const rightDescendants = rightScore.descendantCount ?? 0
        const leftDescendants = leftScore.descendantCount ?? 0
        if (rightDescendants !== leftDescendants) {
          return rightDescendants - leftDescendants
        }

        return leftId.localeCompare(rightId)
      })
      .map(([parentUnitId]) => parentUnitId)
      .find((parentUnitId) => parentUnitId !== unit.id)

    if (!bestParentId) continue

    const bestParentUnit = units.get(bestParentId)
    if (!bestParentUnit) continue

    unit.parentId = bestParentId
    bestParentUnit.childIds.push(unit.id)
  }

  const unitsById: Record<string, FamilyUnit> = {}
  const unitList: FamilyUnit[] = []

  for (const unit of units.values()) {
    finalizeUnit(unit)
    unitsById[unit.id] = unit
    unitList.push(unit)
  }

  unitList.sort((a, b) => {
    if (a.generation !== b.generation) return a.generation - b.generation
    const aPrimary = a.memberIds[0]
    const bPrimary = b.memberIds[0]
    return Number.parseInt(aPrimary, 10) - Number.parseInt(bPrimary, 10)
  })

  const roots = unitList.filter((unit) => !unit.parentId)

  return {
    people,
    units: unitList,
    roots,
    peopleById,
    unitsById,
    personToUnitId: Object.fromEntries(personToUnit.entries()),
  }
}

