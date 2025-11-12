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
          ? 'Tap the Select button for Person A. This opens the picker so you can assign the first relative.'
          : 'Click Select A to begin tagging your first relative in the comparison tray.',
        attachTo: attachToSelector(selectASelector),
        advanceOn: { selector: selectASelector, event: 'click' },
        beforeShowPromise: async () => {
          openControls()
          const element = await waitForElement(selectASelector)
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        },
      },
      {
        id: 'compare-set-a',
        title: `Choose ${pair.a.fullName}`,
        text: bridge.context.isMobile
          ? `Now tap ${pair.a.fullName} on the tree to set them as Person A. The tree glows while the picker is active.`
          : `Click ${pair.a.fullName} on the canvas to assign them to slot A. Hover text and colors show who is connected.`,
        attachTo: { element: personASelector, on: undefined },
        advanceOn: { selector: personASelector, event: 'pointerup' },
        beforeShowPromise: async () => {
          bridge.focusOnPerson(pair.a.id)
          bridge.highlightPerson(pair.a.id)
          await waitForElement(() => document.querySelector(personASelector))
        },
      },
      {
        id: 'compare-start-b',
        title: 'Set up slot B',
        text: bridge.context.isMobile
          ? 'Open the controls again and tap Select for Person B.'
          : 'Click Select B to start picking another relative to compare.',
        attachTo: attachToSelector(selectBSelector),
        advanceOn: { selector: selectBSelector, event: 'click' },
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
          ? `Tap ${pair.b.fullName} to complete the comparison. We will highlight both relatives for you.`
          : `Click ${pair.b.fullName} on the tree to fill slot B. Watch the relationship summary update instantly.`,
        attachTo: { element: personBSelector, on: undefined },
        advanceOn: { selector: personBSelector, event: 'pointerup' },
        beforeShowPromise: async () => {
          bridge.focusOnPerson(pair.b.id)
          bridge.highlightPerson(pair.b.id)
          await waitForElement(() => document.querySelector(personBSelector))
        },
      },
      {
        id: 'compare-summary',
        title: 'Read the relationship summary',
        text: bridge.context.isMobile
          ? 'Open the control sheet to review how these relatives connect. The panel spells out the relationship both ways, plus age differences.'
          : 'The summary explains the relationship in both directions and highlights age differences. You can keep this visible while you explore.',
        attachTo: attachToSelector(summarySelector),
        beforeShowPromise: async () => {
          openControls()
          await waitForElement(summarySelector)
        },
      },
      {
        id: 'compare-clear',
        title: 'Reset when you are done',
        text: bridge.context.isMobile
          ? 'Tap Clear A & B to start a new comparison. Try mixing relatives from different branches.'
          : 'Click Clear A & B anytime to wipe the slots and run another comparison.',
        attachTo: attachToSelector(clearSelector),
        advanceOn: { selector: clearSelector, event: 'click' },
        beforeShowPromise: async () => {
          openControls()
          const element = await waitForElement(clearSelector)
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        },
      },
    ],
    onCancel: () => {
      bridge.highlightPerson(null)
    },
    onComplete: () => {
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
          text: 'Tap the Birthdays button to slide up this week’s celebrations.',
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
          text: `Tap ${entry.person.fullName} in the list to jump straight to their place in the tree.`,
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
          text: 'The tree recenters on the selected person so you can explore their branch or assign them to a comparison slot.',
          attachTo: { element: `g[data-person-id="${entry.person.id}"]`, on: undefined },
          beforeShowPromise: async () => {
            bridge.focusOnPerson(entry.person.id)
            await waitForElement(() => document.querySelector(`g[data-person-id="${entry.person.id}"]`))
          },
        },
      ],
      onCancel: () => {
        bridge.closeBirthdaysPanel()
      },
      onComplete: () => {
        bridge.closeBirthdaysPanel()
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
        text: 'This panel keeps upcoming celebrations for the current week at your fingertips.',
        attachTo: attachToSelector(panelSelector),
        beforeShowPromise: async () => {
          bridge.closeBirthdaysPanel()
          await waitForElement(panelSelector)
        },
      },
      {
        id: 'birthdays-focus-day',
        title: `${entry.dateLabel} celebrations`,
        text: `Click the ${entry.dateLabel} segment to reveal the relatives celebrating on that day.`,
        attachTo: attachToSelector(daySelector),
        advanceOn: { selector: daySelector, event: 'click' },
        beforeShowPromise: async () => {
          await waitForElement(daySelector)
        },
      },
      {
        id: 'birthdays-select-person',
        title: `Jump to ${entry.person.fullName}`,
        text: 'Select their card to center the tree and explore their branch.',
        attachTo: attachToSelector(entrySelector),
        advanceOn: { selector: entrySelector, event: 'click' },
        beforeShowPromise: async () => {
          await waitForElement(entrySelector)
        },
      },
      {
        id: 'birthdays-centered',
        title: 'Ready to explore',
        text: 'The tree zooms to the birthday person so you can send wishes, compare relatives, or keep navigating.',
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
  const resultsSelector = bridge.context.isMobile && !bridge.context.isMobileLandscape
    ? '[data-tour-id="mobile-search-results"]'
    : '[data-tour-id="desktop-search-results"]'
  const resultEntrySelector = `[data-tour-search-result="${person.id}"]`

  return {
    steps: [
      {
        id: 'search-open',
        title: 'Find anyone fast',
        text: bridge.context.isMobile
          ? 'Use the search field to pull down anyone in the tree. We will open it for you.'
          : 'This search field jumps to any relative instantly. Click inside to get started.',
        attachTo: attachToSelector(searchFormSelector),
        beforeShowPromise: async () => {
          bridge.openSearchField()
          await waitForElement(searchInputSelector)
        },
      },
      {
        id: 'search-type',
        title: `Look for ${person.fullName}`,
        text: 'We pre-filled the name so you can see exactly how results appear as you type.',
        attachTo: attachToSelector(searchInputSelector),
        beforeShowPromise: async () => {
          bridge.setSearchValue(person.fullName)
          bridge.highlightSearchResult(person.id)
          await waitForElement(resultsSelector)
        },
      },
      {
        id: 'search-select',
        title: 'Jump straight to the match',
        text: 'Click the highlighted result to center the tree on this relative.',
        attachTo: attachToSelector(resultEntrySelector),
        advanceOn: { selector: resultEntrySelector, event: 'click' },
        beforeShowPromise: async () => {
          await waitForElement(resultEntrySelector)
        },
      },
      {
        id: 'search-focused',
        title: 'Centered and ready',
        text: 'The tree zoomed to focus on the selected relative. From here you can assign them to A or B, open birthdays, or keep navigating.',
        attachTo: { element: `g[data-person-id="${person.id}"]`, on: undefined },
        beforeShowPromise: async () => {
          bridge.focusOnPerson(person.id)
          await waitForElement(() => document.querySelector(`g[data-person-id="${person.id}"]`))
        },
      },
    ],
    onCancel: () => {
      bridge.highlightSearchResult(null)
    },
    onComplete: () => {
      bridge.highlightSearchResult(null)
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
          ? 'Tap + to zoom closer with touch-friendly controls. Try it now.'
          : 'Click + to zoom in on the tree. The canvas animates smoothly so you never lose your place.',
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
        text: 'Use − to pull back and view the wider family structure.',
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
        text: 'The reset control recenters and restores the default zoom, perfect for regaining your bearings.',
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
        text: 'We will zoom to this relative so you can see how hovering or tapping reveals context.',
        attachTo: { element: nodeSelector, on: undefined },
        beforeShowPromise: async () => {
          bridge.focusOnPerson(person.id)
          await waitForElement(() => document.querySelector(nodeSelector))
        },
      },
      {
        id: 'node-hover',
        title: 'See relatives glow together',
        text: bridge.context.isMobile
          ? 'Tap the card to expand their details. The branch color glows around parents, siblings, spouse, and children.'
          : 'Click the card to highlight immediate family and reveal quick stats.',
        attachTo: { element: nodeSelector, on: undefined },
        advanceOn: { selector: nodeSelector, event: 'pointerup' },
        beforeShowPromise: async () => {
          bridge.highlightPerson(person.id)
          await waitForElement(() => document.querySelector(nodeSelector))
        },
      },
      {
        id: 'node-details',
        title: 'Read the inline details',
        text: 'Birth and age info, parents, and spouse details display directly on the card. Use this to follow branches without losing your place.',
        attachTo: { element: nodeSelector, on: undefined },
        beforeShowPromise: async () => {
          await waitForElement(() => document.querySelector(nodeSelector))
        },
      },
    ],
    onCancel: () => {
      bridge.highlightPerson(null)
    },
    onComplete: () => {
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

