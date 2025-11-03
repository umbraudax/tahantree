import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom'

import {
  computeUnitDimensions,
  CORNER_RADIUS,
  GROUP_PADDING,
  PERSON_GAP,
  PERSON_HEIGHT,
  PERSON_WIDTH,
  SPOUSE_GAP_EXTRA,
} from '../constants/layout'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useFamilyLayout } from '../hooks/useFamilyLayout'
import type { FamilyGraph, FamilyUnit, Person } from '../types/family'
import { getBranchColor, withAlpha } from '../utils/colors'
import { describeRelationship } from '../utils/relationships'
const slugifyBranch = (branch: string) => branch.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const MIN_SCALE = 0.35
const MAX_SCALE = 2.5
const SPOUSE_LINK_PADDING = 12
const SPOUSE_COLOR_MARRIED = '#d16bf6'
const SPOUSE_COLOR_DIVORCED = '#ff4d6d'
const SPOUSE_DASHARRAY_DIVORCED = '10 6'

interface Point {
  x: number
  y: number
}

interface UnitLayoutSegment {
  person: Person
  x: number
  y: number
  width: number
  height: number
  expanded: boolean
}

interface UnitLayoutBox {
  width: number
  height: number
  segments: UnitLayoutSegment[]
}

interface PersonGeometry {
  person: Person
  unit: FamilyUnit
  width: number
  height: number
  center: Point
  bounds: { left: number; top: number; right: number; bottom: number }
}

interface FamilyTreeCanvasProps {
  graph: FamilyGraph
}

const computeUnitLayout = (unit: FamilyUnit, expanded: Set<string>): UnitLayoutBox => {
  const hasSpouseBond = Boolean(unit.spouseBond)
  const { width, height } = computeUnitDimensions(unit.members.length, hasSpouseBond)
  const horizontalGap = hasSpouseBond ? PERSON_GAP + SPOUSE_GAP_EXTRA : PERSON_GAP

  const segments: UnitLayoutSegment[] = []
  let currentX = GROUP_PADDING

  for (const person of unit.members) {
    const expandedState = expanded.has(person.id)
    segments.push({
      person,
      x: currentX,
      y: GROUP_PADDING,
      width: PERSON_WIDTH,
      height: PERSON_HEIGHT,
      expanded: expandedState,
    })
    currentX += PERSON_WIDTH + horizontalGap
  }

  if (unit.members.length === 0) {
    segments.push({
      person: {
        id: `${unit.id}-placeholder`,
        numericId: Number.NaN,
        firstName: 'Unknown',
        lastName: '',
        fullName: 'Unknown',
        sex: 'unknown',
        generation: unit.generation,
        divorced: false,
        branch: unit.branch,
      },
      x: GROUP_PADDING,
      y: GROUP_PADDING,
      width: PERSON_WIDTH,
      height: PERSON_HEIGHT,
      expanded: false,
    })
  }

  return { width, height, segments }
}

const formatLifeSpan = (person: Person): string | null => {
  const dob = person.dob ?? ''
  const dod = person.dod ?? ''
  if (!dob && !dod) return null
  if (dob && dod) return `${dob} — ${dod}`
  return dob ? `Born ${dob}` : `Died ${dod}`
}

const getSexLabel = (sex: Person['sex']): string => {
  switch (sex) {
    case 'male':
      return 'Male'
    case 'female':
      return 'Female'
    default:
      return 'Unknown'
  }
}

export const FamilyTreeCanvas = ({ graph }: FamilyTreeCanvasProps) => {
  const { isMobile, isTablet } = useBreakpoint()
  const layoutDensity = isMobile ? 'compact' : isTablet ? 'cozy' : 'default'
  const layout = useFamilyLayout(graph, { density: layoutDensity })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const innerRef = useRef<SVGGElement | null>(null)
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const zoomBehaviorRef = useRef<ReturnType<typeof zoom<SVGSVGElement, unknown>> | null>(null)
  const initialTransformRef = useRef<ZoomTransform>(zoomIdentity)
  const hasInitializedTransform = useRef(false)
  const touchExpandedRef = useRef<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [searchValue, setSearchValue] = useState('')
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState<'none' | 'selectA' | 'selectB'>('none')
  const [nodeAId, setNodeAId] = useState<string | null>(null)
  const [nodeBId, setNodeBId] = useState<string | null>(null)
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null)
  const [isControlSheetOpen, setControlSheetOpen] = useState(false)
  const [isLegendOpen, setLegendOpen] = useState(!isMobile)
  const [searchAssignTarget, setSearchAssignTarget] = useState<'A' | 'B' | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchResultsRef = useRef<HTMLDivElement | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)

  useEffect(() => {
    if (isMobile) {
      setControlSheetOpen(false)
      setLegendOpen(false)
    } else {
      setLegendOpen(true)
    }
    setSearchAssignTarget(null)
  }, [isMobile])

  useEffect(() => {
    if (!isMobile) {
      setControlSheetOpen(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (isMobile) {
      setLegendOpen(false)
    } else {
      setLegendOpen((current) => (current ? current : true))
    }
  }, [isMobile])

  const searchMatches = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    if (!query) return []
    return graph.people
      .filter((person) => person.fullName.toLowerCase().includes(query))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, 12)
  }, [graph.people, searchValue])


  const childrenByParentId = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}

    for (const person of graph.people) {
      if (person.fatherId) {
        if (!map[person.fatherId]) {
          map[person.fatherId] = []
        }
        map[person.fatherId].push(person.id)
      }
      if (person.motherId) {
        if (!map[person.motherId]) {
          map[person.motherId] = []
        }
        map[person.motherId].push(person.id)
      }
    }

    return map
  }, [graph.people])

  const collapsePerson = useCallback((personId: string) => {
    setExpanded((previous) => {
      if (!previous.has(personId)) return previous
      const next = new Set(previous)
      next.delete(personId)
      return next
    })
  }, [])

  const collapseAllDetails = useCallback(() => {
    setExpanded(() => new Set())
    touchExpandedRef.current = null
  }, [])

  const personGeometries = useMemo<Record<string, PersonGeometry>>(() => {
    if (!layout) return {}
    const map: Record<string, PersonGeometry> = {}

    for (const { unit, position } of layout.nodes) {
      const layoutBox = computeUnitLayout(unit, expanded)
      const unitCenter = { x: position.x, y: position.y }
      const left = unitCenter.x - layoutBox.width / 2
      const top = unitCenter.y - layoutBox.height / 2

      for (const segment of layoutBox.segments) {
        const personRecord = graph.peopleById[segment.person.id]
        if (!personRecord) continue
        const center = {
          x: left + segment.x + segment.width / 2,
          y: top + segment.y + segment.height / 2,
        }
        const bounds = {
          left: center.x - segment.width / 2,
          top: center.y - segment.height / 2,
          right: center.x + segment.width / 2,
          bottom: center.y + segment.height / 2,
        }

        map[segment.person.id] = {
          person: personRecord,
          unit,
          width: segment.width,
          height: segment.height,
          center,
          bounds,
        }
      }
    }

    return map
  }, [layout, expanded, graph])
  const contentBounds = useMemo(() => {
    const allGeometries = Object.values(personGeometries)
    if (allGeometries.length === 0) return null

    let minLeft = Number.POSITIVE_INFINITY
    let maxRight = Number.NEGATIVE_INFINITY
    let minTop = Number.POSITIVE_INFINITY
    let maxBottom = Number.NEGATIVE_INFINITY

    for (const { bounds } of allGeometries) {
      if (bounds.left < minLeft) minLeft = bounds.left
      if (bounds.right > maxRight) maxRight = bounds.right
      if (bounds.top < minTop) minTop = bounds.top
      if (bounds.bottom > maxBottom) maxBottom = bounds.bottom
    }

    return {
      minLeft,
      maxRight,
      minTop,
      maxBottom,
      width: maxRight - minLeft,
      height: maxBottom - minTop,
    }
  }, [personGeometries])

  useEffect(() => {
    if (!svgRef.current || !innerRef.current || !layout || !contentBounds) return

    const svgElement = svgRef.current
    const svgSelection = select(svgElement)
    svgSelection.on('.zoom', null)

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_SCALE, MAX_SCALE])
      .on('zoom', (event: { transform: ZoomTransform }) => {
        transformRef.current = event.transform
        innerRef.current?.setAttribute('transform', event.transform.toString())
      })

    zoomBehaviorRef.current = zoomBehavior
    svgSelection.call(zoomBehavior as never)
    svgSelection.on('dblclick.zoom', null)

    const computeInitialTransform = (): ZoomTransform => {
      const rect = svgElement.getBoundingClientRect()
      const viewWidth = rect.width || window.innerWidth
      const viewHeight = rect.height || window.innerHeight
      const contentWidth = Math.max(contentBounds.width, 1)
      const contentHeight = Math.max(contentBounds.height, 1)

      const topMargin = Math.min(64, viewHeight * 0.06)
      const bottomMargin = Math.min(56, viewHeight * 0.05)
      const availableHeight = Math.max(viewHeight - topMargin - bottomMargin, 1)
      const heightScale = availableHeight / contentHeight

      const clampedScale = Math.min(Math.max(heightScale, MIN_SCALE), MAX_SCALE)

      const scaledWidth = contentWidth * clampedScale
      const translateX = (viewWidth - scaledWidth) / 2 - contentBounds.minLeft * clampedScale
      const translateY = topMargin - contentBounds.minTop * clampedScale

      return zoomIdentity.translate(translateX, translateY).scale(clampedScale)
    }

    if (!hasInitializedTransform.current) {
      const initialTransform = computeInitialTransform()
      transformRef.current = initialTransform
      initialTransformRef.current = initialTransform
      innerRef.current.setAttribute('transform', initialTransform.toString())
      svgSelection.call(zoomBehavior.transform as never, initialTransform)
      hasInitializedTransform.current = true
    } else {
      innerRef.current.setAttribute('transform', transformRef.current.toString())
    }

    return () => {
      svgSelection.on('.zoom', null)
    }
  }, [layout, contentBounds])

  const branchList = useMemo(() => {
    const branches = new Set<string>()
    for (const unit of graph.units) {
      branches.add(unit.branch)
    }
    return Array.from(branches)
  }, [graph.units])

  const highlightSourceId = hoveredPersonId ?? selectedPersonId

  const highlightContext = useMemo(() => {
    if (!highlightSourceId) return null
    const selected = graph.peopleById[highlightSourceId]
    if (!selected) return null

    const highlightPeople = new Set<string>()

    const maybeAddPerson = (personId: string | undefined) => {
      if (!personId) return
      if (!graph.peopleById[personId]) return
      highlightPeople.add(personId)
    }

    highlightPeople.add(selected.id)
    maybeAddPerson(selected.motherId)
    maybeAddPerson(selected.fatherId)

    const parentIds = [selected.motherId, selected.fatherId].filter((value): value is string => Boolean(value))
    for (const parentId of parentIds) {
      const siblings = childrenByParentId[parentId] ?? []
      for (const siblingId of siblings) {
        if (siblingId === selected.id) continue
        if (!graph.peopleById[siblingId]) continue
        highlightPeople.add(siblingId)
      }
    }

    const childIds = childrenByParentId[selected.id] ?? []
    for (const childId of childIds) {
      if (!graph.peopleById[childId]) continue
      highlightPeople.add(childId)
    }

    const highlightUnits = new Set<string>()
    for (const personId of highlightPeople) {
      const unitId = graph.personToUnitId[personId]
      if (unitId) {
        highlightUnits.add(unitId)
      }
    }

    return { highlightPeople, highlightUnits }
  }, [highlightSourceId, graph.peopleById, graph.personToUnitId, childrenByParentId])

  const highlightActive = Boolean(hoveredPersonId)

  const centerOnPerson = useCallback(
    (personId: string) => {
      const svgElement = svgRef.current
      const zoomBehavior = zoomBehaviorRef.current
      if (!svgElement || !zoomBehavior) return

      const geometry = personGeometries[personId]
      if (!geometry) return

      const rect = svgElement.getBoundingClientRect()
      const currentScale = transformRef.current.k
      const translateX = rect.width / 2 - geometry.center.x * currentScale
      const translateY = rect.height / 2 - geometry.center.y * currentScale
      const nextTransform = zoomIdentity.translate(translateX, translateY).scale(currentScale)

      transformRef.current = nextTransform
      select(svgElement).call(zoomBehavior.transform as never, nextTransform)
    },
    [personGeometries],
  )

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value)
    if (searchFeedback) {
      setSearchFeedback(null)
    }
  }

  const openControlSheet = useCallback(() => {
    setControlSheetOpen(true)
    setSearchAssignTarget(null)
  }, [])

  const closeControlSheet = useCallback(() => {
    setControlSheetOpen(false)
    setSearchFocused(false)
    setSearchAssignTarget(null)
  }, [])

  const beginSelection = useCallback(
    (target: 'selectA' | 'selectB') => {
      setSelectionMode(target)
      setSearchAssignTarget(null)
      if (isMobile) {
        closeControlSheet()
      }
    },
    [closeControlSheet, isMobile],
  )

  const clearSelections = useCallback(() => {
    setNodeAId(null)
    setNodeBId(null)
    setSelectionMode('none')
    setSelectedPersonId(null)
    setSearchAssignTarget(null)
    collapseAllDetails()
  }, [collapseAllDetails])

  const toggleLegend = () => {
    setLegendOpen((current) => !current)
  }

  const assignPersonToRole = useCallback(
    (personId: string, role: 'A' | 'B') => {
      if (role === 'A') {
        setNodeAId(personId)
      } else {
        setNodeBId(personId)
      }
      setSelectionMode('none')
      setSelectedPersonId(personId)
      setSearchAssignTarget(null)
    },
    [],
  )

  const focusSearchInput = useCallback(() => {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  const startSearchAssignment = useCallback(
    (role: 'A' | 'B') => {
      if (!isControlSheetOpen) {
        openControlSheet()
      }
      setSearchAssignTarget(role)
      setSearchFocused(true)
      focusSearchInput()
    },
    [focusSearchInput, isControlSheetOpen, openControlSheet],
  )

  const handleSearchResultSelect = useCallback(
    (person: Person) => {
      setSearchValue(person.fullName)
      setSearchFeedback(null)
      centerOnPerson(person.id)
      setSearchFocused(false)
      searchInputRef.current?.blur()

      if (searchAssignTarget) {
        assignPersonToRole(person.id, searchAssignTarget)
        if (isMobile) {
          closeControlSheet()
        }
      } else {
        setSelectedPersonId(person.id)
      }
    },
    [assignPersonToRole, centerOnPerson, closeControlSheet, isMobile, searchAssignTarget],
  )

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const query = searchValue.trim().toLowerCase()
      if (!query) {
        setSearchFeedback('Enter a name to search.')
        return
      }

      const match = searchMatches[0]
      if (!match) {
        setSearchFeedback(`No match for "${searchValue}".`)
        return
      }

      setSearchValue(match.fullName)
      setSearchFeedback(null)
      centerOnPerson(match.id)
      setSearchFocused(false)
      searchInputRef.current?.blur()

      if (searchAssignTarget) {
        assignPersonToRole(match.id, searchAssignTarget)
        if (isMobile) {
          closeControlSheet()
        }
      } else {
        setSelectedPersonId(match.id)
      }
    },
    [assignPersonToRole, centerOnPerson, closeControlSheet, isMobile, searchAssignTarget, searchMatches, searchValue],
  )

  const handleCanvasBackgroundClick = useCallback(() => {
    setSelectionMode('none')
    setSelectedPersonId(null)
    collapseAllDetails()
    setHoveredPersonId(null)
    setSearchAssignTarget(null)
  }, [collapseAllDetails])

  const handlePersonPointerEnter = useCallback(
    (personId: string, event: React.PointerEvent<SVGGElement>) => {
      if (event.pointerType === 'touch') return
      setHoveredPersonId(personId)
    },
    [setHoveredPersonId],
  )

  const handlePersonPointerLeave = useCallback(
    (personId: string) => {
      if (touchExpandedRef.current === personId) return
      collapsePerson(personId)
      setHoveredPersonId((current) => (current === personId ? null : current))
    },
    [collapsePerson],
  )

  const handlePersonPointerDown = useCallback(
    (personId: string, event: React.PointerEvent<SVGGElement>) => {
      if (event.pointerType !== 'touch') return

      setExpanded(() => {
        const next = new Set<string>()
        next.add(personId)
        return next
      })
      touchExpandedRef.current = personId
    },
    [],
  )

  const relationshipSummary = useMemo(() => {
    if (!nodeAId || !nodeBId) return null
    return {
      fromAToB: describeRelationship(graph, nodeAId, nodeBId),
      fromBToA: describeRelationship(graph, nodeBId, nodeAId),
    }
  }, [graph, nodeAId, nodeBId])

  const personA = nodeAId ? graph.peopleById[nodeAId] ?? null : null
  const personB = nodeBId ? graph.peopleById[nodeBId] ?? null : null
  const isSelectingA = selectionMode === 'selectA'
  const isSelectingB = selectionMode === 'selectB'
  const isSearchAssigningA = searchAssignTarget === 'A'
  const isSearchAssigningB = searchAssignTarget === 'B'
  const personALabel = personA?.fullName ?? '—'
  const personBLabel = personB?.fullName ?? '—'
  const isSelecting = selectionMode !== 'none'
  const selectionMessage =
    selectionMode === 'selectA'
      ? 'Tap a person to set Person A'
      : selectionMode === 'selectB'
      ? 'Tap a person to set Person B'
      : null

  const parentChildLinks = useMemo(() => {
    const links: Array<{
      id: string
      d: string
      parentIds: string[]
      childId: string
    }> = []

    for (const person of graph.people) {
      const childGeometry = personGeometries[person.id]
      if (!childGeometry) continue

      const parentIds = [person.motherId, person.fatherId].filter(
        (value): value is string => Boolean(value && personGeometries[value]),
      )
      if (parentIds.length === 0) continue

      const grouped = new Map<string, { xSum: number; count: number; startY: number; parentIds: Set<string> }>()

      for (const parentId of parentIds) {
        const parentGeometry = personGeometries[parentId]
        if (!parentGeometry) continue

        const groupKey = graph.personToUnitId[parentId] ?? parentId
        let entry = grouped.get(groupKey)
        if (!entry) {
          entry = {
            xSum: 0,
            count: 0,
            startY: Number.NEGATIVE_INFINITY,
            parentIds: new Set<string>(),
          }
          grouped.set(groupKey, entry)
        }

        entry.xSum += parentGeometry.center.x
        entry.count += 1
        entry.startY = Math.max(entry.startY, parentGeometry.bounds.bottom)
        entry.parentIds.add(parentId)
      }

      grouped.forEach((entry, groupKey) => {
        if (entry.count === 0) return

        const startX = entry.xSum / entry.count
        const startY = entry.startY
        const endX = childGeometry.center.x
        const endY = childGeometry.bounds.top
        const verticalDelta = endY - startY
        const controlOffset = Math.max(Math.abs(verticalDelta) / 2, 40)
        const direction = verticalDelta === 0 ? 1 : Math.sign(verticalDelta)
        const controlY = startY + direction * controlOffset
        const d = `M${startX},${startY} C${startX},${controlY} ${endX},${controlY} ${endX},${endY}`

        links.push({
          id: `parent-group-${groupKey}-${person.id}`,
          d,
          parentIds: Array.from(entry.parentIds),
          childId: person.id,
        })
      })
    }

    return links
  }, [graph.people, graph.personToUnitId, personGeometries])

  const spouseLines = useMemo(() => {
    const lines: Array<{
      id: string
      d: string
      x1: number
      y1: number
      x2: number
      y2: number
      color: string
      dasharray?: string
      personId: string
      spouseId: string
    }> = []
    const seen = new Set<string>()

    for (const person of graph.people) {
      const spouseId = person.spouseId
      if (!spouseId) continue

      const pairKey = [person.id, spouseId].sort().join('-')
      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      const personGeometry = personGeometries[person.id]
      const spouseGeometry = personGeometries[spouseId]
      if (!personGeometry || !spouseGeometry) continue

      const unitId = graph.personToUnitId[person.id]
      const unit = unitId ? graph.unitsById[unitId] : undefined
      const spouseBondType = unit?.spouseBond?.type
      const inferredBondType: 'married' | 'divorced' = spouseBondType
        ? spouseBondType
        : person.divorced || graph.peopleById[spouseId]?.divorced
        ? 'divorced'
        : 'married'

      let leftGeometry = personGeometry
      let rightGeometry = spouseGeometry
      if (
        spouseGeometry.center.x < personGeometry.center.x ||
        (spouseGeometry.center.x === personGeometry.center.x && spouseGeometry.center.y < personGeometry.center.y)
      ) {
        leftGeometry = spouseGeometry
        rightGeometry = personGeometry
      }

      const yStart = leftGeometry.center.y
      const yEnd = rightGeometry.center.y
      const availableSpan = rightGeometry.bounds.left - leftGeometry.bounds.right
      const padding = Math.min(SPOUSE_LINK_PADDING, Math.max(availableSpan / 4, 0))
      const xStartCandidate = leftGeometry.bounds.right + padding
      const xEndCandidate = rightGeometry.bounds.left - padding
      const useEdge = Number.isFinite(xStartCandidate) && xStartCandidate < xEndCandidate
      const x1 = useEdge ? xStartCandidate : leftGeometry.center.x
      const x2 = useEdge ? xEndCandidate : rightGeometry.center.x

      const horizontalDistance = Math.max(x2 - x1, 0)
      const verticalDistance = yEnd - yStart
      let path: string

      if (horizontalDistance < 12) {
        const directionY = verticalDistance === 0 ? 1 : Math.sign(verticalDistance)
        const bendMagnitude = Math.max(Math.abs(verticalDistance) * 0.5, 48)
        const midX = (x1 + x2) / 2
        const controlOffsetX = Math.max(Math.min(bendMagnitude * 0.3, 60), 18)
        const controlY1 = yStart + directionY * bendMagnitude
        const controlY2 = yEnd - directionY * bendMagnitude
        path = `M${x1},${yStart} C${midX - controlOffsetX},${controlY1} ${midX + controlOffsetX},${controlY2} ${x2},${yEnd}`
      } else {
        const baseBend = Math.max(Math.min(horizontalDistance * 0.42, 160), 36)
        const bend = Math.min(baseBend, horizontalDistance / 2)
        const influenceY = verticalDistance * 0.25
        const controlX1 = x1 + bend
        const controlX2 = x2 - bend
        const controlY1 = yStart + influenceY
        const controlY2 = yEnd - influenceY
        path = `M${x1},${yStart} C${controlX1},${controlY1} ${controlX2},${controlY2} ${x2},${yEnd}`
      }

      lines.push({
        id: `spouse-${pairKey}`,
        d: path,
        x1,
        y1: yStart,
        x2,
        y2: yEnd,
        color: inferredBondType === 'divorced' ? SPOUSE_COLOR_DIVORCED : SPOUSE_COLOR_MARRIED,
        dasharray: inferredBondType === 'divorced' ? SPOUSE_DASHARRAY_DIVORCED : undefined,
        personId: person.id,
        spouseId,
      })
    }

    return lines
  }, [graph.people, graph.peopleById, graph.personToUnitId, graph.unitsById, personGeometries])

  const handlePersonClick = (
    personId: string,
    event: React.PointerEvent<SVGGElement> | React.MouseEvent<SVGGElement>,
  ) => {
    event.stopPropagation()

    if (selectionMode === 'selectA') {
      assignPersonToRole(personId, 'A')
      return
    }

    if (selectionMode === 'selectB') {
      assignPersonToRole(personId, 'B')
      return
    }

    if (selectedPersonId === personId) {
      setSelectedPersonId(null)
    } else {
      setSelectedPersonId(personId)
    }
  }

  const zoomByFactor = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    select(svgRef.current).call(zoomBehaviorRef.current.scaleBy as never, factor)
  }

  const resetView = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    select(svgRef.current).call(
      zoomBehaviorRef.current.transform as never,
      initialTransformRef.current,
    )
  }

  const trimmedSearchValue = searchValue.trim()
  const showSearchResults = searchFocused && trimmedSearchValue.length > 0

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white">
        No family data available.
      </div>
    )
  }

  return (
    <div
      className={`relative h-full w-full bg-black text-white ${
        isSelecting ? 'ring-2 ring-white/40 ring-offset-4 ring-offset-black' : ''
      }`}
    >
      {selectionMessage && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center pt-4">
          <div className="rounded-full border border-white/30 bg-black/70 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white">
            {selectionMessage}
          </div>
        </div>
      )}
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        style={{ overflow: 'visible' }}
        role="img"
      >
        <defs>
          {branchList.map((branch) => {
            const color = getBranchColor(branch)
            const id = `glow-${slugifyBranch(branch)}`
            return (
              <filter
                key={branch}
                id={id}
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feDropShadow
                  dx="0"
                  dy="0"
                  stdDeviation="10"
                  floodColor={withAlpha(color, 0.5)}
                  floodOpacity="1"
                />
              </filter>
            )
          })}
        </defs>
        <g ref={innerRef}>
          <rect
            x={(contentBounds?.minLeft ?? 0) - 4000}
            y={(contentBounds?.minTop ?? 0) - 4000}
            width={(contentBounds?.width ?? layout?.size.width ?? 0) + 8000}
            height={(contentBounds?.height ?? layout?.size.height ?? 0) + 8000}
            fill="transparent"
            pointerEvents="all"
            onClick={handleCanvasBackgroundClick}
          />
          {parentChildLinks.map((link) => {
            const parentsHighlighted = link.parentIds.some((parentId) =>
              highlightContext?.highlightPeople.has(parentId) ?? false,
            )
            const childHighlighted = highlightContext?.highlightPeople.has(link.childId) ?? false
            const linkHighlighted = highlightActive ? parentsHighlighted && childHighlighted : false
            const strokeOpacity = highlightActive ? (linkHighlighted ? 0.85 : 0.12) : 0.7
            const strokeWidth = linkHighlighted ? 3 : 1.6

            return (
              <path
                key={link.id}
                d={link.d}
                fill="none"
                stroke="#ffffff33"
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
              />
            )
          })}

          {spouseLines.map((line) => {
            const lineHighlighted = highlightActive
              ? (highlightContext?.highlightPeople.has(line.personId) ?? false) &&
                (highlightContext?.highlightPeople.has(line.spouseId) ?? false)
              : false
            const strokeOpacity = highlightActive ? (lineHighlighted ? 0.95 : 0.3) : 0.85

            return (
              <path
                key={line.id}
                d={line.d}
                fill="none"
                stroke={line.color}
                strokeWidth={4}
                strokeOpacity={strokeOpacity}
                strokeDasharray={line.dasharray}
                strokeLinecap="round"
              />
            )
          })}

          {Object.values(personGeometries).map((geometry) => {
            const { person, bounds, width, height, unit } = geometry
            const branchColor = getBranchColor(person.branch)
            const isTouchExpanded = expanded.has(person.id)
            const isHovered = hoveredPersonId === person.id
            const isSelected = selectedPersonId === person.id
            const personHighlighted = highlightContext?.highlightPeople.has(person.id) ?? false
            const personDimmed = highlightActive && !personHighlighted
            const personIsA = nodeAId === person.id
            const personIsB = nodeBId === person.id

            const emphasisState = isTouchExpanded || isSelected
            const hoverEmphasis = isHovered && !emphasisState

            const baseFillAlpha = emphasisState ? 0.38 : hoverEmphasis ? 0.32 : 0.24
            const highlightFillAlpha = emphasisState ? 0.52 : hoverEmphasis ? 0.42 : 0.36
            const fillAlpha = highlightActive
              ? personHighlighted
                ? highlightFillAlpha
                : 0.1
              : baseFillAlpha

            const baseStrokeAlpha = emphasisState ? 0.95 : hoverEmphasis ? 0.82 : 0.7
            const highlightStrokeAlpha = emphasisState ? 1 : hoverEmphasis ? 0.9 : 0.85
            const strokeAlpha = highlightActive
              ? personHighlighted
                ? highlightStrokeAlpha
                : 0.28
              : baseStrokeAlpha

            const baseStrokeWidth = emphasisState ? 2.6 : hoverEmphasis ? 2.2 : 1.9
            const strokeWidth = highlightActive && personHighlighted ? baseStrokeWidth + 0.6 : baseStrokeWidth
            const textOpacity = personDimmed ? 0.35 : 1

            const detailLines: string[] = []
            if (person.dob) detailLines.push(`DOB: ${person.dob}`)
            if (person.dod) detailLines.push(`DOD: ${person.dod}`)

            const parents: string[] = []
            if (person.fatherId) {
              const father = graph.peopleById[person.fatherId]
              if (father) parents.push(father.fullName)
            }
            if (person.motherId) {
              const mother = graph.peopleById[person.motherId]
              if (mother) parents.push(mother.fullName)
            }
            if (parents.length > 0) {
              detailLines.push(`Parents: ${parents.join(' & ')}`)
            }

            if (person.spouseId) {
              const spouse = graph.peopleById[person.spouseId]
              if (spouse) {
                detailLines.push(`${person.divorced ? 'Former spouse' : 'Spouse'}: ${spouse.fullName}`)
              }
            }

            const detailContent = detailLines.length > 0 ? detailLines : ['Details unavailable']
            const showDetailLines = isTouchExpanded || isSelected

            return (
              <g
                key={person.id}
                transform={`translate(${bounds.left}, ${bounds.top})`}
                className="pointer-events-auto cursor-pointer transition-transform"
                onPointerDown={(event) => {
                  handlePersonPointerDown(person.id, event)
                }}
                onClick={(event) => handlePersonClick(person.id, event)}
                onPointerEnter={(event) => {
                  handlePersonPointerEnter(person.id, event)
                }}
                onPointerLeave={() => {
                  handlePersonPointerLeave(person.id)
                }}
                style={{ opacity: personDimmed ? 0.3 : 1 }}
              >
                <rect
                  width={width}
                  height={height}
                  rx={CORNER_RADIUS}
                  fill={withAlpha(branchColor, fillAlpha)}
                  stroke={withAlpha(branchColor, strokeAlpha)}
                  strokeWidth={strokeWidth}
                  filter={`url(#glow-${slugifyBranch(unit.branch)})`}
                />
                <text
                  x={width / 2}
                  y={34}
                  textAnchor="middle"
                  className="fill-white text-[16px] font-semibold tracking-wide"
                  opacity={textOpacity}
                >
                  {person.fullName}
                </text>
                <text
                  x={width / 2}
                  y={52}
                  textAnchor="middle"
                  className="fill-white text-[12px] tracking-wide"
                  opacity={textOpacity}
                >
                  {getSexLabel(person.sex)}
                </text>
                <text
                  x={width / 2}
                  y={72}
                  textAnchor="middle"
                  className="fill-white text-[11px] uppercase tracking-[0.3em]"
                  opacity={textOpacity}
                >
                  {person.branch} · Gen {person.generation}
                </text>
                {(personIsA || personIsB) && (
                  <g transform={`translate(${width - 42}, 12)`}>
                    <rect width={30} height={20} rx={6} fill={withAlpha(branchColor, 0.45)} />
                    <text
                      x={15}
                      y={14}
                      textAnchor="middle"
                      className="fill-white text-[11px] font-semibold"
                    >
                      {personIsA && personIsB ? 'A·B' : personIsA ? 'A' : 'B'}
                    </text>
                  </g>
                )}
                {showDetailLines && (
                  <text
                    x={width / 2}
                    y={height - 60}
                    textAnchor="middle"
                    className="fill-white text-[11px] leading-[14px]"
                    opacity={textOpacity}
                  >
                    {detailContent.map((line, index) => (
                      <tspan key={`${line}-${index}`} x={width / 2} dy={index === 0 ? 0 : 14}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div
        className={`pointer-events-none absolute z-30 ${
          isMobile ? 'left-3 right-3 top-3' : 'left-6 top-6 w-[360px]'
        } flex flex-col gap-3 text-xs text-white`}
      >
        <div className="pointer-events-auto rounded-2xl border border-white/20 bg-black/80 px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.7)] backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black text-lg text-white transition hover:bg-white/10"
                onClick={() => zoomByFactor(0.8)}
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black text-lg text-white transition hover:bg-white/10"
                onClick={() => zoomByFactor(1.2)}
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="rounded-full border border-white/20 bg-black px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-white/10"
              onClick={resetView}
            >
              Reset
            </button>
          </div>

          {isMobile ? (
            <button
              type="button"
              onClick={() => {
                openControlSheet()
                focusSearchInput()
              }}
              className="mt-3 w-full rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20"
            >
              Search &amp; Select
            </button>
          ) : (
            <>
              <form className="mt-3 flex w-full flex-wrap items-start gap-2" onSubmit={handleSearchSubmit}>
                <div className="relative w-full flex-1">
                  <input
                    ref={searchInputRef}
                    type="search"
                    placeholder="Find a person"
                    value={searchValue}
                    onChange={handleSearchChange}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={(event) => {
                      const next = event.relatedTarget as Node | null
                      if (next && searchResultsRef.current?.contains(next)) {
                        return
                      }
                      setSearchFocused(false)
                    }}
                    className="w-full rounded-full border border-white/20 bg-black px-3 py-2 text-xs text-white placeholder-white/50 outline-none transition focus:border-white focus:ring-2 focus:ring-white/40"
                  />
                  {showSearchResults && (
                    <div
                      ref={searchResultsRef}
                      className="pointer-events-auto absolute left-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl border border-white/20 bg-black/95 shadow-[0_16px_40px_rgba(0,0,0,0.65)] backdrop-blur-sm"
                    >
                      {searchMatches.length > 0 ? (
                        <ul className="divide-y divide-white/5">
                          {searchMatches.map((person) => {
                            const life = formatLifeSpan(person)
                            return (
                              <li key={person.id}>
                                <button
                                  type="button"
                                  className="flex w-full flex-col gap-1 px-3 py-2 text-left text-xs text-white transition hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => handleSearchResultSelect(person)}
                                  onFocus={() => setSearchFocused(true)}
                                  onBlur={(event) => {
                                    const next = event.relatedTarget as Node | null
                                    if (
                                      next &&
                                      (next === searchInputRef.current || searchResultsRef.current?.contains(next))
                                    ) {
                                      return
                                    }
                                    setSearchFocused(false)
                                  }}
                                >
                                  <span className="text-sm font-semibold text-white">{person.fullName}</span>
                                  <span className="text-[11px] uppercase tracking-[0.25em] text-white/60">
                                    {person.branch} · Gen {person.generation}
                                  </span>
                                  {life && <span className="text-[11px] text-white/40">{life}</span>}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <div className="px-3 py-2 text-xs text-white/60">No matching people.</div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="rounded-full border border-white/20 bg-black px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/10"
                >
                  Search
                </button>
              </form>
              {searchAssignTarget && !isMobile && (
                <div className="mt-2 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/80">
                  Assigning to Person {searchAssignTarget}
                </div>
              )}
              {searchFeedback && (
                <div className="mt-2 rounded-full border border-white/20 bg-black px-3 py-1 text-[11px] text-white">
                  {searchFeedback}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isLegendOpen && isMobile && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={toggleLegend} />
      )}

      <button
        type="button"
        onClick={toggleLegend}
        className="fixed right-4 top-4 z-50 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10 md:text-[11px]"
        aria-expanded={isLegendOpen}
        aria-controls="branch-legend-panel"
      >
        {isLegendOpen ? 'Hide Legend' : 'Show Legend'}
      </button>

      <div
        id="branch-legend-panel"
        className={`fixed right-4 top-20 z-40 w-[min(260px,80vw)] max-h-[70vh] overflow-y-auto rounded-3xl border border-white/15 bg-black/85 p-4 text-xs text-white shadow-[0_24px_60px_rgba(0,0,0,0.75)] backdrop-blur transition-all duration-300 ${
          isLegendOpen ? 'pointer-events-auto translate-x-0 opacity-100' : 'pointer-events-none translate-x-[120%] opacity-0'
        }`}
      >
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
          Branch legend
        </div>
        <div className="grid gap-2">
          {branchList.map((branch) => (
            <div key={branch} className="flex items-center gap-3 text-white">
              <span
                className="h-3 w-3 rounded-full shadow-[0_0_8px_2px_rgba(244,178,143,0.25)]"
                style={{ background: getBranchColor(branch) }}
              />
              <span className="text-sm font-medium tracking-wide">{branch}</span>
            </div>
          ))}
        </div>
      </div>

      {!isMobile && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex w-full justify-center px-4 text-xs text-white">
          <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-3 rounded-3xl border border-white/15 bg-black/75 px-6 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.75)] backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => beginSelection('selectA')}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition ${
                    isSelectingA
                      ? 'border border-white bg-white/10 text-white'
                      : 'border border-white/20 bg-black text-white hover:bg-white/10'
                  }`}
                >
                  Select A
                </button>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">Person A</span>
                  <span className="text-sm font-semibold text-white">{personALabel}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => beginSelection('selectB')}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] transition ${
                    isSelectingB
                      ? 'border border-white bg-white/10 text-white'
                      : 'border border-white/20 bg-black text-white hover:bg-white/10'
                  }`}
                >
                  Select B
                </button>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">Person B</span>
                  <span className="text-sm font-semibold text-white">{personBLabel}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={clearSelections}
                className="rounded-full border border-white/20 bg-black px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/10"
              >
                Clear A &amp; B
              </button>
            </div>
            {selectionMode !== 'none' && (
              <div className="rounded-2xl border border-white/20 bg-black/70 px-3 py-2 text-center text-[10px] uppercase tracking-[0.3em] text-white">
                {isSelectingA ? 'Click a person to set A' : 'Click a person to set B'}
              </div>
            )}
            {relationshipSummary && personA && personB ? (
              <div className="space-y-1 text-center text-sm">
                <div>
                  {personA.fullName} is {relationshipSummary.fromAToB} of {personB.fullName}
                </div>
                <div>
                  {personB.fullName} is {relationshipSummary.fromBToA} of {personA.fullName}
                </div>
              </div>
            ) : (
              <div className="text-center text-sm text-white/70">Choose two people to see their relationship.</div>
            )}
          </div>
        </div>
      )}

      {isMobile && (
        <>
          <button
            type="button"
            onClick={() => (isControlSheetOpen ? closeControlSheet() : openControlSheet())}
            className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-white/15 text-[10px] font-semibold uppercase tracking-[0.3em] text-white shadow-[0_16px_32px_rgba(0,0,0,0.65)] backdrop-blur transition hover:bg-white/25"
            aria-expanded={isControlSheetOpen}
            aria-controls="mobile-control-sheet"
          >
            {isControlSheetOpen ? 'Close' : 'Tools'}
          </button>

          <div
            className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
              isControlSheetOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onClick={closeControlSheet}
          />

          <div
            id="mobile-control-sheet"
            className={`fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${
              isControlSheetOpen ? 'translate-y-0' : 'translate-y-full'
            }`}
            role="dialog"
            aria-label="Family tree tools"
          >
            <div className="rounded-t-3xl border border-white/20 bg-black/90 px-5 pb-6 pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.7)] backdrop-blur">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />
              <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1 text-xs text-white">
                <form className="flex w-full flex-wrap items-start gap-2" onSubmit={handleSearchSubmit}>
                  <div className="relative w-full flex-1">
                    <input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Find a person"
                      value={searchValue}
                      onChange={handleSearchChange}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={(event) => {
                        const next = event.relatedTarget as Node | null
                        if (next && searchResultsRef.current?.contains(next)) {
                          return
                        }
                        setSearchFocused(false)
                      }}
                      className="w-full rounded-full border border-white/20 bg-black px-3 py-2 text-xs text-white placeholder-white/50 outline-none transition focus:border-white focus:ring-2 focus:ring-white/40"
                    />
                    {showSearchResults && (
                      <div
                        ref={searchResultsRef}
                        className="pointer-events-auto absolute left-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl border border-white/20 bg-black/95 shadow-[0_16px_40px_rgba(0,0,0,0.65)] backdrop-blur-sm"
                      >
                        {searchMatches.length > 0 ? (
                          <ul className="divide-y divide-white/5">
                            {searchMatches.map((person) => {
                              const life = formatLifeSpan(person)
                              return (
                                <li key={person.id}>
                                  <button
                                    type="button"
                                    className="flex w-full flex-col gap-1 px-3 py-2 text-left text-xs text-white transition hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleSearchResultSelect(person)}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={(event) => {
                                      const next = event.relatedTarget as Node | null
                                      if (
                                        next &&
                                        (next === searchInputRef.current || searchResultsRef.current?.contains(next))
                                      ) {
                                        return
                                      }
                                      setSearchFocused(false)
                                    }}
                                  >
                                    <span className="text-sm font-semibold text-white">{person.fullName}</span>
                                    <span className="text-[11px] uppercase tracking-[0.25em] text-white/60">
                                      {person.branch} · Gen {person.generation}
                                    </span>
                                    {life && <span className="text-[11px] text-white/40">{life}</span>}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        ) : (
                          <div className="px-3 py-2 text-xs text-white/60">No matching people.</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="rounded-full border border-white/20 bg-black px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/10"
                  >
                    Search
                  </button>
                </form>
                {searchAssignTarget && (
                  <div className="rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/80">
                    Assigning to Person {searchAssignTarget}
                  </div>
                )}
                {searchFeedback && (
                  <div className="rounded-full border border-white/20 bg-black px-3 py-1 text-[11px] text-white">
                    {searchFeedback}
                  </div>
                )}

                <div className="space-y-3">
                  <div
                    className={`flex items-center justify-between rounded-2xl border px-3 py-3 ${
                      isSelectingA ? 'border-white/50 bg-white/10' : 'border-white/20 bg-black/60'
                    }`}
                  >
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">Person A</div>
                      <div className="mt-1 text-sm font-semibold text-white">{personALabel}</div>
                    </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => beginSelection('selectA')}
                        className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20"
                      >
                        {isSelectingA ? 'Selecting…' : 'Select'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startSearchAssignment('A')}
                        className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                          isSearchAssigningA
                            ? 'border border-white/50 bg-white/10 text-white'
                            : 'border border-white/25 bg-black/40 text-white hover:bg-white/10'
                        }`}
                      >
                        + Search
                      </button>
                    </div>
                  </div>
                  </div>

                  <div
                    className={`flex items-center justify-between rounded-2xl border px-3 py-3 ${
                      isSelectingB ? 'border-white/50 bg-white/10' : 'border-white/20 bg-black/60'
                    }`}
                  >
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">Person B</div>
                      <div className="mt-1 text-sm font-semibold text-white">{personBLabel}</div>
                    </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => beginSelection('selectB')}
                        className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20"
                      >
                        {isSelectingB ? 'Selecting…' : 'Select'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startSearchAssignment('B')}
                        className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                          isSearchAssigningB
                            ? 'border border-white/50 bg-white/10 text-white'
                            : 'border border-white/25 bg-black/40 text-white hover:bg-white/10'
                        }`}
                      >
                        + Search
                      </button>
                    </div>
                  </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={clearSelections}
                  className="w-full rounded-full border border-white/25 bg-transparent px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10"
                >
                  Clear A &amp; B
                </button>

                {selectionMode !== 'none' && (
                  <div className="rounded-2xl border border-white/20 bg-black/70 px-3 py-2 text-center text-[10px] uppercase tracking-[0.3em] text-white">
                    {isSelectingA ? 'Tap a person to set A' : 'Tap a person to set B'}
                  </div>
                )}

                {relationshipSummary && personA && personB ? (
                  <div className="space-y-1 text-center text-sm">
                    <div>
                      {personA.fullName} is {relationshipSummary.fromAToB} of {personB.fullName}
                    </div>
                    <div>
                      {personB.fullName} is {relationshipSummary.fromBToA} of {personA.fullName}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-sm text-white/70">
                    Choose two people to see their relationship.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  )
}

export default FamilyTreeCanvas

