import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { getToken } from './services/api'

function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            getToken() ? <HomePage /> : <Navigate to="/auth" replace />
          }
        />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
