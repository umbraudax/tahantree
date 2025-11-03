declare module 'd3-hierarchy' {
  export interface HierarchyPointNode<T> {
    data: T
    x: number
    y: number
    depth: number
    height: number
    parent: HierarchyPointNode<T> | null
    children?: Array<HierarchyPointNode<T>>
    descendants(): Array<HierarchyPointNode<T>>
  }

  export interface TreeLayout<T> {
    (root: HierarchyPointNode<T>): HierarchyPointNode<T>
    nodeSize(size: [number, number]): TreeLayout<T>
    separation(
      separation: (a: HierarchyPointNode<T>, b: HierarchyPointNode<T>) => number,
    ): TreeLayout<T>
  }

  export function hierarchy<T>(
    data: T,
    children?: (d: T) => Array<T | undefined> | undefined,
  ): HierarchyPointNode<T>

  export function tree<T>(): TreeLayout<T>
}

