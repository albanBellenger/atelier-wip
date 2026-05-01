import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminCrossStudioPage } from './pages/AdminCrossStudioPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { AdminTokenUsagePage } from './pages/AdminTokenUsagePage'
import { AuthPage } from './pages/AuthPage'
import { HomePage } from './pages/HomePage'
import { MeProfilePage } from './pages/MeProfilePage'
import { NotificationSettingsPage } from './pages/NotificationSettingsPage'
import { ArtifactsPage } from './pages/ArtifactsPage'
import { WorkOrdersPage } from './pages/WorkOrdersPage'
import { IssuesPage } from './pages/IssuesPage'
import { MeTokenUsagePage } from './pages/MeTokenUsagePage'
import { ProjectPage } from './pages/ProjectPage'
import { SectionPage } from './pages/SectionPage'
import { SoftwarePage } from './pages/SoftwarePage'
import { StudioPage } from './pages/StudioPage'
import { StudioTokenUsagePage } from './pages/StudioTokenUsagePage'
import { McpServerSettingsPage } from './pages/McpServerSettingsPage'
import { StudioSettingsPage } from './pages/StudioSettingsPage'
import { StudiosListPage } from './pages/StudiosListPage'

function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/me/profile" element={<MeProfilePage />} />
        <Route
          path="/me/notifications"
          element={<NotificationSettingsPage />}
        />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
        <Route path="/admin/cross-studio" element={<AdminCrossStudioPage />} />
        <Route path="/admin/token-usage" element={<AdminTokenUsagePage />} />
        <Route path="/me/token-usage" element={<MeTokenUsagePage />} />
        <Route path="/studios" element={<StudiosListPage />} />
        <Route
          path="/studios/:studioId/settings/mcp"
          element={<McpServerSettingsPage />}
        />
        <Route path="/studios/:studioId/settings" element={<StudioSettingsPage />} />
        <Route
          path="/studios/:studioId/token-usage"
          element={<StudioTokenUsagePage />}
        />
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
