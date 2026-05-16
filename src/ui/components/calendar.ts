// T-021 — Calendar formatter (shared module so the TopBar component file
// only exports React components — keeps fast-refresh happy).
//
// Calendar mapping (disambiguated in T-021 brief — vault example was
// off-by-one):
//   month index = tick % 12 (0 = Jan)
//   year offset = floor(tick / 12)
//   year        = CALENDAR_START_YEAR + yearOffset
//   format      = "<MonShort> <Year> — Tick <tick> / Year <yearOffset>"
//
// CALENDAR_START_YEAR is a Phase 1 fixed constant per the vault. Promote to
// `Tunables` (and the vault) when a start-year picker arrives in a later
// phase — out of scope for T-021.

/** Phase 1 fixed: calendar starts at 2024. */
export const CALENDAR_START_YEAR = 2024

/** 3-letter month names, indexed 0 = Jan … 11 = Dec. */
export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Format the calendar string for a given tick. Pure function — no store access. */
export function formatCalendar(tick: number): string {
  const month = MONTH_SHORT[tick % 12]
  const yearOffset = Math.floor(tick / 12)
  const year = CALENDAR_START_YEAR + yearOffset
  return `${month} ${year} — Tick ${tick} / Year ${yearOffset}`
}
