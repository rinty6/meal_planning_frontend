/**
 * api/addFood/addFoodApi.types.ts — shapes for the Add Food modal's data.
 *
 * Serves: components/addfoodmodal.tsx and components/addfood/*.
 * Mirrors: the CatalogFoodHit / CatalogSearchResult JSDoc in
 *          backend/src/services/catalogSearch.js. Change both together.
 *
 * The modal renders FoodCardVM, never a raw hit, so the database shape can
 * change without touching JSX (the mapping lives in addFoodApi.mappers.ts).
 */

/** One search hit as the backend returns it. Numbers are numbers, nulls mean unknown. */
export type CatalogFoodHit = {
  public_id: string; // 'food_…'
  title: string; // catalog_foods.name verbatim
  base_name: string | null; // AUSNUT head noun ('chicken'); OFF rows carry the whole name
  name_segments: string[]; // ordered AUSNUT clauses after the head noun; [] for OFF rows
  brand: string | null;
  food_type: "generic" | "branded" | string;
  source_name: string; // 'ausnut_2023' | 'openfoodfacts' | …
  source_derivation: "analysed" | "label_data" | "recipe" | "imputed" | "borrowed" | "estimated" | string | null;
  image_url: string | null;
  serving: {
    id: number;
    description: string;
    grams_equivalent: number | null;
    metric_amount: number | null;
    metric_unit: string | null;
  };
  nutrition: {
    energy_kj: number | null;
    calories_kcal: number | null;
    protein_g: number | null;
    fat_g: number | null;
    carbohydrate_g: number | null;
    fiber_g: number | null;
    sugar_g: number | null;
    sodium_mg: number | null;
    vitamin_a_mcg: number | null;
    /** 're' | 'rae' | null. Never compare vitamin A across conventions. */
    vitamin_a_convention: string | null;
  };
};

export type CatalogFacet = { value: string; label: string; count: number };

export type CatalogSearchResponse = {
  items: CatalogFoodHit[];
  facets: {
    /** Top segments by count over the relevant rows, "(…)" qualifier stripped. `value` goes back as ?segment=. */
    segments: CatalogFacet[];
    sources: { generic: number; branded: number };
  };
  meta: {
    query: string;
    limit: number;
    offset: number;
    total_relevant: number;
    total_candidates: number;
    cached: boolean;
  };
};

export type CatalogSource = "generic" | "branded";

export type CatalogSearchParams = {
  query: string;
  /** Facet labels selected in the refine row; ANDed server-side. */
  segments?: string[];
  source?: CatalogSource | null;
  limit?: number;
  offset?: number;
};

/** What the tag beside the title says. `none` renders nothing (a branded row with no brand name). */
export type FoodCardTag = { kind: "generic" } | { kind: "brand"; name: string } | { kind: "none" };

/** Everything the Design 3 card needs, precomputed. */
export type FoodCardVM = {
  key: string; // public_id
  title: string;
  tag: FoodCardTag;
  chips: string[];
  servingLabel: string; // "1 thigh, large (174 g)" — already normalised
  energyKcal: number | null; // stored unit; format with utils/energy formatEnergy()
  proteinG: number | null;
  fatG: number | null;
  carbG: number | null;
  hit: CatalogFoodHit;
};

/**
 * The object the modal hands to its parent's onAddFood(). The parent adds
 * clerkId/date/mealType and POSTs /api/meals/add. Every field maps 1:1 onto
 * a meal_logs column (backend/src/db/schema.js:149); calories is kcal.
 */
export type LoggableFood = {
  title: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  image: string;
  externalId: string;
  source: "catalog";
  servingId: string;
  servingDescription: string;
  servings: number;
  nutrients: CatalogFoodHit["nutrition"] & { serving_grams: number | null };
};
