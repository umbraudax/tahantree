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
const MOBILE_USER_AGENT_REGEX = /Android|iPhone|iPod|iPad|IEMobile|Windows Phone|BlackBerry|webOS/i

type DeviceCharacteristics = {
  isMobileUserAgent: boolean
  hasCoarsePointer: boolean
}

const resolveBreakpoint = (width: number): Breakpoint => {
  if (width <= PALM_MAX) return 'palm'
  if (width <= HANDSET_MAX) return 'handset'
  if (width <= TABLET_MAX) return 'tablet'
  return 'desktop'
}

let cachedWidth: number | null = null
let cachedHeight: number | null = null
let cachedSnapshot: BreakpointState | null = null
let cachedDeviceSignature: string | null = null

const extractDeviceCharacteristics = (): DeviceCharacteristics => {
  if (typeof window === 'undefined') {
    return { isMobileUserAgent: false, hasCoarsePointer: false }
  }

  const navigatorWithUAData = window.navigator as Navigator & {
    userAgentData?: {
      mobile?: boolean
    }
  }

  const uaDataMobile =
    typeof navigatorWithUAData.userAgentData?.mobile === 'boolean'
      ? navigatorWithUAData.userAgentData.mobile
      : undefined

  const userAgent = navigatorWithUAData.userAgent || ''
  const isMobileUserAgent = uaDataMobile ?? MOBILE_USER_AGENT_REGEX.test(userAgent)

  const hasCoarsePointer =
    typeof window.matchMedia === 'function' ? window.matchMedia('(pointer:coarse)').matches : false

  return {
    isMobileUserAgent,
    hasCoarsePointer,
  }
}

const snapshotFromDimensions = (width: number, height: number): BreakpointState => {
  const deviceCharacteristics = extractDeviceCharacteristics()
  const deviceSignature = `${deviceCharacteristics.isMobileUserAgent}-${deviceCharacteristics.hasCoarsePointer}`

  if (
    cachedSnapshot &&
    cachedWidth === width &&
    cachedHeight === height &&
    cachedDeviceSignature === deviceSignature
  ) {
    return cachedSnapshot
  }

  const orientation: Orientation = width >= height ? 'landscape' : 'portrait'
  const shortestSide = Math.min(width, height)
  const longestSide = Math.max(width, height)
  const breakpoint = resolveBreakpoint(longestSide)
  const isLikelyMobileDevice = deviceCharacteristics.isMobileUserAgent || deviceCharacteristics.hasCoarsePointer
  const isMobile = isLikelyMobileDevice && shortestSide <= HANDSET_MAX
  const isTablet = isLikelyMobileDevice && !isMobile && shortestSide <= TABLET_MAX

  cachedWidth = width
  cachedHeight = height
  cachedDeviceSignature = deviceSignature
  cachedSnapshot = {
    width,
    height,
    breakpoint,
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    isNarrowPhone: isMobile && shortestSide <= PALM_MAX,
    isLargePhone: isMobile && shortestSide > PALM_MAX && shortestSide <= HANDSET_MAX,
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


