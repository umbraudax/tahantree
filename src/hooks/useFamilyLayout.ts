import { hierarchy, tree } from 'd3-hierarchy'
import { useMemo } from 'react'

import type { FamilyGraph, FamilyUnit } from '../types/family'

const HORIZONTAL_SPACING = 190
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

export const useFamilyLayout = (graph: FamilyGraph | null): LayoutResult | null =>
  useMemo(() => {
    if (!graph || graph.roots.length === 0) return null

    const virtualRoot = makeVirtualRoot(graph.roots)
    const layoutTree = tree<FamilyUnit | VirtualRoot>().nodeSize([HORIZONTAL_SPACING, VERTICAL_SPACING])

    const hierarchyRoot = hierarchy<FamilyUnit | VirtualRoot>(virtualRoot, (unit) =>
      unit.childIds?.map((childId) => graph.unitsById[childId]).filter(Boolean) ?? [],
    )

    const treeRoot = layoutTree(hierarchyRoot)
    type HierNode = typeof treeRoot
    const staggerCache = new WeakMap<HierNode, Map<HierNode, number>>()
    const levelMap = new WeakMap<HierNode, number>()

    const traverseLevels = (node: HierNode, parentLevel: number, parentGeneration: number) => {
      const data = node.data as FamilyUnit | VirtualRoot

      if (data.id === virtualRoot.id) {
        for (const child of node.children ?? []) {
          traverseLevels(child, parentLevel, virtualRoot.generation)
        }
        return
      }

      const unitData = data as FamilyUnit
      const generationGap = Math.max(1, unitData.generation - parentGeneration)
      const level = parentLevel + generationGap
      levelMap.set(node, level)

      for (const child of node.children ?? []) {
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

    const adjustedNodes = treeRoot.descendants().filter((node) => node.data.id !== virtualRoot.id)

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
      const position: LayoutPosition = {
        x: node.x,
        y: level * VERTICAL_SPACING + getSiblingStagger(node),
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

