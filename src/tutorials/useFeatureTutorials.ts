import { useCallback } from 'react'

import { useGuidedTour } from '../hooks/useGuidedTour'

import type { FeatureTutorialId } from './types'
import { getFeatureTourConfig } from './featureTours'

export const useFeatureTutorials = () => {
  const { startTour } = useGuidedTour()

  const launchFeatureTour = useCallback(
    (featureId: FeatureTutorialId) => {
      const tourConfig = getFeatureTourConfig(featureId)
      startTour(tourConfig)
    },
    [startTour],
  )

  return {
    launchFeatureTour,
  }
}

