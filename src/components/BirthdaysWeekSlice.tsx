import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

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
      const day = week[index]
      if (!day || day.entries.length === 0) return
      setHoveredDayIndex(index)
    },
    [variant, week],
  )

  const handleSegmentPointerLeave = useCallback(
    (index: number, event?: ReactPointerEvent<HTMLDivElement>) => {
      if (variant === 'desktop') {
        const container = containerRef.current
        const relatedTarget = event?.relatedTarget as Node | null
        if (relatedTarget && container?.contains(relatedTarget)) {
          return
        }
        if (activeDayIndex !== null) {
          return
        }
        setHoveredDayIndex((current) => (current === index ? null : current))
        return
      }
      setHoveredDayIndex((current) => (current === index ? null : current))
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
      <div className="flex w-full max-h-[320px] flex-col gap-2 overflow-y-auto px-2 pb-1">
        {day.entries.map((entry) => {
          const branchColor = getBranchColor(entry.person.branch)
          const background = withAlpha(branchColor, 0.18)
          return (
            <button
              key={entry.person.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-medium text-white transition hover:bg-white/15 focus:bg-white/15 focus:outline-none"
              style={{ background }}
              onClick={() => handlePersonClick(entry.person.id)}
            >
              <span className="truncate">{entry.person.fullName}</span>
              <span className="flex flex-col items-end text-[11px] font-normal uppercase tracking-[0.28em] text-white/75">
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
      ? 'flex flex-col gap-3 rounded-3xl border border-white/20 bg-white/8 px-4 pb-4 pt-4 shadow-[0_24px_55px_rgba(0,0,0,0.55)] backdrop-blur-sm'
      : 'flex flex-col items-center px-2 pb-4 pt-3',
    className,
  )

  const dayRowClassNames = combineClassNames(
    'grid w-full grid-cols-7',
    variant === 'desktop' ? 'gap-3' : 'gap-2',
  )

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      onPointerLeave={() => {
        if (variant === 'desktop' && activeDayIndex === null) {
          setHoveredDayIndex(null)
        }
      }}
    >
      {variant === 'desktop' && expandedContent && <div className="w-full">{expandedContent}</div>}
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
                'relative',
                variant === 'desktop' ? 'min-w-[58px]' : 'min-w-[48px]',
              )}
              onPointerEnter={() => handleSegmentPointerEnter(index)}
              onPointerLeave={(event) => handleSegmentPointerLeave(index, event)}
            >
              <button
                type="button"
                className={combineClassNames(
                  'group relative flex h-20 w-full flex-col justify-between rounded-2xl bg-transparent px-3 py-3 text-sm font-semibold uppercase tracking-[0.34em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
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
                <span className="text-center text-[17px] tracking-[0.38em] leading-none">{day.dayLetter}</span>
                <div className="flex w-full items-center justify-between text-[11px] font-semibold tracking-[0.08em]">
                  <span
                    className={combineClassNames(
                      'text-white/70 transition-colors',
                      hasBirthdays ? 'group-hover:text-white' : '',
                    )}
                  >
                    {day.dateLabel}
                  </span>
                  <span
                    className={combineClassNames(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors',
                      hasBirthdays
                        ? isActive
                          ? 'bg-white/25 text-black'
                          : 'bg-white/10 text-white/70 group-hover:bg-white/18 group-hover:text-white'
                        : 'bg-white/8 text-white/35',
                    )}
                  >
                    {count}
                  </span>
                </div>
              </button>
            </div>
          )
        })}
      </div>
      {variant === 'mobile' && expandedContent && (
        <div className="mt-3 w-full transition-all duration-200 ease-out">{expandedContent}</div>
      )}
    </div>
  )
}

export default BirthdaysWeekSlice

