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

interface TooltipState {
  person: Person
  clientX: number
  clientY: number
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

const tooltipLines = (person: Person, graph: FamilyGraph): string[] => {
  const lines = [person.fullName]
  const life = formatLifeSpan(person)
  if (life) lines.push(life)
  lines.push(getSexLabel(person.sex))

  if (person.spouseId) {
    const spouse = graph.peopleById[person.spouseId]
    lines.push(`Spouse: ${spouse ? spouse.fullName : person.spouseId}`)
  }

  lines.push(`Branch: ${person.branch}`)
  return lines
}

export const FamilyTreeCanvas = ({ graph }: FamilyTreeCanvasProps) => {
  const layout = useFamilyLayout(graph)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const innerRef = useRef<SVGGElement | null>(null)
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const zoomBehaviorRef = useRef<ReturnType<typeof zoom<SVGSVGElement, unknown>> | null>(null)
  const initialTransformRef = useRef<ZoomTransform>(zoomIdentity)
  const hasInitializedTransform = useRef(false)
  const touchExpandedRef = useRef<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState<'none' | 'selectA' | 'selectB'>('none')
  const [nodeAId, setNodeAId] = useState<string | null>(null)
  const [nodeBId, setNodeBId] = useState<string | null>(null)
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null)


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


  const expandPerson = useCallback((personId: string) => {
    setExpanded((previous) => {
      if (previous.has(personId)) return previous
      const next = new Set(previous)
      next.add(personId)
      return next
    })
  }, [])

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

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const query = searchValue.trim().toLowerCase()
      if (!query) {
        setSearchFeedback('Enter a name to search.')
        return
      }

      const match = graph.people.find((person) => person.fullName.toLowerCase().includes(query))
      if (!match) {
        setSearchFeedback(`No match for "${searchValue}".`)
        return
      }

      setSearchFeedback(null)
      setSelectedPersonId(match.id)
      centerOnPerson(match.id)
    },
    [centerOnPerson, graph.people, searchValue],
  )

  const beginSelection = useCallback((target: 'selectA' | 'selectB') => {
    setSelectionMode((current) => (current === target ? 'none' : target))
  }, [])

  const clearSelections = useCallback(() => {
    setNodeAId(null)
    setNodeBId(null)
    setSelectionMode('none')
    setSelectedPersonId(null)
    collapseAllDetails()
  }, [collapseAllDetails])

  const handleCanvasBackgroundClick = useCallback(() => {
    setSelectionMode('none')
    setSelectedPersonId(null)
    collapseAllDetails()
    setHoveredPersonId(null)
  }, [collapseAllDetails])

  const handleSelectPersonRole = useCallback((personId: string, role: 'A' | 'B') => {
    if (role === 'A') {
      setNodeAId(personId)
    } else {
      setNodeBId(personId)
    }
    setSelectionMode('none')
    setSelectedPersonId(personId)
  }, [])

  const handlePersonPointerEnter = useCallback(
    (personId: string, event: React.PointerEvent<SVGGElement>) => {
      if (event.pointerType === 'touch') return
      expandPerson(personId)
      setHoveredPersonId(personId)
    },
    [expandPerson],
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
  const personALabel = personA?.fullName ?? '—'
  const personBLabel = personB?.fullName ?? '—'

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

  const handleTooltip = (person: Person, event: React.PointerEvent) => {
    setTooltip({ person, clientX: event.clientX, clientY: event.clientY })
  }

  const updateTooltipPosition = (event: React.PointerEvent) => {
    setTooltip((current) => {
      if (!current) return current
      return { ...current, clientX: event.clientX, clientY: event.clientY }
    })
  }

  const clearTooltip = () => setTooltip(null)

  const handlePersonClick = (
    personId: string,
    event: React.PointerEvent<SVGGElement> | React.MouseEvent<SVGGElement>,
  ) => {
    event.stopPropagation()

    if (selectionMode === 'selectA') {
      setNodeAId(personId)
      setSelectionMode('none')
      setSelectedPersonId(personId)
      return
    }

    if (selectionMode === 'selectB') {
      setNodeBId(personId)
      setSelectionMode('none')
      setSelectedPersonId(personId)
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

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white">
        No family data available.
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-black text-white">
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
            const personHighlighted = highlightContext?.highlightPeople.has(person.id) ?? false
            const personDimmed = highlightActive && !personHighlighted
            const personIsA = nodeAId === person.id
            const personIsB = nodeBId === person.id
            const expandedState = expanded.has(person.id)

            const baseFillAlpha = expandedState ? 0.38 : 0.24
            const highlightFillAlpha = expandedState ? 0.52 : 0.36
            const fillAlpha = highlightActive
              ? personHighlighted
                ? highlightFillAlpha
                : 0.1
              : baseFillAlpha

            const baseStrokeAlpha = expandedState ? 0.95 : 0.7
            const highlightStrokeAlpha = expandedState ? 1 : 0.85
            const strokeAlpha = highlightActive
              ? personHighlighted
                ? highlightStrokeAlpha
                : 0.28
              : baseStrokeAlpha

            const baseStrokeWidth = expandedState ? 2.6 : 1.9
            const strokeWidth = highlightActive && personHighlighted ? baseStrokeWidth + 0.6 : baseStrokeWidth
            const textOpacity = personDimmed ? 0.35 : 1

            const detailLines: string[] = []
            detailLines.push(`Sex: ${getSexLabel(person.sex)}`)
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

            if (detailLines.length === 0) {
              detailLines.push('Details unavailable')
            }

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
                  handleTooltip(person, event)
                }}
                onPointerMove={updateTooltipPosition}
                onPointerLeave={() => {
                  handlePersonPointerLeave(person.id)
                  clearTooltip()
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
                  Sex: {getSexLabel(person.sex)}
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
                {expandedState && (
                  <>
                    <text
                      x={width / 2}
                      y={height - 60}
                      textAnchor="middle"
                      className="fill-white text-[11px] leading-[14px]"
                      opacity={textOpacity}
                    >
                      {detailLines.map((line, index) => (
                        <tspan key={line} x={width / 2} dy={index === 0 ? 0 : 14}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                    <g transform={`translate(${width / 2 - 60}, ${height - 32})`}>
                      {(['A', 'B'] as const).map((role, index) => {
                        const isActive = role === 'A' ? personIsA : personIsB
                        const translateX = index * 70
                        return (
                          <g
                            key={role}
                            transform={`translate(${translateX}, 0)`}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleSelectPersonRole(person.id, role)
                            }}
                            className="cursor-pointer"
                          >
                            <rect
                              width={58}
                              height={24}
                              rx={12}
                              fill={withAlpha(branchColor, isActive ? 0.55 : 0.25)}
                              stroke={withAlpha(branchColor, isActive ? 0.85 : 0.4)}
                              strokeWidth={isActive ? 2 : 1.4}
                            />
                            <text
                              x={29}
                              y={16}
                              textAnchor="middle"
                              className="fill-white text-[11px] font-semibold tracking-wide"
                            >
                              {role === 'A' ? 'Set A' : 'Set B'}
                            </text>
                          </g>
                        )
                      })}
                    </g>
                  </>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-white/20 bg-black px-3 py-2 text-xs text-white shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
          style={{ left: tooltip.clientX + 16, top: tooltip.clientY + 16 }}
        >
          <div className="font-semibold">{tooltip.person.fullName}</div>
          <div className="mt-1 space-y-1">
            {tooltipLines(tooltip.person, graph)
              .slice(1)
              .map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 flex w-full max-w-xs flex-col gap-2 text-xs text-white">
        <div className="pointer-events-auto rounded-2xl border border-white/20 bg-black px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.7)]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black text-lg text-white transition hover:bg-white/10"
              onClick={() => zoomByFactor(0.8)}
            >
              −
            </button>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black text-lg text-white transition hover:bg-white/10"
              onClick={() => zoomByFactor(1.2)}
            >
              +
            </button>
            <button
              type="button"
              className="rounded-full border border-white/20 bg-black px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/10"
              onClick={resetView}
            >
              Reset
            </button>
          </div>
          <form className="mt-3 flex w-full flex-wrap items-center gap-2" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              placeholder="Find a person"
              value={searchValue}
              onChange={handleSearchChange}
              className="w-full flex-1 rounded-full border border-white/20 bg-black px-3 py-1.5 text-xs text-white placeholder-white/50 outline-none transition focus:border-white focus:ring-2 focus:ring-white/40"
            />
            <button
              type="submit"
              className="rounded-full border border-white/20 bg-black px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/10"
            >
              Search
            </button>
          </form>
          {searchFeedback && (
            <div className="mt-2 rounded-full border border-white/20 bg-black px-3 py-1 text-[11px] text-white">
              {searchFeedback}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 flex w-full justify-center px-4 text-xs text-white">
        <div className="pointer-events-auto w-full max-w-2xl rounded-3xl border border-white/20 bg-black px-4 py-4 text-white shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
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
              <span className="text-white">A:</span>
              <span className="font-semibold text-white">{personALabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <span className="text-white">B:</span>
              <span className="font-semibold text-white">{personBLabel}</span>
            </div>
            <button
              type="button"
              onClick={clearSelections}
              className="rounded-full border border-white/20 bg-black px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/10"
            >
              Clear A & B
            </button>
          </div>
          {selectionMode !== 'none' && (
            <div className="mt-3 rounded-full border border-white/20 bg-black px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white text-center">
              {isSelectingA ? 'Tap a person to set A' : 'Tap a person to set B'}
            </div>
          )}
          {relationshipSummary && personA && personB && (
            <div className="mt-3 space-y-1 text-center">
              <div>
                {personA.fullName} is {relationshipSummary.fromAToB} of {personB.fullName}
              </div>
              <div>
                {personB.fullName} is {relationshipSummary.fromBToA} of {personA.fullName}
              </div>
            </div>
          )}
          {!relationshipSummary && (
            <div className="mt-3 text-center text-white">Choose two people to see their relationship.</div>
          )}
        </div>
      </div>

    

      <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-3 text-xs text-white">
        <div className="pointer-events-auto rounded-2xl border border-white/20 bg-black p-4 shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
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
      </div>
    </div>
  )
}

export default FamilyTreeCanvas

