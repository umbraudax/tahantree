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

  return (
    <div className="flex h-full w-full flex-col text-white">
      <div className="border-b border-white/10 bg-black px-6 py-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 text-xs text-white">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/20 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-white">
              People
            </span>
            <span className="text-base font-semibold text-white">{data.people.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/20 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-white">
              Family Units
            </span>
            <span className="text-base font-semibold text-white">{data.units.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/20 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-white">
              Branches
            </span>
            <span className="text-base font-semibold text-white">{branchCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/20 bg-black px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-white">
              Generations
            </span>
            <span className="text-base font-semibold text-white">{generationCount}</span>
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

