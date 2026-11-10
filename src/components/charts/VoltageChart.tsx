
import { useLayoutEffect, useMemo, useRef } from 'react';
import uPlot from 'uplot';
import type { AlignedData } from 'uplot';

interface VoltageChartProps {
  readings: {
    voltage: number;
    receivedAt: string;
  }[];
  height?: number;
  title?: string;
}

export default function VoltageChart({
  readings,
  height = 350,
  title = 'Voltage Trend',
}: VoltageChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  const data = useMemo<AlignedData>(() => {
    const sorted = [...readings]
      .filter(
        (r) =>
          Number.isFinite(Number(r.voltage)) &&
          Number.isFinite(Date.parse(r.receivedAt))
      )
      .sort(
        (a, b) =>
          Date.parse(a.receivedAt) - Date.parse(b.receivedAt)
      );

    return [
      sorted.map((r) => Date.parse(r.receivedAt) / 1000),
      sorted.map((r) => Number(r.voltage)),
    ];

  }, [readings]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const width = Math.max(containerRef.current.clientWidth, 300);

    const chart = new uPlot(
      {
        width,
        height,
        title,
        scales: { x: { time: true } },
        series: [
          {},
          {
            label: 'Voltage',
            stroke: '#228be6',
            width: 2,
            points: { show: true, size: 5 },
            value: (_u, value) =>
              value == null ? '-' : `${value.toFixed(3)} V`,
          },
        ],
        axes: [
          { stroke: '#868e96', grid: { show: true } },
          {
            label: 'Voltage (V)',
            stroke: '#868e96',
            grid: { show: true },
          },
        ],
        cursor: { drag: { x: true, y: false } },
      },
      [[], []],
      containerRef.current
    );

    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !containerRef.current.clientWidth) return;

      chart.setSize({
        width: Math.max(containerRef.current.clientWidth, 300),
        height,
      });
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, [height, title]);

  useLayoutEffect(() => {
    chartRef.current?.setData(data);
  }, [data, height, title]);

  return <div ref={containerRef} style={{ width: '100%' }} />;
}
