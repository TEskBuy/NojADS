/**
 * Chart palette.
 *
 * Three categorical slots, validated with the dataviz validator against both
 * surfaces (adjacent CVD dE 9.2 light / 9.4 dark; normal-vision 27.6 / 26.5).
 * The light aqua sits below 3:1 on the light surface, so every chart that uses
 * it also ships the table view below it — that is the relief rule, not an
 * oversight.
 */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70'] as const;

export const SEQUENTIAL_LIGHT = '#2a78d6';
export const SEQUENTIAL_DARK = '#3987e5';

export function seriesColor(index: number, dark: boolean): string {
  const palette = dark ? SERIES_DARK : SERIES_LIGHT;
  return palette[index % palette.length];
}

export const AXIS_STYLE = {
  fontSize: 11,
  fill: 'rgb(var(--faint))',
} as const;

export const GRID_COLOR = 'rgb(var(--line))';
