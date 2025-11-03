const BRANCH_COLORS: Record<string, string> = {
  OG: '#f29f9f',
  Homsany: '#f7b267',
  Petriello: '#9fd8a3',
  'B Tahan': '#c4b5f6',
  'A Tahan': '#f9d976',
  Other: '#f6a9d2',
}

export const getBranchColor = (branch: string): string => BRANCH_COLORS[branch] ?? '#e8c8a7'

export const withAlpha = (hex: string, alpha: number): string => {
  const normalized = hex.replace('#', '')
  const bigint = Number.parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${Math.min(Math.max(alpha, 0), 1)})`
}

