import { useEffect, useState } from 'react'

import { loadFamilyGraph } from '../services/familyData'
import type { FamilyGraph } from '../types/family'

interface UseFamilyDataState {
  data: FamilyGraph | null
  loading: boolean
  error: Error | null
}

export const useFamilyData = (url?: string): UseFamilyDataState => {
  const [state, setState] = useState<UseFamilyDataState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let active = true

    loadFamilyGraph(url)
      .then((graph) => {
        if (!active) return
        setState({ data: graph, loading: false, error: null })
      })
      .catch((error: Error) => {
        if (!active) return
        setState({ data: null, loading: false, error })
      })

    return () => {
      active = false
    }
  }, [url])

  return state
}

