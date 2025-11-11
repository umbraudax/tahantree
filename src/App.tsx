import { useEffect, useMemo, useState } from 'react'

import { useBreakpoint } from './hooks/useBreakpoint'

import FamilyTree from './components/FamilyTree'

const tutorialSections = [
  {
    title: 'Explore the tree',
    points: [
      'Drag or swipe anywhere on the canvas to pan across the branches.',
      'Use your mouse wheel, trackpad scroll, or pinch gestures to zoom. The on-screen − / + controls and Reset button keep the layout manageable.',
      'Hovering a person on desktop highlights their immediate family and shows a rich tooltip with key details.',
    ],
  },
  {
    title: 'Understand each person',
    points: [
      'Color glows reflect each branch. When you focus or hover someone, their parents, siblings, spouse, and children glow with them.',
    ],
  },
  {
    title: 'Search & focus quickly',
    points: [
      'Type a name into the “Find a person” search field to jump straight to them. Selecting a result recenters and zooms the tree.',
      'On phones and small tablets, tap the “Search & Select” button to open the control sheet with the same search and assignment tools.',
    ],
  },
  {
    title: 'Compare relationships',
    points: [
      'Use “Select A” and “Select B” to tag two people. Their relationship summary appears in the bottom control panel (desktop) or mobile sheet.',
      'Assign people directly from the search results with the “+ Search” shortcuts or by tapping the left or right half of a person card.',
      'Use “Clear A & B” anytime to start a fresh comparison.',
    ],
  },
  {
    title: 'Use the branch legend & stats',
    points: [
      'Toggle “Show Legend” in the top corner to see color assignments for each branch.',
      'Review the Family Overview stats bar for counts of people, units, branches, and generations. On mobile it lives inside the collapsible summary.',
    ],
  },
]

const App = () => {
  const [isTutorialOpen, setTutorialOpen] = useState(false)
  const { isMobile, isLandscape } = useBreakpoint()
  const isMobileLandscape = isMobile && isLandscape
  const isMobilePortrait = isMobile && !isLandscape
  const helpButtonStyle = isMobileLandscape
    ? {
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
      }
    : undefined
  const helpButtonPositionClasses = isMobileLandscape ? '' : 'bottom-4 left-4 md:bottom-6 md:left-6'

  useEffect(() => {
    if (!isTutorialOpen) return
    if (typeof document === 'undefined') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isTutorialOpen])

  const tutorialContent = useMemo(
    () =>
      tutorialSections.map((section) => (
        <section
          key={section.title}
          className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 shadow-[0_20px_45px_rgba(0,0,0,0.55)] backdrop-blur"
        >
          <h3 className="text-base font-semibold text-white">{section.title}</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/90">
            {section.points.map((point, index) => (
              <li key={`${section.title}-${index}`} className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/70" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      )),
    [],
  )

  return (
    <div className="flex min-h-screen flex-col bg-black text-white pb-safe-b">
      {!isMobilePortrait && (
        <header className="border-b border-white/10 bg-black px-4 py-4 xs:px-5 sm:px-6 sm:py-5 md:px-8 md:py-6 pt-safe-t">
          <div className="mx-auto flex w/full max-w-6xl flex-col items-center gap-3 text-center">
            <h1 className="font-semibold tracking-tight text-2xl xs:text-[26px] sm:text-3xl md:text-[34px]">
              Hamway &amp; Tahan Family Tree
            </h1>
          </div>
        </header>
      )}
      <main className="flex-1 overflow-hidden">
        <FamilyTree />
      </main>

      <button
        id="app-help-button"
        type="button"
        onClick={() => setTutorialOpen(true)}
        className={`fixed z-[80] flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/15 text-2xl font-semibold text-white backdrop-blur shadow-[0_15px_30px_rgba(0,0,0,0.55)] transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black ${helpButtonPositionClasses}`}
        style={helpButtonStyle}
        aria-haspopup="dialog"
        aria-expanded={isTutorialOpen}
        aria-controls="app-tutorial-dialog"
      >
        <span aria-hidden="true">?</span>
        <span className="sr-only">Open application tutorial</span>
      </button>

      {isTutorialOpen && (
        <div
          id="app-tutorial-dialog"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-8"
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setTutorialOpen(false)}
          />
          <div className="relative z-[1] flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-black/90 p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
            <button
              type="button"
              onClick={() => setTutorialOpen(false)}
              className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/15 text-lg text-white backdrop-blur transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black"
            >
              <span aria-hidden="true">×</span>
              <span className="sr-only">Close tutorial</span>
            </button>

            <div className="pr-3">
              <div className="mr-12 flex flex-col gap-3">
                <h2 className="text-2xl font-semibold text-white">How to use the family tree</h2>
              </div>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto pr-1">
              <div className="space-y-4 pr-3">{tutorialContent}</div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

export default App
