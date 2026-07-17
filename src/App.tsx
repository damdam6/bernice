import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home.tsx'
import Rankings from './pages/Rankings.tsx'
import Players from './pages/Players.tsx'
import Trends from './pages/Trends.tsx'
import NotFound from './pages/NotFound.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rankings" element={<Rankings />} />
      <Route path="/players" element={<Players />} />
      <Route path="/trends" element={<Trends />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
