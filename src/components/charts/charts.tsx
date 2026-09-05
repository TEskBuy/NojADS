'use client';
/**
 * Chart components.
 *
 * Deliberate constraints, from the visualisation rules this project follows:
 *   - one y-axis per chart, never two scales on one plot;
 *   - categorical colours assigned in fixed order and never cycled;
 *   - a legend whenever there are two or more series;
 *   - thin marks, recessive grid, hover tooltip by default;
 *   - a table view under every chart, so identity never rests on colour alone.
 */
import { useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { seriesColor, GRID_COLOR } from './theme';
import { formatNumber } from '@/lib/utils';

function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export interface SeriesSpec {
  key: string;
  label: string;
  format?: (value: number) => string;
}

interface ChartProps {
  data: Record<string, string | number>[];
  xKey: string;
  series: SeriesSpec[];
  height?: number;
  /** Table view under the plot. On by default: it is the relief for low-contrast hues. */
  showTable?: boolean;
}

function ChartTooltip({ active, payload, label, series }: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
  series: SeriesSpec[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-lg">
      <p className="mb-1 text-[11px] font-semibold text-ink">{label}</p>
      {payload.map((entry) => {
        const spec = series.find((s) => s.key === entry.dataKey);
        return (
          <p key={entry.dataKey} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} aria-hidden />
            <span className="text-muted">{spec?.label ?? entry.dataKey}</span>
            <span className="ml-auto font-medium tabular-nums text-ink">
              {spec?.format ? spec.format(entry.value) : formatNumber(entry.value)}
            </span>
          </p>
        );
      })}
    </div>
  );
}

function DataTable({ data, xKey, series }: ChartProps) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] text-muted hover:text-ink">
        Ver os dados em tabela
      </summary>
      <div className="table-scroll mt-2">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-line">
              <th className="py-1.5 pr-3 font-medium text-faint">Periodo</th>
              {series.map((s) => (
                <th key={s.key} className="py-1.5 pr-3 text-right font-medium text-faint">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-1 pr-3 text-muted">{String(row[xKey])}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-1 pr-3 text-right tabular-nums text-ink">
                    {s.format ? s.format(Number(row[s.key] ?? 0)) : formatNumber(Number(row[s.key] ?? 0))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TrendChart({ data, xKey, series, height = 260, showTable = true }: ChartProps) {
  const dark = useDarkMode();

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'rgb(var(--faint))' }}
            tickLine={false} axisLine={{ stroke: GRID_COLOR }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--faint))' }}
            tickLine={false} axisLine={false} width={52}
            tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip content={<ChartTooltip series={series} />} cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }} />
          {series.length > 1 ? (
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          ) : null}
          {series.map((spec, index) => (
            <Line
              key={spec.key}
              type="monotone"
              dataKey={spec.key}
              name={spec.label}
              stroke={seriesColor(index, dark)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {showTable ? <DataTable data={data} xKey={xKey} series={series} /> : null}
    </div>
  );
}

export function AreaTrendChart({ data, xKey, series, height = 220, showTable = true }: ChartProps) {
  const dark = useDarkMode();
  const color = seriesColor(0, dark);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="nojads-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'rgb(var(--faint))' }}
            tickLine={false} axisLine={{ stroke: GRID_COLOR }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--faint))' }}
            tickLine={false} axisLine={false} width={52}
            tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip content={<ChartTooltip series={series} />} cursor={{ stroke: GRID_COLOR }} />
          <Area
            type="monotone" dataKey={series[0].key} name={series[0].label}
            stroke={color} strokeWidth={2} fill="url(#nojads-area)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      {showTable ? <DataTable data={data} xKey={xKey} series={series} /> : null}
    </div>
  );
}

export function CategoryBarChart({ data, xKey, series, height = 260, showTable = true }: ChartProps) {
  const dark = useDarkMode();

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barGap={2}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: 'rgb(var(--faint))' }}
            tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
          <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--faint))' }}
            tickLine={false} axisLine={false} width={52}
            tickFormatter={(v: number) => formatNumber(v)} />
          <Tooltip content={<ChartTooltip series={series} />} cursor={{ fill: 'rgb(var(--raised))' }} />
          {series.length > 1 ? (
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          ) : null}
          {series.map((spec, index) => (
            <Bar
              key={spec.key} dataKey={spec.key} name={spec.label}
              fill={seriesColor(index, dark)} radius={[4, 4, 0, 0]} maxBarSize={38}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {showTable ? <DataTable data={data} xKey={xKey} series={series} /> : null}
    </div>
  );
}
