// T-037 — Settings screen tests.
//
// Acceptance criteria covered:
//   - AC #1: defaultTickSpeed persists and is applied to bootEngine on new game.
//   - AC #2: "Replay tutorial" clears onboarding completed flag; tour re-arms.
//   - AC #3: "Reset panel layout" clears mandate.layout.v1.
//   - Language stub: persisting 'es' renders the non-blocking Phase 5 banner.
//   - Settings persistence: mandate.settings.v1 key is written on change; a
//     new loadSettings() call returns the updated value.
//   - Settings independence: clearing mandate.save.v1 does NOT affect settings;
//     clearing settings does NOT affect the save.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  isOnboardingCompleted,
  markOnboardingCompleted,
  readOnboardingRecord,
} from '@ui/onboarding/tour'
import { Settings } from '@ui/screens/Settings'
import { MainMenu } from '@ui/screens/MainMenu'
import { LAYOUT_STORAGE_KEY } from '@ui/theme/layout'
import {
  loadSettings,
  saveSettings,
  resetSettings,
  SETTINGS_KEY,
} from '@ui/theme/settings'
import {
  getGameStore,
  resetGameStoreSingleton,
} from '@ui/stores/gameStore'

beforeEach(() => {
  window.localStorage.clear()
  resetGameStoreSingleton()
})

afterEach(() => {
  cleanup()
  resetGameStoreSingleton()
  window.localStorage.clear()
})

// ---------------------------------------------------------------------------
// AC #1 — defaultTickSpeed persists and is applied to bootEngine.
// ---------------------------------------------------------------------------

describe('T-037 AC#1 — defaultTickSpeed persists and applies on new game', () => {
  it('loadSettings() returns DEFAULT_SETTINGS when localStorage is empty', () => {
    const settings = loadSettings()
    expect(settings.version).toBe(1)
    expect(settings.defaultTickSpeed).toBe(1)
    expect(settings.language).toBe('en')
  })

  it('saveSettings + loadSettings round-trips the value correctly', () => {
    saveSettings({ version: 1, defaultTickSpeed: 2, language: 'en' })
    expect(loadSettings().defaultTickSpeed).toBe(2)
  })

  it('saveSettings + loadSettings preserves language', () => {
    saveSettings({ version: 1, defaultTickSpeed: 4, language: 'es' })
    const loaded = loadSettings()
    expect(loaded.defaultTickSpeed).toBe(4)
    expect(loaded.language).toBe('es')
  })

  it('corrupt settings JSON silently falls back to defaults', () => {
    window.localStorage.setItem(SETTINGS_KEY, '{not-json}')
    const settings = loadSettings()
    expect(settings.defaultTickSpeed).toBe(1)
    expect(settings.language).toBe('en')
  })

  it('wrong version in settings falls back to defaults', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 999, defaultTickSpeed: 4, language: 'en' }),
    )
    const settings = loadSettings()
    expect(settings.defaultTickSpeed).toBe(1)
  })

  it('invalid defaultTickSpeed falls back to defaults', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, defaultTickSpeed: 3, language: 'en' }),
    )
    // 3 is not in SPEEDS [0, 1, 2, 4].
    expect(loadSettings().defaultTickSpeed).toBe(1)
  })

  it('clicking a speed button persists the new speed and reflects active state', () => {
    render(<Settings onClose={() => {}} />)

    // Click the 2× button.
    fireEvent.click(screen.getByTestId('settings-speed-2'))

    // The setting is persisted.
    expect(loadSettings().defaultTickSpeed).toBe(2)

    // The button has aria-checked=true.
    expect(screen.getByTestId('settings-speed-2').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('settings-speed-1').getAttribute('aria-checked')).toBe('false')
  })

  it('bootEngine picks up the persisted defaultTickSpeed on new game', () => {
    // Pre-seed settings with speed 4.
    saveSettings({ version: 1, defaultTickSpeed: 4, language: 'en' })

    const store = getGameStore()
    render(<MainMenu store={store} />)

    // Navigate to new-game and start.
    fireEvent.click(screen.getByTestId('new-game-button'))
    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    // The store's speed should match the persisted setting.
    expect(store.getState().speed).toBe(4)
  })

  it('bootEngine uses speed 1 (default) when settings are absent', () => {
    // localStorage is clear — loadSettings() returns defaultTickSpeed: 1.
    const store = getGameStore()
    render(<MainMenu store={store} />)

    fireEvent.click(screen.getByTestId('new-game-button'))
    act(() => {
      fireEvent.click(screen.getByTestId('start-button'))
    })

    expect(store.getState().speed).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// AC #2 — Replay tutorial clears onboarding completed.
// ---------------------------------------------------------------------------

describe('T-037 AC#2 — Replay tutorial re-arms the tour', () => {
  it('clicking Replay tutorial clears mandate.onboarding.v1.completed', () => {
    // Pre-condition: the player previously completed the tour.
    markOnboardingCompleted(false)
    expect(isOnboardingCompleted()).toBe(true)

    render(<Settings onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-replay-tutorial'))

    expect(isOnboardingCompleted()).toBe(false)
  })

  it('clicking Replay shows the confirmation message', () => {
    render(<Settings onClose={() => {}} />)
    expect(screen.queryByTestId('settings-replay-confirmation')).toBeNull()

    fireEvent.click(screen.getByTestId('settings-replay-tutorial'))

    expect(screen.getByTestId('settings-replay-confirmation')).toBeInTheDocument()
  })

  it('Replay preserves the skipped flag when clearing completed', () => {
    // Mark as completed-with-skip.
    markOnboardingCompleted(true)
    expect(readOnboardingRecord()?.skipped).toBe(true)

    render(<Settings onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-replay-tutorial'))

    // Skipped flag is preserved, completed is now false.
    const record = readOnboardingRecord()
    expect(record?.completed).toBe(false)
    expect(record?.skipped).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC #3 — Reset panel layout clears mandate.layout.v1.
// ---------------------------------------------------------------------------

describe('T-037 AC#3 — Reset panel layout clears mandate.layout.v1', () => {
  it('clicking Reset panel layout removes the layout key from localStorage', () => {
    // Pre-seed a custom layout.
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        panels: {
          overview: { x: 99, y: 99, width: 400, height: 300 },
          economy: { x: 99, y: 400, width: 400, height: 300 },
          society: { x: 500, y: 99, width: 400, height: 300 },
          politics: { x: 500, y: 400, width: 400, height: 300 },
        },
      }),
    )
    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).not.toBeNull()

    render(<Settings onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-reset-layout'))

    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull()
  })

  it('clicking Reset panel layout shows the confirmation message', () => {
    render(<Settings onClose={() => {}} />)
    expect(screen.queryByTestId('settings-layout-reset-confirmation')).toBeNull()

    fireEvent.click(screen.getByTestId('settings-reset-layout'))

    expect(
      screen.getByTestId('settings-layout-reset-confirmation'),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Language stub — persists + renders banner for 'es'.
// ---------------------------------------------------------------------------

describe('T-037 — language stub persists and shows Phase 5 banner for es', () => {
  it('clicking Español persists the language setting', () => {
    render(<Settings onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('settings-language-es'))
    expect(loadSettings().language).toBe('es')
  })

  it('selecting es renders the "coming Phase 5" banner', () => {
    render(<Settings onClose={() => {}} />)
    expect(screen.queryByTestId('settings-language-es-banner')).toBeNull()

    fireEvent.click(screen.getByTestId('settings-language-es'))

    expect(screen.getByTestId('settings-language-es-banner')).toBeInTheDocument()
  })

  it('switching back to en hides the banner', () => {
    saveSettings({ version: 1, defaultTickSpeed: 1, language: 'es' })
    render(<Settings onClose={() => {}} />)
    expect(screen.getByTestId('settings-language-es-banner')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('settings-language-en'))

    expect(screen.queryByTestId('settings-language-es-banner')).toBeNull()
    expect(loadSettings().language).toBe('en')
  })
})

// ---------------------------------------------------------------------------
// Dismissal contract.
// ---------------------------------------------------------------------------

describe('T-037 — Settings dismissal (Esc, backdrop, Close)', () => {
  it('Esc calls onClose', () => {
    let closed = false
    render(<Settings onClose={() => { closed = true }} />)

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(closed).toBe(true)
  })

  it('backdrop click calls onClose', () => {
    let closed = false
    render(<Settings onClose={() => { closed = true }} />)

    fireEvent.click(screen.getByTestId('settings-backdrop'))

    expect(closed).toBe(true)
  })

  it('Close button calls onClose', () => {
    let closed = false
    render(<Settings onClose={() => { closed = true }} />)

    fireEvent.click(screen.getByTestId('settings-close'))

    expect(closed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Settings persistence independence.
// ---------------------------------------------------------------------------

describe('T-037 — Settings persistence independent of save + layout keys', () => {
  it('resetting settings does not affect mandate.layout.v1', () => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{"v":"custom"}')
    saveSettings({ version: 1, defaultTickSpeed: 2, language: 'en' })

    resetSettings()

    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('{"v":"custom"}')
  })

  it('resetting settings does not affect mandate.save.v1', () => {
    window.localStorage.setItem('mandate.save.v1', '{"v":"save"}')
    saveSettings({ version: 1, defaultTickSpeed: 2, language: 'en' })

    resetSettings()

    expect(window.localStorage.getItem('mandate.save.v1')).toBe('{"v":"save"}')
  })

  it('clearing save does not affect settings', () => {
    saveSettings({ version: 1, defaultTickSpeed: 4, language: 'en' })
    window.localStorage.removeItem('mandate.save.v1')

    expect(loadSettings().defaultTickSpeed).toBe(4)
  })
})
