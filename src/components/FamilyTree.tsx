import FamilyTreeCanvas from './FamilyTreeCanvas'
import { useFamilyData } from '../hooks/useFamilyData'

const FamilyTree = () => {
  const { data, loading, error } = useFamilyData()

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

  const branchCount = new Set(data.units.map((unit) => unit.branch)).size
  const generationCount = data.people.reduce((max, person) => Math.max(max, person.generation), 0)

  const stats = [
    { key: 'people', label: 'People', value: data.people.length },
    { key: 'units', label: 'Family Units', value: data.units.length },
    { key: 'branches', label: 'Branches', value: branchCount },
    { key: 'generations', label: 'Generations', value: generationCount },
  ]

  return (
    <div className="flex h-full w-full flex-col text-white">
      <div className="border-b border-white/10 bg-black px-4 py-3 xs:px-5 sm:px-6 md:px-8 md:py-4">
        <div className="mx-auto w-full max-w-6xl text-xs text-white">
          <details className="group rounded-2xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm transition-colors md:hidden">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-white/80">
              <span className="text-[11px] font-semibold uppercase tracking-[0.35em]">Family Overview</span>
              <span className="inline-flex min-w-[3.5rem] justify-end text-sm font-semibold text-white">
                {data.people.length}
              </span>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3 text-white">
              {stats.map((stat) => (
                <div
                  key={stat.key}
                  className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/70 px-3 py-2"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
                    {stat.label}
                  </span>
                  <span className="text-base font-semibold text-white">{stat.value}</span>
                </div>
              ))}
            </div>
          </details>

          <div className="hidden items-center justify-center gap-5 text-white md:flex">
            {stats.map((stat) => (
              <div key={stat.key} className="flex items-center gap-3">
                <span className="rounded-full border border-white/20 bg-black px-3 py-1.5 text-[11px] uppercase tracking-[0.35em] text-white/70">
                  {stat.label}
                </span>
                <span className="text-lg font-semibold text-white md:text-xl">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="relative flex-1">
        <FamilyTreeCanvas graph={data} />
      </div>
    </div>
  )
}

export default FamilyTree

