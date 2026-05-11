import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminConsolePage } from './pages/admin/AdminConsolePage'
import { EmbeddingsSection } from './pages/admin/EmbeddingsSection'
import { BudgetsSection } from './pages/admin/BudgetsSection'
import { LlmSection } from './pages/admin/LlmSection'
import { OverviewSection } from './pages/admin/OverviewSection'
import { StudiosSection } from './pages/admin/StudiosSection'
import { UsersSection } from './pages/admin/UsersSection'
import { AuthPage } from './pages/AuthPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { DocsUserGuidePage } from './pages/DocsUserGuidePage'
import { HomePage } from './pages/HomePage'
import { MeProfilePage } from './pages/MeProfilePage'
import { NotificationSettingsPage } from './pages/NotificationSettingsPage'
import { OutlineEditorPage } from './pages/OutlineEditorPage'
import { ArtifactLibraryPage } from './pages/ArtifactLibraryPage'
import { ArtifactsPage } from './pages/ArtifactsPage'
import { WorkOrdersPage } from './pages/WorkOrdersPage'
import { IssuesPage } from './pages/IssuesPage'
import { LlmUsagePage } from './pages/LlmUsagePage'
import { MeTokenUsagePage } from './pages/MeTokenUsagePage'
import { ProjectPage } from './pages/ProjectPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { SectionCopilotAliasRedirect } from './pages/SectionCopilotAliasRedirect'
import { SectionPage } from './pages/SectionPage'
import { SoftwareDocEditorPage } from './pages/SoftwareDocEditorPage'
import { SoftwarePage } from './pages/SoftwarePage'
import { SoftwareSettingsPage } from './pages/SoftwareSettingsPage'
import { StudioPage } from './pages/StudioPage'
import { StudioTokenUsageRedirect } from './pages/StudioTokenUsageRedirect'
import { McpServerSettingsPage } from './pages/McpServerSettingsPage'
import { StudioSettingsPage } from './pages/StudioSettingsPage'
import { StudiosListPage } from './pages/StudiosListPage'

function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route path="/ui/outline-editor" element={<OutlineEditorPage />} />
        <Route path="/docs/builder" element={<DocsUserGuidePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/me/profile" element={<MeProfilePage />} />
        <Route
          path="/me/notifications"
          element={<NotificationSettingsPage />}
        />
        <Route path="/admin/console" element={<AdminConsolePage />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewSection />} />
          <Route path="studios" element={<StudiosSection />} />
          <Route path="llm" element={<LlmSection />} />
          <Route path="budgets" element={<BudgetsSection />} />
          <Route path="embeddings" element={<EmbeddingsSection />} />
          <Route path="users" element={<UsersSection />} />
        </Route>
        <Route path="/llm-usage" element={<LlmUsagePage />} />
        <Route path="/me/token-usage" element={<MeTokenUsagePage />} />
        <Route path="/studios" element={<StudiosListPage />} />
        <Route
          path="/studios/:studioId/settings/mcp"
          element={<McpServerSettingsPage />}
        />
        <Route path="/studios/:studioId/settings" element={<StudioSettingsPage />} />
        <Route
          path="/studios/:studioId/token-usage"
          element={<StudioTokenUsageRedirect />}
        />
        <Route
          path="/studios/:studioId/artifact-library"
          element={<ArtifactLibraryPage />}
        />
        <Route path="/studios/:studioId" element={<StudioPage />} />
        <Route
          path="/studios/:studioId/software/:softwareId/settings"
          element={<SoftwareSettingsPage />}
        />
        <Route
          path="/studios/:studioId/software/:softwareId"
          element={<SoftwarePage />}
        />
        <Route
          path="/studios/:studioId/software/:softwareId/docs/:sectionId"
          element={<SoftwareDocEditorPage />}
        />
        <Route
          path="/studios/:studioId/software/:softwareId/projects/:projectId/sections/:sectionId/copilot"
          element={<SectionCopilotAliasRedirect />}
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
          path="/studios/:studioId/software/:softwareId/projects/:projectId/settings"
          element={<ProjectSettingsPage />}
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
