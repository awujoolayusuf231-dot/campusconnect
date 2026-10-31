export interface OnboardingState { hasAvatar: boolean; hasInstitution: boolean; hasBio: boolean; following: number; communities: number; posts: number }
export interface OnboardingStep { id: string; label: string; hint: string; to: string; done: boolean }
export const FOLLOW_TARGET = 3;

export function computeOnboarding(s: OnboardingState): { steps: OnboardingStep[]; doneCount: number; percent: number; complete: boolean } {
  const steps: OnboardingStep[] = [
    { id: "avatar", label: "Add a profile photo", hint: "Students are more likely to follow back a face they recognise.", to: "/app/profile/edit", done: s.hasAvatar },
    { id: "institution", label: "Choose your institution", hint: "Unlocks the My institution feed. It is self-reported, not verified.", to: "/app/profile/edit", done: s.hasInstitution },
    { id: "bio", label: "Write a short bio", hint: "One line about your course or interests is enough.", to: "/app/profile/edit", done: s.hasBio },
    { id: "follow", label: `Follow ${FOLLOW_TARGET} students`, hint: "Their posts appear in your Following feed.", to: "/app/discover", done: s.following >= FOLLOW_TARGET },
    { id: "community", label: "Join a community", hint: "Find people from your course, department or hobby.", to: "/app/communities", done: s.communities >= 1 },
    { id: "post", label: "Make your first post", hint: "Say hello to your campus.", to: "/app", done: s.posts >= 1 },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  return { steps, doneCount, percent: Math.round((doneCount / steps.length) * 100), complete: doneCount === steps.length };
}
