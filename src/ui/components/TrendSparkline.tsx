// T-022 — Sparkline wrapper around Recharts LineChart.
//
// Renders a tiny line (no axes / legend / tooltip) sized to fit inside a
// dashboard card. Reusable for any panel that wants a trend strip
// (OverviewPanel today, EconomyPanel slider preview in T-023).
//
// Design notes:
//   - With < 2 data points Recharts draws nothing meaningful, so we render an
//     empty placeholder div instead — keeps the card layout stable on first
//     paint when the buffer has just one seeded sample.
//   - `isAnimationActive={false}` because at 4× speed the inter-frame
//     animations visually thrash. The line snaps to the new shape each tick.
//   - ResponsiveContainer is given a fixed `height` and `width="100%"` so the
//     sparkline scales horizontally with the card.

import { Line, LineChart, ResponsiveContainer } from 'recharts'

export type TrendSparklineProps = {
  /** Time-ordered samples. Index 0 is oldest, last is newest. */
  data: number[]
  /** Pixel height. Defaults to a compact card sparkline (30px). */
  height?: number
  /** Stroke color. Defaults to the app accent variable. */
  color?: string
}

const DEFAULT_HEIGHT = 30
const DEFAULT_COLOR = 'var(--accent)'

export function TrendSparkline({
  data,
  height = DEFAULT_HEIGHT,
  color = DEFAULT_COLOR,
}: TrendSparklineProps) {
  // Need at least 2 points for a line; render a placeholder of the same height
  // so the card doesn't reflow when the first tick lands.
  if (data.length < 2) {
    return (
      <div
        className="trend-sparkline trend-sparkline--empty"
        data-testid="trend-sparkline-empty"
        style={{ height }}
      />
    )
  }

  // Recharts wants array-of-records — map index→i, value→v for the line series.
  const chartData = data.map((v, i) => ({ i, v }))

  return (
    <div className="trend-sparkline" data-testid="trend-sparkline" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
