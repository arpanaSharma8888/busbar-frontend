import { useLayoutEffect, useMemo, useRef } from 'react';
import { Button, Group, Text, useComputedColorScheme } from '@mantine/core';
import { RotateCcw } from 'lucide-react';
import uPlot from 'uplot';
import type { AlignedData } from 'uplot';
import { chartPoints, voltageRange } from './chartData';
import './VoltageChart.css';

interface Props {
  readings: { voltage: number; receivedAt: string }[];
  height?: number;
  title?: string;
  timeRange?: { from: string; to: string } | null;
  loading?: boolean;
  emptyMessage?: string;
}

export default function VoltageChart({ readings, height = 420, timeRange, loading = false,
  emptyMessage = 'No readings in this period', title = 'Voltage' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const theme = useComputedColorScheme('light');
  const points = useMemo(() => chartPoints(readings), [readings]);
  const start = timeRange?.from;
  const end = timeRange?.to;
  const bounds = useMemo<[number, number]>(() => {
    const from = start ? Date.parse(start) / 1000 : NaN;
    const to = end ? Date.parse(end) / 1000 : NaN;
    if (Number.isFinite(from) && Number.isFinite(to) && from < to) return [from, to];
    if (points.length) {
      const first = points[0].time;
      const last = points[points.length - 1].time;
      return first === last ? [first - 300, last + 300] : [first, last];
    }
    const now = Date.now() / 1000;
    return [now - 1800, now];
  }, [start, end, points]);
  const data = useMemo<AlignedData>(() => points.length
    ? [points.map(p => p.time), points.map(p => p.voltage)]
    : [[bounds[0], bounds[1]], [null, null]], [points, bounds]);
  const values = points.map(p => p.voltage);
  const latest = points.at(-1)?.voltage;
  const minimum = values.length ? values.reduce((a, b) => Math.min(a, b)) : null;
  const maximum = values.length ? values.reduce((a, b) => Math.max(a, b)) : null;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const dark = theme === 'dark';
    const ink = dark ? '#a5b3c7' : '#64748b';
    const grid = dark ? '#293544' : '#edf1f5';
    const chart = new uPlot({
      width: Math.max(container.clientWidth, 240), height,
      padding: [20, 22, 0, 0], legend: { show: false },
      scales: { x: { time: true }, y: { range: (_u, min, max) => voltageRange(min, max) } },
      series: [{}, { label: 'Voltage', stroke: dark ? '#66b7ff' : '#1672c4', width: 2,
        points: { show: (_u, _series, first, last) => last - first < 40, size: 5 }, spanGaps: false }],
      axes: [
        { stroke: ink, font: '11px Segoe UI, sans-serif', size: 48, space: 90,
          grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 },
          values: (_u, splits) => splits.map(t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) },
        { stroke: ink, font: '11px Segoe UI, sans-serif', size: 72, space: 55,
          grid: { stroke: grid, width: 1 }, ticks: { show: false },
          values: (u, splits) => u.data[1].some(v => v != null) ? splits.map(v => v.toLocaleString(undefined, { maximumFractionDigits: 3 })) : splits.map(() => '') },
      ],
      cursor: { y: false, drag: { x: true, y: false }, points: { size: 7 } },
      hooks: { setCursor: [u => {
        const tip = tooltipRef.current;
        if (!tip) return;
        const index = u.cursor.idx;
        const value = index == null ? null : u.data[1][index];
        if (index == null || value == null || (u.cursor.left ?? -1) < 0) { tip.hidden = true; return; }
        tip.hidden = false;
        tip.replaceChildren();
        const time = document.createElement('span');
        time.textContent = new Date(u.data[0][index] * 1000).toLocaleString();
        const voltage = document.createElement('strong');
        voltage.textContent = `${value.toFixed(3)} V`;
        tip.append(time, voltage);
        tip.style.left = `${Math.max(8, Math.min(u.over.offsetLeft + (u.cursor.left ?? 0) + 14, container.clientWidth - 220))}px`;
        tip.style.top = `${Math.max(8, Math.min(u.over.offsetTop + (u.cursor.top ?? 0) - 78, height - 90))}px`;
      }] },
    }, [[], []], container);
    chartRef.current = chart;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth) chart.setSize({ width: Math.max(container.clientWidth, 240), height });
    });
    observer.observe(container);
    return () => { observer.disconnect(); chart.destroy(); chartRef.current = null; };
  }, [height, theme]);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setData(data);
    chart.setScale('x', { min: bounds[0], max: bounds[1] });
    if (!data[1].some(value => value != null)) chart.setScale('y', { min: 0, max: 1 });
    if (tooltipRef.current) tooltipRef.current.hidden = true;
  }, [data, bounds, height, theme]);

  return <section className="voltage-chart" aria-label="Voltage over time" aria-busy={loading}>
    <Group justify="space-between" className="chart-readout" gap="sm">
      <Group gap="lg"><Text size="sm" fw={600}><span className="chart-series-dot" />{title || 'Voltage'} <span className="chart-unit">V</span></Text>
        <Text size="sm" className="chart-latest">{latest == null ? '—' : `${latest.toFixed(3)} V`}</Text>
        {minimum != null && maximum != null && <Text size="xs" c="dimmed">Min {minimum.toFixed(3)} · Max {maximum.toFixed(3)}</Text>}
      </Group>
      <Button size="compact-xs" variant="subtle" color="gray" disabled={!points.length} leftSection={<RotateCcw size={13} />} onClick={() => {
        chartRef.current?.setData(data);
        chartRef.current?.setScale('x', { min: bounds[0], max: bounds[1] });
      }}>Reset zoom</Button>
    </Group>
    <div className="chart-canvas" style={{ minHeight: height }}>
      <div ref={containerRef} />
      <div ref={tooltipRef} className="chart-tooltip" hidden />
      {!points.length && <div className="chart-empty" role="status"><span>{loading ? 'Loading readings…' : emptyMessage}</span></div>}
    </div>
    <div className="chart-caption"><span>{new Date(bounds[0] * 1000).toLocaleDateString()} – {new Date(bounds[1] * 1000).toLocaleDateString()}</span><span>Local time · Drag to zoom</span></div>
  </section>;
}
