import { formatVoltage } from '../../utils/telemetry';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Group, Text, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import { ZoomOut } from 'lucide-react';
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

export default function VoltageChart({
  readings,
  height: fixedHeight,
  timeRange,
  loading = false,
  emptyMessage = 'No readings in this period',
  title = 'Voltage',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fullBoundsRef = useRef<[number, number]>([0, 1]);
  const zoomRef = useRef<{ min: number; max: number } | null>(null);
  const updatingRef = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(350);
  const height = fixedHeight ?? availableHeight;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || fixedHeight !== undefined) {
      return;
    }
    const resize = () => {
      if (canvas.getClientRects().length) {
        // Reserve room below the canvas for dates, fetch status, and page padding.
        setAvailableHeight(
          Math.max(
            280,
            Math.floor(
              window.innerHeight - canvas.getBoundingClientRect().top - window.scrollY - 100,
            ),
          ),
        );
      }
    };
    const observer = new ResizeObserver(resize);
    const main = canvas.closest('main');
    if (main) {
      observer.observe(main);
    }
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [fixedHeight]);
  const theme = useComputedColorScheme('light');
  const mantineTheme = useMantineTheme();
  const chartColor = mantineTheme.colors[mantineTheme.primaryColor][theme === 'dark' ? 5 : 8];
  const [emptyWindowEnd] = useState(() => Date.now() / 1000);
  const points = useMemo(() => chartPoints(readings), [readings]);
  const start = timeRange?.from;
  const end = timeRange?.to;
  const bounds = useMemo<[number, number]>(() => {
    const from = start ? Date.parse(start) / 1000 : NaN;
    const to = end ? Date.parse(end) / 1000 : NaN;
    if (Number.isFinite(from) && Number.isFinite(to) && from < to) {
      return [from, to];
    }
    if (points.length) {
      const first = points[0].time;
      const last = points[points.length - 1].time;
      return first === last ? [first - 300, last + 300] : [first, last];
    }
    return [emptyWindowEnd - 1800, emptyWindowEnd];
  }, [start, end, points, emptyWindowEnd]);
  const data = useMemo<AlignedData>(
    () =>
      points.length
        ? [points.map((point) => point.time), points.map((point) => point.voltage)]
        : [
            [bounds[0], bounds[1]],
            [null, null],
          ],
    [points, bounds],
  );
  const values = points.map((point) => point.voltage);
  const latest = points.at(-1)?.voltage;
  const minimum = values.length ? values.reduce((a, b) => Math.min(a, b)) : null;
  const maximum = values.length ? values.reduce((a, b) => Math.max(a, b)) : null;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const dark = theme === 'dark';
    const axisColor = dark ? '#a5b3c7' : '#64748b';
    const gridColor = dark ? '#293544' : '#edf1f5';
    updatingRef.current = true;
    const chart = new uPlot(
      {
        width: Math.max(container.clientWidth, 240),
        height,
        padding: [20, 22, 0, 0],
        legend: { show: false },
        scales: { x: { time: true }, y: { range: (_plot, min, max) => voltageRange(min, max) } },
        series: [
          {},
          {
            label: 'Voltage',
            stroke: chartColor,
            width: 2,
            points: { show: (_plot, _series, first, last) => last - first < 40, size: 5 },
            spanGaps: false,
          },
        ],
        axes: [
          {
            stroke: axisColor,
            font: '11px Segoe UI, sans-serif',
            size: 48,
            space: 90,
            grid: { stroke: gridColor, width: 1 },
            ticks: { stroke: gridColor, width: 1 },
            values: (_plot, splits) =>
              splits.map((timestamp) =>
                new Date(timestamp * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              ),
          },
          {
            stroke: axisColor,
            font: '11px Segoe UI, sans-serif',
            size: 72,
            space: 55,
            grid: { stroke: gridColor, width: 1 },
            ticks: { show: false },
            values: (plot, splits) =>
              plot.data[1].some((voltage) => voltage != null)
                ? splits.map((voltage) =>
                    voltage.toLocaleString(undefined, { maximumFractionDigits: 3 }),
                  )
                : splits.map(() => ''),
          },
        ],
        cursor: { y: false, drag: { x: true, y: false }, points: { size: 7 } },
        hooks: {
          setScale: [
            (plot, scale) => {
              if (scale !== 'x' || updatingRef.current) {
                return;
              }
              const { min, max } = plot.scales.x;
              const [fullMin, fullMax] = fullBoundsRef.current;
              const isZoomed =
                min != null && max != null && max - min < (fullMax - fullMin) * 0.999;
              zoomRef.current = isZoomed ? { min: min!, max: max! } : null;
              setZoomed(isZoomed);
            },
          ],
          setCursor: [
            (plot) => {
              const tooltip = tooltipRef.current;
              if (!tooltip) {
                return;
              }
              const index = plot.cursor.idx;
              const value = index == null ? null : plot.data[1][index];
              if (index == null || value == null || (plot.cursor.left ?? -1) < 0) {
                tooltip.hidden = true;
                return;
              }
              tooltip.hidden = false;
              tooltip.replaceChildren();
              const time = document.createElement('span');
              time.textContent = new Date(plot.data[0][index] * 1000).toLocaleString();
              const voltage = document.createElement('strong');
              voltage.textContent = `${formatVoltage(value)} mV`;
              tooltip.append(time, voltage);
              tooltip.style.left = `${Math.max(8, Math.min(plot.over.offsetLeft + (plot.cursor.left ?? 0) + 14, container.clientWidth - 220))}px`;
              tooltip.style.top = `${Math.max(8, Math.min(plot.over.offsetTop + (plot.cursor.top ?? 0) - 78, height - 90))}px`;
            },
          ],
        },
      },
      [[], []],
      container,
    );
    chartRef.current = chart;
    updatingRef.current = false;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth) {
        chart.setSize({ width: Math.max(container.clientWidth, 240), height });
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, [height, theme, chartColor]);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    fullBoundsRef.current = bounds;
    updatingRef.current = true;
    chart.setData(data);
    chart.setScale('x', zoomRef.current ?? { min: bounds[0], max: bounds[1] });
    updatingRef.current = false;
    if (!data[1].some((value) => value != null)) {
      chart.setScale('y', { min: 0, max: 10 });
    }
    if (tooltipRef.current) {
      tooltipRef.current.hidden = true;
    }
  }, [data, bounds, height, theme, chartColor]);

  return (
    <section className="voltage-chart" aria-label="Voltage over time" aria-busy={loading}>
      <Group justify="space-between" className="chart-readout" gap="sm">
        <Group gap="lg">
          <Text size="sm" fw={600}>
            <span className="chart-series-dot" />
            {title || 'Voltage'} <span className="chart-unit">mV</span>
          </Text>
          <Text size="sm" className="chart-latest">
            <span className="chart-value-label">Last in window </span>
            {latest == null ? '—' : `${formatVoltage(latest)} mV`}
          </Text>
          {minimum != null && maximum != null && (
            <Text size="xs" c="dimmed">
              Min {formatVoltage(minimum)} · Max {formatVoltage(maximum)}
            </Text>
          )}
        </Group>
        {zoomed && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="teal"
            leftSection={<ZoomOut size={13} />}
            onClick={() => {
              zoomRef.current = null;
              chartRef.current?.setScale('x', { min: bounds[0], max: bounds[1] });
              setZoomed(false);
            }}
          >
            Zoom out
          </Button>
        )}
      </Group>
      <div ref={canvasRef} className="chart-canvas" style={{ minHeight: height }}>
        <div ref={containerRef} />
        <div ref={tooltipRef} className="chart-tooltip" hidden />
        {!points.length && (
          <div className="chart-empty" role="status">
            <span>{loading ? 'Loading readings…' : emptyMessage}</span>
          </div>
        )}
      </div>
      <div className="chart-caption">
        <span>
          {new Date(bounds[0] * 1000).toLocaleDateString()} –{' '}
          {new Date(bounds[1] * 1000).toLocaleDateString()}
        </span>
        <span>Local time · Drag to zoom</span>
      </div>
    </section>
  );
}
