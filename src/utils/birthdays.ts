import type { Person } from '../types/family'

export interface BirthdayPersonEntry {
  person: Person
  birthMonth: number
  birthDay: number
  birthYear: number | null
  formattedBirthDate: string
  upcomingAge: number | null
}

export interface BirthdayWeekDay {
  index: number
  dayLetter: string
  weekdayName: string
  date: Date
  dateLabel: string
  isoDate: string
  entries: BirthdayPersonEntry[]
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const pad = (value: number): string => value.toString().padStart(2, '0')

const normalizeDate = (value: Date): Date => {
  const clone = new Date(value)
  clone.setHours(0, 0, 0, 0)
  return clone
}

const startOfWeek = (value: Date): Date => {
  const normalized = normalizeDate(value)
  const day = normalized.getDay()
  const diff = day * -1
  normalized.setDate(normalized.getDate() + diff)
  return normalized
}

const parseDobComponents = (
  dob?: string,
): { month: number; day: number; year: number | null; formatted: string } | null => {
  if (!dob) return null
  const trimmed = dob.trim()
  if (trimmed.length === 0) return null

  const parts = trimmed.split(/[/-]/).map((part) => part.trim())
  if (parts.length < 2) return null

  const month = Number.parseInt(parts[0], 10)
  const day = Number.parseInt(parts[1], 10)
  const yearPart = parts[2]
  const year = yearPart ? Number.parseInt(yearPart, 10) : Number.NaN

  if (!Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month <= 0 || month > 12) return null
  if (day <= 0 || day > 31) return null

  const hasYear = Number.isFinite(year)
  const formatted = hasYear ? `${month}/${day}/${year}` : `${month}/${day}`

  return {
    month,
    day,
    year: hasYear ? year : null,
    formatted,
  }
}

const computeUpcomingAge = (birthYear: number | null, reference: Date): number | null => {
  if (birthYear === null) return null
  return reference.getFullYear() - birthYear
}

const createWeekDayEntry = (date: Date, index: number): BirthdayWeekDay => {
  const normalizedDate = normalizeDate(date)
  const dayLetter = DAY_LETTERS[index]
  const weekdayName = WEEKDAY_NAMES[normalizedDate.getDay()]
  const dateLabel = normalizedDate.getDate().toString()
  const isoDate = `${normalizedDate.getFullYear()}-${pad(normalizedDate.getMonth() + 1)}-${pad(normalizedDate.getDate())}`

  return {
    index,
    dayLetter,
    weekdayName,
    date: normalizedDate,
    dateLabel,
    isoDate,
    entries: [],
  }
}

export const computeBirthdaysForCurrentWeek = (people: Person[], now: Date = new Date()): BirthdayWeekDay[] => {
  const reference = normalizeDate(now)
  const weekStart = startOfWeek(reference)

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    return createWeekDayEntry(date, index)
  })

  for (const person of people) {
    if (person.dod) continue

    const dob = parseDobComponents(person.dob)
    if (!dob) continue

    const targetIndex = weekDays.findIndex(
      (day) => day.date.getMonth() + 1 === dob.month && day.date.getDate() === dob.day,
    )
    if (targetIndex === -1) continue

    const day = weekDays[targetIndex]
    const upcomingAge = computeUpcomingAge(dob.year, day.date)

    day.entries.push({
      person,
      birthMonth: dob.month,
      birthDay: dob.day,
      birthYear: dob.year,
      formattedBirthDate: dob.formatted,
      upcomingAge,
    })
  }

  for (const day of weekDays) {
    day.entries.sort((a, b) => {
      const yearA = a.birthYear ?? Number.POSITIVE_INFINITY
      const yearB = b.birthYear ?? Number.POSITIVE_INFINITY
      if (yearA !== yearB) {
        return yearA - yearB
      }
      return a.person.fullName.localeCompare(b.person.fullName)
    })
  }

  return weekDays
}

