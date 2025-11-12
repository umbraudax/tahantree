/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
declare module 'd3-zoom' {
  export interface ZoomTransform {
    x: number
    y: number
    k: number
    rescaleX: (scale: unknown) => unknown
    rescaleY: (scale: unknown) => unknown
    toString(): string
    translate(x: number, y: number): ZoomTransform
    scale(k: number): ZoomTransform
  }

  export const zoomIdentity: ZoomTransform
  export function zoom<This, Datum>(): any
}

