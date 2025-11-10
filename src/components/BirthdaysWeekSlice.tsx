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

  return (
    <div
      ref={containerRef}
      className={combineClassNames('relative text-xs text-white', className)}
      onPointerLeave={() => {
        if (variant !== 'desktop') return
        if (activeDayIndex !== null) return
        setHoveredDayIndex(null)
      }}
    >
      <div
        className={combineClassNames(
          'flex w-full gap-2',
          variant === 'mobile' ? 'justify-between' : 'justify-center',
        )}
      >
        {week.map((day, index) => {
          const count = day.entries.length
          const hasBirthdays = count > 0
          const isExpanded = expandedDayIndex === index && hasBirthdays
          const isActive = activeDayIndex === index
          const isDisabled = !hasBirthdays && variant === 'mobile'
          const entriesContent = hasBirthdays ? (
            <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto rounded-3xl border border-white/15 bg-black/90 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.65)] backdrop-blur">
              {day.entries.map((entry) => {
                const branchColor = getBranchColor(entry.person.branch)
                const background = withAlpha(branchColor, 0.22)
                const borderColor = withAlpha(branchColor, 0.45)
                return (
                  <button
                    key={entry.person.id}
                    type="button"
                    className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-sm font-medium text-white transition hover:bg-white/10 focus:bg-white/10 focus:outline-none"
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
          ) : null

          return (
            <div
              key={day.isoDate}
              className="relative flex-1 min-w-[42px]"
              onPointerEnter={() => handleSegmentPointerEnter(index)}
              onPointerLeave={() => handleSegmentPointerLeave(index)}
            >
              {hasBirthdays && variant === 'desktop' && (
                <div
                  className={combineClassNames(
                    'pointer-events-none absolute bottom-full left-1/2 z-10 w-full -translate-x-1/2 pb-3 transition-all duration-200 ease-out',
                    isExpanded ? 'pointer-events-auto opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
                  )}
                  onPointerEnter={() => handleSegmentPointerEnter(index)}
                >
                  {entriesContent}
                </div>
              )}

              <button
                type="button"
                className={combineClassNames(
                  'relative flex h-16 w-full items-end justify-center rounded-2xl border px-2 pb-2 pt-4 text-sm font-semibold uppercase tracking-[0.3em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                  hasBirthdays
                    ? isActive
                      ? 'border-white/40 bg-white/15 text-white'
                      : 'border-white/20 bg-white/10 text-white hover:bg-white/15'
                    : 'border-white/10 bg-white/5 text-white/40',
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
                <span className="text-lg tracking-[0.32em]">{day.dayLetter}</span>
                <span className="absolute left-2 bottom-2 text-[11px] font-normal tracking-normal text-white/70">
                  {day.dateLabel}
                </span>
                <span
                  className={combineClassNames(
                    'absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    hasBirthdays ? 'bg-white/20 text-white' : 'bg-white/10 text-white/40',
                  )}
                >
                  {count}
                </span>
              </button>

              {variant === 'mobile' && hasBirthdays && isExpanded && (
                <div className="mt-3">{entriesContent}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BirthdaysWeekSlice

