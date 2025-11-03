import { useSyncExternalStore } from 'react'

export type Breakpoint = 'palm' | 'handset' | 'tablet' | 'desktop'

type Orientation = 'portrait' | 'landscape'

interface BreakpointState {
  width: number
  height: number
  breakpoint: Breakpoint
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isNarrowPhone: boolean
  isLargePhone: boolean
  orientation: Orientation
  isLandscape: boolean
  isPortrait: boolean
}

const PALM_MAX = 359
const HANDSET_MAX = 767
const TABLET_MAX = 1023

const resolveBreakpoint = (width: number): Breakpoint => {
  if (width <= PALM_MAX) return 'palm'
  if (width <= HANDSET_MAX) return 'handset'
  if (width <= TABLET_MAX) return 'tablet'
  return 'desktop'
}

let cachedWidth: number | null = null
let cachedHeight: number | null = null
let cachedSnapshot: BreakpointState | null = null

const snapshotFromDimensions = (width: number, height: number): BreakpointState => {
  if (cachedSnapshot && cachedWidth === width && cachedHeight === height) {
    return cachedSnapshot
  }

  const breakpoint = resolveBreakpoint(width)
  const orientation: Orientation = width >= height ? 'landscape' : 'portrait'

  cachedWidth = width
  cachedHeight = height
  cachedSnapshot = {
    width,
    height,
    breakpoint,
    isMobile: breakpoint === 'palm' || breakpoint === 'handset',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isNarrowPhone: width <= PALM_MAX,
    isLargePhone: width > PALM_MAX && width <= HANDSET_MAX,
    orientation,
    isLandscape: orientation === 'landscape',
    isPortrait: orientation === 'portrait',
  }

  return cachedSnapshot
}

const getClientSnapshot = () => {
  if (typeof window === 'undefined') {
    return snapshotFromDimensions(TABLET_MAX + 1, TABLET_MAX + 1)
  }

  return snapshotFromDimensions(window.innerWidth, window.innerHeight)
}

const getServerSnapshot = () => snapshotFromDimensions(TABLET_MAX + 1, TABLET_MAX + 1)

const subscribe = (listener: () => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  window.addEventListener('resize', listener, { passive: true })
  window.addEventListener('orientationchange', listener, { passive: true })

  return () => {
    window.removeEventListener('resize', listener)
    window.removeEventListener('orientationchange', listener)
  }
}

export const useBreakpoint = (): BreakpointState =>
  useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)


