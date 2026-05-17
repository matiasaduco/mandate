import '@testing-library/jest-dom/vitest'

// T-028 — In-memory localStorage shim.
//
// jsdom 29 + Node 26 + Vitest 4: the jsdom window has a `localStorage` getter
// that returns `undefined` because Node's experimental localStorage backend
// requires the `--localstorage-file` flag. `sessionStorage` works, but we
// specifically need `localStorage` for the save / load UI controls. The
// cleanest fix is a hermetic in-memory shim installed once per worker.
//
// Notes:
//   - We mirror the Web Storage API surface (`getItem`, `setItem`,
//     `removeItem`, `clear`, `length`, indexed access via `key`). Production
//     code only uses `getItem` / `setItem` / `removeItem` / `clear`, so the
//     extra precision is for defense-in-depth.
//   - Installed on both `window` and `globalThis` so isomorphic code paths
//     (e.g. `if (typeof window !== 'undefined') window.localStorage`) work.
//   - Per-test isolation is the responsibility of each test's
//     `beforeEach(() => window.localStorage.clear())`.
//   - Only installed if a working localStorage is not already present, so
//     this is a no-op in any environment that does provide one natively.

function createInMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length(): number {
      return Object.keys(store).length
    },
    key(index: number): string | null {
      const keys = Object.keys(store)
      return index >= 0 && index < keys.length ? keys[index] : null
    },
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key: string, value: string): void {
      store[key] = String(value)
    },
    removeItem(key: string): void {
      delete store[key]
    },
    clear(): void {
      store = {}
    },
  }
}

function installLocalStorage(target: object): void {
  // Replace the broken getter (which returns undefined) with a real Storage
  // instance. `configurable: true` so subsequent reinstalls (e.g. across
  // re-imports of setup.ts in nested worker contexts) still succeed.
  const storage = createInMemoryStorage()
  Object.defineProperty(target, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  })
}

// Only install if the natively-resolved value is unusable.
const probe = (target: { localStorage?: unknown }): boolean => {
  try {
    return target.localStorage !== undefined && target.localStorage !== null
  } catch {
    return false
  }
}

if (typeof window !== 'undefined' && !probe(window as { localStorage?: unknown })) {
  installLocalStorage(window)
}
if (typeof globalThis !== 'undefined' && !probe(globalThis as { localStorage?: unknown })) {
  installLocalStorage(globalThis)
}
