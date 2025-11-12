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
  learnLabel: string
  accent: string
}

const featureEntries: FeatureEntry[] = [
  {
    id: 'compare',
    desktopTitle: 'A/B Comparison Menu',
    mobileTitle: 'Assign A/B & Search Drawer',
    description:
      'Walk through assigning relatives into slots A & B, triggering comparisons, and interpreting the relationship summary.',
    learnLabel: 'Learn about comparing relatives',
    accent: 'from-amber-400/35 via-orange-400/20 to-transparent',
  },
  {
    id: 'birthdays',
    desktopTitle: 'Weekly Birthday Menu',
    mobileTitle: 'Birthday Highlights',
    description:
      'See how to open the birthday planner, filter by week, and celebrate upcoming milestones across the branches.',
    learnLabel: 'Learn about birthday planning',
    accent: 'from-pink-400/35 via-purple-400/20 to-transparent',
  },
  {
    id: 'search',
    desktopTitle: 'Find & Focus Search',
    mobileTitle: 'Focused Search Shortcuts',
    description:
      'Master the search field, jump to a person instantly, and explore quick-assign shortcuts tailored to your layout.',
    learnLabel: 'Learn about smart searching',
    accent: 'from-sky-400/35 via-cyan-400/20 to-transparent',
  },
  {
    id: 'zoom',
    desktopTitle: 'Zoom / Reset Controls',
    mobileTitle: 'Pinch, Zoom & Reset',
    description:
      'Practice zooming in and out, resetting the layout, and balancing the full tree on desktop, phone portrait, and landscape.',
    learnLabel: 'Learn about navigation controls',
    accent: 'from-lime-400/35 via-emerald-400/20 to-transparent',
  },
  {
    id: 'nodeInfo',
    desktopTitle: 'Node Details & Highlights',
    mobileTitle: 'Person Detail Cards',
    description:
      'Discover the rich tooltips, quick actions, and context glows available when you focus or tap anyone in the tree.',
    learnLabel: 'Learn about person insights',
    accent: 'from-amber-300/40 via-rose-300/25 to-transparent',
  },
]

const App = () => {
  const [isLauncherOpen, setLauncherOpen] = useState(false)
  const { isMobile, isLandscape, isDesktop } = useBreakpoint()
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
    if (!isLauncherOpen) return
    if (typeof document === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isLauncherOpen])

  const featureCards = useMemo(
    () =>
      featureEntries.map((feature) => ({
        ...feature,
        title: isMobile ? feature.mobileTitle ?? feature.desktopTitle : feature.desktopTitle,
      })),
    [isMobile],
  )

  const handleLaunchFeature = useCallback(
    (featureId: FeatureTutorialId) => {
      setLauncherOpen(false)
      requestAnimationFrame(() => {
        launchFeatureTour(featureId)
      })
    },
    [launchFeatureTour],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden bg-black text-white pb-safe-b">
      <main className="flex-1 overflow-hidden">
        <FamilyTree />
      </main>

      <button
        id="app-help-button"
        type="button"
        onClick={() => setLauncherOpen(true)}
        className={`fixed z-[80] flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/15 text-2xl font-semibold text-white backdrop-blur shadow-[0_15px_30px_rgba(0,0,0,0.55)] transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black ${helpButtonPositionClasses}`}
        style={helpButtonStyle}
        aria-haspopup="dialog"
        aria-expanded={isLauncherOpen}
        aria-controls="app-tutorial-dialog"
      >
        <span aria-hidden="true">?</span>
        <span className="sr-only">Open application tutorial</span>
      </button>

      {isLauncherOpen && (
        <div
          id="app-tutorial-dialog"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-8"
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setLauncherOpen(false)}
          />
          <div className="relative z-[1] flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-black/90 p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
            <button
              type="button"
              onClick={() => setLauncherOpen(false)}
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/15 text-lg text-white backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black"
            >
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close tutorial</span>
            </button>

            <div className="pr-3">
              <div className="mr-12 flex flex-col gap-3">
                <h2 className="text-2xl font-semibold text-white">Choose a feature to walk through</h2>
                <p className="text-sm text-white/70">
                  {isDesktop
                    ? 'Hover to preview and click to start a guided session. We will bring the live tree into a safe, learnable state with example relatives.'
                    : 'Tap a card to launch the guided walkthrough. We adapt the steps to portrait, landscape, and touch layouts automatically.'}
                </p>
              </div>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-4 pr-3 sm:grid-cols-2">
                {featureCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleLaunchFeature(card.id)}
                    className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.08] p-5 text-left transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                      isDesktop
                        ? 'hover:border-amber-300/70 hover:shadow-[0_24px_60px_rgba(251,191,36,0.22)]'
                        : 'active:scale-[0.99] active:border-amber-200/80'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 ${isDesktop ? 'bg-gradient-to-br ' + card.accent : ''}`}
                    />
                    <div className="relative z-[1] flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium uppercase tracking-[0.2em] text-white/45">
                          Guided Tutorial
                        </span>
                        <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                      </div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold uppercase text-amber-200 shadow-[0_15px_35px_rgba(251,191,36,0.18)] transition group-hover:bg-amber-300/20">
                        Start
                      </div>
                    </div>
                    <p className="relative z-[1] mt-3 text-sm text-white/70 transition group-hover:text-white/90">
                      {card.description}
                    </p>
                    <p className="relative z-[1] mt-5 text-xs font-semibold uppercase tracking-wider text-amber-300/80 transition group-hover:text-amber-200">
                      {card.learnLabel}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
