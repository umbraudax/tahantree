import type { FamilyGraph, Person } from '../types/family'

const ORDINAL_WORDS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  5: 'fifth',
  6: 'sixth',
  7: 'seventh',
  8: 'eighth',
  9: 'ninth',
  10: 'tenth',
  11: 'eleventh',
  12: 'twelfth',
}

const ordinalWord = (value: number): string => {
  if (ORDINAL_WORDS[value]) return ORDINAL_WORDS[value]

  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`
  }

  const mod10 = value % 10
  switch (mod10) {
    case 1:
      return `${value}st`
    case 2:
      return `${value}nd`
    case 3:
      return `${value}rd`
    default:
      return `${value}th`
  }
}

const formatRemoval = (removal: number): string => {
  if (removal === 1) return 'once removed'
  if (removal === 2) return 'twice removed'
  return `${removal} times removed`
}

const buildChildrenMap = (graph: FamilyGraph): Record<string, string[]> => {
  const map: Record<string, string[]> = {}

  for (const person of graph.people) {
    if (person.fatherId && graph.peopleById[person.fatherId]) {
      if (!map[person.fatherId]) map[person.fatherId] = []
      map[person.fatherId].push(person.id)
    }
    if (person.motherId && graph.peopleById[person.motherId]) {
      if (!map[person.motherId]) map[person.motherId] = []
      map[person.motherId].push(person.id)
    }
  }

  return map
}

const collectParents = (graph: FamilyGraph, personId: string): string[] => {
  const person = graph.peopleById[personId]
  if (!person) return []
  const parents: string[] = []
  if (person.motherId && graph.peopleById[person.motherId]) parents.push(person.motherId)
  if (person.fatherId && graph.peopleById[person.fatherId]) parents.push(person.fatherId)
  return parents
}

type SiblingType = 'full' | 'half'

const determineSiblingType = (graph: FamilyGraph, aId: string, bId: string): SiblingType | null => {
  const parentsA = collectParents(graph, aId)
  if (parentsA.length === 0) return null

  const parentsB = collectParents(graph, bId)
  if (parentsB.length === 0) return null

  const parentsBSet = new Set(parentsB)
  let sharedCount = 0
  for (const parentId of parentsA) {
    if (parentsBSet.has(parentId)) {
      sharedCount += 1
    }
  }

  if (sharedCount === 0) return null

  return sharedCount >= 2 ? 'full' : 'half'
}

const isParentOf = (graph: FamilyGraph, parentId: string, childId: string): boolean => {
  const child = graph.peopleById[childId]
  if (!child) return false
  return child.motherId === parentId || child.fatherId === parentId
}

const getAncestors = (graph: FamilyGraph, personId: string): Map<string, number> => {
  const map = new Map<string, number>()
  const queue: Array<{ id: string; depth: number }> = [{ id: personId, depth: 0 }]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current.id)) continue
    visited.add(current.id)

    if (current.depth > 0) {
      map.set(current.id, current.depth)
    }

    const parents = collectParents(graph, current.id)
    for (const parentId of parents) {
      queue.push({ id: parentId, depth: current.depth + 1 })
    }
  }

  return map
}

const shareParent = (graph: FamilyGraph, aId: string, bId: string): boolean => determineSiblingType(graph, aId, bId) !== null

const getSiblingsOf = (
  graph: FamilyGraph,
  childrenByParentId: Record<string, string[]>,
  personId: string,
): Set<string> => {
  const siblings = new Set<string>()
  const parentIds = collectParents(graph, personId)
  for (const parentId of parentIds) {
    const children = childrenByParentId[parentId] ?? []
    for (const childId of children) {
      if (childId !== personId) siblings.add(childId)
    }
  }
  return siblings
}

const findCollateralDepth = (
  graph: FamilyGraph,
  childrenByParentId: Record<string, string[]>,
  candidateId: string,
  ancestorMap: Map<string, number>,
): number | null => {
  const orderedAncestors = Array.from(ancestorMap.entries()).sort((a, b) => a[1] - b[1])
  for (const [ancestorId, depth] of orderedAncestors) {
    const siblings = getSiblingsOf(graph, childrenByParentId, ancestorId)
    if (siblings.has(candidateId)) {
      return depth
    }
  }
  return null
}

const sexWord = (sex: Person['sex'], maleWord: string, femaleWord: string, neutralWord: string): string => {
  if (sex === 'male') return maleWord
  if (sex === 'female') return femaleWord
  return neutralWord
}

const formatAncestorTitle = (person: Person, depth: number): string => {
  if (depth <= 0) return 'relative'
  if (depth === 1) {
    return sexWord(person.sex, 'father', 'mother', 'parent')
  }
  const prefix = depth === 2 ? 'grand' : `${'great-'.repeat(depth - 2)}grand`
  return sexWord(person.sex, `${prefix}father`, `${prefix}mother`, `${prefix}parent`)
}

const formatDescendantTitle = (person: Person, depth: number): string => {
  if (depth <= 0) return 'relative'
  if (depth === 1) {
    return sexWord(person.sex, 'son', 'daughter', 'child')
  }
  const prefix = depth === 2 ? 'grand' : `${'great-'.repeat(depth - 2)}grand`
  return sexWord(person.sex, `${prefix}son`, `${prefix}daughter`, `${prefix}child`)
}

const formatAuntUncleTitle = (person: Person, depth: number): string => {
  if (depth <= 1) {
    return sexWord(person.sex, 'uncle', 'aunt', 'aunt/uncle')
  }
  const prefix = 'great-'.repeat(depth - 1)
  return sexWord(person.sex, `${prefix}uncle`, `${prefix}aunt`, `${prefix}aunt/uncle`)
}

const formatNieceNephewTitle = (person: Person, depth: number): string => {
  if (depth <= 1) {
    return sexWord(person.sex, 'nephew', 'niece', 'niece/nephew')
  }
  const prefix = 'great-'.repeat(depth - 1)
  return sexWord(person.sex, `${prefix}nephew`, `${prefix}niece`, `${prefix}niece/nephew`)
}

const formatSpouseTitle = (person: Person): string => sexWord(person.sex, 'husband', 'wife', 'spouse')

const formatSiblingTitle = (person: Person, siblingType: SiblingType = 'full'): string => {
  const baseTitle = sexWord(person.sex, 'brother', 'sister', 'sibling')
  if (siblingType === 'half') {
    return `half-${baseTitle}`
  }
  return baseTitle
}

const formatParentInLawTitle = (person: Person): string =>
  sexWord(person.sex, 'father-in-law', 'mother-in-law', 'parent-in-law')

const formatChildInLawTitle = (person: Person): string =>
  sexWord(person.sex, 'son-in-law', 'daughter-in-law', 'child-in-law')

const formatSiblingInLawTitle = (person: Person): string =>
  sexWord(person.sex, 'brother-in-law', 'sister-in-law', 'sibling-in-law')

export const describeRelationship = (
  graph: FamilyGraph,
  fromId: string,
  toId: string,
): string => {
  if (fromId === toId) return 'the same person'

  const fromPerson = graph.peopleById[fromId]
  const toPerson = graph.peopleById[toId]
  if (!fromPerson || !toPerson) return 'not related'

  const areSpouses = fromPerson.spouseId === toPerson.id || toPerson.spouseId === fromPerson.id
  if (areSpouses) {
    const title = formatSpouseTitle(fromPerson)
    if (fromPerson.divorced || toPerson.divorced) {
      return `former ${title}`
    }
    return title
  }

  const childrenByParentId = buildChildrenMap(graph)
  const ancestorsOfTo = getAncestors(graph, toId)

  if (ancestorsOfTo.has(fromId)) {
    const depth = ancestorsOfTo.get(fromId)!
    return formatAncestorTitle(fromPerson, depth)
  }

  const ancestorsOfFrom = getAncestors(graph, fromId)
  if (ancestorsOfFrom.has(toId)) {
    const depth = ancestorsOfFrom.get(toId)!
    return formatDescendantTitle(fromPerson, depth)
  }

  const siblingType = determineSiblingType(graph, fromId, toId)
  if (siblingType) {
    return formatSiblingTitle(fromPerson, siblingType)
  }

  const auntUncleDepth = findCollateralDepth(graph, childrenByParentId, fromId, ancestorsOfTo)
  if (auntUncleDepth !== null) {
    return formatAuntUncleTitle(fromPerson, auntUncleDepth)
  }

  if (fromPerson.spouseId) {
    const spouse = graph.peopleById[fromPerson.spouseId]
    if (spouse) {
      const spouseAuntUncleDepth = findCollateralDepth(graph, childrenByParentId, spouse.id, ancestorsOfTo)
      if (spouseAuntUncleDepth !== null) {
        return formatAuntUncleTitle(fromPerson, spouseAuntUncleDepth)
      }
    }
  }

  const nieceNephewDepth = findCollateralDepth(graph, childrenByParentId, toId, ancestorsOfFrom)
  if (nieceNephewDepth !== null) {
    return formatNieceNephewTitle(fromPerson, nieceNephewDepth)
  }

  if (toPerson.spouseId) {
    const spouse = graph.peopleById[toPerson.spouseId]
    if (spouse) {
      const spouseNieceNephewDepth = findCollateralDepth(graph, childrenByParentId, spouse.id, ancestorsOfFrom)
      if (spouseNieceNephewDepth !== null) {
        return formatNieceNephewTitle(fromPerson, spouseNieceNephewDepth)
      }
    }
  }

  const sharedAncestors: Array<{ depthA: number; depthB: number }> = []
  for (const [ancestorId, depthA] of ancestorsOfFrom.entries()) {
    const depthB = ancestorsOfTo.get(ancestorId)
    if (depthB !== undefined) {
      sharedAncestors.push({ depthA, depthB })
    }
  }

  if (sharedAncestors.length > 0) {
    sharedAncestors.sort((a, b) => {
      const totalA = a.depthA + a.depthB
      const totalB = b.depthA + b.depthB
      if (totalA === totalB) {
        return Math.min(a.depthA, a.depthB) - Math.min(b.depthA, b.depthB)
      }
      return totalA - totalB
    })

    const closest = sharedAncestors[0]
    const cousinDegree = Math.min(closest.depthA, closest.depthB) - 1
    const removal = Math.abs(closest.depthA - closest.depthB)

    if (cousinDegree > 0) {
      const base = `${ordinalWord(cousinDegree)} cousin`
      if (removal === 0) return base
      return `${base} ${formatRemoval(removal)}`
    }
  }

  const toSpouse = toPerson.spouseId ? graph.peopleById[toPerson.spouseId] : undefined
  const fromSpouse = fromPerson.spouseId ? graph.peopleById[fromPerson.spouseId] : undefined

  if (toSpouse && isParentOf(graph, fromId, toSpouse.id)) {
    return formatParentInLawTitle(fromPerson)
  }

  const toChildren = childrenByParentId[toId] ?? []
  for (const childId of toChildren) {
    const child = graph.peopleById[childId]
    if (child?.spouseId === fromId) {
      return formatChildInLawTitle(fromPerson)
    }
  }

  if (fromSpouse && isParentOf(graph, toId, fromSpouse.id)) {
    return formatChildInLawTitle(fromPerson)
  }

  const fromChildren = childrenByParentId[fromId] ?? []
  for (const childId of fromChildren) {
    const child = graph.peopleById[childId]
    if (child?.spouseId === toId) {
      return formatParentInLawTitle(fromPerson)
    }
  }

  if (toSpouse && shareParent(graph, fromId, toSpouse.id)) {
    return formatSiblingInLawTitle(fromPerson)
  }

  if (fromSpouse && shareParent(graph, toId, fromSpouse.id)) {
    return formatSiblingInLawTitle(fromPerson)
  }

  const toSiblings = getSiblingsOf(graph, childrenByParentId, toId)
  for (const siblingId of toSiblings) {
    const sibling = graph.peopleById[siblingId]
    if (sibling?.spouseId === fromId) {
      return formatSiblingInLawTitle(fromPerson)
    }
  }

  if (fromSpouse) {
    const fromSpouseSiblings = getSiblingsOf(graph, childrenByParentId, fromSpouse.id)
    if (fromSpouseSiblings.has(toId)) {
      return formatSiblingInLawTitle(fromPerson)
    }
  }

  return 'distant relative'
}

export default describeRelationship

