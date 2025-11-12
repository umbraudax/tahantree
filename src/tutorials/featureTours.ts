import type { GuidedTourConfig } from '../hooks/useGuidedTour'
import type { FeatureTutorialId } from './types'
import type { FamilyTreeTutorialBridge } from './bridge'
import { getTutorialBridge } from './bridge'
import { attachToSelector, waitForElement } from './dom'

type TourBuilder = (bridge: FamilyTreeTutorialBridge) => GuidedTourConfig | null

const fallbackTour = (title: string, message: string): GuidedTourConfig => ({
  steps: [
    {
      title,
      text: message,
    },
  ],
})

const buildCompareTour: TourBuilder = (bridge) => {
  const pair = bridge.getRandomPair({ preferLiving: true })
  if (!pair) {
    return fallbackTour(
      'Not enough relatives',
      'We need at least two relatives to demonstrate comparisons. Add more people to the tree and try again.',
    )
  }

  const selectASelector = bridge.context.isMobile ? '[data-tour-id="mobile-select-a"]' : '[data-tour-id="desktop-select-a"]'
  const selectBSelector = bridge.context.isMobile ? '[data-tour-id="mobile-select-b"]' : '[data-tour-id="desktop-select-b"]'
  const clearSelector = bridge.context.isMobile ? '[data-tour-id="mobile-clear-ab"]' : '[data-tour-id="desktop-clear-ab"]'
  const summarySelector = '[data-tour-id="relationship-summary"]'
  const personASelector = `g[data-person-id="${pair.a.id}"]`
  const personBSelector = `g[data-person-id="${pair.b.id}"]`

  const openControls = () => {
    if (bridge.context.isMobile) {
      bridge.openControlSheet()
    }
  }

  return {
    steps: [
      {
        id: 'compare-start',
        title: 'Start with slot A',
        text: bridge.context.isMobile
          ? 'Tap the Select button for Person A. This keeps the drawer open so you can choose the relative next.'
          : 'Click Select A to arm the tray. Next you will click the relative who should occupy slot A.',
        attachTo: attachToSelector(selectASelector),
        advanceOn: { selector: 'body', event: 'tutorial:compareSelectingA' },
        beforeShowPromise: async () => {
          bridge.beginCompareTutorialSession()
          openControls()
          const element = await waitForElement(selectASelector)
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        },
      },
      {
        id: 'compare-set-a',
        title: `Choose ${pair.a.fullName}`,
        text: bridge.context.isMobile
          ? `Tap ${pair.a.fullName} on the tree now. Watch how the selection glow confirms that A has been assigned.`
          : `Click ${pair.a.fullName} on the tree to lock them into slot A. Notice the glow around the selected branch.`,
        attachTo: { element: personASelector, on: undefined },
        beforeShowPromise: async () => {
          bridge.focusOnPerson(pair.a.id)
          bridge.highlightPerson(pair.a.id)
          await waitForElement(() => document.querySelector(personASelector))
        },
        when: {
          show() {
            const handle = () => {
              this.tour.next()
            }
            window.addEventListener('tutorial:compareSelectedA', handle, { once: true })
            this.once('hide', () => {
              window.removeEventListener('tutorial:compareSelectedA', handle)
            })
          },
        },
      },
      {
        id: 'compare-start-b',
        title: 'Set up slot B',
        text: bridge.context.isMobile
          ? 'Open the drawer again and tap Select for Person B so we can capture the second relative.'
          : 'Click Select B to move the tray into selection mode for the second relative.',
        attachTo: attachToSelector(selectBSelector),
        advanceOn: { selector: 'body', event: 'tutorial:compareSelectingB' },
        beforeShowPromise: async () => {
          openControls()
          const element = await waitForElement(selectBSelector)
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        },
      },
      {
        id: 'compare-set-b',
        title: `Choose ${pair.b.fullName}`,
        text: bridge.context.isMobile
          ? `Tap ${pair.b.fullName} on the tree to complete the comparison. Notice how both relatives now glow.`
          : `Click ${pair.b.fullName} to fill slot B. The comparison tray and highlights update immediately.`,
        attachTo: { element: personBSelector, on: undefined },
        beforeShowPromise: async () => {
          bridge.focusOnPerson(pair.b.id)
          bridge.highlightPerson(pair.b.id)
          await waitForElement(() => document.querySelector(personBSelector))
        },
        when: {
          show() {
            const handle = () => {
              this.tour.next()
            }
            window.addEventListener('tutorial:compareSelectedB', handle, { once: true })
            this.once('hide', () => {
              window.removeEventListener('tutorial:compareSelectedB', handle)
            })
          },
        },
      },
      {
        id: 'compare-summary',
        title: 'Read the relationship summary',
        text: bridge.context.isMobile
          ? 'Open the drawer to review the summary. Read through each line to understand how these relatives are connected.'
          : 'Review the relationship summary. It spells out the connection in both directions and includes age offsets.',
        attachTo: attachToSelector(summarySelector),
        beforeShowPromise: async () => {
          openControls()
          await waitForElement(summarySelector)
        },
        buttons: [
          {
            text: 'Continue',
            classes: 'app-tour-button-primary',
            action() {
              this.next()
            },
          },
        ],
      },
      {
        id: 'compare-clear',
        title: 'Reset when you are done',
        text: bridge.context.isMobile
          ? 'Tap Clear A & B to reset the tray. You can now repeat the flow with any other relatives.'
          : 'Click Clear A & B to reset the comparison. Try experimenting with other relatives afterwards.',
        attachTo: attachToSelector(clearSelector),
        beforeShowPromise: async () => {
          openControls()
          const element = await waitForElement(clearSelector)
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        },
        when: {
          show() {
            const handle = () => {
              this.tour.next()
            }
            window.addEventListener('tutorial:compareCleared', handle, { once: true })
            this.once('hide', () => {
              window.removeEventListener('tutorial:compareCleared', handle)
            })
          },
        },
      },
    ],
    onCancel: () => {
      bridge.cancelCompareTutorialSession()
      bridge.highlightPerson(null)
    },
    onComplete: () => {
      bridge.completeCompareTutorialSession()
      bridge.highlightPerson(null)
    },
  }
}

const buildBirthdaysTour: TourBuilder = (bridge) => {
  const entry = bridge.getRandomBirthdayEntry()
  if (!entry) {
    return fallbackTour(
      'No birthdays this week',
      'There are no upcoming birthdays in the current week. Add birth dates to relatives or try again later.',
    )
  }

  const isMobilePortrait = bridge.context.isMobile && bridge.context.isMobilePortrait

  if (isMobilePortrait) {
    const toggleSelector = '[data-tour-id="mobile-birthdays-toggle"]'
    const entrySelector = `[data-tour-birthday-entry="${entry.person.id}"]`

    return {
      steps: [
        {
          id: 'birthdays-open-mobile',
          title: 'Open the birthdays tray',
          text: 'Tap the Birthdays button at the bottom of the tree. We will keep the sheet open while you interact.',
          attachTo: attachToSelector(toggleSelector),
          advanceOn: { selector: toggleSelector, event: 'click' },
          beforeShowPromise: async () => {
            const element = await waitForElement(toggleSelector)
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          },
        },
        {
          id: 'birthdays-highlight-entry',
          title: `${entry.person.fullName} has a birthday`,
          text: `Tap ${entry.person.fullName} in the list to jump straight to their place in the tree and close the sheet automatically.`,
          attachTo: attachToSelector(entrySelector),
          advanceOn: { selector: entrySelector, event: 'click' },
          beforeShowPromise: async () => {
            bridge.openBirthdaysPanel()
            await waitForElement(entrySelector)
          },
        },
        {
          id: 'birthdays-focus',
          title: 'Celebrate in context',
          text: 'When the tree recenters on the birthday person, explore the branch glow and consider starting a comparison from here.',
          attachTo: { element: `g[data-person-id="${entry.person.id}"]`, on: undefined },
          beforeShowPromise: async () => {
            bridge.focusOnPerson(entry.person.id)
            await waitForElement(() => document.querySelector(`g[data-person-id="${entry.person.id}"]`))
          },
        },
      ],
      onCancel: () => {
        bridge.closeBirthdaysPanel()
        bridge.highlightPerson(null)
        bridge.setSelectedPerson(null)
      },
      onComplete: () => {
        bridge.closeBirthdaysPanel()
        bridge.highlightPerson(null)
        bridge.setSelectedPerson(null)
      },
    }
  }

  const panelSelector = bridge.context.isMobile ? '[data-tour-id="mobile-birthdays-panel"]' : '[data-tour-id="desktop-birthdays-panel"]'
  const daySelector = `[data-tour-birthday-day="${entry.isoDate}"]`
  const entrySelector = `[data-tour-birthday-entry="${entry.person.id}"]`

  return {
    steps: [
      {
        id: 'birthdays-locate-panel',
        title: 'Weekly birthday planner',
        text: 'Hover this panel to reveal the planner. We keep the birthdays for the current week grouped by day.',
        attachTo: attachToSelector(panelSelector),
        beforeShowPromise: async () => {
          bridge.closeBirthdaysPanel()
          await waitForElement(panelSelector)
        },
      },
      {
        id: 'birthdays-focus-day',
        title: `${entry.dateLabel} celebrations`,
        text: `Click the ${entry.dateLabel} segment to expand that day. The badge shows how many birthdays are waiting.`,
        attachTo: attachToSelector(daySelector),
        advanceOn: { selector: daySelector, event: 'click' },
        beforeShowPromise: async () => {
          await waitForElement(daySelector)
        },
      },
      {
        id: 'birthdays-select-person',
        title: `Jump to ${entry.person.fullName}`,
        text: 'Select the highlighted person to center the tree. This also collapses the panel so you can stay focused.',
        attachTo: attachToSelector(entrySelector),
        advanceOn: { selector: entrySelector, event: 'click' },
        beforeShowPromise: async () => {
          await waitForElement(entrySelector)
        },
      },
      {
        id: 'birthdays-centered',
        title: 'Ready to explore',
        text: 'The tree now tracks the birthday person. Use this view to reach out, compare with relatives, or continue browsing.',
        attachTo: { element: `g[data-person-id="${entry.person.id}"]`, on: undefined },
        beforeShowPromise: async () => {
          bridge.focusOnPerson(entry.person.id)
          await waitForElement(() => document.querySelector(`g[data-person-id="${entry.person.id}"]`))
        },
      },
    ],
  }
}

const buildSearchTour: TourBuilder = (bridge) => {
  const person = bridge.getRandomPerson({ preferLiving: true })
  if (!person) {
    return fallbackTour(
      'No searchable relatives',
      'We need at least one relative with a name to demonstrate search. Add more info first.',
    )
  }

  const searchInputSelector = bridge.context.isMobile && !bridge.context.isMobileLandscape
    ? '[data-tour-id="mobile-search-input"]'
    : '[data-tour-id="desktop-search-input"]'
  const searchFormSelector = bridge.context.isMobile && !bridge.context.isMobileLandscape
    ? '[data-tour-id="mobile-search-form"]'
    : '[data-tour-id="desktop-search-form"]'
  const resultEntrySelector = `[data-tour-search-result="${person.id}"]`

  return {
    steps: [
      {
        id: 'search-single-step',
        title: 'Practice searching',
        text: bridge.context.isMobile
          ? `Tap the search field, type "${person.fullName}", then tap the matching result when it appears.`
          : `Click the search field, type "${person.fullName}", then click the matching result once it appears.`,
        attachTo: attachToSelector(searchFormSelector),
        beforeShowPromise: async () => {
          bridge.setSearchTutorialTarget(person)
          bridge.openSearchField()
          await waitForElement(searchInputSelector)
        },
        when: {
          show() {
            const handleResultClick = (event: MouseEvent) => {
              const target = event.target as Element | null
              if (target && target.closest(resultEntrySelector)) {
                advance()
              }
            }
            const handleEnter = (event: KeyboardEvent) => {
              if (event.key === 'Enter') {
                const active = document.querySelector(resultEntrySelector)
                if (active) {
                  advance()
                }
              }
            }
            const advance = () => {
              cleanup()
                this.tour.next()
              }
            const cleanup = () => {
              document.removeEventListener('click', handleResultClick, true)
              document.removeEventListener('keydown', handleEnter, true)
            }
            document.addEventListener('click', handleResultClick, true)
            document.addEventListener('keydown', handleEnter, true)
            this.once('hide', cleanup)
          },
        },
      },
      {
        id: 'search-centered',
        title: 'Centered and ready',
        text: 'Great! The tree zoomed to the relative you selected. From here you can assign them to A or B, open birthdays, or keep navigating.',
        attachTo: { element: `g[data-person-id="${person.id}"]`, on: undefined },
        beforeShowPromise: async () => {
          bridge.focusOnPerson(person.id)
          await waitForElement(() => document.querySelector(`g[data-person-id="${person.id}"]`))
        },
        buttons: [
          {
            text: 'Finish',
            classes: 'app-tour-button-primary',
            action() {
              this.complete()
            },
          },
        ],
      },
    ],
    onCancel: () => {
      bridge.highlightSearchResult(null)
        bridge.highlightPerson(null)
        bridge.setSelectedPerson(null)
    },
    onComplete: () => {
      bridge.highlightSearchResult(null)
        bridge.highlightPerson(null)
        bridge.setSelectedPerson(null)
    },
  }
}

const buildZoomTour: TourBuilder = (bridge) => {
  const landscapeZoomInSelector = '[data-tour-id="landscape-control-zoom-in"]'
  const zoomInSelector = bridge.context.isMobileLandscape ? landscapeZoomInSelector : '[data-tour-id="zoom-in-button"]'
  const zoomOutSelector = bridge.context.isMobileLandscape ? '[data-tour-id="landscape-control-zoom-out"]' : '[data-tour-id="zoom-out-button"]'
  const resetSelector = bridge.context.isMobileLandscape ? '[data-tour-id="landscape-control-reset"]' : '[data-tour-id="reset-view-button"]'
  const toggleSelector = '[data-tour-id="landscape-control-toggle"]'

  return {
    steps: [
      ...(bridge.context.isMobileLandscape
        ? [
            {
              id: 'zoom-open-radial',
              title: 'Open the navigation wheel',
              text: 'Tap the camera button to reveal zoom and reset controls while in landscape mode.',
              attachTo: attachToSelector(toggleSelector),
              advanceOn: { selector: toggleSelector, event: 'click' },
              beforeShowPromise: async () => {
                await waitForElement(toggleSelector)
              },
            },
          ]
        : []),
      {
        id: 'zoom-in',
        title: 'Zoom in for detail',
        text: bridge.context.isMobile
          ? 'Tap the + control to zoom closer. The tree will animate so you stay oriented.'
          : 'Click the + control to zoom in a notch. Notice how the camera keeps your focus within view.',
        attachTo: attachToSelector(zoomInSelector),
        advanceOn: { selector: zoomInSelector, event: 'click' },
        beforeShowPromise: async () => {
          if (bridge.context.isMobileLandscape) {
            bridge.ensureLandscapeControlsOpen()
          }
          await waitForElement(zoomInSelector)
        },
      },
      {
        id: 'zoom-out',
        title: 'Zoom back out',
        text: 'Use the − control to pull back out to the wider family structure.',
        attachTo: attachToSelector(zoomOutSelector),
        advanceOn: { selector: zoomOutSelector, event: 'click' },
        beforeShowPromise: async () => {
          if (bridge.context.isMobileLandscape) {
            bridge.ensureLandscapeControlsOpen()
          }
          await waitForElement(zoomOutSelector)
        },
      },
      {
        id: 'zoom-reset',
        title: 'Reset the view',
        text: 'Use the Reset control to restore the default zoom and position. This is useful after detailed exploration.',
        attachTo: attachToSelector(resetSelector),
        advanceOn: { selector: resetSelector, event: 'click' },
        beforeShowPromise: async () => {
          if (bridge.context.isMobileLandscape) {
            bridge.ensureLandscapeControlsOpen()
          }
          await waitForElement(resetSelector)
        },
      },
    ],
  }
}

const buildNodeInfoTour: TourBuilder = (bridge) => {
  const person = bridge.getRandomPerson({ preferLiving: true })
  if (!person) {
    return fallbackTour(
      'No relatives to inspect',
      'Add at least one person to the tree to explore node details.',
    )
  }

  const nodeSelector = `g[data-person-id="${person.id}"]`

  return {
    steps: [
      {
        id: 'node-focus',
        title: `${person.fullName} on the tree`,
        text: 'We center the tree on this person so you can see how their card behaves when focused.',
        attachTo: { element: nodeSelector, on: undefined },
        beforeShowPromise: async () => {
          bridge.beginCompareTutorialSession()
          bridge.focusOnPerson(person.id)
          await waitForElement(() => document.querySelector(nodeSelector))
        },
      },
      {
        id: 'node-hover',
        title: 'See relatives glow together',
        text: bridge.context.isMobile
          ? 'Tap the left or right side of the card. The nearby family will glow and you will assign this person to either slot A or slot B.'
          : 'Hover to see nearby family glow, then hold Shift while clicking the left or right half of the card to toggle this person into slot A or slot B.',
        attachTo: { element: nodeSelector, on: undefined },
        beforeShowPromise: async () => {
          bridge.highlightPerson(person.id)
          await waitForElement(() => document.querySelector(nodeSelector))
        },
        when: {
          show() {
            const nextStep = () => {
              this.tour.next()
            }
            const handleA = () => {
              remove()
              nextStep()
            }
            const handleB = () => {
              remove()
              nextStep()
            }
            const remove = () => {
              window.removeEventListener('tutorial:compareSelectedA', handleA)
              window.removeEventListener('tutorial:compareSelectedB', handleB)
              document.removeEventListener('tutorial:compareSelectedA', handleA)
              document.removeEventListener('tutorial:compareSelectedB', handleB)
              document.body?.removeEventListener('tutorial:compareSelectedA', handleA)
              document.body?.removeEventListener('tutorial:compareSelectedB', handleB)
            }
            window.addEventListener('tutorial:compareSelectedA', handleA, { once: true })
            window.addEventListener('tutorial:compareSelectedB', handleB, { once: true })
            document.addEventListener('tutorial:compareSelectedA', handleA, { once: true })
            document.addEventListener('tutorial:compareSelectedB', handleB, { once: true })
            document.body?.addEventListener('tutorial:compareSelectedA', handleA, { once: true })
            document.body?.addEventListener('tutorial:compareSelectedB', handleB, { once: true })
            this.once('hide', remove)
          },
        },
      },
      {
        id: 'node-details',
        title: 'Read the inline details',
        text: bridge.context.isMobile
          ? 'Great! With this person assigned to a slot, read through their inline details and nearby relatives. You can clear the slot or choose someone else whenever you are ready.'
          : 'Great! With this person assigned, review their inline details and nearby relatives. You can clear the slot or choose anyone else from here.',
        attachTo: { element: nodeSelector, on: undefined },
        beforeShowPromise: async () => {
          await waitForElement(() => document.querySelector(nodeSelector))
        },
        buttons: [
          {
            text: 'Finish',
            classes: 'app-tour-button-primary',
            action() {
              this.complete()
            },
          },
        ],
      },
    ],
    onCancel: () => {
      bridge.cancelCompareTutorialSession()
      bridge.highlightPerson(null)
    },
    onComplete: () => {
      bridge.completeCompareTutorialSession({ applyAssignments: false })
      bridge.highlightPerson(null)
    },
  }
}

const builders: Record<FeatureTutorialId, TourBuilder> = {
  compare: buildCompareTour,
  birthdays: buildBirthdaysTour,
  search: buildSearchTour,
  zoom: buildZoomTour,
  nodeInfo: buildNodeInfoTour,
}

export const getFeatureTourConfig = (featureId: FeatureTutorialId): GuidedTourConfig => {
  const bridge = getTutorialBridge()
  if (!bridge) {
    return fallbackTour(
      'Tree not ready',
      'Open the family tree view before launching this tutorial so we can guide you through live controls.',
    )
  }

  const builder = builders[featureId]
  if (!builder) {
    return fallbackTour('Tutorial unavailable', 'This guided flow has not been implemented yet.')
  }

  const tour = builder(bridge)
  return tour ?? fallbackTour('Tutorial unavailable', 'We could not prepare a live example. Please try again.')
}

