const BRANCH_COLORS: Record<string, string> = {
  OG: '#f29f9f',
  Homsany: '#f7b267',
  Petriello: '#9fd8a3',
  'B Tahan': '#c4b5f6',
  'A Tahan': '#f9d976',
  Other: '#f6a9d2',
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)))

const normalizeHex = (hex: string): string => {
  const normalized = hex.replace('#', '').trim()
  if (normalized.length === 3) {
    return normalized
      .split('')
      .map((char) => char + char)
      .join('')
  }
  if (normalized.length === 6) return normalized
  if (normalized.length === 0) return '000000'
  if (normalized.length < 6) {
    return (normalized + '000000').slice(0, 6)
  }
  return normalized.slice(0, 6)
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const normalized = normalizeHex(hex)
  const bigint = Number.parseInt(normalized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return { r, g, b }
}

const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (channel: number) => clampByte(channel).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export const getBranchColor = (branch: string): string => BRANCH_COLORS[branch] ?? '#e8c8a7'

export const withAlpha = (hex: string, alpha: number): string => {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.min(Math.max(alpha, 0), 1)})`
}

export const dimColor = (
  hex: string,
  {
    darken = 0.76,
    greyMix = 0.18,
  }: {
    darken?: number
    greyMix?: number
  } = {},
): string => {
  const { r, g, b } = hexToRgb(hex)
  const greyChannel = 128
  const adjustChannel = (channel: number) => {
    const darkened = channel * (1 - Math.max(0, darken))
    const blended = darkened * (1 - Math.max(0, Math.min(greyMix, 1))) + greyChannel * Math.max(0, Math.min(greyMix, 1))
    return clampByte(blended)
  }

  return rgbToHex(adjustChannel(r), adjustChannel(g), adjustChannel(b))
}

