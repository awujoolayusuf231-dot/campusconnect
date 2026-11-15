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
const FlashcardsLayout = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.FlashcardsLayout })));
const FlashcardsHomePage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.FlashcardsHomePage })));
const FlashcardLibraryPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.FlashcardLibraryPage })));
const MyFlashcardsPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.MyFlashcardsPage })));
const CreateFlashcardsPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.CreateFlashcardsPage })));
const QuizLibraryPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.QuizLibraryPage })));
const MyQuizzesPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.MyQuizzesPage })));
const CreateQuizPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.CreateQuizPage })));
const QuizResultsPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.QuizResultsPage })));
const SavedQuestionsPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.SavedQuestionsPage })));
const PerformancePage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.PerformancePage })));
const AdvancedLearningPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.AdvancedLearningPage })));
const AdvancedLearningDetailPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.AdvancedLearningDetailPage })));
const FlashcardCollectionPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.FlashcardCollectionPage })));
const GroupQuizHomePage = lazy(() => import("@/features/group-quiz/GroupQuizPages").then((m) => ({ default: m.GroupQuizHomePage })));
const CreateQuizGroupPage = lazy(() => import("@/features/group-quiz/GroupQuizPages").then((m) => ({ default: m.CreateQuizGroupPage })));
const QuizGroupPage = lazy(() => import("@/features/group-quiz/GroupQuizPages").then((m) => ({ default: m.QuizGroupPage })));
const CreateGroupQuizPage = lazy(() => import("@/features/group-quiz/GroupQuizPages").then((m) => ({ default: m.CreateGroupQuizPage })));
const GroupQuizDetailsPage = lazy(() => import("@/features/group-quiz/GroupQuizPages").then((m) => ({ default: m.GroupQuizDetailsPage })));
const GroupQuizAttemptPage = lazy(() => import("@/features/group-quiz/GroupQuizPages").then((m) => ({ default: m.GroupQuizAttemptPage })));
const GroupQuizResultPage = lazy(() => import("@/features/group-quiz/GroupQuizPages").then((m) => ({ default: m.GroupQuizResultPage })));
const GroupQuizPerformancePage = lazy(() => import("@/features/group-quiz/GroupQuizPages").then((m) => ({ default: m.GroupQuizPerformancePage })));
const CelebrationsHomePage = lazy(() => import("@/features/celebrations/CelebrationsPages").then((m) => ({ default: m.CelebrationsHomePage })));
const CreateCelebrationPage = lazy(() => import("@/features/celebrations/CelebrationsPages").then((m) => ({ default: m.CreateCelebrationPage })));
const MyCelebrationsPage = lazy(() => import("@/features/celebrations/CelebrationsPages").then((m) => ({ default: m.MyCelebrationsPage })));
const CelebrationDetailsPage = lazy(() => import("@/features/celebrations/CelebrationsPages").then((m) => ({ default: m.CelebrationDetailsPage })));
const PortfolioDashboardPage = lazy(() => import("@/features/portfolio/PortfolioPages").then((m) => ({ default: m.PortfolioDashboardPage })));
const PortfolioEditorPage = lazy(() => import("@/features/portfolio/PortfolioPages").then((m) => ({ default: m.PortfolioEditorPage })));
const PublicPortfolioPage = lazy(() => import("@/features/portfolio/PortfolioPages").then((m) => ({ default: m.PublicPortfolioPage })));
const CvDashboardPage = lazy(() => import("@/features/cv-builder/CvBuilderPages").then((m) => ({ default: m.CvDashboardPage })));
const CvEditorPage = lazy(() => import("@/features/cv-builder/CvBuilderPages").then((m) => ({ default: m.CvEditorPage })));
const CvPrintPage = lazy(() => import("@/features/cv-builder/CvBuilderPages").then((m) => ({ default: m.CvPrintPage })));
const TimetablePage = lazy(() => import("@/features/timetable/TimetablePages").then((m) => ({ default: m.TimetablePage })));
const TimetableEventEditorPage = lazy(() => import("@/features/timetable/TimetablePages").then((m) => ({ default: m.TimetableEventEditorPage })));

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
        <Route path="/portfolio/:slug" element={<PublicPortfolioPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/app/cv-builder/:cvId/print" element={<CvPrintPage />} />
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
            <Route path="/app/flashcards" element={<FlashcardsLayout />}>
              <Route index element={<FlashcardsHomePage />} />
              <Route path="library" element={<FlashcardLibraryPage />} />
              <Route path="mine" element={<MyFlashcardsPage />} />
              <Route path="create" element={<CreateFlashcardsPage />} />
              <Route path="collections/:collectionId" element={<FlashcardCollectionPage />} />
              <Route path="quizzes" element={<QuizLibraryPage />} />
              <Route path="my-quizzes" element={<MyQuizzesPage />} />
              <Route path="create-quiz" element={<CreateQuizPage />} />
              <Route path="results" element={<QuizResultsPage />} />
              <Route path="saved" element={<SavedQuestionsPage />} />
              <Route path="performance" element={<PerformancePage />} />
              <Route path="advanced" element={<AdvancedLearningPage />} />
              <Route path="advanced/:featureId" element={<AdvancedLearningDetailPage />} />
            </Route>
            <Route path="/app/group-quiz" element={<GroupQuizHomePage />} />
            <Route path="/app/group-quiz/create-group" element={<CreateQuizGroupPage />} />
            <Route path="/app/group-quiz/groups/:groupId" element={<QuizGroupPage />} />
            <Route path="/app/group-quiz/groups/:groupId/create-quiz" element={<CreateGroupQuizPage />} />
            <Route path="/app/group-quiz/quizzes/:quizId" element={<GroupQuizDetailsPage />} />
            <Route path="/app/group-quiz/quizzes/:quizId/performance" element={<GroupQuizPerformancePage />} />
            <Route path="/app/group-quiz/attempts/:attemptId" element={<GroupQuizAttemptPage />} />
            <Route path="/app/group-quiz/attempts/:attemptId/results" element={<GroupQuizResultPage />} />
            <Route path="/app/celebrations" element={<CelebrationsHomePage />} />
            <Route path="/app/celebrations/create" element={<CreateCelebrationPage />} />
            <Route path="/app/celebrations/mine" element={<MyCelebrationsPage />} />
            <Route path="/app/celebrations/:celebrationId/edit" element={<CreateCelebrationPage />} />
            <Route path="/app/celebrations/:celebrationId" element={<CelebrationDetailsPage />} />
            <Route path="/app/portfolio" element={<PortfolioDashboardPage />} />
            <Route path="/app/portfolio/edit" element={<PortfolioEditorPage />} />
            <Route path="/app/cv-builder" element={<CvDashboardPage />} />
            <Route path="/app/cv-builder/new" element={<CvEditorPage />} />
            <Route path="/app/cv-builder/:cvId/edit" element={<CvEditorPage />} />
            <Route path="/app/timetable" element={<TimetablePage />} />
            <Route path="/app/timetable/new" element={<TimetableEventEditorPage />} />
            <Route path="/app/timetable/:eventId/edit" element={<TimetableEventEditorPage />} />
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
