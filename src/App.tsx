import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.tsx'
import Rankings from './pages/Rankings.tsx'
import Players from './pages/Players.tsx'
import NotFound from './pages/NotFound.tsx'
import AdminLogin from './pages/admin/AdminLogin.tsx'
import SheetManagementHome from './pages/admin/SheetManagementHome.tsx'
import RecordsDateSelect from './pages/admin/RecordsDateSelect.tsx'
import RecordsParticipants from './pages/admin/RecordsParticipants.tsx'
import RecordsPlayerInput from './pages/admin/RecordsPlayerInput.tsx'
import CreateSheet from './pages/admin/CreateSheet.tsx'
import AddPlayers from './pages/admin/AddPlayers.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rankings" element={<Rankings />} />
      <Route path="/players" element={<Players />} />
      <Route path="/trends" element={<Navigate to="/players" replace />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<SheetManagementHome />} />
      <Route path="/admin/records" element={<RecordsDateSelect />} />
      <Route path="/admin/records/:sessionDate" element={<RecordsParticipants />} />
      <Route path="/admin/records/:sessionDate/:playerId" element={<RecordsPlayerInput />} />
      <Route path="/admin/create-sheet" element={<CreateSheet />} />
      <Route path="/admin/add-players" element={<AddPlayers />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
