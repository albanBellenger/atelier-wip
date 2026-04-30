import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { ArtifactsPage } from './pages/ArtifactsPage'
import { WorkOrdersPage } from './pages/WorkOrdersPage'
import { IssuesPage } from './pages/IssuesPage'
import { ProjectPage } from './pages/ProjectPage'
import { SectionPage } from './pages/SectionPage'
import { SoftwarePage } from './pages/SoftwarePage'
import { StudioPage } from './pages/StudioPage'
import { StudioSettingsPage } from './pages/StudioSettingsPage'
import { StudiosListPage } from './pages/StudiosListPage'

function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
        <Route path="/studios" element={<StudiosListPage />} />
        <Route path="/studios/:studioId/settings" element={<StudioSettingsPage />} />
        <Route path="/studios/:studioId" element={<StudioPage />} />
        <Route
          path="/studios/:studioId/software/:softwareId"
          element={<SoftwarePage />}
        />
        <Route
          path="/studios/:studioId/software/:softwareId/projects/:projectId/sections/:sectionId"
          element={<SectionPage />}
        />
        <Route
          path="/studios/:studioId/software/:softwareId/projects/:projectId/issues"
          element={<IssuesPage />}
        />
        <Route
          path="/studios/:studioId/software/:softwareId/projects/:projectId"
          element={<ProjectPage />}
        />
        <Route
          path="/studios/:studioId/software/:softwareId/projects/:projectId/artifacts"
          element={<ArtifactsPage />}
        />
        <Route
          path="/studios/:studioId/software/:softwareId/projects/:projectId/work-orders"
          element={<WorkOrdersPage />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
