import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireStaff } from "@/features/auth/guards";
import { LoadingState } from "@/app/LoadingState";

const StudentLayout = lazy(() => import("@/app/StudentLayout").then((m) => ({ default: m.StudentLayout })));
const HomePage = lazy(() => import("@/pages/HomePage").then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import("@/features/auth/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/features/auth/pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const AuthCallbackPage = lazy(() => import("@/features/auth/pages/AuthCallbackPage").then((m) => ({ default: m.AuthCallbackPage })));
const ForgotPasswordPage = lazy(() => import("@/features/auth/pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/features/auth/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const FeedPage = lazy(() => import("@/features/social/FeedPage").then((m) => ({ default: m.FeedPage })));
const DiscoverPage = lazy(() => import("@/features/social/DiscoverPage").then((m) => ({ default: m.DiscoverPage })));
const ProfilePage = lazy(() => import("@/features/profile/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const ProfileEditPage = lazy(() => import("@/features/profile/ProfileEditPage").then((m) => ({ default: m.ProfileEditPage })));
const CommunitiesPage = lazy(() => import("@/features/community/CommunitiesPage").then((m) => ({ default: m.CommunitiesPage })));
const CommunityPage = lazy(() => import("@/features/community/CommunityPage").then((m) => ({ default: m.CommunityPage })));
const NotificationsPage = lazy(() => import("@/features/notifications/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const MessagesPage = lazy(() => import("@/features/messages/MessagesPage").then((m) => ({ default: m.MessagesPage })));
const AboutPage = lazy(() => import("@/pages/public/pages").then((m) => ({ default: m.AboutPage })));
const MissionPage = lazy(() => import("@/pages/public/pages").then((m) => ({ default: m.MissionPage })));
const ContactPage = lazy(() => import("@/pages/public/pages").then((m) => ({ default: m.ContactPage })));
const FeaturesPage = lazy(() => import("@/pages/public/pages").then((m) => ({ default: m.FeaturesPage })));
const GuidelinesPage = lazy(() => import("@/pages/public/pages").then((m) => ({ default: m.GuidelinesPage })));
const PrivacyPage = lazy(() => import("@/pages/public/pages").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("@/pages/public/pages").then((m) => ({ default: m.TermsPage })));
const PostPage = lazy(() => import("@/features/social/PostPage").then((m) => ({ default: m.PostPage })));
const SavedPostsPage = lazy(() => import("@/features/social/SavedPostsPage").then((m) => ({ default: m.SavedPostsPage })));
const AccountAnalyticsPage = lazy(() => import("@/features/social/AccountAnalyticsPage").then((m) => ({ default: m.AccountAnalyticsPage })));
const SubscriptionPage = lazy(() => import("@/features/payments/SubscriptionPage").then((m) => ({ default: m.SubscriptionPage })));
const OpportunitiesPage = lazy(() => import("@/features/opportunities/OpportunitiesPage").then((m) => ({ default: m.OpportunitiesPage })));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const PastQuestionsLayout = lazy(() => import("@/features/past-questions/PastQuestionsLayout").then((m) => ({ default: m.PastQuestionsLayout })));
const MyStudyNotes = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.MyStudyNotes })));
const SavedStudyNotes = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.SavedStudyNotes })));
const StudyNoteDetails = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.StudyNoteDetails })));
const StudyNotesCourses = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.StudyNotesCourses })));
const StudyNotesCourseDetails = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.StudyNotesCourseDetails })));
const StudyNotesHome = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.StudyNotesHome })));
const StudyNotesInstitutionDetails = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.StudyNotesInstitutionDetails })));
const StudyNotesInstitutions = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.StudyNotesInstitutions })));
const StudyNotesLayout = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.StudyNotesLayout })));
const StudyNotesUpload = lazy(() => import("@/features/study-notes/StudyNotesPages").then((m) => ({ default: m.StudyNotesUpload })));
const CourseBrowser = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.CourseBrowser })));
const CourseDetailsPage = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.CourseDetailsPage })));
const CatalogManagementPage = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.CatalogManagementPage })));
const InstitutionBrowser = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.InstitutionBrowser })));
const InstitutionDetailsPage = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.InstitutionDetailsPage })));
const MyResourcesPage = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.MyResourcesPage })));
const PastQuestionsHome = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.PastQuestionsHome })));
const QuestionDetailsPage = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.QuestionDetailsPage })));
const ResourceManagementPage = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.ResourceManagementPage })));
const UploadPage = lazy(() => import("@/features/past-questions/PastQuestionsPages").then((m) => ({ default: m.UploadPage })));

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
const AccountDeletionRequestsPage = lazy(() => import("@/features/admin/pages/AccountDeletionRequestsPage").then((m) => ({ default: m.AccountDeletionRequestsPage })));
const ResendContactsPage = lazy(() => import("@/features/admin/pages/ResendContactsPage").then((m) => ({ default: m.ResendContactsPage })));
const StudyNotesReviewPage = lazy(() => import("@/features/admin/pages/StudyNotesReviewPage").then((m) => ({ default: m.StudyNotesReviewPage })));
const CelebrationCatalogPage = lazy(() => import("@/features/admin/pages/CelebrationCatalogPage").then((m) => ({ default: m.CelebrationCatalogPage })));
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
const LearningQuizDetailsPage = lazy(() => import("@/features/flashcards/FlashcardsPages").then((m) => ({ default: m.LearningQuizDetailsPage })));
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
const CelebrationStudioPage = lazy(() => import("@/features/celebrations/CelebrationStudioPage").then((m) => ({ default: m.CelebrationStudioPage })));
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
const HashtagPage = lazy(() => import("@/features/social/HashtagPage").then((m) => ({ default: m.HashtagPage })));
const ProjectBoardPage = lazy(() => import("@/features/projects/ProjectPages").then((m) => ({ default: m.ProjectBoardPage })));
const ProjectWorkspacePage = lazy(() => import("@/features/projects/ProjectPages").then((m) => ({ default: m.ProjectWorkspacePage })));
const CompetitionsPage = lazy(() => import("@/features/competitions/CompetitionsPages").then((m) => ({ default: m.CompetitionsPage })));
const CompetitionDetailsPage = lazy(() => import("@/features/competitions/CompetitionsPages").then((m) => ({ default: m.CompetitionDetailsPage })));
const CompetitionReviewPage = lazy(() => import("@/features/competitions/CompetitionsPages").then((m) => ({ default: m.CompetitionReviewPage })));
const VoiceSpacesPage = lazy(() => import("@/features/voice/VoiceSpacesPages").then((m) => ({ default: m.VoiceSpacesPage })));
const VoiceRoomPage = lazy(() => import("@/features/voice/VoiceSpacesPages").then((m) => ({ default: m.VoiceRoomPage })));
const LearnHub = lazy(() => import("@/features/academic/AcademicResourcesHub").then((m) => ({ default: m.LearnHub })));
const CollaborateHub = lazy(() => import("@/features/academic/AcademicResourcesHub").then((m) => ({ default: m.CollaborateHub })));
const DiscoverHub = lazy(() => import("@/features/academic/AcademicResourcesHub").then((m) => ({ default: m.DiscoverHub })));

export function App() {
  return (
    <Suspense fallback={<LoadingState label="Preparing your campus space" variant="page" />}>
      <div className="route-transition">
       <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/mission" element={<MissionPage />} />
        <Route path="/community-guidelines" element={<GuidelinesPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/portfolio/:slug" element={<PublicPortfolioPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/app/cv-builder/:cvId/print" element={<CvPrintPage />} />
          <Route element={<StudentLayout />}>
            <Route path="/app" element={<FeedPage />} />
            <Route path="/app/discover" element={<DiscoverPage />} />
            <Route path="/app/tags/:tag" element={<HashtagPage />} />
            <Route path="/app/p/:id" element={<PostPage />} />
            <Route path="/app/saved-posts" element={<SavedPostsPage />} />
            <Route path="/app/learning" element={<Navigate to="/app/flashcards" replace />} />
            <Route path="/app/academic" element={<Navigate to="/app/learn" replace />} />
            <Route path="/app/learn" element={<LearnHub />} />
            <Route path="/app/collaborate" element={<CollaborateHub />} />
            <Route path="/app/discover-hub" element={<DiscoverHub />} />
            <Route path="/app/analytics" element={<AccountAnalyticsPage />} />
            <Route path="/app/subscription" element={<SubscriptionPage />} />
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
              <Route path="edit-quiz/:quizId" element={<CreateQuizPage />} />
              <Route path="quizzes/:quizId" element={<LearningQuizDetailsPage />} />
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
            <Route path="/app/celebrations/create" element={<CelebrationStudioPage />} />
            <Route path="/app/celebrations/mine" element={<MyCelebrationsPage />} />
            <Route path="/app/celebrations/:celebrationId/edit" element={<CelebrationStudioPage />} />
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
            <Route path="/app/projects" element={<ProjectBoardPage />} />
            <Route path="/app/projects/:id" element={<ProjectWorkspacePage />} />
            <Route path="/app/competitions" element={<CompetitionsPage />} />
            <Route path="/app/competitions/:id" element={<CompetitionDetailsPage />} />
            <Route path="/app/voice-spaces" element={<VoiceSpacesPage />} />
            <Route path="/app/voice-spaces/:id" element={<VoiceRoomPage />} />
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
            <Route path="deletions" element={<AccountDeletionRequestsPage />} />
            <Route path="resend-contacts" element={<ResendContactsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="communities" element={<CommunitiesAdminPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="opportunities" element={<OpportunitiesAdminPage />} />
            <Route path="institutions" element={<InstitutionsPage />} />
            <Route path="settings" element={<PlatformSettingsPage />} />
            <Route path="celebration-studio" element={<CelebrationCatalogPage />} />
            <Route path="competition-review" element={<CompetitionReviewPage />} />
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
