import { useCallback, useRef } from 'react'
import Shepherd, {
  type StepOptions,
  type StepOptionsButton,
  type Tour,
  type TourOptions,
} from 'shepherd.js'

export type GuidedTourStep = StepOptions

export interface GuidedTourConfig {
  steps: GuidedTourStep[]
  tourOptions?: TourOptions
  onCancel?: () => void
  onComplete?: () => void
}

type ShepherdButton = StepOptionsButton

const buildDefaultButtons = (
  index: number,
  total: number,
  tour: Tour,
  existing?: ReadonlyArray<ShepherdButton>,
) => {
  if (existing && existing.length > 0) {
    return existing
  }

  const buttons: ShepherdButton[] = []

  if (index > 0) {
    buttons.push({
      text: 'Back',
      classes: 'app-tour-button-secondary',
      action() {
        tour.back()
      },
    })
  }

  buttons.push({
    text: index === total - 1 ? 'Finish' : 'Next',
    classes: 'app-tour-button-primary',
    action() {
      if (index === total - 1) {
        tour.complete()
        return
      }
      tour.next()
    },
  })

  return buttons
}

export const useGuidedTour = () => {
  const activeTourRef = useRef<Tour | null>(null)

  const startTour = useCallback(
    (config: GuidedTourConfig) => {
      if (typeof window === 'undefined') {
        return undefined
      }

      if (!config.steps.length) {
        return undefined
      }

      if (activeTourRef.current) {
        activeTourRef.current.cancel()
        activeTourRef.current = null
      }

      const tour = new Shepherd.Tour({
        defaultStepOptions: {
          cancelIcon: { enabled: true },
          canClickTarget: true,
          scrollTo: { behavior: 'smooth', block: 'center' },
          modalOverlayOpeningPadding: 6,
          modalOverlayOpeningRadius: 12,
          classes: 'app-tour-step',
          ...config.tourOptions?.defaultStepOptions,
        },
        useModalOverlay: true,
        exitOnEsc: true,
        keyboardNavigation: true,
        ...config.tourOptions,
      })

      config.steps.forEach((step, index) => {
        tour.addStep({
          ...step,
          id: step.id ?? `app-tour-step-${index}`,
          buttons: buildDefaultButtons(index, config.steps.length, tour, step.buttons),
        })
      })

      tour.on('cancel', () => {
        activeTourRef.current = null
        config.onCancel?.()
      })

      tour.on('complete', () => {
        activeTourRef.current = null
        config.onComplete?.()
      })

      activeTourRef.current = tour
      tour.start()

      return tour
    },
    [],
  )

  const cancelTour = useCallback(() => {
    if (activeTourRef.current) {
      activeTourRef.current.cancel()
    }
  }, [])

  return {
    startTour,
    cancelTour,
    get activeTour() {
      return activeTourRef.current
    },
  }
}

export type GuidedTour = ReturnType<typeof useGuidedTour>

