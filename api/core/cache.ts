/**
 * api/core/cache.ts — a small TTL + LRU cache with in-flight de-duplication.
 *
 * Serves: every feature folder under api/. No feature knowledge lives here.
 * Calls: nothing. Memory-only unless a `storage` adapter is passed (opt-in,
 *        per cache; AsyncStorage fits the adapter shape).
 *
 * What it refuses to repeat from the old layer (ERROR_LOG 059/064/065):
 *   - it never stores a failure, so a timeout can never become a cached
 *     "no results" (065 layer 3 cached "no image" for 24 h);
 *   - it is bounded, with a versioned key prefix (mealAPI.tsx reached
 *     fatsecret-image-cache:v12 because stale entries had to be invalidated
 *     by hand);
 *   - concurrent identical requests share one in-flight promise (the 059
 *     request storm had no such guard);
 *   - persistence, when enabled, is debounced and best-effort: a storage
 *     error never fails a read or a write.
 *
 * Dependency-free on purpose: tested with plain `node --test`.
 */

import type { ApiResult } from "./request";

export type CacheStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type TtlCacheOptions = {
  /** Feature-scoped name, e.g. "addFood.search". */
  name: string;
  /** Bump when the cached shape changes; old entries are then ignored. */
  version: number;
  ttlMs: number;
  maxEntries: number;
  /** Opt-in persistence. Omit for memory-only. */
  storage?: CacheStorage;
  persistDebounceMs?: number;
  /** Test hook. */
  now?: () => number;
};

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inFlight = new Map<string, Promise<ApiResult<T>>>();
  private readonly prefix: string;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly storage?: CacheStorage;
  private readonly persistDebounceMs: number;
  private readonly now: () => number;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded: Promise<void> | null = null;

  constructor(options: TtlCacheOptions) {
    this.prefix = `ghm:${options.name}:v${options.version}`;
    this.ttlMs = options.ttlMs;
    this.maxEntries = Math.max(1, options.maxEntries);
    this.storage = options.storage;
    this.persistDebounceMs = options.persistDebounceMs ?? 500;
    this.now = options.now ?? (() => Date.now());
  }

  /** Number of live entries (expired ones are dropped lazily on read). */
  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      this.schedulePersist();
      return null;
    }
    // Re-insert to mark as most recently used (Map keeps insertion order).
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  set(key: string, value: T): T {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.schedulePersist();
    return value;
  }

  delete(key: string): void {
    if (this.entries.delete(key)) this.schedulePersist();
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
    this.schedulePersist();
  }

  /**
   * Cached value, or run `fetcher` once for all concurrent callers of the same
   * key. Only an `ok` result is stored. The fetcher receives the FIRST caller's
   * signal; a later joiner whose own signal aborts gets `aborted` without
   * disturbing the shared request.
   */
  async getOrFetch(
    key: string,
    fetcher: (signal?: AbortSignal) => Promise<ApiResult<T>>,
    options: { signal?: AbortSignal } = {},
  ): Promise<ApiResult<T> & { fromCache: boolean }> {
    await this.ensureLoaded();
    const { signal } = options;
    if (signal?.aborted) return { ok: false, kind: "aborted", status: 0, retryable: false, message: "Request cancelled.", fromCache: false };

    const cached = this.get(key);
    if (cached !== null) return { ok: true, data: cached, status: 200, fromCache: true };

    let shared = this.inFlight.get(key);
    const isOwner = !shared;
    if (!shared) {
      shared = fetcher(signal)
        .then((result) => {
          if (result.ok) this.set(key, result.data);
          return result;
        })
        .finally(() => {
          this.inFlight.delete(key);
        });
      this.inFlight.set(key, shared);
    }

    if (isOwner || !signal) {
      const result = await shared;
      return { ...result, fromCache: !isOwner && result.ok };
    }

    // Joiner with its own signal: race the shared request against that signal.
    const aborted = new Promise<ApiResult<T>>((resolve) => {
      signal.addEventListener(
        "abort",
        () => resolve({ ok: false, kind: "aborted", status: 0, retryable: false, message: "Request cancelled." }),
        { once: true },
      );
    });
    const result = await Promise.race([shared, aborted]);
    return { ...result, fromCache: result.ok };
  }

  // --- optional persistence ------------------------------------------------

  private ensureLoaded(): Promise<void> {
    if (!this.storage) return Promise.resolve();
    if (!this.loaded) {
      this.loaded = this.storage
        .getItem(this.prefix)
        .then((raw) => {
          if (!raw) return;
          const parsed = JSON.parse(raw) as Record<string, Entry<T>>;
          const now = this.now();
          for (const [key, entry] of Object.entries(parsed)) {
            if (entry && typeof entry.expiresAt === "number" && entry.expiresAt > now && !this.entries.has(key)) {
              this.entries.set(key, entry);
            }
          }
        })
        .catch(() => {
          // Unreadable persisted state must never block a fetch.
        });
    }
    return this.loaded;
  }

  private schedulePersist(): void {
    if (!this.storage || this.persistTimer !== null) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const now = this.now();
      const live: Record<string, Entry<T>> = {};
      for (const [key, entry] of this.entries) if (entry.expiresAt > now) live[key] = entry;
      this.storage!.setItem(this.prefix, JSON.stringify(live)).catch(() => {
        // Best-effort only.
      });
    }, this.persistDebounceMs);
  }
}
