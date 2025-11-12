/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'd3-dsv' {
  export function csvParse<T = any>(input: string): T[]
}

