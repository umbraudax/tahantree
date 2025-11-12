import { useCallback, useRef } from 'react'
import Shepherd, { type StepOptions, type Tour, type TourOptions } from 'shepherd.js'

export type GuidedTourStep = StepOptions

export interface GuidedTourConfig {
  steps: GuidedTourStep[]
  tourOptions?: TourOptions
  onCancel?: () => void
  onComplete?: () => void
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
          highlightClass: 'app-tour-highlight',
          ...config.tourOptions?.defaultStepOptions,
        },
        useModalOverlay: false,
        exitOnEsc: true,
        keyboardNavigation: true,
        ...config.tourOptions,
      })

      config.steps.forEach((step, index) => {
        const hasAdvanceOn = Boolean(step.advanceOn)
        const hasWhenHandlers = Boolean(step.when) && Object.keys(step.when ?? {}).length > 0
        const hasButtons = Array.isArray(step.buttons) && step.buttons.length > 0
        const needsDefaultButton = !hasAdvanceOn && !hasWhenHandlers && !hasButtons

        tour.addStep({
          ...step,
          id: step.id ?? `app-tour-step-${index}`,
          buttons: needsDefaultButton
            ? [
                {
                  text: 'Next',
                  classes: 'app-tour-button-primary',
                  action() {
                    this.next()
                  },
                },
              ]
            : step.buttons,
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

