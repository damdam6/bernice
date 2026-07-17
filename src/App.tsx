import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.tsx'
import Rankings from './pages/Rankings.tsx'
import Players from './pages/Players.tsx'
import NotFound from './pages/NotFound.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rankings" element={<Rankings />} />
      <Route path="/players" element={<Players />} />
      <Route path="/trends" element={<Navigate to="/players" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
