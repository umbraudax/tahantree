import FamilyTree from './components/FamilyTree'

const App = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-black text-white pb-safe-b">
      <main className="flex-1 overflow-hidden">
        <FamilyTree />
      </main>
    </div>
  )
}

export default App
