// Who is asked about pregnancy and breastfeeding. ONE definition, used by
// both screens that show the question:
//   app/(onboarding)/index.tsx    step 8
//   app/(tabs)/profile/edit.tsx   the "Pregnancy & breastfeeding" section
// If they each kept their own copy, changing one and forgetting the other
// would make the two screens disagree about who sees the question.
//
// The server applies the matching rule independently (it stores NULL for any
// male user), in backend/src/services/demographicsRules.js. That is a
// separate repo, so it cannot import this file; change both together.
//
// Design: claude_memory/database redesign/meal planning redesign/
//         ONBOARDING_PREGNANCY_DESIGN.html  (section 4, "Who sees it")

export const PREGNANCY_QUESTION_GENDERS = ['female', 'other'] as const;

/** True when the pregnancy question applies to someone of this gender. */
export const asksAboutPregnancy = (gender: unknown): boolean =>
  (PREGNANCY_QUESTION_GENDERS as readonly string[]).includes(
    String(gender ?? '').toLowerCase()
  );
