import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BirthdayWeekDay } from '../utils/birthdays'
import { getBranchColor, withAlpha } from '../utils/colors'

interface BirthdaysWeekSliceProps {
  week: BirthdayWeekDay[]
  onSelectPerson: (personId: string) => void
  className?: string
  variant?: 'desktop' | 'mobile'
}

const combineClassNames = (...values: Array<string | false | null | undefined>): string =>
  values.filter(Boolean).join(' ')

const BirthdaysWeekSlice = ({
  week,
  onSelectPerson,
  className,
  variant = 'desktop',
}: BirthdaysWeekSliceProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null)
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null)

  const expandedDayIndex = useMemo(() => {
    if (variant === 'desktop') {
      return activeDayIndex ?? hoveredDayIndex
    }
    return activeDayIndex
  }, [activeDayIndex, hoveredDayIndex, variant])

  useEffect(() => {
    if (variant !== 'desktop') return
    if (activeDayIndex === null) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const container = containerRef.current
      if (container && container.contains(target)) return
      setActiveDayIndex(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDayIndex(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeDayIndex, variant])

  useEffect(() => {
    setActiveDayIndex(null)
    setHoveredDayIndex(null)
  }, [variant])

  useEffect(() => {
    if (activeDayIndex === null) return
    if (!week[activeDayIndex] || week[activeDayIndex].entries.length > 0) return
    setActiveDayIndex(null)
  }, [activeDayIndex, week])

  const handleSegmentPointerEnter = useCallback(
    (index: number) => {
      if (variant !== 'desktop') return
      setHoveredDayIndex(index)
    },
    [variant],
  )

  const handleSegmentPointerLeave = useCallback(
    (index: number) => {
      if (variant !== 'desktop') return
      setHoveredDayIndex((current) => {
        if (current !== index) {
          return current
        }
        if (activeDayIndex !== null) {
          return activeDayIndex
        }
        return null
      })
    },
    [activeDayIndex, variant],
  )

  const handleSegmentClick = useCallback(
    (index: number, hasBirthdays: boolean) => {
      if (!hasBirthdays) {
        if (variant === 'desktop') {
          setHoveredDayIndex(null)
        }
        return
      }
      setActiveDayIndex((current) => (current === index ? null : index))
      if (variant === 'desktop') {
        setHoveredDayIndex(index)
      }
    },
    [variant],
  )

  const handlePersonClick = useCallback(
    (personId: string) => {
      onSelectPerson(personId)
      if (variant === 'mobile') {
        setActiveDayIndex(null)
      }
    },
    [onSelectPerson, variant],
  )

  const expandedDay = expandedDayIndex !== null ? week[expandedDayIndex] : null

  const renderEntries = useCallback(
    (day: BirthdayWeekDay) => (
      <div className="flex w-full max-h-[320px] flex-col gap-2 overflow-y-auto rounded-3xl bg-white/10 px-3 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur">
        {day.entries.map((entry) => {
          const branchColor = getBranchColor(entry.person.branch)
          const background = withAlpha(branchColor, 0.22)
          const borderColor = withAlpha(branchColor, 0.5)
          return (
            <button
              key={entry.person.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-left text-sm font-medium text-white transition hover:bg-white/12 focus:bg-white/12 focus:outline-none"
              style={{ background, borderColor }}
              onClick={() => handlePersonClick(entry.person.id)}
            >
              <span className="truncate">{entry.person.fullName}</span>
              <span className="flex flex-col items-end text-[11px] font-normal uppercase tracking-[0.28em] text-white/70">
                {entry.formattedBirthDate}
              </span>
            </button>
          )
        })}
      </div>
    ),
    [handlePersonClick],
  )
  const expandedContent =
    expandedDay && expandedDay.entries.length > 0 ? renderEntries(expandedDay) : null

  const containerClasses = combineClassNames(
    'relative text-xs text-white',
    variant === 'desktop'
      ? 'overflow-visible rounded-3xl border border-white/18 bg-white/8 px-4 pb-4 pt-5 shadow-[0_24px_55px_rgba(0,0,0,0.55)] backdrop-blur-sm'
      : 'px-2 pt-3',
    className,
  )

  const dayRowClassNames = combineClassNames(
    'flex w-full',
    variant === 'desktop' ? 'gap-3 justify-center' : 'gap-2 justify-center',
  )

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      onPointerLeave={() => {
        if (variant !== 'desktop') return
        if (activeDayIndex !== null) return
        setHoveredDayIndex(null)
      }}
    >
      {variant === 'desktop' && expandedContent && (
        <div className="mb-3 overflow-hidden rounded-3xl bg-white/8 px-3 py-3 shadow-[0_24px_55px_rgba(0,0,0,0.55)]">
          {expandedContent}
        </div>
      )}
      <div className={dayRowClassNames}>
        {week.map((day, index) => {
          const count = day.entries.length
          const hasBirthdays = count > 0
          const isExpanded = expandedDayIndex === index && hasBirthdays
          const isActive = activeDayIndex === index
          const isDisabled = !hasBirthdays && variant === 'mobile'
          return (
            <div
              key={day.isoDate}
              className={combineClassNames(
                'relative flex-1',
                variant === 'desktop' ? 'min-w-[60px] max-w-[76px]' : 'min-w-[52px] max-w-[64px]',
              )}
              onPointerEnter={() => handleSegmentPointerEnter(index)}
              onPointerLeave={() => handleSegmentPointerLeave(index)}
            >
              <button
                type="button"
                className={combineClassNames(
                  'group relative flex h-16 w-full flex-col items-center justify-end rounded-2xl bg-transparent px-3 pb-3 pt-5 text-sm font-semibold uppercase tracking-[0.34em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                  hasBirthdays
                    ? isActive
                      ? 'bg-white/18 text-white shadow-[0_18px_48px_rgba(255,255,255,0.2)] cursor-pointer'
                      : 'text-white hover:bg-white/12 cursor-pointer'
                    : 'text-white/45 cursor-default hover:bg-transparent',
                )}
                disabled={isDisabled}
                aria-expanded={isExpanded}
                aria-pressed={isActive}
                aria-label={
                  hasBirthdays
                    ? `${day.weekdayName}, ${count} birthday${count === 1 ? '' : 's'}`
                    : `${day.weekdayName}, no birthdays`
                }
                onClick={() => handleSegmentClick(index, hasBirthdays)}
              >
                <span className="text-[17px] tracking-[0.38em]">{day.dayLetter}</span>
                <span className="absolute left-3 bottom-2 text-[11px] font-semibold tracking-[0.06em] text-white/70 group-hover:text-white">
                  {day.dateLabel}
                </span>
                <span
                  className={combineClassNames(
                    'absolute right-3 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors',
                    hasBirthdays
                      ? isActive
                        ? 'bg-white/25 text-black'
                      : 'bg-white/10 text-white/70 group-hover:bg-white/18 group-hover:text-white'
                      : 'bg-white/8 text-white/35',
                  )}
                >
                  {count}
                </span>
              </button>
            </div>
          )
        })}
      </div>
      {variant === 'mobile' && expandedContent && (
        <div className="mt-3 transition-all duration-200 ease-out">{expandedContent}</div>
      )}
    </div>
  )
}

export default BirthdaysWeekSlice

