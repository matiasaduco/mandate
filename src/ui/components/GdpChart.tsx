// T-023 — GDP trend chart for the Economy panel.
//
// Thin wrapper around Recharts' LineChart. Sized larger than the
// `TrendSparkline` (which is a 30px card strip) so the EconomyPanel can show
// a readable trend with visible axes. Deliberately kept simple in P1: no
// tooltip, no legend, no animation. The fancy interactivity arrives with T-026
// (event feed hover-back) and T-027 (visual polish pass).
//
// Same Recharts caveats as the sparkline:
//   - With < 2 data points Recharts renders an empty SVG. We render a
//     placeholder div instead so the panel layout stays stable on first paint
//     when the trend buffer has just one seeded sample.
//   - `isAnimationActive={false}` to avoid 4×-speed visual thrash.
//   - `ResponsiveContainer` with fixed height + 100% width lets the chart
//     stretch with the panel section.

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

export type GdpChartProps = {
  /** Time-ordered samples. Index 0 is oldest, last is newest. */
  data: number[]
  /** Pixel height. Defaults to a compact panel chart (120px). */
  height?: number
  /** Stroke color. Defaults to the app accent variable. */
  color?: string
}

const DEFAULT_HEIGHT = 120
const DEFAULT_COLOR = 'var(--accent)'

export function GdpChart({ data, height = DEFAULT_HEIGHT, color = DEFAULT_COLOR }: GdpChartProps) {
  // Need at least 2 points for a meaningful line; render a placeholder of the
  // same height so the chart container doesn't reflow when the second tick
  // lands.
  if (data.length < 2) {
    return (
      <div
        className="gdp-chart gdp-chart--empty"
        data-testid="gdp-chart-empty"
        style={{ height }}
      />
    )
  }

  // Recharts wants array-of-records — map index→i (X axis), value→v (Y axis).
  const chartData = data.map((v, i) => ({ i, v }))

  return (
    <div className="gdp-chart" data-testid="gdp-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
          <XAxis dataKey="i" tick={{ fontSize: 10 }} stroke="var(--text)" />
          <YAxis tick={{ fontSize: 10 }} stroke="var(--text)" width={60} />
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
