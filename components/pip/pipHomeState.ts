/**
 * Decides which Pip state and copy the home reminder card shows.
 *
 * Kept as a pure function (no React, no clock, no fetching) so the branch table
 * can be reasoned about and tested directly. The caller supplies the hour and
 * today's data.
 */

import type { PipState } from './PipBird';
import { resolveCalorieZone } from '../../services/calorieBand';

export type MealLogType = 'breakfast' | 'lunch' | 'dinner';

export type PipCardModel = {
  /** Which meal the card's action should target, or null for a non-meal state. */
  mealType: MealLogType | null;
  state: PipState;
  subline: string;
  title: string;
};

export type PipCardInput = {
  calorieTarget: number;
  consumedCalories: number;
  /** Local hour, 0-23. */
  hour: number;
  /** Meals logged today, or null when that data has not loaded yet. */
  loggedMealTypes: Set<MealLogType> | null;
  /** False while the 2000 kcal placeholder target is in play (Error 066). */
  targetResolved: boolean;
};

/**
 * Tight windows so a meal reminder only appears near a real meal time. These are
 * deliberately narrower than getDefaultMealLogType() in the home screen, which
 * splits the whole day into three buckets purely to default the log type.
 */
export const MEAL_WINDOWS: { end: number; start: number; type: MealLogType }[] = [
  { end: 10, start: 7, type: 'breakfast' },
  { end: 14, start: 11, type: 'lunch' },
  { end: 20, start: 17, type: 'dinner' },
];

/** Share of the daily target each meal is expected to cover, for the suggestion line. */
const MEAL_SHARE: Record<MealLogType, number> = {
  breakfast: 0.25,
  dinner: 0.35,
  lunch: 0.3,
};

const DAY_ENDS_HOUR = 22;
const CONFIDENT_MIN_HOURS_LEFT = 2;

/**
 * Skip copy, per meal. Deliberately free of kcal figures: a number here reads as
 * a scorecard, and the point of this branch is to make logging feel easy rather
 * than to quantify what was lost. The push sent by the backend's 10:00 / 14:00 /
 * 20:00 skip-checks is the same message in the same voice, so opening the app
 * from a notification does not feel like a different app talking.
 */
const SKIP_COPY: Record<MealLogType, { subline: string; title: string }> = {
  breakfast: {
    subline: 'You haven’t had a bite yet, there’s still time for something easy.',
    title: 'Brekkie check-in, mate!',
  },
  dinner: {
    subline: 'Something easy tonight is still a solid win.',
    title: 'Dinner check-in!',
  },
  lunch: {
    subline: 'Lunch slipped by, a simple bite can keep you going this arvo.',
    title: 'Lunch check-in!',
  },
};

const kcal = (value: number) => Math.round(value).toLocaleString('en-US');
const roundTo10 = (value: number) => Math.max(0, Math.round(value / 10) * 10);

export function resolvePipCard({
  calorieTarget,
  consumedCalories,
  hour,
  loggedMealTypes,
  targetResolved,
}: PipCardInput): PipCardModel {
  // Error 066: the 2000 kcal placeholder must never drive an emotional state.
  // Hold neutral until the real goal arrives.
  if (!targetResolved || calorieTarget <= 0) {
    return {
      mealType: null,
      state: 'idle',
      subline: 'Getting today’s numbers together.',
      title: 'Welcome back',
    };
  }

  const remaining = Math.max(0, calorieTarget - consumedCalories);
  const zone = resolveCalorieZone(consumedCalories, calorieTarget);

  // 1. Inside the tolerance band. Highest priority: a win outranks everything
  //    else. This is a band rather than an exact hit — see services/calorieBand.ts.
  if (zone === 'on_target') {
    return {
      mealType: null,
      state: 'happy',
      subline: `${kcal(consumedCalories)} of ${kcal(calorieTarget)} kcal logged today.`,
      title: 'Target smashed!',
    };
  }

  // 2. Past the top of the band. Confident, never a scolding — and no meal
  //    prompt, since suggesting another meal here would be absurd.
  if (zone === 'over') {
    return {
      mealType: null,
      state: 'confident',
      subline: 'Tomorrow is a clean slate. One day does not undo a week.',
      title: `${kcal(consumedCalories - calorieTarget)} kcal over today.`,
    };
  }

  const openWindow = MEAL_WINDOWS.find((w) => hour >= w.start && hour < w.end) ?? null;

  // 3. Inside a meal window that has not been logged yet.
  //
  // This deliberately outranks Sad. If breakfast was missed but it is now
  // lunchtime, the useful thing to say is "time for lunch", not "you missed
  // breakfast" — the design's own note is that guilt loses users.
  if (openWindow && !loggedMealTypes?.has(openWindow.type)) {
    const suggested = roundTo10(Math.min(remaining, calorieTarget * MEAL_SHARE[openWindow.type]));
    return {
      mealType: openWindow.type,
      state: 'care',
      subline: `You’re ${kcal(remaining)} kcal short. A ${kcal(suggested)} kcal ${openWindow.type} keeps today on track.`,
      title: `Time for ${openWindow.type}?`,
    };
  }

  // 4. A meal window has closed with nothing logged against it.
  if (loggedMealTypes) {
    const closed = MEAL_WINDOWS.filter((w) => hour >= w.end);
    const lastClosed = closed[closed.length - 1];
    // Windows are ordered and non-overlapping, so the closed ones are always a
    // prefix and this is the window that follows the last closed one.
    const nextWindow = MEAL_WINDOWS[closed.length];
    // Once the next meal window has opened, an earlier miss is old news. Without
    // this, logging lunch at midday would make Pip sulk about breakfast — the
    // user would be punished for the very thing the card asked them to do.
    //
    // The DAY_ENDS_HOUR clause does the same job for dinner, which has no window
    // after it: past 22:00 "add it now" is asking for a midnight meal, so the
    // card hands over to the closing note at the bottom of this function.
    const missIsStale =
      (Boolean(nextWindow) && hour >= nextWindow.start) || hour >= DAY_ENDS_HOUR;

    if (lastClosed && !missIsStale && !loggedMealTypes.has(lastClosed.type)) {
      const previousClosed = closed[closed.length - 2];
      const missedTwoInARow = Boolean(previousClosed) && !loggedMealTypes.has(previousClosed.type);

      // Motion spec: Sad never twice in a row. The second miss challenges
      // instead of sulking.
      if (missedTwoInARow) {
        return {
          mealType: lastClosed.type,
          state: 'confident',
          subline: 'A couple slipped by. One good feed still turns today around.',
          title: 'No stress, mate.',
        };
      }

      return {
        mealType: lastClosed.type,
        state: 'sad',
        ...SKIP_COPY[lastClosed.type],
      };
    }
  }

  // 5. Behind target with real time left in the day.
  if (hour < DAY_ENDS_HOUR - CONFIDENT_MIN_HOURS_LEFT) {
    return {
      mealType: null,
      state: 'confident',
      subline: 'Plenty of day left to get there.',
      title: `${kcal(remaining)} kcal to go — easy.`,
    };
  }

  // 6. Under target with the day effectively over.
  //
  // Everything above has returned, so reaching here means zone === 'under' and
  // it is late. There is no useful nudge left — suggesting a meal at this hour
  // is worse advice than eating nothing — so this closes the day out instead.
  // The old copy here was an idle "You’re on track", which was simply untrue for
  // the only user who can reach this branch. Mirrors the backend's 21:00 push.
  return {
    mealType: null,
    state: 'care',
    subline: 'Every meal you logged counts. Reset and give it another crack tomorrow.',
    title: 'Still a good day!',
  };
}

/** Pulls the set of meal types logged today out of a meals-summary payload. */
export function extractLoggedMealTypes(meals: unknown): Set<MealLogType> {
  const logged = new Set<MealLogType>();
  if (!Array.isArray(meals)) return logged;

  for (const meal of meals) {
    const raw = String(
      (meal as { mealType?: unknown; meal_type?: unknown })?.mealType ??
        (meal as { meal_type?: unknown })?.meal_type ??
        ''
    )
      .trim()
      .toLowerCase();
    if (raw === 'breakfast' || raw === 'lunch' || raw === 'dinner') {
      logged.add(raw);
    }
  }

  return logged;
}
