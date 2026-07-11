// Frontend client for the backend TheMealDB proxy (browse-by-cuisine).
// These are public GET endpoints (no auth); the premier key stays server-side.

const BACKEND_API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const baseUrl = (): string => {
  const b = String(BACKEND_API_URL || '').trim().replace(/\/+$/, '');
  if (!b) throw new Error('Missing EXPO_PUBLIC_BACKEND_URL for TheMealDB requests.');
  return b;
};

export type CuisineArea = { area: string; count: number };

export type CuisineDish = { source: 'themealdb'; id: string; title: string; image: string };

export type ThemealdbRecipe = {
  source: 'themealdb';
  id: string;
  title: string;
  image: string;
  cuisine: string;
  category: string;
  tags: string[];
  youtube: string;
  ingredients: { name: string; measure: string; image?: string }[];
  instructions: string[];
  nutrition: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
    sugar?: number | null;
    estimated: boolean;
    status?: string;          // 'computed' | 'pending'
    basis?: string;           // 'whole_recipe'
    coverage?: number;        // 0..1 share of ingredients resolved
    lowConfidence?: boolean;
    // Estimated whole-recipe yield (server-derived from parsed ingredient mass +
    // TheMealDB category, clamped 1-12; TheMealDB has no real servings count).
    // Always an estimate when present, hence servingsEstimated — the serving pill
    // stays user-editable so a wrong guess is a one-tap fix, not a dead end.
    servings?: number;
    servingsEstimated?: boolean;
  };
};

export const getCuisines = async (): Promise<CuisineArea[]> => {
  // Cache-bust: the areas list is tiny and may change when we regenerate it, so
  // never let the device serve a stale on-disk HTTP cache (the unique URL forces
  // a fresh fetch; the backend still answers from its own in-memory cache).
  const res = await fetch(`${baseUrl()}/api/themealdb/areas?_=${Date.now()}`, {
    cache: 'no-store' as RequestCache,
  });
  if (!res.ok) throw new Error(`Failed to load cuisines (${res.status})`);
  const data = await res.json();
  const raw: unknown[] = Array.isArray(data?.areas) ? data.areas : [];
  // Tolerate both response shapes: the new {area,count}[] and the legacy string[]
  // (e.g. an older backend build), and drop anything malformed so the UI never
  // crashes on an undefined area name.
  return raw
    .map((item): CuisineArea | null => {
      if (typeof item === 'string') return { area: item, count: 0 };
      if (item && typeof (item as any).area === 'string') {
        return { area: (item as any).area, count: Number((item as any).count) || 0 };
      }
      return null;
    })
    .filter((x): x is CuisineArea => x !== null);
};

export const getDishesByCuisine = async (area: string): Promise<CuisineDish[]> => {
  const res = await fetch(`${baseUrl()}/api/themealdb/by-area/${encodeURIComponent(area)}`);
  if (!res.ok) throw new Error(`Failed to load ${area} dishes (${res.status})`);
  const data = await res.json();
  return Array.isArray(data?.dishes) ? data.dishes : [];
};

export const getThemealdbRecipe = async (id: string): Promise<ThemealdbRecipe> => {
  const res = await fetch(`${baseUrl()}/api/themealdb/recipe/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Failed to load recipe (${res.status})`);
  return res.json();
};
