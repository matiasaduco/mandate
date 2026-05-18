// T-023 — Per-sector breakdown for the Economy panel.
//
// CSS-only horizontal bar list. One row per sector with:
//   - sector name
//   - output (formatted with thousand separators)
//   - output bar (width = output / total_output)
//   - employment_share (formatted as %)
//   - employment bar (width = employment_share)
//
// AC #5: the table footer surfaces the summed `output` and the summed
// `employment_share` via `data-testid` so the spec can assert the sums match
// `gdp` (1e-6 tolerance) and 1.0 (1e-6 tolerance). Per the System Contract,
// summing in the UI is fine — Simple Economy stage 2 holds the invariant
// `country.gdp === Σ sector.output` and `Σ employment_share === 1` over the
// fixture.

import type { Sector } from '@engine/types'
import { formatNumber } from '@ui/components/format'
import { Tooltip } from '@ui/components/Tooltip'

export type SectorBreakdownProps = {
  sectors: Sector[]
}

export function SectorBreakdown({ sectors }: SectorBreakdownProps) {
  // Compute totals once. Pure arithmetic over the props — no derived store
  // state.
  const totalOutput = sectors.reduce((sum, s) => sum + s.output, 0)
  const totalEmployment = sectors.reduce((sum, s) => sum + s.employment_share, 0)

  return (
    <div className="sector-breakdown" data-testid="sector-breakdown">
      <div className="sector-breakdown__header">
        <span>Sector</span>
        <span>Output</span>
        <span>Employment</span>
      </div>
      {sectors.map((s) => {
        // Guard against div-by-zero on a degenerate state. If totalOutput is
        // 0, every bar collapses to 0% width (engine-side this would already
        // imply gdp=0; UI just renders gracefully).
        const outputPct = totalOutput > 0 ? (s.output / totalOutput) * 100 : 0
        const employmentPct = s.employment_share * 100
        return (
          <div
            key={s.sector_type}
            className="sector-breakdown__row"
            data-testid={`sector-row-${s.sector_type}`}
          >
            <span className="sector-breakdown__name">{s.sector_type}</span>
            <Tooltip tooltipKey="sector.output">
              <div className="sector-breakdown__cell" tabIndex={0}>
                <div className="sector-breakdown__bar-track" aria-hidden="true">
                  <div
                    className="sector-breakdown__bar sector-breakdown__bar--output"
                    style={{ width: `${outputPct}%` }}
                  />
                </div>
                <span
                  className="sector-breakdown__value"
                  data-testid={`sector-output-${s.sector_type}`}
                >
                  {formatNumber(s.output)}
                </span>
              </div>
            </Tooltip>
            <Tooltip tooltipKey="sector.employment">
              <div className="sector-breakdown__cell" tabIndex={0}>
                <div className="sector-breakdown__bar-track" aria-hidden="true">
                  <div
                    className="sector-breakdown__bar sector-breakdown__bar--employment"
                    style={{ width: `${employmentPct}%` }}
                  />
                </div>
                <span
                  className="sector-breakdown__value"
                  data-testid={`sector-employment-${s.sector_type}`}
                >
                  {`${(s.employment_share * 100).toFixed(1)}%`}
                </span>
              </div>
            </Tooltip>
          </div>
        )
      })}
      <div className="sector-breakdown__footer">
        <span>Total</span>
        <span data-testid="sector-output-sum" data-value={totalOutput}>
          {formatNumber(totalOutput)}
        </span>
        <span data-testid="sector-employment-sum" data-value={totalEmployment}>
          {`${(totalEmployment * 100).toFixed(1)}%`}
        </span>
      </div>
    </div>
  )
}
