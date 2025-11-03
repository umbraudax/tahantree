import { hierarchy, tree } from 'd3-hierarchy'
import { useMemo } from 'react'

import { computeUnitDimensions, MIN_PARENT_CHILD_GAP, MIN_UNIT_GAP } from '../constants/layout'
import type { FamilyGraph, FamilyUnit } from '../types/family'

const BASE_UNIT_DIMENSIONS = computeUnitDimensions(1)
const BASE_UNIT_WIDTH = BASE_UNIT_DIMENSIONS.width
const BASE_UNIT_HEIGHT = BASE_UNIT_DIMENSIONS.height
const HORIZONTAL_SPACING = BASE_UNIT_WIDTH + MIN_UNIT_GAP
const VERTICAL_SPACING = 440
const PADDING_X = 140
const PADDING_Y = 260
const SIBLING_BASE_STAGGER = 70
const SIBLING_HEIGHT_FACTOR = 55
const SIBLING_DESCENDANT_FACTOR = 30

export interface LayoutPosition {
  x: number
  y: number
  depth: number
}

export interface LayoutNode {
  unit: FamilyUnit
  position: LayoutPosition
}

export interface LayoutLink {
  sourceId: string
  targetId: string
}

export interface LayoutResult {
  nodes: LayoutNode[]
  links: LayoutLink[]
  positions: Record<string, LayoutPosition>
  size: { width: number; height: number }
}

interface VirtualRoot extends FamilyUnit {
  isVirtual: true
}

const makeVirtualRoot = (roots: FamilyUnit[]): VirtualRoot => ({
  id: 'virtual-root',
  members: [],
  memberIds: [],
  branch: 'virtual',
  generation: Math.min(...roots.map((root) => root.generation)) - 1,
  childIds: roots.map((root) => root.id),
  isVirtual: true,
})

const isVirtualUnit = (unit: FamilyUnit | VirtualRoot): unit is VirtualRoot =>
  (unit as VirtualRoot).isVirtual === true

interface LayoutHierarchyNode {
  data: FamilyUnit | VirtualRoot
  x: number
  y: number
  depth: number
  height: number
  parent: LayoutHierarchyNode | null
  children?: LayoutHierarchyNode[]
  descendants(): LayoutHierarchyNode[]
}

const isOtherBranch = (branch: string | undefined): boolean =>
  (branch ?? '').trim().toLowerCase() === 'other'

const computeBranchGap = (left?: FamilyUnit | null, right?: FamilyUnit | null) => {
  if (!left || !right) return MIN_UNIT_GAP
  if (left.branch === right.branch) return MIN_UNIT_GAP

  let gap = MIN_UNIT_GAP * 3
  if (isOtherBranch(left.branch) || isOtherBranch(right.branch)) {
    gap = Math.max(gap, BASE_UNIT_WIDTH * 10)
  }

  return gap
}

export const useFamilyLayout = (graph: FamilyGraph | null): LayoutResult | null =>
  useMemo(() => {
    if (!graph || graph.roots.length === 0) return null

    const virtualRoot = makeVirtualRoot(graph.roots)
    const layoutTree = tree<FamilyUnit | VirtualRoot>()
      .nodeSize([HORIZONTAL_SPACING, VERTICAL_SPACING])
      .separation((first: LayoutHierarchyNode, second: LayoutHierarchyNode) => {
        const firstData = first.data as FamilyUnit | VirtualRoot
        const secondData = second.data as FamilyUnit | VirtualRoot

        if (isVirtualUnit(firstData) || isVirtualUnit(secondData)) {
          return 1
        }

        const firstUnit = firstData as FamilyUnit
        const secondUnit = secondData as FamilyUnit
        const firstWidth = computeUnitDimensions(firstUnit.members.length, Boolean(firstUnit.spouseBond)).width
        const secondWidth = computeUnitDimensions(secondUnit.members.length, Boolean(secondUnit.spouseBond)).width
        const branchGap = computeBranchGap(firstUnit, secondUnit)
        const requiredSpacing = (firstWidth + secondWidth) / 2 + branchGap

        return Math.max(requiredSpacing / HORIZONTAL_SPACING, 1)
      })

    const hierarchyRoot = hierarchy<FamilyUnit | VirtualRoot>(virtualRoot, (unit: FamilyUnit | VirtualRoot) =>
      unit.childIds?.map((childId: string) => graph.unitsById[childId]).filter(Boolean) ?? [],
    )

    const treeRoot = layoutTree(hierarchyRoot) as unknown as LayoutHierarchyNode
    type HierNode = LayoutHierarchyNode

    const getNodeUnit = (node: HierNode): FamilyUnit | null => {
      const data = node.data as FamilyUnit | VirtualRoot
      return isVirtualUnit(data) ? null : (data as FamilyUnit)
    }

    const getNodeWidth = (node: HierNode): number => {
      const unit = getNodeUnit(node)
      if (!unit) return BASE_UNIT_WIDTH
      return computeUnitDimensions(unit.members.length, Boolean(unit.spouseBond)).width
    }

    const getNodeHeight = (node: HierNode): number => {
      const unit = getNodeUnit(node)
      if (!unit) return BASE_UNIT_HEIGHT
      return computeUnitDimensions(unit.members.length, Boolean(unit.spouseBond)).height
    }

    const shiftSubtree = (node: HierNode, delta: number): void => {
      node.x += delta
      for (const child of node.children ?? []) {
        shiftSubtree(child, delta)
      }
    }

    const enforceSiblingSpacing = (node: HierNode): void => {
      for (const child of node.children ?? []) {
        enforceSiblingSpacing(child)
      }

      if (!node.children || node.children.length <= 1) return

      let previous = node.children[0]
      for (let index = 1; index < node.children.length; index += 1) {
        const current = node.children[index]
        const previousWidth = getNodeWidth(previous)
        const currentWidth = getNodeWidth(current)
        const previousUnit = getNodeUnit(previous)
        const currentUnit = getNodeUnit(current)

        const previousRight = previous.x + previousWidth / 2
        const currentLeft = current.x - currentWidth / 2
        const requiredGap = computeBranchGap(previousUnit, currentUnit)
        const overlap = previousRight + requiredGap - currentLeft

        if (overlap > 0) {
          shiftSubtree(current, overlap)
        }

        previous = current
      }
    }

    enforceSiblingSpacing(treeRoot)
    const staggerCache = new WeakMap<HierNode, Map<HierNode, number>>()
    const levelMap = new WeakMap<HierNode, number>()

    const traverseLevels = (node: HierNode, parentLevel: number, parentGeneration: number) => {
      const data = node.data as FamilyUnit | VirtualRoot

      if (data.id === virtualRoot.id) {
        const children = node.children ?? []
        for (const child of children) {
          traverseLevels(child, parentLevel, virtualRoot.generation)
        }
        return
      }

      const unitData = data as FamilyUnit
      const generationGap = Math.max(1, unitData.generation - parentGeneration)
      const level = parentLevel + generationGap
      levelMap.set(node, level)

      const children = node.children ?? []
      for (const child of children) {
        traverseLevels(child, level, unitData.generation)
      }
    }

    traverseLevels(treeRoot, -1, virtualRoot.generation)

    const computeSiblingOffsets = (parent: HierNode): Map<HierNode, number> => {
      const siblings = (parent.children ?? []).filter((child) => child.data.id !== virtualRoot.id)
      const offsets = new Map<HierNode, number>()
      if (siblings.length <= 1) return offsets

      const steps = siblings.map((child) => {
        const height = child.height ?? 0
        const descendantCount = child.descendants().length - 1
        return (
          SIBLING_BASE_STAGGER +
          height * SIBLING_HEIGHT_FACTOR +
          Math.sqrt(Math.max(descendantCount, 0)) * SIBLING_DESCENDANT_FACTOR
        )
      })

      const rawOffsets = new Array(siblings.length).fill(0)
      for (let index = 1; index < siblings.length; index += 1) {
        const spacing = (steps[index - 1] + steps[index]) / 2
        rawOffsets[index] = rawOffsets[index - 1] + spacing
      }

      const minOffset = Math.min(...rawOffsets)
      const maxOffset = Math.max(...rawOffsets)
      const center = (minOffset + maxOffset) / 2

      for (let index = 0; index < siblings.length; index += 1) {
        offsets.set(siblings[index], rawOffsets[index] - center)
      }

      return offsets
    }

    const positions = new Map<string, LayoutPosition>()
    const nodes: LayoutNode[] = []
    const links: LayoutLink[] = []

    const rawX: number[] = []
    const rawY: number[] = []

    const adjustedNodes: HierNode[] = treeRoot
      .descendants()
      .filter((node) => node.data.id !== virtualRoot.id)

    const getSiblingStagger = (node: HierNode): number => {
      const parent = node.parent
      if (!parent) return 0

      let cached = staggerCache.get(parent)
      if (!cached) {
        cached = computeSiblingOffsets(parent)
        staggerCache.set(parent, cached)
      }

      return cached.get(node) ?? 0
    }

    for (const node of adjustedNodes) {
      const data = node.data as FamilyUnit
      const level = levelMap.get(node) ?? node.depth - 1
      const parentNode = (node.parent as HierNode | null) ?? null
      const baseY = level * VERTICAL_SPACING + getSiblingStagger(node)
      let adjustedY = baseY

      if (parentNode && parentNode.data.id !== virtualRoot.id) {
        const parentId = (parentNode.data as FamilyUnit).id
        const parentPosition = positions.get(parentId)
        if (parentPosition) {
          const parentHeight = getNodeHeight(parentNode)
          const childHeight = getNodeHeight(node)
          const minCenterDistance = parentHeight / 2 + childHeight / 2 + MIN_PARENT_CHILD_GAP
          const minAllowedY = parentPosition.y + minCenterDistance
          if (adjustedY < minAllowedY) {
            adjustedY = minAllowedY
          }
        }
      }

      const position: LayoutPosition = {
        x: node.x,
        y: adjustedY,
        depth: level,
      }

      positions.set(data.id, position)
      nodes.push({ unit: data, position })
      rawX.push(position.x)
      rawY.push(position.y)
    }

    for (const node of adjustedNodes) {
      const sourceId = (node.data as FamilyUnit).id
      for (const child of node.children ?? []) {
        if (child.data.id === virtualRoot.id) continue
        links.push({ sourceId, targetId: (child.data as FamilyUnit).id })
      }
    }

    const minX = Math.min(...rawX)
    const maxX = Math.max(...rawX)
    const minY = Math.min(...rawY)
    const maxY = Math.max(...rawY)

    const offsetX = -minX + PADDING_X
    const offsetY = -minY + PADDING_Y

    const resultNodes = nodes.map(({ unit, position }) => {
      const adjusted: LayoutPosition = {
        depth: position.depth,
        x: position.x + offsetX,
        y: position.y + offsetY,
      }
      positions.set(unit.id, adjusted)
      return { unit, position: adjusted }
    })

    const positionsRecord: Record<string, LayoutPosition> = {}
    for (const [key, value] of positions.entries()) {
      positionsRecord[key] = value
    }

    const width = maxX - minX + PADDING_X * 2
    const height = maxY - minY + PADDING_Y * 2

    return {
      nodes: resultNodes,
      links,
      positions: positionsRecord,
      size: { width, height },
    }
  }, [graph])

