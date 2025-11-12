import type { Person } from '../types/family'

export interface FamilyTreeTutorialBridge {
  readonly context: {
    isMobile: boolean
    isMobileLandscape: boolean
    isMobilePortrait: boolean
    isDesktop: boolean
  }
  getPersonById(personId: string): Person | null
  getRandomPerson(options?: { excludeIds?: string[]; preferLiving?: boolean }): Person | null
  getRandomPair(options?: { excludeIds?: string[]; preferLiving?: boolean }): { a: Person; b: Person } | null
  getRandomBirthdayEntry(): { dateLabel: string; isoDate: string; person: Person } | null
  focusOnPerson(personId: string): void
  highlightPerson(personId: string | null): void
  setSelectedPerson(personId: string | null): void
  assignPersonToRole(personId: string, role: 'A' | 'B', options?: { suppressHighlight?: boolean }): void
  beginSelection(mode: 'selectA' | 'selectB'): void
  clearSelections(): void
  openControlSheet(): void
  closeControlSheet(): void
  openBirthdaysPanel(): void
  closeBirthdaysPanel(): void
  openSearchField(): void
  setSearchValue(value: string): void
  highlightSearchResult(personId: string | null): void
  assignSearchResultToRole(role: 'A' | 'B'): void
  ensureLandscapeControlsOpen(): void
  zoomBy(factor: number): void
  resetView(): void
}

declare global {
  interface Window {
    __familyTreeTutorialBridge__?: FamilyTreeTutorialBridge | null
  }
}

export const setTutorialBridge = (bridge: FamilyTreeTutorialBridge | null) => {
  if (typeof window === 'undefined') {
    return
  }

  window.__familyTreeTutorialBridge__ = bridge
}

export const getTutorialBridge = (): FamilyTreeTutorialBridge | null => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.__familyTreeTutorialBridge__ ?? null
}

