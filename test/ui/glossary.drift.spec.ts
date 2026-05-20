// T-037 — Glossary vault ↔ code drift test.
//
// Asserts that every entry in `~/Documents/Tycoon/06 - Reference/Glossary.md`
// has a corresponding entry in `src/ui/copy/glossary.ts`, and vice versa.
//
// Implementation: a hand-maintained `GLOSSARY_VAULT_KEYS` const mirrors the
// term list from Glossary.md. No filesystem read — the const is updated by
// the maintainer whenever a new term is added to (or removed from) the vault.
//
// IMPORTANT: when you add a new term to `Glossary.md`, you MUST:
//   1. Add its key to `GLOSSARY_VAULT_KEYS` below.
//   2. Add the corresponding entry to `src/ui/copy/glossary.ts`.
// The two tests below will catch any mismatch on the next CI run.
//
// Key derivation convention (matches glossary.ts):
//   - Vault § "Core simulation" term names → lowercase snake_case
//   - Vault § "Player-facing" → lowercase snake_case
//   - Vault § "Country" → lowercase snake_case
//   - Vault § "World" → lowercase snake_case
//   - Vault § "Vault conventions" → lowercase snake_case

import { describe, expect, it } from 'vitest'

import { GLOSSARY } from '@ui/copy/glossary'

// ---------------------------------------------------------------------------
// Hand-maintained vault key list.
// Extract every term heading from Glossary.md and add its snake_case key here.
//
// Last updated: T-037 — covers Glossary.md as of 2026-05-18.
// ---------------------------------------------------------------------------
export const GLOSSARY_VAULT_KEYS: readonly string[] = [
  // § Core simulation
  'simulation',
  'tick',
  'tick_stage',
  'state',
  'system',
  'entity',
  'stock_flow',
  'derived_state',
  'hidden_visible_state',

  // § Player-facing
  'player',
  'decision',
  'slider',
  'decree',
  'law',
  'project',

  // § Country
  'pop',
  'sector',
  'industry',
  'approval',
  'legitimacy',
  'stability',
  'treasury',
  'balance',
  'government_type',

  // § World
  'bloc',
  'soft_power',
  'fx',

  // § Vault conventions
  'system_contract',
  'acceptance_criteria',
  'edge_case',
  'status_frontmatter',
  'phase_frontmatter',
] as const

// ---------------------------------------------------------------------------
// AC #5 — drift tests.
// ---------------------------------------------------------------------------

describe('T-037 AC#5 — Glossary.md vault ↔ glossary.ts drift', () => {
  it('every Glossary.md term has a glossary.ts entry', () => {
    for (const key of GLOSSARY_VAULT_KEYS) {
      expect(
        GLOSSARY[key],
        `Vault term "${key}" missing from src/ui/copy/glossary.ts`,
      ).toBeDefined()
    }
  })

  it('every glossary.ts key has a vault entry', () => {
    for (const key of Object.keys(GLOSSARY)) {
      expect(
        GLOSSARY_VAULT_KEYS as readonly string[],
        `glossary.ts key "${key}" missing from GLOSSARY_VAULT_KEYS in this test — did you forget to add it to Glossary.md?`,
      ).toContain(key)
    }
  })

  it('the vault key list and glossary.ts have the same length', () => {
    expect(Object.keys(GLOSSARY).length).toBe(GLOSSARY_VAULT_KEYS.length)
  })
})
