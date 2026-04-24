type ProfileSnapshot = {
  demographics: any | null;
  fetchedAt: number;
  dirty: boolean;
};

const profileByUser = new Map<string, ProfileSnapshot>();

const cloneDemographics = (demographics: any) =>
  demographics && typeof demographics === 'object' ? { ...demographics } : demographics ?? null;

export const getCachedProfileDemographics = (userId?: string | null): ProfileSnapshot | null => {
  if (!userId) return null;
  const snapshot = profileByUser.get(userId);
  if (!snapshot) return null;
  return {
    demographics: cloneDemographics(snapshot.demographics),
    fetchedAt: snapshot.fetchedAt,
    dirty: snapshot.dirty,
  };
};

export const setCachedProfileDemographics = (userId: string, demographics: any) => {
  profileByUser.set(userId, {
    demographics: cloneDemographics(demographics),
    fetchedAt: Date.now(),
    dirty: false,
  });
};

export const markProfileDirty = (userId?: string | null) => {
  if (!userId) return;
  const snapshot = profileByUser.get(userId);
  if (!snapshot) {
    profileByUser.set(userId, {
      demographics: null,
      fetchedAt: 0,
      dirty: true,
    });
    return;
  }
  profileByUser.set(userId, {
    ...snapshot,
    dirty: true,
  });
};

export const shouldRefreshProfile = (userId?: string | null, maxAgeMs = 60_000) => {
  if (!userId) return false;
  const snapshot = profileByUser.get(userId);
  if (!snapshot) return true;
  if (snapshot.dirty) return true;
  return Date.now() - snapshot.fetchedAt > maxAgeMs;
};
