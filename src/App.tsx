import FamilyTree from './components/FamilyTree'

const App = () => (
  <div className="flex min-h-full flex-col bg-black">
    <header className="border-b border-white/10 bg-black px-6 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Hamway &amp; Tahan Interactive Family Tree
        </h1>
        <p className="text-sm text-white">
          A living genealogy explorer uniting the Hamway, Tahan, Homsany, Petriello, and extended
          families across generations.
        </p>
      </div>
    </header>
    <main className="flex-1 overflow-hidden">
      <FamilyTree />
    </main>
  </div>
)

export default App
