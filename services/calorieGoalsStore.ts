import { authedFetch, type GetToken } from "./authedFetch";

export type CalorieGoal = {
  id: number;
  userId?: number;
  goalName: string;
  dailyCalories: number;
  description?: string | null;
  startDate: string;
  endDate: string;
  notificationsEnabled?: boolean;
  status: "done" | "in-progress";
  createdAt?: string;
  updatedAt?: string;
};

type CalorieGoalsSnapshot = {
  goals: CalorieGoal[];
  fetchedAt: number;
  dirty: boolean;
};

const goalsByUser = new Map<string, CalorieGoalsSnapshot>();
const inFlightFetches = new Map<string, Promise<CalorieGoal[] | null>>();

const cloneGoals = (goals: CalorieGoal[]) =>
  goals.map((goal) => ({ ...goal }));

export const getCachedCalorieGoals = (
  userId?: string | null
): CalorieGoalsSnapshot | null => {
  if (!userId) return null;
  const snapshot = goalsByUser.get(userId);
  if (!snapshot) return null;
  return {
    goals: cloneGoals(snapshot.goals),
    fetchedAt: snapshot.fetchedAt,
    dirty: snapshot.dirty,
  };
};

export const setCachedCalorieGoals = (
  userId: string,
  goals: CalorieGoal[]
) => {
  goalsByUser.set(userId, {
    goals: cloneGoals(goals),
    fetchedAt: Date.now(),
    dirty: false,
  });
};

export const markCalorieGoalsDirty = (userId?: string | null) => {
  if (!userId) return;
  const snapshot = goalsByUser.get(userId);
  if (!snapshot) {
    goalsByUser.set(userId, { goals: [], fetchedAt: 0, dirty: true });
    return;
  }
  goalsByUser.set(userId, { ...snapshot, dirty: true });
};

export const removeCalorieGoalFromCache = (
  userId: string,
  goalId: number
) => {
  const snapshot = goalsByUser.get(userId);
  if (!snapshot) return;
  goalsByUser.set(userId, {
    ...snapshot,
    goals: snapshot.goals.filter((goal) => goal.id !== goalId),
  });
};

export const shouldRefreshCalorieGoals = (
  userId?: string | null,
  maxAgeMs = 5 * 60 * 1000
) => {
  if (!userId) return false;
  const snapshot = goalsByUser.get(userId);
  if (!snapshot) return true;
  if (snapshot.dirty) return true;
  return Date.now() - snapshot.fetchedAt > maxAgeMs;
};

type FetchCalorieGoalsArgs = {
  userId: string;
  getToken?: GetToken;
  ttlMs?: number;
  force?: boolean;
};

export const fetchCalorieGoalsWithCache = async ({
  userId,
  getToken,
  ttlMs = 5 * 60 * 1000,
  force = false,
}: FetchCalorieGoalsArgs): Promise<CalorieGoal[] | null> => {
  if (!userId) return null;

  if (!force) {
    const cached = goalsByUser.get(userId);
    if (cached && !cached.dirty && Date.now() - cached.fetchedAt <= ttlMs) {
      return cloneGoals(cached.goals);
    }
  }

  const inFlight = inFlightFetches.get(userId);
  if (inFlight) return inFlight;

  const pending = (async () => {
    try {
      const response = await authedFetch(`/api/calorie/list/${userId}`, {
        getToken,
        clerkId: userId,
      });
      if (!response.ok) return null;

      const data = await response.json();
      if (!Array.isArray(data)) return null;

      const goals = data as CalorieGoal[];
      setCachedCalorieGoals(userId, goals);
      return cloneGoals(goals);
    } catch {
      return null;
    }
  })();

  inFlightFetches.set(userId, pending);
  try {
    return await pending;
  } finally {
    if (inFlightFetches.get(userId) === pending) {
      inFlightFetches.delete(userId);
    }
  }
};
