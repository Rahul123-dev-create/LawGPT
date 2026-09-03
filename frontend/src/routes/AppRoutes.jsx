import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import AppShell from '../components/layout/AppShell';
import GuestRoute from './GuestRoute';
import ProtectedRoute from './ProtectedRoute';

import Landing from '../pages/Landing';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ForgotPassword from '../pages/ForgotPassword';
import NotFound from '../pages/NotFound';
import Profile from '../pages/Profile';

import AppHome from '../pages/app/AppHome';
import CaseListView from '../pages/app/CaseListView';
import NewCase from '../pages/app/NewCase';
import EditCase from '../pages/app/EditCase';
import CaseWorkspacePreview from '../pages/app/CaseWorkspacePreview';
import SearchResults from '../pages/app/SearchResults';
import ComingSoonView from '../pages/app/ComingSoonView';
import { researchTools, practiceTools } from '../config/toolsRegistry';

import CaseDetailLayout from '../pages/app/case/CaseDetailLayout';
import CaseOverviewTab from '../pages/app/case/CaseOverviewTab';
import CaseTimelineTab from '../pages/app/case/CaseTimelineTab';
import CaseHearingsTab from '../pages/app/case/CaseHearingsTab';
import HearingDetail from '../pages/app/case/HearingDetail';
import CasePartiesTab from '../pages/app/case/CasePartiesTab';
import CaseNotesTab from '../pages/app/case/CaseNotesTab';
import CaseActivityTab from '../pages/app/case/CaseActivityTab';
import CaseDocumentsTab from '../pages/app/case/CaseDocumentsTab';
import CaseJudgmentsTab from '../pages/app/case/CaseJudgmentsTab';
import CaseAIAnalysisTab from '../pages/app/case/CaseAIAnalysisTab';
import CaseLawsTab from '../pages/app/case/CaseLawsTab';
import CaseArgumentsTab from '../pages/app/case/CaseArgumentsTab';
import CaseChatTab from '../pages/app/case/CaseChatTab';
import CaseReportsTab from '../pages/app/case/CaseReportsTab';
import CaseComingSoonTab from '../pages/app/case/CaseComingSoonTab';
import ResearchHub from '../pages/app/research/ResearchHub';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public / marketing — simple top navbar, no sidebar */}
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />

        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>

      {/* Authenticated app shell — sidebar + topbar */}
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<AppHome />} />
          <Route path="profile" element={<Profile />} />
          <Route path="search" element={<SearchResults />} />

          <Route path="cases/new" element={<NewCase />} />
          <Route path="cases/preview" element={<CaseWorkspacePreview />} />
          <Route path="cases/:status" element={<CaseListView />} />

          {/* "edit" is a literal static segment, so React Router ranks it
              above the dynamic ":section" catch-all inside CaseDetailLayout
              below, even though both patterns could otherwise match
              /app/case/:caseId/edit. */}
          <Route path="case/:caseId/edit" element={<EditCase />} />

          <Route path="case/:caseId" element={<CaseDetailLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<CaseOverviewTab />} />
            <Route path="timeline" element={<CaseTimelineTab />} />
            <Route path="hearings" element={<CaseHearingsTab />} />
            <Route path="hearings/:hearingId" element={<HearingDetail />} />
            <Route path="parties" element={<CasePartiesTab />} />
            <Route path="notes" element={<CaseNotesTab />} />
            <Route path="activity" element={<CaseActivityTab />} />
            <Route path="documents" element={<CaseDocumentsTab />} />
            <Route path="judgments" element={<CaseJudgmentsTab />} />
            <Route path="ai-analysis" element={<CaseAIAnalysisTab />} />
            <Route path="laws" element={<CaseLawsTab />} />
            <Route path="arguments" element={<CaseArgumentsTab />} />
            <Route path="chat" element={<CaseChatTab />} />
            <Route path="reports" element={<CaseReportsTab />} />
            <Route path=":section" element={<CaseComingSoonTab />} />
          </Route>

          <Route path="research/:slug" element={<ResearchHub registry={researchTools} fallback={<ComingSoonView registry={researchTools} />} />} />
          <Route path="practice/:slug" element={<ComingSoonView registry={practiceTools} />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
