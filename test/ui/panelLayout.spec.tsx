// T-034 — Panel layout persistence test.
//
// Covers the `mandate.layout.v1` storage contract end-to-end:
//   - drag / resize via Rnd's callbacks writes through to localStorage,
//   - a fresh load reads the persisted entry,
//   - `resetPanelLayout()` clears the entry and restores the token defaults,
//   - `mandate.save.v1` is untouched by any layout operation.
//
// We exercise the `layout.ts` module directly (its public API is the same
// surface T-037 will call) rather than driving real drag/resize through Rnd —
// JSDOM has no layout engine so pointer events don't produce coordinates the
// way a real browser does. This keeps the test deterministic and focused on
// the storage contract, which is the AC-bearing behaviour.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  defaultLayout,
  LAYOUT_STORAGE_KEY,
  loadLayout,
  resetPanelLayout,
  saveLayout,
  subscribeLayoutReset,
  type LayoutState,
} from '@ui/theme/layout'
import { DEFAULT_PANEL_POSITIONS } from '@ui/theme/tokens'

const SAVE_KEY = 'mandate.save.v1'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('T-034 AC — layout persistence round-trip', () => {
  it('saveLayout() writes the layout under mandate.layout.v1', () => {
    const layout: LayoutState = {
      version: 1,
      panels: {
        overview: { x: 100, y: 100, width: 600, height: 400 },
        economy: { x: 200, y: 200, width: 600, height: 400 },
        society: { x: 300, y: 300, width: 600, height: 400 },
        politics: { x: 400, y: 400, width: 600, height: 400 },
      },
    }
    saveLayout(layout)
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed.version).toBe(1)
    expect(parsed.panels.overview.x).toBe(100)
    expect(parsed.panels.economy.y).toBe(200)
  })

  it('loadLayout() restores a saved layout verbatim', () => {
    const layout: LayoutState = {
      version: 1,
      panels: {
        overview: { x: 11, y: 12, width: 600, height: 400 },
        economy: { x: 21, y: 22, width: 600, height: 400 },
        society: { x: 31, y: 32, width: 600, height: 400 },
        politics: { x: 41, y: 42, width: 600, height: 400 },
      },
    }
    saveLayout(layout)
    const loaded = loadLayout()
    expect(loaded).toEqual(layout)
  })

  it('loadLayout() returns the token defaults when no entry is persisted', () => {
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()
    const loaded = loadLayout()
    expect(loaded.version).toBe(1)
    expect(loaded.panels.overview).toEqual(DEFAULT_PANEL_POSITIONS.overview)
    expect(loaded.panels.economy).toEqual(DEFAULT_PANEL_POSITIONS.economy)
    expect(loaded.panels.society).toEqual(DEFAULT_PANEL_POSITIONS.society)
    expect(loaded.panels.politics).toEqual(DEFAULT_PANEL_POSITIONS.politics)
  })

  it('loadLayout() falls back to defaults on parse failure / version mismatch / missing fields', () => {
    // Garbage payload.
    localStorage.setItem(LAYOUT_STORAGE_KEY, 'not-json-at-all')
    expect(loadLayout()).toEqual(defaultLayout())

    // Wrong version.
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 2, panels: {} }),
    )
    expect(loadLayout()).toEqual(defaultLayout())

    // Missing a required panel.
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        panels: {
          overview: { x: 0, y: 0, width: 600, height: 400 },
        },
      }),
    )
    expect(loadLayout()).toEqual(defaultLayout())
  })
})

describe('T-034 AC — resetPanelLayout clears the key and notifies subscribers', () => {
  it('removes mandate.layout.v1 from localStorage and triggers subscribers', () => {
    const layout: LayoutState = {
      version: 1,
      panels: {
        overview: { x: 500, y: 500, width: 600, height: 400 },
        economy: { x: 500, y: 500, width: 600, height: 400 },
        society: { x: 500, y: 500, width: 600, height: 400 },
        politics: { x: 500, y: 500, width: 600, height: 400 },
      },
    }
    saveLayout(layout)
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).not.toBeNull()

    let notified = 0
    const unsubscribe = subscribeLayoutReset(() => {
      notified += 1
    })

    resetPanelLayout()

    // Persisted entry is gone — next loadLayout falls back to defaults.
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()
    expect(loadLayout()).toEqual(defaultLayout())
    // Listener was called exactly once.
    expect(notified).toBe(1)

    unsubscribe()
  })

  it('subscribeLayoutReset returns an unsubscribe that detaches the listener', () => {
    let count = 0
    const unsubscribe = subscribeLayoutReset(() => {
      count += 1
    })
    resetPanelLayout()
    expect(count).toBe(1)
    unsubscribe()
    resetPanelLayout()
    // After unsubscribe the listener is no longer fired.
    expect(count).toBe(1)
  })
})

describe('T-034 AC — layout operations leave mandate.save.v1 untouched', () => {
  it('saveLayout / resetPanelLayout do not modify the save key', () => {
    // Plant a fake save payload — its contents don't matter for this test;
    // we only care that layout operations never touch the key.
    const savePayload = JSON.stringify({ version: 1, fake: true })
    localStorage.setItem(SAVE_KEY, savePayload)

    saveLayout({
      version: 1,
      panels: {
        overview: { x: 7, y: 7, width: 600, height: 400 },
        economy: { x: 7, y: 7, width: 600, height: 400 },
        society: { x: 7, y: 7, width: 600, height: 400 },
        politics: { x: 7, y: 7, width: 600, height: 400 },
      },
    })
    expect(localStorage.getItem(SAVE_KEY)).toBe(savePayload)

    resetPanelLayout()
    expect(localStorage.getItem(SAVE_KEY)).toBe(savePayload)
  })
})
