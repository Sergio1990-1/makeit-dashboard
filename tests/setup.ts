/**
 * Vitest global setup.
 *
 * Why this exists: Node 24 ships an experimental `globalThis.localStorage`
 * polyfill that is a plain object — no `Storage` prototype, no `.clear()`,
 * no `.length`. When vitest spins up jsdom, jsdom does NOT overwrite an
 * already-defined `localStorage` global, so the bad polyfill leaks in and
 * any test that calls `localStorage.clear()` blows up with
 * "TypeError: localStorage.clear is not a function".
 *
 * Fix: replace the global with a hand-rolled in-memory Storage before any
 * test runs. The shim is small (~30 lines) and reset between tests via the
 * `beforeEach` hooks individual tests already use.
 */
import { beforeEach } from "vitest";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// Replace whatever the runtime decided to put here. `configurable: true` so
// individual tests can `vi.stubGlobal` if they want a one-off override.
Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
});

// Wipe between tests. The vast majority of suites don't touch storage; the
// ones that do already call `localStorage.clear()` themselves, but a global
// reset keeps state from leaking when somebody forgets.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
