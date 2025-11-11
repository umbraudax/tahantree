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

const buildFullName = (firstName: string, lastName: string, suffix?: string): string => {
  const base = `${firstName}${lastName ? ` ${lastName}` : ''}`.trim()
  return suffix ? `${base} ${suffix}` : base
}

const toRomanNumeral = (value: number): string => {
  if (value <= 0) return ''
  const numerals: Array<{ value: number; symbol: string }> = [
    { value: 1000, symbol: 'M' },
    { value: 900, symbol: 'CM' },
    { value: 500, symbol: 'D' },
    { value: 400, symbol: 'CD' },
    { value: 100, symbol: 'C' },
    { value: 90, symbol: 'XC' },
    { value: 50, symbol: 'L' },
    { value: 40, symbol: 'XL' },
    { value: 10, symbol: 'X' },
    { value: 9, symbol: 'IX' },
    { value: 5, symbol: 'V' },
    { value: 4, symbol: 'IV' },
    { value: 1, symbol: 'I' },
  ]

  let remainder = value
  let result = ''

  for (const numeral of numerals) {
    while (remainder >= numeral.value) {
      result += numeral.symbol
      remainder -= numeral.value
    }
    if (remainder === 0) break
  }

  return result
}

const getSuffixForRank = (rank: number): string | null => {
  if (rank === 0) return 'Sr.'
  if (rank === 1) return 'Jr.'
  const numeral = toRomanNumeral(rank + 1)
  return numeral ? numeral : null
}

const normalizeBranchName = (branch?: string): string => {
  if (!branch) return 'unknown'
  const trimmed = branch.trim()
  return trimmed.length === 0 ? 'unknown' : trimmed.toLowerCase()
}

const safeNumericId = (value?: string): number => {
  if (!value) return Number.POSITIVE_INFINITY
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY
}

const BRANCH_ORDER_FALLBACK = 1_000_000

const parseDateValue = (value?: string): number | null => {
  if (!value) return null
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return parsed
}

const compareBySeniority = (left: Person, right: Person): number => {
  if (left.generation !== right.generation) {
    return left.generation - right.generation
  }

  const leftDob = parseDateValue(left.dob)
  const rightDob = parseDateValue(right.dob)

  const leftHasDob = leftDob !== null
  const rightHasDob = rightDob !== null

  if (leftHasDob && rightHasDob && leftDob !== rightDob) {
    return leftDob - rightDob
  }

  if (leftHasDob && !rightHasDob) return -1
  if (!leftHasDob && rightHasDob) return 1

  return left.numericId - right.numericId
}

const assignNameSuffixes = (people: Person[]): void => {
  const groups = new Map<string, Person[]>()

  for (const person of people) {
    const key = `${person.firstName.toLowerCase()}|${person.lastName.toLowerCase()}`
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(person)
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue

    const idsInGroup = new Set(group.map((person) => person.id))
    const adjacency = new Map<string, Set<string>>()
    const lookup = new Map(group.map((person) => [person.id, person] as const))

    const ensureAdjacency = (id: string) => {
      if (!adjacency.has(id)) {
        adjacency.set(id, new Set())
      }
    }

    for (const person of group) {
      for (const parentId of [person.fatherId, person.motherId]) {
        if (!parentId) continue
        if (!idsInGroup.has(parentId)) continue

        ensureAdjacency(person.id)
        ensureAdjacency(parentId)

        adjacency.get(person.id)!.add(parentId)
        adjacency.get(parentId)!.add(person.id)
      }
    }

    const visited = new Set<string>()

    for (const person of group) {
      if (visited.has(person.id)) continue

      if (!adjacency.has(person.id)) {
        visited.add(person.id)
        continue
      }

      const stack: string[] = [person.id]
      const component: Person[] = []

      while (stack.length > 0) {
        const currentId = stack.pop()!
        if (visited.has(currentId)) continue
        visited.add(currentId)

        const currentPerson = lookup.get(currentId)
        if (!currentPerson) continue
        component.push(currentPerson)

        const neighbors = adjacency.get(currentId)
        if (!neighbors) continue

        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            stack.push(neighborId)
          }
        }
      }

      if (component.length <= 1) {
        continue
      }

      component.sort(compareBySeniority)

      component.forEach((member, index) => {
        const suffix = getSuffixForRank(index)
        if (!suffix) return
        member.suffix = suffix
        member.fullName = buildFullName(member.firstName, member.lastName, member.suffix)
      })
    }
  }
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
    fullName: buildFullName(firstName, lastName),
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
  personRowIndex: Map<string, number>,
  unitFirstSeenIndex: Map<string, number>,
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

  const rowIndex = personRowIndex.get(person.id)
  if (rowIndex !== undefined) {
    const existing = unitFirstSeenIndex.get(unitId)
    if (existing === undefined || rowIndex < existing) {
      unitFirstSeenIndex.set(unitId, rowIndex)
    }
  }

  if (!unit.memberIds.includes(person.id)) {
    unit.memberIds.push(person.id)
    unit.members.push(person)
    unit.members.sort(compareBySeniority)
    unit.memberIds.sort((a, b) => safeNumericId(a) - safeNumericId(b))
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
  units: Map<string, FamilyUnit>,
  peopleById: Record<string, Person>,
  currentUnitId?: string,
): string | undefined => {
  const selectParentUnit = (primary?: string, secondary?: string): string | undefined => {
    if (primary && secondary && primary !== secondary) {
      return primary
    }
    return primary ?? secondary
  }

  const motherUnit = person.motherId ? personToUnit.get(person.motherId) : undefined
  const fatherUnit = person.fatherId ? personToUnit.get(person.fatherId) : undefined
  const directParentUnit = selectParentUnit(motherUnit, fatherUnit)

  if (directParentUnit && directParentUnit !== currentUnitId) {
    return directParentUnit
  }

  const spouseId = person.spouseId
  if (!spouseId) {
    return undefined
  }

  const spouseUnitId = personToUnit.get(spouseId)
  if (spouseUnitId && spouseUnitId !== currentUnitId) {
    const spouseUnit = units.get(spouseUnitId)
    const spouseParentFromUnit = spouseUnit?.parentId
    if (spouseParentFromUnit && spouseParentFromUnit !== currentUnitId) {
      return spouseParentFromUnit
    }
  }

  const spouse = peopleById[spouseId]
  if (!spouse) {
    return undefined
  }

  const spouseMotherUnit = spouse.motherId ? personToUnit.get(spouse.motherId) : undefined
  const spouseFatherUnit = spouse.fatherId ? personToUnit.get(spouse.fatherId) : undefined
  const spouseParentUnit = selectParentUnit(spouseMotherUnit, spouseFatherUnit)

  if (spouseParentUnit && spouseParentUnit !== currentUnitId) {
    return spouseParentUnit
  }

  return undefined
}

const finalizeUnit = (
  unit: FamilyUnit,
  unitLookup: Map<string, FamilyUnit>,
  branchOrder: Map<string, number>,
  unitFirstSeenIndex: Map<string, number>,
  peopleById: Record<string, Person>,
): void => {
  const branchSortValue = (branch?: string): number => {
    const normalized = normalizeBranchName(branch)
    if (normalized === 'other') return BRANCH_ORDER_FALLBACK + 2
    if (normalized === 'unknown') return BRANCH_ORDER_FALLBACK + 1
    const index = branchOrder.get(normalized)
    return index ?? BRANCH_ORDER_FALLBACK
  }

  const parentMemberIds = new Set(unit.members.map((member) => member.id))

  const resolvePerson = (personId?: string): Person | undefined => {
    if (!personId) return undefined
    return peopleById[personId]
  }

  const isChildOfParent = (person: Person | undefined): boolean => {
    if (!person) return false
    const motherId = person.motherId ?? ''
    const fatherId = person.fatherId ?? ''
    return parentMemberIds.has(motherId) || parentMemberIds.has(fatherId)
  }

  type ChildConnectionType = 'childDirect' | 'formerOnly' | 'partnerOnly' | 'unconnected'

  interface ChildUnitInfo {
    id: string
    unit: FamilyUnit | null
    anchorChildId?: string
    anchorChild?: Person
    childMember?: Person
    connectionType: ChildConnectionType
    connectionRank: number
    connected: boolean
    branchValue: number
    firstSeen: number
    generation: number
    spouseMembers: Person[]
  }

  const CONNECTION_RANK: Record<ChildConnectionType, number> = {
    formerOnly: 0,
    childDirect: 1,
    partnerOnly: 2,
    unconnected: 3,
  }

  const infoCache = new Map<string, ChildUnitInfo>()

  const getUnitInfo = (childUnitId: string): ChildUnitInfo => {
    const cached = infoCache.get(childUnitId)
    if (cached) return cached

    const target = unitLookup.get(childUnitId)
    if (!target) {
      const fallback: ChildUnitInfo = {
        id: childUnitId,
        unit: null,
        connectionType: 'unconnected',
        connectionRank: CONNECTION_RANK.unconnected,
        connected: false,
        branchValue: BRANCH_ORDER_FALLBACK,
        firstSeen: unitFirstSeenIndex.get(childUnitId) ?? Number.POSITIVE_INFINITY,
        generation: Number.POSITIVE_INFINITY,
        spouseMembers: [],
      }
      infoCache.set(childUnitId, fallback)
      return fallback
    }

    const resolvedMembers = target.members.map((member) => resolvePerson(member.id) ?? member)

    let anchorChildId: string | undefined
    let anchorChild: Person | undefined
    let childMember: Person | undefined
    let connectionType: ChildConnectionType = 'unconnected'
    let connected = false
    let spouseMembers: Person[] = []

    for (const member of resolvedMembers) {
      if (isChildOfParent(member)) {
        anchorChildId = member.id
        anchorChild = member
        childMember = member
        connectionType = 'childDirect'
        connected = true
        spouseMembers = resolvedMembers.filter((candidate) => candidate.id !== member.id)
        break
      }
    }

    if (!anchorChildId) {
      for (const member of resolvedMembers) {
        const spouseId = member.spouseId
        if (!spouseId) continue
        const spouse = resolvePerson(spouseId)
        if (!isChildOfParent(spouse)) continue
        anchorChildId = spouse.id
        anchorChild = spouse
        connectionType = member.divorced || spouse?.divorced ? 'formerOnly' : 'partnerOnly'
        connected = true
        spouseMembers = [member]
        break
      }
    }

    const branchValue = branchSortValue(anchorChild?.branch ?? target.branch)
    const firstSeen = unitFirstSeenIndex.get(target.id) ?? Number.POSITIVE_INFINITY
    const generation = target.generation

    const info: ChildUnitInfo = {
      id: childUnitId,
      unit: target,
      anchorChildId,
      anchorChild,
      childMember,
      connectionType,
      connectionRank: CONNECTION_RANK[connectionType],
      connected,
      branchValue,
      firstSeen,
      generation,
      spouseMembers,
    }

    infoCache.set(childUnitId, info)
    return info
  }

  unit.childIds = Array.from(new Set(unit.childIds))
  unit.childIds.sort((leftId, rightId) => {
    const leftInfo = getUnitInfo(leftId)
    const rightInfo = getUnitInfo(rightId)

    if (leftInfo.anchorChildId && rightInfo.anchorChildId) {
      if (leftInfo.anchorChildId !== rightInfo.anchorChildId) {
        const leftChild = leftInfo.anchorChild
        const rightChild = rightInfo.anchorChild
        if (leftChild && rightChild) {
          const childSeniority = compareBySeniority(leftChild, rightChild)
          if (childSeniority !== 0) {
            return childSeniority
          }
        }

        const leftChildBranch = branchSortValue(leftInfo.anchorChild?.branch)
        const rightChildBranch = branchSortValue(rightInfo.anchorChild?.branch)
        if (leftChildBranch !== rightChildBranch) {
          return leftChildBranch - rightChildBranch
        }

        return safeNumericId(leftInfo.anchorChildId) - safeNumericId(rightInfo.anchorChildId)
      }

      if (leftInfo.connectionRank !== rightInfo.connectionRank) {
        return leftInfo.connectionRank - rightInfo.connectionRank
      }
    }

    if (leftInfo.connected !== rightInfo.connected) {
      return leftInfo.connected ? -1 : 1
    }

    if (leftInfo.branchValue !== rightInfo.branchValue) {
      return leftInfo.branchValue - rightInfo.branchValue
    }

    if (leftInfo.generation !== rightInfo.generation) {
      return leftInfo.generation - rightInfo.generation
    }

    if (leftInfo.firstSeen !== rightInfo.firstSeen) {
      return leftInfo.firstSeen - rightInfo.firstSeen
    }

    const leftPrimaryId = leftInfo.anchorChildId ?? leftInfo.unit?.memberIds[0]
    const rightPrimaryId = rightInfo.anchorChildId ?? rightInfo.unit?.memberIds[0]
    const leftNumeric = safeNumericId(leftPrimaryId)
    const rightNumeric = safeNumericId(rightPrimaryId)
    if (leftNumeric !== rightNumeric) {
      return leftNumeric - rightNumeric
    }

    const leftUnitId = leftInfo.unit?.id ?? leftInfo.id
    const rightUnitId = rightInfo.unit?.id ?? rightInfo.id
    if (leftUnitId !== rightUnitId) {
      return leftUnitId.localeCompare(rightUnitId)
    }

    return leftId.localeCompare(rightId)
  })

  const anchorGroups = new Map<string, ChildUnitInfo[]>()
  for (const childId of unit.childIds) {
    const info = getUnitInfo(childId)
    if (!info.anchorChildId) continue
    let group = anchorGroups.get(info.anchorChildId)
    if (!group) {
      group = []
      anchorGroups.set(info.anchorChildId, group)
    }
    group.push(info)
  }

  const reorderUnitMembers = (target: FamilyUnit, childId: string, orientation: 'left' | 'right') => {
    const childIndex = target.memberIds.findIndex((memberId) => memberId === childId)
    if (childIndex === -1) return
    const childMember = target.members[childIndex]
    const otherMembers: Person[] = target.members.filter((_, index) => index !== childIndex)
    const otherIds = target.memberIds.filter((memberId) => memberId !== childId)

    if (orientation === 'left') {
      target.members = [childMember, ...otherMembers]
      target.memberIds = [childId, ...otherIds]
    } else {
      target.members = [...otherMembers, childMember]
      target.memberIds = [...otherIds, childId]
    }
  }

  for (const group of anchorGroups.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const info = group[index]
      if (!info.unit || !info.anchorChildId) {
        continue
      }
      if (info.connectionType !== 'childDirect') {
        continue
      }

      const hasFormerBefore = group.slice(0, index).some((entry) => entry.connectionType === 'formerOnly')
      const hasFormerAfter = group.slice(index + 1).some((entry) => entry.connectionType === 'formerOnly')

      if (hasFormerBefore && !hasFormerAfter) {
        reorderUnitMembers(info.unit, info.anchorChildId, 'left')
      } else if (hasFormerAfter && !hasFormerBefore) {
        reorderUnitMembers(info.unit, info.anchorChildId, 'right')
      }
    }
  }
}

const incrementNestedCounter = (store: Map<string, Map<string, number>>, source: string, target: string) => {
  let entry = store.get(source)
  if (!entry) {
    entry = new Map<string, number>()
    store.set(source, entry)
  }
  entry.set(target, (entry.get(target) ?? 0) + 1)
}

const attachUnitToParent = (
  unit: FamilyUnit,
  parentId: string,
  units: Map<string, FamilyUnit>,
) => {
  const parentUnit = units.get(parentId)
  if (!parentUnit) return

  if (unit.parentId && unit.parentId !== parentId) {
    const previousParent = units.get(unit.parentId)
    if (previousParent) {
      previousParent.childIds = previousParent.childIds.filter((childId) => childId !== unit.id)
    }
  }

  unit.parentId = parentId
  if (!parentUnit.childIds.includes(unit.id)) {
    parentUnit.childIds.push(unit.id)
  }
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
  const personRowIndex = new Map<string, number>()

  rows.forEach((raw, index) => {
    const person = toPerson(raw)
    if (!person) {
      return
    }
    people.push(person)
    peopleById[person.id] = person
    personRowIndex.set(person.id, index)
  })

  assignNameSuffixes(people)

  const branchOrder = new Map<string, number>()
  for (const person of people) {
    const normalized = normalizeBranchName(person.branch)
    if (!branchOrder.has(normalized)) {
      branchOrder.set(normalized, branchOrder.size)
    }
  }

  const branchSortValue = (branch?: string): number => {
    const normalized = normalizeBranchName(branch)
    if (normalized === 'other') return BRANCH_ORDER_FALLBACK + 2
    if (normalized === 'unknown') return BRANCH_ORDER_FALLBACK + 1
    const index = branchOrder.get(normalized)
    return index ?? BRANCH_ORDER_FALLBACK
  }

  const units = new Map<string, FamilyUnit>()
  const personToUnit = new Map<string, string>()
  const unitFirstSeenIndex = new Map<string, number>()

  for (const person of people) {
    const unit = ensureUnit(person, units, personToUnit, personRowIndex, unitFirstSeenIndex)
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

    const parentUnitId = getParentUnitId(person, personToUnit, units, peopleById, unitId)
    if (!parentUnitId) continue
    if (parentUnitId === unitId) continue

    const parentUnit = units.get(parentUnitId)
    if (!parentUnit) continue

    if (!unit.parentId) {
      unit.parentId = parentUnitId
    }

    parentUnit.childIds.push(unitId)
  }

  const coParentCounts = new Map<string, Map<string, number>>()
  for (const person of people) {
    const motherUnitId = person.motherId ? personToUnit.get(person.motherId) : undefined
    const fatherUnitId = person.fatherId ? personToUnit.get(person.fatherId) : undefined
    if (!motherUnitId || !fatherUnitId || motherUnitId === fatherUnitId) continue

    incrementNestedCounter(coParentCounts, motherUnitId, fatherUnitId)
    incrementNestedCounter(coParentCounts, fatherUnitId, motherUnitId)
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

    attachUnitToParent(unit, bestParentId, units)
  }

  for (const unit of units.values()) {
    if (unit.parentId) continue

    const coParents = coParentCounts.get(unit.id)
    if (!coParents || coParents.size === 0) continue

    const ranked = Array.from(coParents.entries())
      .map(([candidateId, weight]) => {
        const candidateUnit = units.get(candidateId)
        return {
          candidateId,
          weight,
          candidateUnit,
        }
      })
      .filter((entry) => entry.candidateUnit)
      .sort((left, right) => {
        if (right.weight !== left.weight) {
          return right.weight - left.weight
        }

        const rightChildren = right.candidateUnit?.childIds.length ?? 0
        const leftChildren = left.candidateUnit?.childIds.length ?? 0
        if (rightChildren !== leftChildren) {
          return rightChildren - leftChildren
        }

        return left.candidateId.localeCompare(right.candidateId)
      })

    const bestCoParent = ranked[0]
    if (!bestCoParent) continue

    const parentFromCoParent = bestCoParent.candidateUnit?.parentId
    if (!parentFromCoParent || parentFromCoParent === unit.id) continue

    attachUnitToParent(unit, parentFromCoParent, units)
  }

  const unitsById: Record<string, FamilyUnit> = {}
  const unitList: FamilyUnit[] = []

  for (const unit of units.values()) {
    finalizeUnit(unit, units, branchOrder, unitFirstSeenIndex, peopleById)
    unitsById[unit.id] = unit
    unitList.push(unit)
  }

  unitList.sort((a, b) => {
    const leftBranchOrder = branchSortValue(a.branch)
    const rightBranchOrder = branchSortValue(b.branch)
    if (leftBranchOrder !== rightBranchOrder) {
      return leftBranchOrder - rightBranchOrder
    }

    const leftFirstSeen = unitFirstSeenIndex.get(a.id) ?? Number.POSITIVE_INFINITY
    const rightFirstSeen = unitFirstSeenIndex.get(b.id) ?? Number.POSITIVE_INFINITY
    if (leftFirstSeen !== rightFirstSeen) {
      return leftFirstSeen - rightFirstSeen
    }

    if (a.generation !== b.generation) {
      return a.generation - b.generation
    }

    const leftPrimary = a.memberIds[0]
    const rightPrimary = b.memberIds[0]
    const leftNumeric = safeNumericId(leftPrimary)
    const rightNumeric = safeNumericId(rightPrimary)
    if (leftNumeric !== rightNumeric) {
      return leftNumeric - rightNumeric
    }

    return a.id.localeCompare(b.id)
  })

  const compareUnitsByBranch = (left: FamilyUnit, right: FamilyUnit): number => {
    const leftBranchOrder = branchSortValue(left.branch)
    const rightBranchOrder = branchSortValue(right.branch)
    if (leftBranchOrder !== rightBranchOrder) {
      return leftBranchOrder - rightBranchOrder
    }

    const leftFirstSeen = unitFirstSeenIndex.get(left.id) ?? Number.POSITIVE_INFINITY
    const rightFirstSeen = unitFirstSeenIndex.get(right.id) ?? Number.POSITIVE_INFINITY
    if (leftFirstSeen !== rightFirstSeen) {
      return leftFirstSeen - rightFirstSeen
    }

    if (left.generation !== right.generation) {
      return left.generation - right.generation
    }

    const leftPrimary = left.memberIds[0]
    const rightPrimary = right.memberIds[0]
    const leftNumeric = safeNumericId(leftPrimary)
    const rightNumeric = safeNumericId(rightPrimary)
    if (leftNumeric !== rightNumeric) {
      return leftNumeric - rightNumeric
    }

    return left.id.localeCompare(right.id)
  }

  const roots = unitList.filter((unit) => !unit.parentId)
  roots.sort(compareUnitsByBranch)

  return {
    people,
    units: unitList,
    roots,
    peopleById,
    unitsById,
    personToUnitId: Object.fromEntries(personToUnit.entries()),
  }
}

