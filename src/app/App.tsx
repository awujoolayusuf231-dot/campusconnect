import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { RequireAuth, RequireStaff } from "@/features/auth/guards";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { RegisterPage } from "@/features/auth/pages/RegisterPage";
import { ForgotPasswordPage } from "@/features/auth/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/pages/ResetPasswordPage";
import { StudentLayout } from "@/app/StudentLayout";
import { FeedPage } from "@/features/social/FeedPage";
import { DiscoverPage } from "@/features/social/DiscoverPage";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { ProfileEditPage } from "@/features/profile/ProfileEditPage";
import { CommunitiesPage } from "@/features/community/CommunitiesPage";
import { CommunityPage } from "@/features/community/CommunityPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { MessagesPage } from "@/features/messages/MessagesPage";
import { AboutPage, ContactPage, FeaturesPage, GuidelinesPage, PrivacyPage, TermsPage } from "@/pages/public/pages";
import { PostPage } from "@/features/social/PostPage";
import { OpportunitiesPage } from "@/features/opportunities/OpportunitiesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { LoadingState } from "@/app/LoadingState";
import { PastQuestionsLayout } from "@/features/past-questions/PastQuestionsLayout";
import {
  MyStudyNotes,
  SavedStudyNotes,
  StudyNoteDetails,
  StudyNotesCourses,
  StudyNotesCourseDetails,
  StudyNotesHome,
  StudyNotesInstitutionDetails,
  StudyNotesInstitutions,
  StudyNotesLayout,
  StudyNotesUpload,
} from "@/features/study-notes/StudyNotesPages";
import {
  CourseBrowser,
  CourseDetailsPage,
  CatalogManagementPage,
  InstitutionBrowser,
  InstitutionDetailsPage,
  MyResourcesPage,
  PastQuestionsHome,
  QuestionDetailsPage,
  ResourceManagementPage,
  UploadPage,
} from "@/features/past-questions/PastQuestionsPages";

const AdminLayout = lazy(() => import("@/features/admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const DashboardPage = lazy(() => import("@/features/admin/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ReportsPage = lazy(() => import("@/features/admin/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const CommunitiesAdminPage = lazy(() => import("@/features/admin/pages/CommunitiesAdminPage").then((m) => ({ default: m.CommunitiesAdminPage })));
const AnnouncementsPage = lazy(() => import("@/features/admin/pages/AnnouncementsPage").then((m) => ({ default: m.AnnouncementsPage })));
const OpportunitiesAdminPage = lazy(() => import("@/features/admin/pages/OpportunitiesAdminPage").then((m) => ({ default: m.OpportunitiesAdminPage })));
const InstitutionsPage = lazy(() => import("@/features/admin/pages/InstitutionsPage").then((m) => ({ default: m.InstitutionsPage })));
const PlatformSettingsPage = lazy(() => import("@/features/admin/pages/PlatformSettingsPage").then((m) => ({ default: m.PlatformSettingsPage })));
const AuditLogPage = lazy(() => import("@/features/admin/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));
const StaffPage = lazy(() => import("@/features/admin/pages/StaffPage").then((m) => ({ default: m.StaffPage })));
const UsersPage = lazy(() => import("@/features/admin/pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const StudyNotesReviewPage = lazy(() => import("@/features/admin/pages/StudyNotesReviewPage").then((m) => ({ default: m.StudyNotesReviewPage })));
const AssignmentDiscussionsPage = lazy(() => import("@/features/assignment-discussions/AssignmentDiscussionsPages").then((m) => ({ default: m.AssignmentDiscussionsPage })));
const AssignmentDiscussionRoomPage = lazy(() => import("@/features/assignment-discussions/AssignmentDiscussionsPages").then((m) => ({ default: m.AssignmentDiscussionRoomPage })));

export function App() {
  const location = useLocation();

  return (
    <Suspense fallback={<LoadingState label="Preparing your campus space" variant="page" />}>
      <div key={location.pathname} className="route-transition">
       <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/community-guidelines" element={<GuidelinesPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<StudentLayout />}>
            <Route path="/app" element={<FeedPage />} />
            <Route path="/app/discover" element={<DiscoverPage />} />
            <Route path="/app/p/:id" element={<PostPage />} />
            <Route path="/app/communities" element={<CommunitiesPage />} />
            <Route path="/app/past-questions" element={<PastQuestionsLayout />}>
              <Route index element={<PastQuestionsHome />} />
              <Route path="institutions" element={<InstitutionBrowser />} />
              <Route path="institutions/:institutionId" element={<InstitutionDetailsPage />} />
              <Route path="courses" element={<CourseBrowser />} />
              <Route path="courses/:courseId" element={<CourseDetailsPage />} />
              <Route path="questions/:questionId" element={<QuestionDetailsPage />} />
              <Route path="upload" element={<UploadPage />} />
              <Route path="my-resources" element={<MyResourcesPage />} />
              <Route path="manage" element={<ResourceManagementPage />} />
              <Route path="catalog" element={<CatalogManagementPage />} />
            </Route>
            <Route path="/app/study-notes" element={<StudyNotesLayout />}>
              <Route index element={<StudyNotesHome />} />
              <Route path="institutions" element={<StudyNotesInstitutions />} />
              <Route path="institutions/:institutionId" element={<StudyNotesInstitutionDetails />} />
              <Route path="courses" element={<StudyNotesCourses />} />
              <Route path="courses/:courseId" element={<StudyNotesCourseDetails />} />
              <Route path="notes/:noteId" element={<StudyNoteDetails />} />
              <Route path="upload" element={<StudyNotesUpload />} />
              <Route path="my-uploads" element={<MyStudyNotes />} />
              <Route path="saved" element={<SavedStudyNotes />} />
            </Route>
            <Route path="/app/assignment-discussions" element={<AssignmentDiscussionsPage />} />
            <Route path="/app/assignment-discussions/courses/:courseId" element={<AssignmentDiscussionRoomPage />} />
            <Route path="/app/opportunities" element={<OpportunitiesPage />} />
            <Route path="/app/c/:slug" element={<CommunityPage />} />
            <Route path="/app/notifications" element={<NotificationsPage />} />
            <Route path="/app/messages" element={<MessagesPage />} />
            <Route path="/app/messages/:id" element={<MessagesPage />} />
            <Route path="/app/u/:username" element={<ProfilePage />} />
            <Route path="/app/profile/edit" element={<ProfileEditPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route element={<RequireStaff />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="communities" element={<CommunitiesAdminPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="opportunities" element={<OpportunitiesAdminPage />} />
            <Route path="institutions" element={<InstitutionsPage />} />
            <Route path="settings" element={<PlatformSettingsPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="study-notes/review" element={<StudyNotesReviewPage />} />
            <Route path="past-questions/review" element={<ResourceManagementPage />} />
            <Route path="past-questions/catalog" element={<CatalogManagementPage />} />
          </Route>
        </Route>
        <Route path="*" element={<div className="p-8">Page not found. <a className="underline" href="/">Home</a></div>} />
       </Routes>
      </div>
    </Suspense>
  );
}
