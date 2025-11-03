import { useSyncExternalStore } from 'react'

export type Breakpoint = 'palm' | 'handset' | 'tablet' | 'desktop'

interface BreakpointState {
  width: number
  breakpoint: Breakpoint
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isNarrowPhone: boolean
  isLargePhone: boolean
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
let cachedSnapshot: BreakpointState | null = null

const snapshotFromWidth = (width: number): BreakpointState => {
  if (cachedSnapshot && cachedWidth === width) {
    return cachedSnapshot
  }

  const breakpoint = resolveBreakpoint(width)

  cachedWidth = width
  cachedSnapshot = {
    width,
    breakpoint,
    isMobile: breakpoint === 'palm' || breakpoint === 'handset',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isNarrowPhone: width <= PALM_MAX,
    isLargePhone: width > PALM_MAX && width <= HANDSET_MAX,
  }

  return cachedSnapshot
}

const getClientSnapshot = () => {
  if (typeof window === 'undefined') {
    return snapshotFromWidth(TABLET_MAX + 1)
  }

  return snapshotFromWidth(window.innerWidth)
}

const getServerSnapshot = () => snapshotFromWidth(TABLET_MAX + 1)

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


