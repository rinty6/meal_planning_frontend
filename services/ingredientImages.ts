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

const normalize = (raw: string): { full: string; tokens: string[] } => {
  const cleaned = (raw || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')      // drop parenthetical notes e.g. "(NS as to ...)"
    .replace(/[^a-z\s-]/g, ' ')      // strip digits/punctuation
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned
    .split(' ')
    .map((t) => t.replace(/s$/, ''))   // crude singularize: avocados -> avocado
    .filter((t) => t.length > 1 && !QUALIFIER_WORDS.has(t));

  return { full: tokens.join(' '), tokens };
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
  const { full, tokens } = normalize(name);
  if (!full) return null;

  const images = DATA.images || {};
  const aliases = DATA.aliases || {};

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

  // 4. Single-token match: any token equals a canonical key or alias.
  for (const token of tokens) {
    if (images[token]) return buildUrl(images[token]);
    if (aliases[token] && images[aliases[token]]) return buildUrl(images[aliases[token]]);
  }

  return null;
};

export default resolveIngredientImage;
