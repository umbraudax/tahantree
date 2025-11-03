import FamilyTree from './components/FamilyTree'

const App = () => (
  <div className="flex min-h-screen flex-col bg-black text-white pb-safe-b">
    <header className="border-b border-white/10 bg-black px-4 py-4 xs:px-5 sm:px-6 sm:py-5 md:px-8 md:py-6 pt-safe-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight xs:text-[26px] sm:text-3xl md:text-[34px]">
          Hamway &amp; Tahan Family Tree
        </h1>
      </div>
    </header>
    <main className="flex-1 overflow-hidden">
      <FamilyTree />
    </main>
  </div>
)

export default App
