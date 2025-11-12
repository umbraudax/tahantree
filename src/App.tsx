import { useCallback, useEffect, useMemo, useState } from 'react'

import { useBreakpoint } from './hooks/useBreakpoint'

import { useFeatureTutorials } from './tutorials/useFeatureTutorials'
import type { FeatureTutorialId } from './tutorials/types'

import FamilyTree from './components/FamilyTree'

interface FeatureEntry {
  id: FeatureTutorialId
  desktopTitle: string
  mobileTitle?: string
  description: string
}

const featureEntries: FeatureEntry[] = [
  {
    id: 'compare',
    desktopTitle: 'A/B Comparison',
    mobileTitle: 'Assign A/B',
    description: 'Click any Select A/B control to learn how comparisons work.',
  },
  {
    id: 'birthdays',
    desktopTitle: 'Weekly Birthdays',
    mobileTitle: 'Birthday Highlights',
    description: 'Open the birthday panel or toggle to learn how to celebrate upcoming events.',
  },
  {
    id: 'search',
    desktopTitle: 'Find & Focus Search',
    mobileTitle: 'Search Drawer',
    description: 'Use the search bar or drawer controls to explore locating relatives quickly.',
  },
  {
    id: 'zoom',
    desktopTitle: 'Zoom & Reset',
    description: 'Interacting with the zoom controls or radial wheel starts the navigation walkthrough.',
  },
  {
    id: 'nodeInfo',
    desktopTitle: 'Person Details',
    description: 'Click any person in the tree to learn about highlights, tooltips, and node details.',
  },
]

const featureSelectorMap: Record<FeatureTutorialId, string[]> = {
  compare: [
    '[data-tour-area="compare-menu"]',
    '[data-tour-id="desktop-select-a"]',
    '[data-tour-id="desktop-select-b"]',
    '[data-tour-id="desktop-clear-ab"]',
    '[data-tour-id="mobile-select-a"]',
    '[data-tour-id="mobile-select-b"]',
    '[data-tour-id="mobile-clear-ab"]',
    '[data-tour-id="relationship-summary"]',
  ],
  birthdays: [
    '[data-tour-area="birthdays-panel"]',
    '[data-tour-id="desktop-birthdays-panel"]',
    '[data-tour-id="mobile-birthdays-panel"]',
    '[data-tour-id="mobile-birthdays-sheet"]',
    '[data-tour-id="mobile-birthdays-toggle"]',
    '[data-tour-birthday-entry]',
    '[data-tour-birthday-day]'
  ],
  search: [
    '[data-tour-area="search-controls"]',
    '[data-tour-id="desktop-search-form"]',
    '[data-tour-id="desktop-search-field"]',
    '[data-tour-id="desktop-search-input"]',
    '[data-tour-id="desktop-search-results"]',
    '[data-tour-id="desktop-search-submit"]',
    '[data-tour-id="mobile-search-form"]',
    '[data-tour-id="mobile-search-field"]',
    '[data-tour-id="mobile-search-input"]',
    '[data-tour-id="mobile-search-results"]',
    '[data-tour-id="mobile-search-submit"]',
  ],
  zoom: [
    '[data-tour-area="zoom-controls"]',
    '[data-tour-id="top-control-row"]',
    '[data-tour-id="zoom-in-button"]',
    '[data-tour-id="zoom-out-button"]',
    '[data-tour-id="reset-view-button"]',
    '[data-tour-id="landscape-control-toggle"]',
    '[data-tour-id="landscape-control-zoom-in"]',
    '[data-tour-id="landscape-control-zoom-out"]',
    '[data-tour-id="landscape-control-reset"]',
    ],
  nodeInfo: [],
}

const App = () => {
  const [isHelpMode, setHelpMode] = useState(false)
  const { isMobile, isLandscape } = useBreakpoint()
  const { launchFeatureTour } = useFeatureTutorials()
  const isMobileLandscape = isMobile && isLandscape
  const helpButtonStyle = isMobileLandscape
    ? {
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
      }
    : undefined
  const helpButtonPositionClasses = isMobileLandscape ? '' : 'bottom-4 left-4 md:bottom-6 md:left-6'

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('help-mode', isHelpMode)
    return () => {
      document.body.classList.remove('help-mode')
    }
  }, [isHelpMode])

  const matchFeatureFromElement = useCallback((element: HTMLElement | null): FeatureTutorialId | null => {
    if (!element) return null
    const nodeTarget = element.closest('[data-person-id]')
    if (nodeTarget) {
      return 'nodeInfo'
    }
    const entries = Object.entries(featureSelectorMap) as Array<[FeatureTutorialId, string[]]>
    for (const [featureId, selectors] of entries) {
      for (const selector of selectors) {
        const match = element.closest(selector)
        if (match) {
          return featureId
        }
      }
    }
    return null
  }, [])

  useEffect(() => {
    if (!isHelpMode) return
    if (typeof document === 'undefined') return

    const handleClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      const helpButton = document.getElementById('app-help-button')
      if (helpButton && (target === helpButton || helpButton.contains(target))) {
        return
      }

      if (target.closest('[data-help-overlay]')) {
        return
      }

      const featureId = matchFeatureFromElement(target)
      if (!featureId) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setHelpMode(false)
      requestAnimationFrame(() => {
        launchFeatureTour(featureId)
      })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHelpMode(false)
      }
    }

    document.addEventListener('click', handleClickCapture, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('click', handleClickCapture, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isHelpMode, launchFeatureTour, matchFeatureFromElement])

  const activeInstructions = useMemo(() => {
    if (!isHelpMode) return null
    return featureEntries
  }, [isHelpMode])

  const handleHelpButtonClick = () => {
    setHelpMode((current) => !current)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-black text-white pb-safe-b">
      <main className="flex-1 overflow-hidden">
        <FamilyTree />
      </main>

      <button
        id="app-help-button"
        type="button"
        onClick={handleHelpButtonClick}
        className={`fixed z-[95] flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/15 text-2xl font-semibold text-white backdrop-blur shadow-[0_15px_30px_rgba(0,0,0,0.55)] transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black ${helpButtonPositionClasses}`}
        style={helpButtonStyle}
        aria-pressed={isHelpMode}
        aria-label={isHelpMode ? 'Exit help mode' : 'Enter help mode'}
      >
        <span aria-hidden="true">?</span>
      </button>

      {isHelpMode && activeInstructions && (
        <div className="pointer-events-none fixed bottom-24 left-20 z-[94] max-w-sm px-4" data-help-overlay>
          <div className="pointer-events-auto rounded-3xl border border-white/15 bg-black/80 px-5 py-4 text-sm text-white shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Help mode is active</h2>
                <p className="mt-1 text-xs text-white/70">
                  Hover to highlight controls. Click any glowing area to launch its interactive walkthrough. Press Esc or the help button to cancel.
                </p>
              </div>
            <button
              type="button"
                onClick={() => setHelpMode(false)}
                className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-white/20"
            >
                Exit
            </button>
            </div>
            <ul className="mt-3 space-y-2 text-xs text-white/70">
              {activeInstructions.map((feature) => (
                <li key={feature.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/55">
                    {isMobile ? feature.mobileTitle ?? feature.desktopTitle : feature.desktopTitle}
            </div>
                  <div className="mt-1 text-xs leading-snug text-white/70">{feature.description}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
