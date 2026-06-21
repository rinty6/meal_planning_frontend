// Resolves a (possibly messy, brand-named) ingredient string to a clean
// transparent ingredient image URL, using the curated map in
// data/ingredientImages.json.
//
// FatSecret returns recipe-specific strings like "Almond Breeze Unsweetened"
// or "Vanilla Whey Protein Powder", so an exact name lookup almost never hits.
// This resolver normalizes the name (drops qualifier/brand words, singularizes)
// and then tries: exact canonical key -> alias -> substring keyword match.
//
// Returns null when no confident match exists OR when no image source is
// configured yet (baseUrl empty). Callers should fall back to <IngredientIcon>.

import ingredientImages from '../data/ingredientImages.json';
import { API_URL } from '../utils/config';

type IngredientImageData = {
  baseUrl: string;
  images: Record<string, string>;
  aliases: Record<string, string>;
};

const DATA = ingredientImages as unknown as IngredientImageData;

// Words that describe an ingredient but should not affect matching.
const QUALIFIER_WORDS = new Set([
  'fresh', 'frozen', 'organic', 'raw', 'pure', 'unsweetened', 'sweetened',
  'large', 'small', 'medium', 'whole', 'ground', 'chopped', 'sliced', 'diced',
  'minced', 'shredded', 'grated', 'boneless', 'skinless', 'extra', 'virgin',
  'unsalted', 'salted', 'lowfat', 'nonfat', 'reduced', 'fat', 'free', 'low',
  'range', 'lean', 'cooked', 'dried', 'canned', 'roasted', 'toasted', 'baby',
  'ripe', 'unripe', 'plain', 'natural', 'light', 'dark', 'mini', 'jumbo',
]);

// Words that change an ingredient's IDENTITY (a processed/derived product), so
// the base-noun image would be wrong: "garlic powder" is not a garlic bulb,
// "tomato sauce" is not a tomato, "lime juice" is not a lime. When a name
// contains one of these, we only accept a specific multi-word match (e.g. a
// dedicated "tomato sauce" entry); otherwise we fall back to the icon rather
// than show the misleading base image.
const FORM_WORDS = new Set([
  'powder', 'sauce', 'juice', 'paste', 'puree', 'extract', 'vinegar', 'stock',
  'broth', 'syrup', 'ketchup', 'concentrate', 'granules', 'seasoning', 'oil',
  'dressing', 'gravy', 'marinade', 'glaze',
]);

const normalize = (raw: string): { full: string; tokens: string[]; rawFull: string } => {
  const cleaned = (raw || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')      // drop parenthetical notes e.g. "(NS as to ...)"
    .replace(/[^a-z\s-]/g, ' ')      // strip digits/punctuation
    .replace(/\s+/g, ' ')
    .trim();

  const rawTokens = cleaned.split(' ').filter((t) => t.length > 1);
  const tokens = rawTokens.filter((t) => !QUALIFIER_WORDS.has(t));

  // rawFull keeps qualifier words (so keys like "ground mustard", "dried dill",
  // "lamb fat" can match); full/tokens drop them (so "fresh spinach" -> spinach).
  return { full: tokens.join(' '), tokens, rawFull: rawTokens.join(' ') };
};

// Singular/plural variants of a word for forgiving matching. Keys are stored in
// mixed forms (e.g. "oats" plural, "tomato" singular), and FatSecret names vary
// too ("old fashioned oats", "tomatoes"), so we try several forms per token.
const wordForms = (t: string): string[] => {
  const forms = new Set<string>([t]);
  if (t.endsWith('ies')) forms.add(t.slice(0, -3) + 'y'); // strawberries -> strawberry
  else if (t.endsWith('es')) forms.add(t.slice(0, -2));   // tomatoes -> tomato
  if (t.endsWith('s')) forms.add(t.slice(0, -1));          // avocados -> avocado
  forms.add(t + 's');                                      // oat -> oats
  forms.add(t + 'es');
  return [...forms];
};

// Base URL for hosted ingredient images. An explicit baseUrl in the JSON wins;
// otherwise derive `${backend}/ingredients` from EXPO_PUBLIC_BACKEND_URL (same
// pattern as PRIVACY_POLICY_URL). Returns '' when neither is available.
const resolveBaseUrl = (): string => {
  const explicit = (DATA.baseUrl || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const api = (API_URL || '').trim();
  return api ? `${api.replace(/\/+$/, '')}/ingredients` : '';
};

const buildUrl = (filename: string): string | null => {
  const base = resolveBaseUrl();
  if (!base) return null; // no backend configured -> use icon fallback
  return `${base}/${filename}`;
};

/**
 * Resolve an ingredient name to an image URL, or null if none.
 */
export const resolveIngredientImage = (name: string): string | null => {
  if (!name) return null;
  const { full, tokens, rawFull } = normalize(name);
  if (!full) return null;

  const images = DATA.images || {};
  const aliases = DATA.aliases || {};

  // 0. Qualifier-inclusive match: keys that legitimately contain a qualifier word
  //    ("ground mustard", "dried dill", "lamb fat") must match before the
  //    qualifier-stripping steps below remove that word.
  if (rawFull !== full) {
    if (images[rawFull]) return buildUrl(images[rawFull]);
    if (aliases[rawFull] && images[aliases[rawFull]]) return buildUrl(images[aliases[rawFull]]);
    for (const key of Object.keys(images)) {
      if (key.includes(' ') && rawFull.includes(key)) return buildUrl(images[key]);
    }
  }

  // 1. Exact canonical match on the normalized full string.
  if (images[full]) return buildUrl(images[full]);

  // 2. Alias match (full string), e.g. "almond milk" -> "milk".
  if (aliases[full] && images[aliases[full]]) return buildUrl(images[aliases[full]]);

  // 3. Multi-word canonical/alias keys contained in the full string,
  //    e.g. "extra virgin olive oil" -> "olive oil".
  for (const key of Object.keys(images)) {
    if (key.includes(' ') && full.includes(key)) return buildUrl(images[key]);
  }
  for (const key of Object.keys(aliases)) {
    if (key.includes(' ') && full.includes(key) && images[aliases[key]]) {
      return buildUrl(images[aliases[key]]);
    }
  }

  // 4. Single-token match: any token (or its singular/plural form) equals a
  //    canonical key or alias. e.g. "old fashioned oats" -> oats, "tomatoes" -> tomato.
  //    Guard: if the name contains an identity-changing form word (powder/sauce/
  //    juice/...), skip this base-noun fallback so "garlic powder" doesn't resolve
  //    to garlic. Specific entries (steps 1-3) still win when they exist.
  const hasFormWord = tokens.some((t) => FORM_WORDS.has(t));
  if (!hasFormWord) {
    for (const token of tokens) {
      for (const form of wordForms(token)) {
        if (images[form]) return buildUrl(images[form]);
        if (aliases[form] && images[aliases[form]]) return buildUrl(images[aliases[form]]);
      }
    }
  }

  return null;
};

export default resolveIngredientImage;
