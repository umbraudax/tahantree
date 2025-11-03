export const PERSON_WIDTH = 150
export const PERSON_HEIGHT = 130
export const PERSON_GAP = 32
export const SPOUSE_GAP_EXTRA = 28
export const GROUP_PADDING = 16
export const CORNER_RADIUS = 16
export const MIN_UNIT_GAP = PERSON_GAP + GROUP_PADDING
export const MIN_PARENT_CHILD_GAP = PERSON_HEIGHT

export const computeUnitDimensions = (memberCount: number, hasSpouseBond = false) => {
  const count = Math.max(memberCount, 1)
  const gap = hasSpouseBond ? PERSON_GAP + SPOUSE_GAP_EXTRA : PERSON_GAP
  const width = GROUP_PADDING * 2 + count * PERSON_WIDTH + (count - 1) * gap
  const height = GROUP_PADDING * 2 + PERSON_HEIGHT

  return { width, height }
}

