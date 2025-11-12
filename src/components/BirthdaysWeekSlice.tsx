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

const formatDayWithOrdinal = (date: Date): string => {
  const day = date.getDate()
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) {
    return `${day}th`
  }

  const mod10 = day % 10
  if (mod10 === 1) return `${day}st`
  if (mod10 === 2) return `${day}nd`
  if (mod10 === 3) return `${day}rd`
  return `${day}th`
}

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
      setHoveredDayIndex(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDayIndex(null)
        setHoveredDayIndex(null)
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
    setHoveredDayIndex(null)
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
      if (variant === 'desktop') {
        setActiveDayIndex((current) => {
          const next = current === index ? null : index
          setHoveredDayIndex(next)
          return next
        })
        return
      }
      setActiveDayIndex((current) => (current === index ? null : index))
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

  const renderPersonEntry = useCallback(
    (entry: BirthdayWeekDay['entries'][number]) => {
      const branchColor = getBranchColor(entry.person.branch)
      const background = withAlpha(branchColor, 0.18)
      return (
        <button
          key={entry.person.id}
          type="button"
          data-tour-birthday-entry={entry.person.id}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/15 px-4 py-2.5 text-left text-sm font-medium text-white transition backdrop-blur hover:bg-black/35 focus:bg-black/35 focus:outline-none"
          style={{ background }}
          onClick={() => handlePersonClick(entry.person.id)}
        >
          <span className="truncate">{entry.person.fullName}</span>
          <span className="flex flex-col items-end text-[11px] font-normal uppercase tracking-[0.28em] text-white/75">
            {entry.formattedBirthDate}
          </span>
        </button>
      )
    },
    [handlePersonClick],
  )

  const expandedDay = expandedDayIndex !== null ? week[expandedDayIndex] : null

  const renderEntries = useCallback(
    (day: BirthdayWeekDay) => (
      <div className="flex w-full max-h-[320px] flex-col gap-2 overflow-y-auto px-2 pb-1">
        {day.entries.map((entry) => renderPersonEntry(entry))}
      </div>
    ),
    [renderPersonEntry],
  )

  const daysWithBirthdays = useMemo(
    () => week.filter((day) => day.entries.length > 0),
    [week],
  )
  const expandedContent =
    expandedDay && expandedDay.entries.length > 0 ? renderEntries(expandedDay) : null

  const containerClasses = combineClassNames(
    'relative text-white',
    variant === 'desktop'
      ? 'flex min-w-[420px] min-h-[100px] flex-col justify-center gap-3 rounded-3xl border border-white/20 bg-black/45 px-6 py-5 text-xs shadow-[0_24px_55px_rgba(0,0,0,0.55)] backdrop-blur'
      : 'flex w-full flex-col gap-6 rounded-3xl border border-white/20 bg-black/45 px-4 pb-5 pt-4 shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur',
    className,
  )

  const dayRowClassNames = 'flex w-full justify-center gap-3'

  if (variant === 'mobile') {
    return (
      <div ref={containerRef} className={containerClasses}>
        {daysWithBirthdays.length === 0 ? (
          <p className="w-full text-center text-sm font-semibold uppercase tracking-[0.2em] text-white/65">
            No birthdays this week!
          </p>
        ) : (
          <div className="flex w-full flex-col gap-6">
            {daysWithBirthdays.map((day, index) => (
              <div key={day.isoDate} className="flex w-full flex-col">
                <span className="text-[13px] font-semibold uppercase tracking-[0.32em] text-white/85">
                  {day.weekdayName} - {formatDayWithOrdinal(day.date)}
                </span>
                <div className="mt-3 flex flex-col gap-2">{day.entries.map((entry) => renderPersonEntry(entry))}</div>
                {index < daysWithBirthdays.length - 1 && <div className="mt-5 h-px w-full bg-black/50" />}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      onPointerLeave={() => {
        if (activeDayIndex === null) {
          setHoveredDayIndex(null)
        }
      }}
    >
      {expandedContent && <div className="w-full">{expandedContent}</div>}
      <div className={dayRowClassNames}>
        {week.map((day, index) => {
          const count = day.entries.length
          const hasBirthdays = count > 0
          const isExpanded = expandedDayIndex === index && hasBirthdays
          const isActive = activeDayIndex === index
          return (
            <div
              key={day.isoDate}
              className="relative w-[54px]"
              onPointerEnter={() => handleSegmentPointerEnter(index)}
              onPointerLeave={(event) => handleSegmentPointerLeave(index, event)}
            >
              <button
                type="button"
                data-tour-birthday-day={day.isoDate}
                className={combineClassNames(
                  'group relative flex h-20 w-full flex-col items-center justify-center gap-2 rounded-2xl text-sm font-semibold uppercase tracking-[0.34em] transition-colors backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                  hasBirthdays
                    ? isActive
                      ? 'bg-black/30 text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)] cursor-pointer'
                      : 'bg-black/45 text-white hover:bg-black/35 cursor-pointer'
                    : 'bg-black/55 text-white/45 cursor-default hover:bg-black/55',
                )}
                aria-expanded={isExpanded}
                aria-pressed={isActive}
                aria-label={
                  hasBirthdays
                    ? `${day.weekdayName}, ${count} birthday${count === 1 ? '' : 's'}`
                    : `${day.weekdayName}, no birthdays`
                }
                onClick={() => handleSegmentClick(index, hasBirthdays)}
              >
                <span
                  className={combineClassNames(
                    'text-[11px] font-semibold tracking-[0.08em] leading-none translate-x-[-1px]',
                    hasBirthdays ? 'text-white/75 group-hover:text-white' : 'text-white/35',
                  )}
                >
                  {count}
                </span>
                <span className="text-center text-[17px] tracking-[0.38em] leading-tight translate-x-[2px]">{day.dayLetter}</span>
                <span
                  className={combineClassNames(
                    'text-[11px] font-semibold tracking-[0.08em] leading-none translate-x-[1px]',
                    hasBirthdays ? 'text-white/70 group-hover:text-white' : 'text-white/35',
                  )}
                >
                  {formatDayWithOrdinal(day.date)}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BirthdaysWeekSlice

