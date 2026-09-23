/**
 * api/barcode/barcodeApi.types.ts — shapes for the barcode scanner.
 *
 * Serves: components/addfood/Barcode*.tsx via barcodeApi.ts.
 * Mirrors: backend/src/services/catalogBarcode.js (lookup) and
 *          backend/src/services/barcodeReports.js (report). Change together.
 *
 * A scanned product is a CatalogFoodHit with three additions: the barcode it
 * was found by, how sure we are of it, and every serving rather than only the
 * default one. The extra servings are what the picker's chip row offers, and
 * each carries its own nutrition because the importer scales a profile per
 * serving — switching chips changes the numbers, it does not just relabel them.
 */

import type { CatalogFoodHit, LoggableFood } from "../addFood/addFoodApi.types";

/** One selectable serving. `id` is null for a live Open Food Facts answer, which has no catalogue row. */
export type BarcodeServing = {
  id: number | null;
  /** Present when id is null: 'synthetic:100g' | 'label:serving'. */
  source_record_id?: string | null;
  description: string;
  grams_equivalent: number | null;
  metric_amount: number | null;
  metric_unit: string | null;
  is_default: boolean;
  nutrition: CatalogFoodHit["nutrition"];
};

/**
 * `catalog` is a product we imported and checked. `openfoodfacts_live` is a
 * product we asked OFF for at scan time: usable, but nobody on our side has
 * seen it, which is why the card says so.
 */
export type BarcodeSource = "catalog" | "openfoodfacts_live";

export type BarcodeHit = Omit<CatalogFoodHit, "serving"> & {
  barcode: string;
  barcode_type: string | null;
  verification_status: string | null;
  /** The default serving, repeated from `servings` so the card needs no lookup. */
  serving: BarcodeServing;
  /** Default first. One entry for 17,989 products, two for 28,013. */
  servings: BarcodeServing[];
};

/**
 * A miss is a successful answer, not a failure: `found: false` with a null
 * item. Anything that is genuinely wrong arrives as an ApiFailure instead
 * (ERROR_LOG 063/065 — the two must never be rendered as each other).
 */
export type BarcodeLookupResponse = {
  found: boolean;
  barcode: string;
  source: BarcodeSource | null;
  item: BarcodeHit | null;
  meta: { cached: boolean };
};

/** What the user typed off a pack we do not hold. Energy is kJ, as printed. */
export type BarcodeReportForm = {
  productName: string;
  brand: string;
  servingSize: string;
  servingUnit: "g" | "ml";
  energyKj: string;
  proteinG: string;
  carbohydrateG: string;
  fatG: string;
  photoUrl: string | null;
};

/** The POST body. Nothing here is trusted server-side; it is validated again. */
export type BarcodeReportPayload = {
  barcode: string;
  barcodeType: string | null;
  productName: string;
  brand: string | null;
  servingSize: number;
  servingUnit: "g" | "ml";
  energyKj: number;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  photoUrl: string | null;
  appVersion: string | null;
};

export type BarcodeReportResponse = {
  report: { id: number; barcode: string; status: string };
  created: boolean;
  notified: boolean;
};

/**
 * Which of the three starred fields are still missing. The Send button is
 * disabled while this is non-empty, so an empty report can never be sent.
 */
export type BarcodeReportMissing = ("productName" | "servingSize" | "energyKj")[];

/**
 * What the scanner hands to onAddFood(). Same shape the search path produces,
 * with an honest `source`: a live OFF answer and a user's own typing are not
 * the catalogue and the meal log should not claim they were.
 */
export type LoggableScannedFood = Omit<LoggableFood, "source"> & {
  source: "catalog" | "openfoodfacts_live" | "user_report";
  barcode: string;
};
