"use client";

import { useId } from "react";

/**
 * Two native range inputs laid over one track. Native, so it works with a
 * keyboard and a screen reader for free; `onCommit` fires on release (or a
 * keyboard step), not on every pixel, which is when a filter should apply.
 * When both handles sit at the ends the range means "any".
 */
export function DualRange({
  label,
  min,
  max,
  step,
  low,
  high,
  format,
  anyLabel,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  format: (n: number) => string;
  anyLabel: string;
  onChange: (low: number, high: number) => void;
  onCommit: () => void;
}) {
  const id = useId();
  const isAny = low <= min && high >= max;
  const pct = (n: number) => ((n - min) / Math.max(1, max - min)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span id={`${id}-label`} className="font-bold">
          {label}
        </span>
        <span className="text-ink-2" aria-hidden>
          {isAny ? anyLabel : `${format(low)} – ${format(high)}`}
        </span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-lake"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
        <input
          type="range"
          className="range-thumb"
          aria-label={`${label}, minimum`}
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(e) => onChange(Math.min(Number(e.target.value), high - step), high)}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onTouchEnd={onCommit}
        />
        <input
          type="range"
          className="range-thumb"
          aria-label={`${label}, maximum`}
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(e) => onChange(low, Math.max(Number(e.target.value), low + step))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onTouchEnd={onCommit}
        />
      </div>
    </div>
  );
}

export function SingleRange({
  label,
  min,
  max,
  step,
  value,
  format,
  anyLabel,
  onChange,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (n: number) => string;
  anyLabel: string;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  const isAny = value >= max;
  const pct = ((value - min) / Math.max(1e-9, max - min)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className="text-ink-2" aria-hidden>
          {isAny ? anyLabel : format(value)}
        </span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-lake" style={{ width: `${pct}%` }} />
        <input
          type="range"
          className="range-thumb"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onTouchEnd={onCommit}
        />
      </div>
    </div>
  );
}
