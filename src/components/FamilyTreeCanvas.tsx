import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
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
const SEARCH_FOCUS_SCALE = 1.5
const SPOUSE_LINK_PADDING = 12
const SPOUSE_COLOR_MARRIED = '#d16bf6'
const SPOUSE_COLOR_DIVORCED = '#ff4d6d'
const SPOUSE_DASHARRAY_DIVORCED = '10 6'
const PARENT_CHILD_LINE_COLOR = '#ffffff33'
const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-')

type SelectionHalf = 'left' | 'right'

const computeSelectionHalf = (event: ReactPointerEvent<SVGGElement>): SelectionHalf => {
  const target = event.currentTarget as SVGGElement
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0) {
    return 'left'
  }
  const relativeX = event.clientX - rect.left
  return relativeX <= rect.width / 2 ? 'left' : 'right'
}

const SELECTION_A_HOVER_FILL = 'rgba(16,185,129,0.38)'
const SELECTION_B_HOVER_FILL = 'rgba(59,130,246,0.38)'
const SELECTION_A_HOVER_FILL_ACTIVE = 'rgba(16,185,129,0.6)'
const SELECTION_B_HOVER_FILL_ACTIVE = 'rgba(59,130,246,0.6)'

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

const parseDateString = (value?: string): Date | null => {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return new Date(timestamp)
}

const calculateAge = (person: Person): number | null => {
  const birthDate = parseDateString(person.dob)
  if (!birthDate) return null

  const endDate = parseDateString(person.dod) ?? new Date()
  if (endDate < birthDate) return null

  let age = endDate.getFullYear() - birthDate.getFullYear()
  const beforeBirthday =
    endDate.getMonth() < birthDate.getMonth() ||
    (endDate.getMonth() === birthDate.getMonth() && endDate.getDate() < birthDate.getDate())
  if (beforeBirthday) {
    age -= 1
  }

  return age >= 0 ? age : null
}

// const getSexLabel = (sex: Person['sex']): string => {
//   switch (sex) {
//     case 'male':
//       return 'Male'
//     case 'female':
//       return 'Female'
//     default:
//       return 'Unknown'
//   }
// }

export const FamilyTreeCanvas = ({ graph }: FamilyTreeCanvasProps) => {
  const { isMobile, isTablet, isLandscape, height } = useBreakpoint()
  const isMobileLandscape = isMobile && isLandscape
  const layoutDensity = isMobileLandscape ? 'cozy' : isMobile ? 'compact' : isTablet ? 'cozy' : 'default'
  const layout = useFamilyLayout(graph, { density: layoutDensity })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const innerRef = useRef<SVGGElement | null>(null)
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const zoomBehaviorRef = useRef<ReturnType<typeof zoom<SVGSVGElement, unknown>> | null>(null)
  const initialTransformRef = useRef<ZoomTransform>(zoomIdentity)
  const hasInitializedTransform = useRef(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [hoveredSelection, setHoveredSelection] = useState<{ personId: string; half: 'left' | 'right' } | null>(
    null,
  )
  const [searchValue, setSearchValue] = useState('')
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState<'none' | 'selectA' | 'selectB'>('none')
  const [nodeAId, setNodeAId] = useState<string | null>(null)
  const [nodeBId, setNodeBId] = useState<string | null>(null)
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null)
  const [isControlSheetOpen, setControlSheetOpen] = useState(false)
  const [isLegendOpen, setLegendOpen] = useState(false)
  const [controlSheetDragOffset, setControlSheetDragOffset] = useState(0)
  const controlSheetDragState = useRef<{ pointerId: number | null; startY: number }>({ pointerId: null, startY: 0 })
  const controlSheetDragOffsetRef = useRef(0)
  const overscrollRestoreRef = useRef<{ html: string; body: string } | null>(null)
  const [isControlSheetDragging, setControlSheetDragging] = useState(false)
  const [isTopSheetOpen, setTopSheetOpen] = useState(false)
  const [isTopSheetDragging, setTopSheetDragging] = useState(false)
  const [topSheetDragTranslation, setTopSheetDragTranslation] = useState<number | null>(null)
  const topSheetDragState = useRef<{ pointerId: number | null; startY: number; initialTranslation: number }>(
    { pointerId: null, startY: 0, initialTranslation: 0 },
  )
  const topSheetRef = useRef<HTMLDivElement | null>(null)
  const [topSheetHeight, setTopSheetHeight] = useState(320)
  const [lastSearchResultId, setLastSearchResultId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchResultsRef = useRef<HTMLDivElement | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchActiveIndex, setSearchActiveIndex] = useState<number | null>(null)

  useEffect(() => {
    if (isMobile) {
      setControlSheetOpen(false)
      setLegendOpen(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (!isMobile) {
      setControlSheetOpen(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (!isMobileLandscape) {
      setTopSheetOpen(false)
      setTopSheetDragTranslation(null)
    }
  }, [isMobileLandscape])

  useEffect(() => {
    if (!isMobileLandscape) return
    if (isControlSheetOpen) {
      setTopSheetOpen(false)
      setTopSheetDragTranslation(null)
    }
  }, [isControlSheetOpen, isMobileLandscape])

  useEffect(() => {
    if (!isMobileLandscape) return

    const node = topSheetRef.current
    if (!node) return

    const measure = () => {
      setTopSheetHeight(node.getBoundingClientRect().height)
    }

    measure()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(node)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [isMobileLandscape])

  useEffect(() => {
    const svgElement = svgRef.current
    if (!svgElement) return

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault()
      }
    }

    svgElement.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      svgElement.removeEventListener('wheel', handleWheel)
    }
  }, [])

  useEffect(() => {
    if (!isMobile) return
    if (typeof document === 'undefined') return

    const preventDefaultGesture = (event: Event) => {
      event.preventDefault()
    }

    const options: AddEventListenerOptions = { passive: false }

    document.addEventListener('gesturestart', preventDefaultGesture, options)
    document.addEventListener('gesturechange', preventDefaultGesture, options)
    document.addEventListener('gestureend', preventDefaultGesture, options)

    return () => {
      document.removeEventListener('gesturestart', preventDefaultGesture, options)
      document.removeEventListener('gesturechange', preventDefaultGesture, options)
      document.removeEventListener('gestureend', preventDefaultGesture, options)
    }
  }, [isMobile])

  useEffect(() => {
    if (!isMobile) return
    if (typeof document === 'undefined' || typeof window === 'undefined') return

    const svgElement = svgRef.current
    if (!svgElement) return

    const activePointers = new Set<number>()
    const edgeGuardPointers = new Set<number>()
    const EDGE_GUARD_PX = 72
    let restore: {
      htmlTouchAction: string
      bodyTouchAction: string
      htmlOverscrollBehavior: string
      bodyOverscrollBehavior: string
    } | null = null

    const listenerOptions: AddEventListenerOptions = { passive: false, capture: true }

    const preventTouchMove = (event: TouchEvent) => {
      if (activePointers.size === 0 && edgeGuardPointers.size === 0) return
      event.preventDefault()
    }

    const preventEdgeTouchStart = (event: TouchEvent) => {
      if (!svgElement.contains(event.target as Node)) return
      const touch = event.changedTouches[0]
      if (!touch) return
      const viewportWidth = window.innerWidth || svgElement.getBoundingClientRect().width || 0
      const isNearEdge =
        touch.clientX <= EDGE_GUARD_PX || (viewportWidth > 0 && touch.clientX >= viewportWidth - EDGE_GUARD_PX)
      if (!isNearEdge) return
      lockInteractions()
      event.preventDefault()
    }

    const lockInteractions = () => {
      if (restore) return
      const htmlElement = document.documentElement
      const bodyElement = document.body
      restore = {
        htmlTouchAction: htmlElement.style.touchAction,
        bodyTouchAction: bodyElement.style.touchAction,
        htmlOverscrollBehavior: htmlElement.style.overscrollBehavior,
        bodyOverscrollBehavior: bodyElement.style.overscrollBehavior,
      }
      htmlElement.style.touchAction = 'none'
      bodyElement.style.touchAction = 'none'
      htmlElement.style.overscrollBehavior = 'contain'
      bodyElement.style.overscrollBehavior = 'contain'
      document.addEventListener('touchmove', preventTouchMove, listenerOptions)
    }

    const releaseInteractions = () => {
      if (!restore) return
      const htmlElement = document.documentElement
      const bodyElement = document.body
      htmlElement.style.touchAction = restore.htmlTouchAction
      bodyElement.style.touchAction = restore.bodyTouchAction
      htmlElement.style.overscrollBehavior = restore.htmlOverscrollBehavior
      bodyElement.style.overscrollBehavior = restore.bodyOverscrollBehavior
      restore = null
      edgeGuardPointers.clear()
      document.removeEventListener('touchmove', preventTouchMove, listenerOptions)
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      lockInteractions()
      const viewportWidth = window.innerWidth || svgElement.getBoundingClientRect().width || 0
      const isNearEdge =
        event.clientX <= EDGE_GUARD_PX || (viewportWidth > 0 && event.clientX >= viewportWidth - EDGE_GUARD_PX)
      if (isNearEdge) {
        edgeGuardPointers.add(event.pointerId)
        event.preventDefault()
      }
      activePointers.add(event.pointerId)
      if (svgElement.setPointerCapture) {
        try {
          svgElement.setPointerCapture(event.pointerId)
        } catch {
          // Ignore capture errors
        }
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      if (edgeGuardPointers.has(event.pointerId)) {
        event.preventDefault()
      }
    }

    const handlePointerRelease = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      activePointers.delete(event.pointerId)
      edgeGuardPointers.delete(event.pointerId)
      if (svgElement.hasPointerCapture && svgElement.hasPointerCapture(event.pointerId)) {
        try {
          svgElement.releasePointerCapture(event.pointerId)
        } catch {
          // Ignore release errors
        }
      }
      if (activePointers.size === 0) {
        releaseInteractions()
      }
    }

    svgElement.addEventListener('pointerdown', handlePointerDown)
    svgElement.addEventListener('pointermove', handlePointerMove)
    svgElement.addEventListener('pointerup', handlePointerRelease)
    svgElement.addEventListener('pointercancel', handlePointerRelease)
    svgElement.addEventListener('pointerleave', handlePointerRelease)
    svgElement.addEventListener('touchstart', preventEdgeTouchStart, listenerOptions)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerRelease)
    window.addEventListener('pointercancel', handlePointerRelease)

    return () => {
      svgElement.removeEventListener('pointerdown', handlePointerDown)
      svgElement.removeEventListener('pointermove', handlePointerMove)
      svgElement.removeEventListener('pointerup', handlePointerRelease)
      svgElement.removeEventListener('pointercancel', handlePointerRelease)
      svgElement.removeEventListener('pointerleave', handlePointerRelease)
      svgElement.removeEventListener('touchstart', preventEdgeTouchStart, listenerOptions)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerRelease)
      window.removeEventListener('pointercancel', handlePointerRelease)
      activePointers.clear()
      edgeGuardPointers.clear()
      releaseInteractions()
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

  const trimmedSearchValue = searchValue.trim()
  const showSearchResults = searchFocused && trimmedSearchValue.length > 0
  useEffect(() => {
    if (!showSearchResults || searchMatches.length === 0) {
      setSearchActiveIndex(null)
      return
    }

    setSearchActiveIndex((current) => {
      if (current === null) return 0
      const maxIndex = searchMatches.length - 1
      return current > maxIndex ? maxIndex : current
    })
  }, [searchMatches, showSearchResults])


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

    const maybeAddCurrentSpouse = (person: Person) => {
      const spouseId = person.spouseId
      if (!spouseId) return

      const spouse = graph.peopleById[spouseId]
      if (!spouse) return

      let bondType: 'married' | 'divorced' | undefined
      const unitId = graph.personToUnitId[person.id]
      if (unitId) {
        const unit = graph.unitsById[unitId]
        const bond = unit?.spouseBond
        if (bond && bond.partnerIds.includes(person.id) && bond.partnerIds.includes(spouseId)) {
          bondType = bond.type
        }
      }

      const isCurrentSpouse = bondType
        ? bondType === 'married'
        : !person.divorced && !spouse.divorced

      if (!isCurrentSpouse) return

      highlightPeople.add(spouseId)
    }

    highlightPeople.add(selected.id)
    maybeAddPerson(selected.motherId)
    maybeAddPerson(selected.fatherId)
    maybeAddCurrentSpouse(selected)

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
  }, [highlightSourceId, graph.peopleById, graph.personToUnitId, graph.unitsById, childrenByParentId])

  const highlightActive = Boolean(hoveredPersonId)

  const hoverRelationshipLabels = useMemo(() => {
    if (!hoveredPersonId) return new Map<string, string>()
    if (!highlightContext) return new Map<string, string>()

    const labels = new Map<string, string>()
    const hoveredPerson: Person | undefined = graph.peopleById[hoveredPersonId]
    for (const personId of highlightContext.highlightPeople) {
      if (personId === hoveredPersonId) continue
      const person: Person | undefined = graph.peopleById[personId]
      if (!person) continue

      let label = describeRelationship(graph, personId, hoveredPersonId)
      const isSpousePair =
        person.spouseId === hoveredPersonId || hoveredPerson?.spouseId === personId

      if (isSpousePair) {
        const normalized = label.toLowerCase()
        if (normalized === 'husband' || normalized === 'wife' || normalized === 'spouse') {
          const divorced = person.divorced || hoveredPerson?.divorced
          if (divorced) {
            const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
            label = `Former ${capitalized}`
          }
        }
      }

      labels.set(personId, label)
    }

    return labels
  }, [graph, highlightContext, hoveredPersonId])

  const centerOnPerson = useCallback(
    (personId: string) => {
      const svgElement = svgRef.current
      const zoomBehavior = zoomBehaviorRef.current
      if (!svgElement || !zoomBehavior) return

      const geometry = personGeometries[personId]
      if (!geometry) return

      if (typeof window === 'undefined') return

      const rect = svgElement.getBoundingClientRect()
      const windowCenterX = window.innerWidth / 2
      const windowCenterY = window.innerHeight / 2
      const targetX = windowCenterX - rect.left
      const targetY = windowCenterY - rect.top

      const desiredScale = Math.min(Math.max(SEARCH_FOCUS_SCALE, MIN_SCALE), MAX_SCALE)

      const translateX = targetX - geometry.center.x * desiredScale
      const translateY = targetY - geometry.center.y * desiredScale
      const nextTransform = zoomIdentity.translate(translateX, translateY).scale(desiredScale)

      transformRef.current = nextTransform
      select(svgElement).call(zoomBehavior.transform as never, nextTransform)
    },
    [personGeometries],
  )

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value)
    setLastSearchResultId(null)
    if (searchFeedback) {
      setSearchFeedback(null)
    }
    setSearchActiveIndex(null)
  }

  const handleSearchFocus = useCallback(() => {
    setSearchFocused(true)
    if (searchValue !== '') {
      setSearchValue('')
    }
    setLastSearchResultId(null)
    setSearchFeedback(null)
    setSearchActiveIndex(null)
  }, [searchValue])

  const openControlSheet = useCallback(() => {
    setControlSheetDragOffset(0)
    controlSheetDragOffsetRef.current = 0
    controlSheetDragState.current = { pointerId: null, startY: 0 }
    setControlSheetDragging(false)
    setControlSheetOpen(true)
    searchInputRef.current?.blur()
  }, [])

  const closeControlSheet = useCallback(() => {
    setControlSheetOpen(false)
    setSearchFocused(false)
    setControlSheetDragOffset(0)
    controlSheetDragOffsetRef.current = 0
    controlSheetDragState.current = { pointerId: null, startY: 0 }
    setControlSheetDragging(false)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const htmlElement = document.documentElement
    const bodyElement = document.body

    if (isMobile && isControlSheetOpen) {
      if (!overscrollRestoreRef.current) {
        overscrollRestoreRef.current = {
          html: htmlElement.style.overscrollBehavior,
          body: bodyElement.style.overscrollBehavior,
        }
      }
      htmlElement.style.overscrollBehavior = 'contain'
      bodyElement.style.overscrollBehavior = 'contain'
      bodyElement.classList.add('mobile-control-sheet-open')
    } else {
      bodyElement.classList.remove('mobile-control-sheet-open')
      if (overscrollRestoreRef.current) {
        htmlElement.style.overscrollBehavior = overscrollRestoreRef.current.html
        bodyElement.style.overscrollBehavior = overscrollRestoreRef.current.body
        overscrollRestoreRef.current = null
      }
    }

    return () => {
      bodyElement.classList.remove('mobile-control-sheet-open')
      if (overscrollRestoreRef.current) {
        htmlElement.style.overscrollBehavior = overscrollRestoreRef.current.html
        bodyElement.style.overscrollBehavior = overscrollRestoreRef.current.body
        overscrollRestoreRef.current = null
      }
    }
  }, [isControlSheetOpen, isMobile])

  useEffect(() => {
    if (!isMobileLandscape) return
    if (typeof window === 'undefined') return

    const hideSafariChrome = () => {
      window.scrollTo(0, 0)
      window.scrollTo(0, 1)
    }

    const timeout = window.setTimeout(hideSafariChrome, 200)

    window.addEventListener('orientationchange', hideSafariChrome)
    window.addEventListener('resize', hideSafariChrome)

    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('orientationchange', hideSafariChrome)
      window.removeEventListener('resize', hideSafariChrome)
    }
  }, [isMobileLandscape])

  useEffect(() => {
    if (!isMobile) return
    if (!isControlSheetDragging) return
    if (typeof document === 'undefined') return

    const preventTouchMove = (event: TouchEvent) => {
      event.preventDefault()
    }

    document.addEventListener('touchmove', preventTouchMove, { passive: false })

    return () => {
      document.removeEventListener('touchmove', preventTouchMove)
    }
  }, [isControlSheetDragging, isMobile])

  const beginSelection = useCallback(
    (target: 'selectA' | 'selectB') => {
      setSelectionMode(target)
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

      if (isMobile) {
        openControlSheet()
      }
    },
    [isMobile, openControlSheet],
  )

  const updateHoveredSelectionHalf = useCallback(
    (personId: string, event: ReactPointerEvent<SVGGElement>) => {
      if (event.pointerType === 'touch') return
      const half = computeSelectionHalf(event)
      setHoveredSelection({ personId, half })
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

  const assignLastSearchResultToRole = useCallback(
    (role: 'A' | 'B') => {
      if (!lastSearchResultId) {
        setSearchFeedback('Search for a person first.')
        setSearchFocused(true)
        focusSearchInput()
        return
      }

      const person = graph.peopleById[lastSearchResultId]
      if (!person) {
        setLastSearchResultId(null)
        setSearchFeedback('That search result is no longer available.')
        setSearchFocused(true)
        focusSearchInput()
        return
      }

      assignPersonToRole(person.id, role)
      setSearchFeedback(null)
    },
    [assignPersonToRole, focusSearchInput, graph.peopleById, lastSearchResultId],
  )

  const zoomByFactor = useCallback((factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    select(svgRef.current).call(zoomBehaviorRef.current.scaleBy as never, factor)
  }, [])

  const resetView = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    select(svgRef.current).call(
      zoomBehaviorRef.current.transform as never,
      initialTransformRef.current,
    )
  }, [])

  const panView = useCallback((dx: number, dy: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    select(svgRef.current).call(zoomBehaviorRef.current.translateBy as never, dx, dy)
  }, [])

  const legendShortcutActiveRef = useRef(false)
  const legendShortcutRestoreRef = useRef(false)
  const isLegendOpenRef = useRef(isLegendOpen)

  useEffect(() => {
    isLegendOpenRef.current = isLegendOpen
  }, [isLegendOpen])

  useEffect(() => {
    if (isMobile) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const activeElement = document.activeElement as HTMLElement | null
      if (activeElement === searchInputRef.current) return
      if (activeElement?.isContentEditable) return
      if (activeElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(activeElement.tagName)) return

      const key = event.key

      if (key === ' ' || key === 'Spacebar') {
        event.preventDefault()
        setSearchValue('')
        setSearchFeedback(null)
        setLastSearchResultId(null)
        setSearchFocused(true)
        setSearchActiveIndex(null)
        focusSearchInput()
        return
      }

      if (key === 'a' || key === 'A') {
        if (!lastSearchResultId) return
        event.preventDefault()
        assignLastSearchResultToRole('A')
        return
      }

      if (key === 'b' || key === 'B') {
        if (!lastSearchResultId) return
        event.preventDefault()
        assignLastSearchResultToRole('B')
        return
      }

      if (key === 'c' || key === 'C') {
        event.preventDefault()
        clearSelections()
        return
      }

      if (key === 'r' || key === 'R') {
        event.preventDefault()
        resetView()
        return
      }

      if (key === 'l' || key === 'L') {
        if (legendShortcutActiveRef.current) return
        legendShortcutActiveRef.current = true
        legendShortcutRestoreRef.current = isLegendOpenRef.current
        if (!isLegendOpenRef.current) {
          setLegendOpen(true)
        }
        event.preventDefault()
        return
      }

      const panDistance = event.shiftKey ? 240 : 160
      switch (key) {
        case 'ArrowUp':
          event.preventDefault()
          panView(0, -panDistance)
          return
        case 'ArrowDown':
          event.preventDefault()
          panView(0, panDistance)
          return
        case 'ArrowLeft':
          event.preventDefault()
          panView(-panDistance, 0)
          return
        case 'ArrowRight':
          event.preventDefault()
          panView(panDistance, 0)
          return
      }
    }

    window.addEventListener('keydown', handleGlobalShortcut)

    const handleGlobalKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'l' && event.key !== 'L') return
      if (!legendShortcutActiveRef.current) return
      legendShortcutActiveRef.current = false
      const shouldClose = !legendShortcutRestoreRef.current
      legendShortcutRestoreRef.current = false
      if (shouldClose) {
        setLegendOpen(false)
      }
    }

    window.addEventListener('keyup', handleGlobalKeyUp)

    return () => {
      window.removeEventListener('keydown', handleGlobalShortcut)
      window.removeEventListener('keyup', handleGlobalKeyUp)
    }
  }, [
    assignLastSearchResultToRole,
    clearSelections,
    focusSearchInput,
    isMobile,
    lastSearchResultId,
    panView,
    setLastSearchResultId,
    setSearchActiveIndex,
    setSearchFeedback,
    setSearchFocused,
    setSearchValue,
    resetView,
  ])

  const handleSearchResultSelect = useCallback(
    (person: Person) => {
      setSearchValue(person.fullName)
      setLastSearchResultId(person.id)
      setSearchFeedback(null)
      centerOnPerson(person.id)
      setSearchFocused(false)
      setSearchActiveIndex(null)
      searchInputRef.current?.blur()

      setSelectedPersonId(person.id)
    },
    [centerOnPerson],
  )

  const handleSearchInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.defaultPrevented) return

      if (event.key === 'Escape') {
        event.preventDefault()
        setSearchFocused(false)
        setSearchActiveIndex(null)
        searchInputRef.current?.blur()
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!showSearchResults || searchMatches.length === 0) return
        event.preventDefault()
        setSearchActiveIndex((current) => {
          const count = searchMatches.length
          if (count === 0) return null
          if (current === null) {
            return event.key === 'ArrowDown' ? 0 : count - 1
          }
          if (event.key === 'ArrowDown') {
            return (current + 1) % count
          }
          return (current - 1 + count) % count
        })
        return
      }

      if (event.key === 'Enter') {
        if (!showSearchResults || searchMatches.length === 0) return
        const index = searchActiveIndex ?? 0
        const match = searchMatches[index]
        if (!match) return
        event.preventDefault()
        handleSearchResultSelect(match)
      }
    },
    [handleSearchResultSelect, searchActiveIndex, searchMatches, showSearchResults],
  )

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const query = searchValue.trim().toLowerCase()
      if (!query) {
        setSearchFeedback('Enter a name to search.')
        return
      }

      const match =
        searchActiveIndex !== null && searchMatches[searchActiveIndex]
          ? searchMatches[searchActiveIndex]
          : searchMatches[0]
      if (!match) {
        setSearchFeedback(`No match for "${searchValue}".`)
        return
      }

      setSearchValue(match.fullName)
      setLastSearchResultId(match.id)
      setSearchFeedback(null)
      centerOnPerson(match.id)
      setSearchFocused(false)
      setSearchActiveIndex(null)
      searchInputRef.current?.blur()
      setSelectedPersonId(match.id)
    },
    [centerOnPerson, searchActiveIndex, searchMatches, searchValue],
  )

  const handleCanvasBackgroundClick = useCallback(() => {
    setSelectionMode('none')
    setSelectedPersonId(null)
    collapseAllDetails()
    setHoveredPersonId(null)
    setHoveredSelection(null)
  }, [collapseAllDetails])

  const handleControlSheetDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isControlSheetOpen) return
      if (event.pointerType !== 'touch') return
      event.preventDefault()
      event.stopPropagation()
      controlSheetDragState.current = { pointerId: event.pointerId, startY: event.clientY }
      controlSheetDragOffsetRef.current = 0
      setControlSheetDragOffset(0)
      event.currentTarget.setPointerCapture(event.pointerId)
      setControlSheetDragging(true)
    },
    [isControlSheetOpen],
  )

  const handleControlSheetDragMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (controlSheetDragState.current.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const offset = Math.max(0, event.clientY - controlSheetDragState.current.startY)
    controlSheetDragOffsetRef.current = offset
    setControlSheetDragOffset(offset)
  }, [])

  const handleControlSheetDragEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (controlSheetDragState.current.pointerId !== event.pointerId) return
      event.currentTarget.releasePointerCapture(event.pointerId)
      const offset = controlSheetDragOffsetRef.current
      setControlSheetDragging(false)
      if (offset > 32) {
        closeControlSheet()
      } else {
        setControlSheetDragOffset(0)
      }
      controlSheetDragOffsetRef.current = 0
      controlSheetDragState.current = { pointerId: null, startY: 0 }
    },
    [closeControlSheet],
  )

const handleControlSheetDragCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
  if (controlSheetDragState.current.pointerId !== event.pointerId) return
  event.currentTarget.releasePointerCapture(event.pointerId)
  controlSheetDragOffsetRef.current = 0
  controlSheetDragState.current = { pointerId: null, startY: 0 }
  setControlSheetDragOffset(0)
  setControlSheetDragging(false)
}, [])

  const landscapeContentPadding = isMobileLandscape
    ? 'pl-[calc(env(safe-area-inset-left,0px)+12px)] pr-[calc(env(safe-area-inset-right,0px)+12px)]'
    : ''

  const mobileControlSheetContentClass = isMobileLandscape
    ? `grid gap-4 grid-cols-[minmax(0,0.58fr)_minmax(0,0.42fr)] items-start text-xs text-white ${landscapeContentPadding}`
    : 'space-y-4 overflow-y-auto pr-1 text-xs text-white'

  const mobileSearchFormClass = isMobileLandscape
    ? 'flex w-full flex-nowrap items-end gap-3'
    : 'flex w-full flex-nowrap items-end gap-2'

  const mobileSearchInputWrapperStyle: CSSProperties | undefined = isMobileLandscape
    ? { flexBasis: '50%', maxWidth: '50%', flexGrow: 0 }
    : undefined

  const personCardPaddingClass = isMobileLandscape ? 'py-2' : 'py-3'
  const personCardControlGapClass = isMobileLandscape ? 'gap-1' : 'gap-2'
  const personCardButtonsGapClass = isMobileLandscape ? 'gap-1.5' : 'gap-2'
  const personCardButtonPaddingClass = isMobileLandscape ? 'px-3 py-1' : 'px-3 py-1.5'
  const legendButtonStyle: CSSProperties | undefined = isMobileLandscape
    ? {
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
      }
    : undefined
  const TOP_SHEET_HANDLE_HEIGHT = 72
  const topSheetClosedOffset = Math.max(topSheetHeight - TOP_SHEET_HANDLE_HEIGHT, 0)
  const topSheetBaseTranslation = isTopSheetOpen ? 0 : -topSheetClosedOffset
  const effectiveTopSheetTranslation =
    isTopSheetDragging && topSheetDragTranslation !== null ? topSheetDragTranslation : topSheetBaseTranslation
  const topSheetContentStyle: CSSProperties | undefined = isMobileLandscape
    ? {
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 12px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 12px)',
      }
    : undefined

const handleTopSheetDragStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isMobile) return
      if (event.pointerType === 'mouse' && event.buttons !== 1) return
      const node = event.currentTarget
      topSheetDragState.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        initialTranslation: effectiveTopSheetTranslation,
      }
      setTopSheetDragging(true)
      setTopSheetDragTranslation(effectiveTopSheetTranslation)
      node.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    },
    [effectiveTopSheetTranslation, isMobile],
  )

  const handleTopSheetDragMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (topSheetDragState.current.pointerId !== event.pointerId) return
      const delta = event.clientY - topSheetDragState.current.startY
      const next = topSheetDragState.current.initialTranslation + delta
      const clamped = Math.min(0, Math.max(-topSheetClosedOffset, next))
      setTopSheetDragTranslation(clamped)
    },
    [topSheetClosedOffset],
  )

  const finalizeTopSheetDrag = useCallback(
    (translation: number, initialTranslation: number) => {
      const moved = Math.abs(translation - initialTranslation)
      const toggleThreshold = 8
      const shouldOpen =
        moved < toggleThreshold ? !isTopSheetOpen : translation > -topSheetClosedOffset / 2
      setTopSheetOpen(shouldOpen)
      setTopSheetDragging(false)
      setTopSheetDragTranslation(null)
      topSheetDragState.current = { pointerId: null, startY: 0, initialTranslation: 0 }
    },
    [isTopSheetOpen, topSheetClosedOffset],
  )

  const handleTopSheetDragEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (topSheetDragState.current.pointerId !== event.pointerId) return
      event.currentTarget.releasePointerCapture(event.pointerId)
      finalizeTopSheetDrag(
        topSheetDragTranslation ?? effectiveTopSheetTranslation,
        topSheetDragState.current.initialTranslation,
      )
    },
    [effectiveTopSheetTranslation, finalizeTopSheetDrag, topSheetDragTranslation],
  )

  const handleTopSheetDragCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (topSheetDragState.current.pointerId !== event.pointerId) return
      event.currentTarget.releasePointerCapture(event.pointerId)
      finalizeTopSheetDrag(
        topSheetDragTranslation ?? effectiveTopSheetTranslation,
        topSheetDragState.current.initialTranslation,
      )
    },
    [effectiveTopSheetTranslation, finalizeTopSheetDrag, topSheetDragTranslation],
  )


  const handlePersonPointerEnter = useCallback(
    (personId: string, event: ReactPointerEvent<SVGGElement>) => {
      if (event.pointerType === 'touch') return
      updateHoveredSelectionHalf(personId, event)
      setHoveredPersonId(personId)
    },
    [setHoveredPersonId, updateHoveredSelectionHalf],
  )

  const handlePersonPointerLeave = useCallback(
    (personId: string, event: ReactPointerEvent<SVGGElement>) => {
      if (event.pointerType === 'touch') return
      collapsePerson(personId)
      setHoveredPersonId((current) => (current === personId ? null : current))
      setHoveredSelection((current) => (current?.personId === personId ? null : current))
    },
    [collapsePerson],
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
  const isSelecting = selectionMode !== 'none'
  const relationshipPanelContent =
    relationshipSummary && personA && personB ? (
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
    )
  const topControlsPanel = (
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
        !isControlSheetOpen && !isMobileLandscape && (
          <button
            type="button"
            onClick={toggleLegend}
            className="mt-3 w-full rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20"
          >
            {isLegendOpen ? 'Hide Legend' : 'Show Legend'}
          </button>
        )
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
                onFocus={handleSearchFocus}
                onBlur={(event) => {
                  const next = event.relatedTarget as Node | null
                  if (next && searchResultsRef.current?.contains(next)) {
                    return
                  }
                  setSearchFocused(false)
                }}
                onKeyDown={handleSearchInputKeyDown}
                className="w-full rounded-full border border-white/20 bg-black px-3 py-2 text-xs text-white placeholder-white/50 outline-none transition focus:border-white focus:ring-2 focus:ring-white/40"
              />
              {showSearchResults && (
                <div
                  ref={searchResultsRef}
                  className="pointer-events-auto absolute left-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl border border-white/20 bg-black/95 shadow-[0_16px_40px_rgba(0,0,0,0.65)] backdrop-blur-sm"
                >
                  {searchMatches.length > 0 ? (
                    <ul className="divide-y divide-white/5">
                      {searchMatches.map((person, index) => {
                        const isActive = searchActiveIndex === index
                        const life = formatLifeSpan(person)
                        return (
                          <li key={person.id}>
                            <button
                              type="button"
                              className={`flex w-full flex-col gap-1 px-3 py-2 text-left text-xs text-white transition hover:bg-white/10 focus:bg-white/10 focus:outline-none ${
                                isActive ? 'bg-white/10' : ''
                              }`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleSearchResultSelect(person)}
                              onMouseEnter={() => setSearchActiveIndex(index)}
                              onFocus={() => setSearchFocused(true)}
                              onBlur={(event) => {
                                const next = event.relatedTarget as Node | null
                                if (next && (next === searchInputRef.current || searchResultsRef.current?.contains(next))) {
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
          {searchFeedback && (
            <div className="mt-2 rounded-full border border-white/20 bg-black px-3 py-1 text-[11px] text-white">
              {searchFeedback}
            </div>
          )}
        </>
      )}
    </div>
  )
  const personACard = (
    <div
      className={`flex items-center justify-between rounded-2xl border px-3 ${personCardPaddingClass} ${
        isSelectingA ? 'border-white/50 bg-white/10' : 'border-white/20 bg-black/60'
      }`}
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">Person A</div>
        <div className="mt-1 text-sm font-semibold text-white">{personALabel}</div>
      </div>
      <div className={`flex flex-col items-end ${personCardControlGapClass}`}>
        <div className={`flex items-center ${personCardButtonsGapClass}`}>
          <button
            type="button"
            onClick={() => beginSelection('selectA')}
            className={`rounded-full border border-white/25 bg-white/10 px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20 ${personCardButtonPaddingClass}`}
          >
            {isSelectingA ? 'Selecting…' : 'Select'}
          </button>
          <button
            type="button"
            onClick={() => assignLastSearchResultToRole('A')}
            className={`rounded-full border border-white/25 bg-black/40 px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/10 ${personCardButtonPaddingClass}`}
          >
            + Search
          </button>
        </div>
      </div>
    </div>
  )
  const personBCard = (
    <div
      className={`flex items-center justify-between rounded-2xl border px-3 ${personCardPaddingClass} ${
        isSelectingB ? 'border-white/50 bg-white/10' : 'border-white/20 bg-black/60'
      }`}
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/60">Person B</div>
        <div className="mt-1 text-sm font-semibold text-white">{personBLabel}</div>
      </div>
      <div className={`flex flex-col items-end ${personCardControlGapClass}`}>
        <div className={`flex items-center ${personCardButtonsGapClass}`}>
          <button
            type="button"
            onClick={() => beginSelection('selectB')}
            className={`rounded-full border border-white/25 bg-white/10 px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20 ${personCardButtonPaddingClass}`}
          >
            {isSelectingB ? 'Selecting…' : 'Select'}
          </button>
          <button
            type="button"
            onClick={() => assignLastSearchResultToRole('B')}
            className={`rounded-full border border-white/25 bg-black/40 px-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/10 ${personCardButtonPaddingClass}`}
          >
            + Search
          </button>
        </div>
      </div>
    </div>
  )
  const mobileSearchForm = (
    <form className={mobileSearchFormClass} onSubmit={handleSearchSubmit}>
      <div className="relative w-full flex-1" style={mobileSearchInputWrapperStyle}>
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Find a person"
          value={searchValue}
          onChange={handleSearchChange}
          onFocus={handleSearchFocus}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null
            if (next && searchResultsRef.current?.contains(next)) {
              return
            }
            setSearchFocused(false)
          }}
          onKeyDown={handleSearchInputKeyDown}
          className="w-full rounded-full border border-white/20 bg-black px-3 py-2 text-xs text-white placeholder-white/50 outline-none transition focus:border-white focus:ring-2 focus:ring-white/40"
        />
        {showSearchResults && (
          <div
            ref={searchResultsRef}
            className="pointer-events-auto absolute left-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl border border-white/20 bg-black/95 shadow-[0_16px_40px_rgba(0,0,0,0.65)] backdrop-blur-sm"
          >
            {searchMatches.length > 0 ? (
              <ul className="divide-y divide-white/5">
                {searchMatches.map((person, index) => {
                  const isActive = searchActiveIndex === index
                  const life = formatLifeSpan(person)
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        className={`flex w-full flex-col gap-1 px-3 py-2 text-left text-xs text-white transition hover:bg-white/10 focus:bg-white/10 focus:outline-none ${
                          isActive ? 'bg-white/10' : ''
                        }`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSearchResultSelect(person)}
                        onMouseEnter={() => setSearchActiveIndex(index)}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={(event) => {
                          const next = event.relatedTarget as Node | null
                          if (next && (next === searchInputRef.current || searchResultsRef.current?.contains(next))) {
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
        className="flex-shrink-0 rounded-full border border-white/20 bg-black px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-white/10"
      >
        Search
      </button>
    </form>
  )
  const selectionMessage =
    selectionMode === 'selectA'
      ? 'Tap a person to set Person A'
      : selectionMode === 'selectB'
      ? 'Tap a person to set Person B'
      : null
  const selectionRingClass = isMobile
    ? ''
    : isSelecting
    ? 'ring-2 ring-white/40 ring-offset-4 ring-offset-black'
    : ''

  const mobileSheetMaxHeight = isMobile ? Math.max(320, Math.floor(height * 0.75)) : null

  const floatingToolbarStyle: CSSProperties | undefined = isMobileLandscape
    ? {
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
        maxWidth: '360px',
        margin: '0 auto',
      }
    : undefined

  const mobileControlSheetStyle: CSSProperties | undefined = isMobile
    ? {
        maxHeight: mobileSheetMaxHeight ? `${mobileSheetMaxHeight}px` : '75vh',
        ...(isControlSheetOpen ? { transform: `translateY(${controlSheetDragOffset}px)` } : {}),
      }
    : undefined

  const mobileControlSheetContentStyle: CSSProperties | undefined = isMobile
    ? isMobileLandscape
      ? { maxHeight: 'none', overflowY: 'visible' }
      : {
          maxHeight: mobileSheetMaxHeight ? `${Math.max(200, mobileSheetMaxHeight - 120)}px` : 'calc(75vh - 120px)',
        }
    : undefined

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

  const handlePersonPointerUp = useCallback(
    (personId: string, event: ReactPointerEvent<SVGGElement>) => {
      event.stopPropagation()

      if (event.pointerType === 'touch') {
        if (selectionMode === 'selectA') {
          assignPersonToRole(personId, 'A')
          setHoveredPersonId(personId)
          setHoveredSelection(null)
          return
        }

        if (selectionMode === 'selectB') {
          assignPersonToRole(personId, 'B')
          setHoveredPersonId(personId)
          setHoveredSelection(null)
          return
        }

        setHoveredPersonId(personId)
        setHoveredSelection(null)
        setSelectedPersonId(null)
        return
      }

      if (selectionMode === 'selectA') {
        assignPersonToRole(personId, 'A')
        return
      }

      if (selectionMode === 'selectB') {
        assignPersonToRole(personId, 'B')
        return
      }

      const half = computeSelectionHalf(event)
      const role = half === 'left' ? 'A' : 'B'
      assignPersonToRole(personId, role)
      setHoveredSelection({ personId, half })
    },
    [assignPersonToRole, selectionMode],
  )

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white">
        No family data available.
      </div>
    )
  }

  return (
    <div className={`relative h-full w-full overscroll-contain bg-black text-white ${selectionRingClass}`}>
      {isMobile && selectionMode !== 'none' && (
        <div
          className="pointer-events-none fixed inset-0 z-[70]"
          style={{
            boxShadow:
              selectionMode === 'selectA'
                ? 'inset 0 0 0 8px rgba(52, 211, 153, 0.7)'
                : 'inset 0 0 0 8px rgba(56, 189, 248, 0.7)',
          }}
        />
      )}
      {!isMobile && selectionMessage && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center pt-4">
          <div className="rounded-full border border-white/30 bg-black/70 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white">
            {selectionMessage}
          </div>
        </div>
      )}
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        style={{ overflow: 'visible', touchAction: 'none' }}
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
            style={{ touchAction: 'none' }}
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
                stroke={PARENT_CHILD_LINE_COLOR}
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
            const hoveredHalf = hoveredSelection?.personId === person.id ? hoveredSelection.half : null
            const clipPathId = `person-card-clip-${sanitizeId(person.id)}`
            const personIsA = nodeAId === person.id
            const personIsB = nodeBId === person.id
            const hoveredRole = hoveredHalf ? (hoveredHalf === 'left' ? 'A' : 'B') : null
            const hoveredFill = hoveredRole
              ? hoveredRole === 'A'
                ? personIsA
                  ? SELECTION_A_HOVER_FILL_ACTIVE
                  : SELECTION_A_HOVER_FILL
                : personIsB
                ? SELECTION_B_HOVER_FILL_ACTIVE
                : SELECTION_B_HOVER_FILL
              : null
            const personHighlighted = highlightContext?.highlightPeople.has(person.id) ?? false
            const personDimmed = highlightActive && !personHighlighted

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

            const relationshipLabel = hoverRelationshipLabels.get(person.id) ?? null

            const rawDob = person.dob ?? ''
            const rawDod = person.dod ?? ''
            const hasDob = rawDob.trim().length > 0
            const hasDod = rawDod.trim().length > 0
            const birthDisplay = hasDob ? rawDob : 'Birth Date'
            const ageYears = calculateAge(person)
            const ageDisplay = ageYears !== null ? `${ageYears}` : null
            const nameY = 32
            const setLabelY = Math.max(16, nameY - 16)
            const infoLineStartY = nameY + 28
            const infoLineSpacing = 14
            const infoLines: Array<{ key: string; text: string }> = []
            if (ageDisplay) {
              infoLines.push({ key: 'age', text: ageDisplay })
              infoLines.push({ key: 'dot', text: '·' })
            }
            infoLines.push({ key: 'birth', text: birthDisplay })
            if (hasDod) {
              infoLines.push({ key: 'dash', text: '—' })
              infoLines.push({ key: 'death', text: rawDod })
            }
            const relationshipLabelY = Math.max(nameY + 44, height / 2 - 16)
            const generationBadgeRadius = 20
            const generationBadgeCx = width
            const generationBadgeCy = height
            const generationBadgeTextX = width - generationBadgeRadius * 0.45
            const generationBadgeTextY = height - generationBadgeRadius * 0.45

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
            const showDetailLines = !isMobile && isTouchExpanded

            return (
              <g
                key={person.id}
                transform={`translate(${bounds.left}, ${bounds.top})`}
                className="pointer-events-auto cursor-pointer transition-transform"
                onPointerEnter={(event) => {
                  handlePersonPointerEnter(person.id, event)
                }}
                onPointerMove={(event) => {
                  updateHoveredSelectionHalf(person.id, event)
                }}
                onPointerLeave={(event) => {
                  handlePersonPointerLeave(person.id, event)
                }}
                onPointerUp={(event) => handlePersonPointerUp(person.id, event)}
                style={{ opacity: personDimmed ? 0.3 : 1 }}
              >
                <defs>
                  <clipPath id={clipPathId}>
                    <rect width={width} height={height} rx={CORNER_RADIUS} />
                  </clipPath>
                </defs>
                <rect
                  width={width}
                  height={height}
                  rx={CORNER_RADIUS}
                  fill={withAlpha(branchColor, fillAlpha)}
                  stroke={withAlpha(branchColor, strokeAlpha)}
                  strokeWidth={strokeWidth}
                  filter={`url(#glow-${slugifyBranch(unit.branch)})`}
                />
                {hoveredHalf && hoveredRole && hoveredFill && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={hoveredHalf === 'left' ? 0 : width / 2}
                      y={0}
                      width={width / 2}
                      height={height}
                      fill={hoveredFill}
                      clipPath={`url(#${clipPathId})`}
                    />
                    <text
                      x={hoveredHalf === 'left' ? width / 4 : (width * 3) / 4}
                      y={setLabelY}
                      textAnchor="middle"
                      className="fill-white text-[11px] font-semibold uppercase tracking-[0.25em]"
                    >
                      Set {hoveredRole}
                    </text>
                  </g>
                )}
                <g style={{ pointerEvents: 'none' }} clipPath={`url(#${clipPathId})`}>
                  <circle
                    cx={generationBadgeCx}
                    cy={generationBadgeCy}
                    r={generationBadgeRadius}
                    fill="rgba(0, 0, 0, 0.82)"
                    stroke={withAlpha(branchColor, 0.55)}
                    strokeWidth={1.2}
                  />
                  <text
                    x={generationBadgeTextX}
                    y={generationBadgeTextY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-white text-[12px] font-semibold"
                  >
                    {person.generation}
                  </text>
                </g>
                <text
                  x={width / 2}
                  y={nameY}
                  textAnchor="middle"
                  className="fill-white text-[15px] font-semibold tracking-wide"
                  opacity={textOpacity}
                  style={{ letterSpacing: '0.02em' }}
                >
                  {person.fullName}
                </text>
                {relationshipLabel ? (
                  <text
                    x={width / 2}
                    y={relationshipLabelY}
                    textAnchor="middle"
                    className="fill-white text-[11px] uppercase tracking-[0.3em]"
                    opacity={textOpacity}
                  >
                    {relationshipLabel}
                  </text>
                ) : (
                  infoLines.map((line, index) => (
                    <text
                      key={line.key}
                      x={width / 2}
                      y={infoLineStartY + infoLineSpacing * index}
                      textAnchor="middle"
                      className="fill-white text-[11px] uppercase tracking-[0.3em]"
                      opacity={textOpacity}

                    >
                      {line.text}
                    </text>
                  ))
                )}
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
      {isMobileLandscape ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-60">
          <div
            ref={topSheetRef}
            className="pointer-events-auto mx-auto"
            style={{
              transform: `translateY(${effectiveTopSheetTranslation}px)` ,
              transition: isTopSheetDragging ? 'none' : 'transform 0.25s ease-out',
              width: 'min(296px, calc(100vw - 112px))',
            }}
          >
            <div
              className="rounded-b-3xl border border-white/20 bg-black/90 shadow-[0_12px_40px_rgba(0,0,0,0.7)] backdrop-blur"
              style={topSheetContentStyle}
            >
              <div className="flex justify-center pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-2">
                <button
                  type="button"
                  className="flex h-14 w-32 cursor-grab items-center justify-center rounded-full bg-white/10 text-white outline-none transition focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-black active:cursor-grabbing"
                  aria-label={isTopSheetOpen ? 'Collapse top controls' : 'Expand top controls'}
                  onPointerDown={handleTopSheetDragStart}
                  onPointerMove={handleTopSheetDragMove}
                  onPointerUp={handleTopSheetDragEnd}
                  onPointerCancel={handleTopSheetDragCancel}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setTopSheetOpen((current) => !current)
                    }
                  }}
                  style={{ touchAction: 'none' }}
                >
                  <span className="block h-1.5 w-14 rounded-full bg-white/60" />
                </button>
              </div>
              <div className="px-4 pb-5">{topControlsPanel}</div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`pointer-events-none absolute z-30 ${
            isMobile ? 'left-3 right-3 top-3' : 'left-6 top-6 w-[360px]'
          } flex flex-col gap-3 text-xs text-white`}
          style={floatingToolbarStyle}
        >
          {topControlsPanel}
        </div>
      )}

      {isLegendOpen && isMobile && !isMobileLandscape && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={toggleLegend} />
      )}

      {(!isMobile || isMobileLandscape) && (
        <button
          type="button"
          onClick={toggleLegend}
          className={`fixed z-50 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10 md:text-[11px] ${
            isMobileLandscape ? '' : 'right-4 top-4'
          }`}
          style={legendButtonStyle}
          aria-expanded={isLegendOpen}
          aria-controls="branch-legend-panel"
        >
          {isLegendOpen ? 'Hide Legend' : 'Show Legend'}
        </button>
      )}

      <div
        id="branch-legend-panel"
        className={`fixed right-4 top-20 z-40 w-[min(260px,80vw)] max-h-[70vh] overflow-y-auto rounded-3xl border border-white/15 bg-black/85 p-4 text-xs text-white shadow-[0_24px_60px_rgba(0,0,0,0.75)] backdrop-blur transition-all duration-300 ${
          isLegendOpen ? 'pointer-events-auto translate-x-0 opacity-100' : 'pointer-events-none translate-x-[120%] opacity-0'
        }`}
      >
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
          Branches
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
        <div className="mt-5 border-t border-white/15 pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
            Connections
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className="block h-1 w-12 rounded-full"
                style={{ backgroundColor: SPOUSE_COLOR_MARRIED }}
              />
              <span className="text-sm font-medium tracking-wide">Current spouse</span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="block h-0 w-12 border-t-4 border-dashed"
                style={{ borderColor: SPOUSE_COLOR_DIVORCED }}
              />
              <span className="text-sm font-medium tracking-wide">Divorced spouse</span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="block h-0 w-12 border-t-2"
                style={{ borderColor: PARENT_CHILD_LINE_COLOR }}
              />
              <span className="text-sm font-medium tracking-wide">Children</span>
            </div>
          </div>
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
            {relationshipPanelContent}
          </div>
        </div>
      )}

      {isMobile && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
              isControlSheetOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onClick={closeControlSheet}
          />

          <div
            id="mobile-control-sheet"
            className={`fixed inset-x-0 bottom-0 z-50 transform ${
              isControlSheetDragging ? '' : 'transition-transform duration-300 ease-out'
            } ${isControlSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
            style={mobileControlSheetStyle}
            role="dialog"
            aria-label="Family tree controls"
          >
            <div className="rounded-t-3xl border border-white/20 bg-black/90 px-5 pb-6 pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.7)] backdrop-blur">
              <div className="mb-4 flex justify-center">
                <div
                  className="flex h-14 w-32 cursor-grab items-center justify-center rounded-full bg-white/10 active:cursor-grabbing"
                  role="button"
                  aria-label="Drag to close"
                  onPointerDown={handleControlSheetDragStart}
                  onPointerMove={handleControlSheetDragMove}
                  onPointerUp={handleControlSheetDragEnd}
                  onPointerCancel={handleControlSheetDragCancel}
                  style={{ touchAction: 'none' }}
                >
                  <span className="block h-1.5 w-14 rounded-full bg-white/60" />
                </div>
              </div>
              <div
                className={mobileControlSheetContentClass}
                style={mobileControlSheetContentStyle}
              >
                {isMobileLandscape ? (
                  <>
                    <div className="flex flex-col gap-3">
                      {mobileSearchForm}
                      {searchFeedback && (
                        <div className="rounded-full border border-white/20 bg-black px-3 py-1 text-[11px] text-white">
                          {searchFeedback}
                        </div>
                      )}
                      <div className="flex flex-col gap-3">
                        {personACard}
                        {personBCard}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={clearSelections}
                        className="w-full rounded-full border border-white/25 bg-transparent px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10"
                      >
                        Clear A &amp; B
                      </button>
                      {selectionMode !== 'none' && (
                        <div className="rounded-2xl border border-white/20 bg-black/70 px-3 py-2 text-center text-[10px] uppercase tracking-[0.3em] text-white">
                          {selectionMessage}
                        </div>
                      )}
                      {relationshipPanelContent}
                    </div>
                  </>
                ) : (
                  <>
                    {mobileSearchForm}
                    {searchFeedback && (
                      <div className="rounded-full border border-white/20 bg-black px-3 py-1 text-[11px] text-white">
                        {searchFeedback}
                      </div>
                    )}
                    <div className="space-y-3">
                      {personACard}
                      {personBCard}
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
                        {selectionMessage}
                      </div>
                    )}
                    {relationshipPanelContent}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {isMobile && !isControlSheetOpen && (
        selectionMode === 'none' ? (
          <button
            type="button"
            onClick={() => {
              openControlSheet()
            }}
            className="fixed bottom-4 right-4 z-50 grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-black/80 text-3xl text-white shadow-[0_20px_40px_rgba(0,0,0,0.6)] transition hover:bg-white/15"
          >
            <span aria-hidden="true">🔍</span>
            <span className="sr-only">Search &amp; Select</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSelectionMode('none')
              setHoveredSelection(null)
              setHoveredPersonId(null)
              openControlSheet()
            }}
            className="fixed bottom-4 right-4 z-50 grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-black/80 text-3xl text-white shadow-[0_20px_40px_rgba(0,0,0,0.6)] transition hover:bg-white/15"
          >
            <span aria-hidden="true">×</span>
            <span className="sr-only">Cancel selection</span>
          </button>
        )
      )}

    </div>
  )
}

export default FamilyTreeCanvas

