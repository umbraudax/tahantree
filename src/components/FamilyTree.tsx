import FamilyTreeCanvas from './FamilyTreeCanvas'
import { useFamilyData } from '../hooks/useFamilyData'
import { useBreakpoint } from '../hooks/useBreakpoint'

const FamilyTree = () => {
  const { data, loading, error } = useFamilyData()
  const { isMobile, isLandscape } = useBreakpoint()
  const isMobileLandscape = isMobile && isLandscape

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-white">
        <span className="text-sm uppercase tracking-[0.3em] text-white">Loading</span>
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="max-w-sm text-center text-xs text-white">
          Building the family tree layout. Large trees can take a few moments to render.
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-white">
        <p>We couldn&apos;t load the family data.</p>
        <p className="text-xs text-white">{error.message}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white">
        No data available.
      </div>
    )
  }

  const generationCount = data.people.reduce((max, person) => Math.max(max, person.generation), 0)
  const currentCount = data.people.reduce((total, person) => (person.dod ? total : total + 1), 0)

  const stats = [
    { key: 'people', label: 'People', value: data.people.length },
    { key: 'current', label: 'Current', value: currentCount },
    { key: 'generations', label: 'Generations', value: generationCount },
  ]

  return (
    <div className="relative h-full w-full text-white">
      <FamilyTreeCanvas graph={data} />
      {!isMobileLandscape && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4 xs:px-5 sm:px-6 md:px-8">
          <div className="pointer-events-auto w-full max-w-6xl space-y-3 text-xs text-white">
            <details className="group md:hidden">
              <summary className="list-none">
                <div className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/20 bg-black/45 px-4 py-3 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur transition hover:bg-black/35">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.35em]">Current Members</span>
                  <span className="inline-flex min-w-[3.5rem] justify-end text-sm font-semibold text-white">
                    {currentCount}
                  </span>
                </div>
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3 text-white">
                {stats.map((stat) => (
                  <div
                    key={stat.key}
                    className="flex flex-col gap-1 rounded-xl border border-white/20 bg-black/45 px-3 py-2 backdrop-blur"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
                      {stat.label}
                    </span>
                    <span className="text-base font-semibold text-white">{stat.value}</span>
                  </div>
                ))}
              </div>
            </details>

            <div className="hidden justify-center md:flex">
              <div className="flex w-full items-center justify-center gap-6 rounded-3xl border border-white/20 bg-black/45 px-6 py-4 text-white shadow-[0_24px_56px_rgba(0,0,0,0.55)] backdrop-blur">
                {stats.map((stat) => (
                  <div key={stat.key} className="flex items-center gap-3">
                    <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-[11px] uppercase tracking-[0.35em] text-white/70 backdrop-blur">
                      {stat.label}
                    </span>
                    <span className="text-lg font-semibold text-white md:text-xl">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FamilyTree

