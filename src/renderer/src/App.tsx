import { AnimatePresence } from 'motion/react';
import { Mascot } from './components/Mascot';
import { Sidebar } from './components/Shell';
import { Toasts } from './components/Toasts';
import { CoachPage } from './features/coach/CoachPage';
import { InterviewPage } from './features/interview/InterviewPage';
import { LearnPage } from './features/learn/LearnPage';
import { LessonPlayer } from './features/lesson/LessonPlayer';
import { Onboarding } from './features/onboarding/Onboarding';
import { PracticePage } from './features/practice/PracticePage';
import { ProgressPage } from './features/progress/ProgressPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TargetDetail } from './features/targets/TargetDetail';
import { TargetsPage } from './features/targets/TargetsPage';
import { useApp, type Route } from './lib/store';
import { useThemeSync } from './lib/theme';

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'learn':
      return <LearnPage />;
    case 'practice':
      return <PracticePage />;
    case 'interview':
      return <InterviewPage id={route.id} />;
    case 'targets':
      return <TargetsPage />;
    case 'target':
      return <TargetDetail id={route.id} />;
    case 'coach':
      return <CoachPage id={route.id} />;
    case 'progress':
      return <ProgressPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

function Splash() {
  return (
    <div className="drag flex h-full flex-col items-center justify-center gap-4">
      <Mascot mood="thinking" size={110} />
      <div className="text-lg font-black">Warming up Ascend…</div>
    </div>
  );
}

export function App() {
  useThemeSync();
  const ready = useApp((s) => s.ready);
  const onboarded = useApp((s) => s.snapshot?.profile.onboarded);
  const route = useApp((s) => s.route);
  const lessonId = useApp((s) => s.lessonId);
  const onboardingActive = useApp((s) => s.onboardingActive);

  if (!ready) return <Splash />;

  if (!onboarded || onboardingActive) {
    return (
      <>
        <Onboarding />
        <Toasts />
      </>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <Page route={route} />
      </main>
      <AnimatePresence>{lessonId && <LessonPlayer key={lessonId} lessonId={lessonId} />}</AnimatePresence>
      <Toasts />
    </div>
  );
}
