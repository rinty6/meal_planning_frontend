// Run: npm test  (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";

import { TtlCache } from "./cache.ts";
import type { ApiResult } from "./request.ts";

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data, status: 200 });
const fail = (): ApiResult<number> => ({ ok: false, kind: "timeout", status: 0, retryable: true, message: "slow" });

test("TTL expiry and LRU cap", () => {
  let now = 1_000;
  const cache = new TtlCache<number>({ name: "t", version: 1, ttlMs: 100, maxEntries: 2, now: () => now });
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1); // touches a → b is now the oldest
  cache.set("c", 3);
  assert.equal(cache.get("b"), null, "least recently used entry evicted");
  assert.equal(cache.get("a"), 1);
  now += 101;
  assert.equal(cache.get("a"), null, "expired");
  assert.equal(cache.size, 1);
});

test("getOrFetch caches only ok results", async () => {
  const cache = new TtlCache<number>({ name: "t", version: 1, ttlMs: 10_000, maxEntries: 10 });
  let calls = 0;
  const failing = () => { calls++; return Promise.resolve(fail()); };
  const first = await cache.getOrFetch("k", failing);
  assert.equal(first.ok, false);
  const second = await cache.getOrFetch("k", failing);
  assert.equal(second.ok, false);
  assert.equal(calls, 2, "a failure must not be cached");

  const good = await cache.getOrFetch("k", () => Promise.resolve(ok(7)));
  assert.deepEqual([good.ok, good.fromCache], [true, false]);
  const again = await cache.getOrFetch("k", () => Promise.resolve(ok(99)));
  assert.equal((again as { data: number }).data, 7);
  assert.equal(again.fromCache, true);
});

test("concurrent identical keys share one fetch", async () => {
  const cache = new TtlCache<number>({ name: "t", version: 1, ttlMs: 10_000, maxEntries: 10 });
  let calls = 0;
  const slow = () => new Promise<ApiResult<number>>((resolve) => { calls++; setTimeout(() => resolve(ok(1)), 20); });
  const [a, b, c] = await Promise.all([cache.getOrFetch("k", slow), cache.getOrFetch("k", slow), cache.getOrFetch("k", slow)]);
  assert.equal(calls, 1);
  assert.equal(a.ok && b.ok && c.ok, true);
  assert.equal(a.fromCache, false);
  assert.equal(b.fromCache, true);
});

test("a joiner's own abort returns aborted without disturbing the shared request", async () => {
  const cache = new TtlCache<number>({ name: "t", version: 1, ttlMs: 10_000, maxEntries: 10 });
  const slow = () => new Promise<ApiResult<number>>((resolve) => setTimeout(() => resolve(ok(5)), 30));
  const owner = cache.getOrFetch("k", slow);
  const joinerController = new AbortController();
  const joiner = cache.getOrFetch("k", slow, { signal: joinerController.signal });
  joinerController.abort();
  const [o, j] = await Promise.all([owner, joiner]);
  assert.equal(o.ok, true);
  assert.equal(j.ok, false);
  assert.equal((j as { kind: string }).kind, "aborted");
  assert.equal(cache.get("k"), 5, "owner's result was cached");
});

test("an already-aborted signal short-circuits before fetching", async () => {
  const cache = new TtlCache<number>({ name: "t", version: 1, ttlMs: 10_000, maxEntries: 10 });
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const result = await cache.getOrFetch("k", () => { calls++; return Promise.resolve(ok(1)); }, { signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("opt-in persistence writes live entries and reloads them", async () => {
  const store = new Map<string, string>();
  const storage = { getItem: async (k: string) => store.get(k) ?? null, setItem: async (k: string, v: string) => { store.set(k, v); } };
  const a = new TtlCache<number>({ name: "p", version: 2, ttlMs: 10_000, maxEntries: 10, storage, persistDebounceMs: 1 });
  a.set("x", 42);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(store.has("ghm:p:v2"));

  const b = new TtlCache<number>({ name: "p", version: 2, ttlMs: 10_000, maxEntries: 10, storage });
  const hit = await b.getOrFetch("x", () => Promise.resolve(ok(0)));
  assert.equal((hit as { data: number }).data, 42);
  assert.equal(hit.fromCache, true);

  const c = new TtlCache<number>({ name: "p", version: 3, ttlMs: 10_000, maxEntries: 10, storage });
  const miss = await c.getOrFetch("x", () => Promise.resolve(ok(1)));
  assert.equal(miss.fromCache, false, "a version bump ignores old entries");
});
