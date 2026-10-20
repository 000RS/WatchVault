'use client';

// Small hand-built charts for Stats, Diary and Wrapped. Every mark has a hover/tap tooltip.
// Colour: a single oxblood ramp for magnitude; text always uses text colours.

import { createContext, useCallback, useContext, useRef, useState } from 'react';

const TipCtx = createContext(null);

/** Wrap a chart area; children call useTip() to show a tooltip next to the pointer. */
export function TipArea({ children, className = '' }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const show = useCallback((e, content) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const pt = e.touches?.[0] || e;
    const x = (pt.clientX ?? box.left) - box.left;
    const y = (pt.clientY ?? box.top) - box.top;
    setTip({ x, y, content, flip: x > box.width - 180 });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return (
    <TipCtx.Provider value={{ show, hide }}>
      <div ref={ref} className={`tip-area ${className}`} onMouseLeave={hide}>
        {children}
        {tip && (
          <div className={`chart-tip ${tip.flip ? 'flip' : ''}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
            {tip.content}
          </div>
        )}
      </div>
    </TipCtx.Provider>
  );
}
export function useTip(content) {
  const ctx = useContext(TipCtx);
  if (!ctx) return {};
  const on = (e) => ctx.show(e, content);
  return { onMouseEnter: on, onMouseMove: on, onFocus: (e) => ctx.show({ clientX: e.target.getBoundingClientRect().left + 10, clientY: e.target.getBoundingClientRect().top }, content), onBlur: ctx.hide, onTouchStart: on, tabIndex: 0 };
}

/** Bucket a value into one of 6 ramp steps (0 = empty). */
export function rampStep(v, max) {
  if (!v) return 0;
  if (!max) return 1;
  return Math.max(1, Math.min(6, Math.ceil((v / max) * 6)));
}

/** GitHub-style year heatmap. `values` is Map(yyyy-mm-dd → number). */
export function Heatmap({ year, values, format = (v) => `${v}`, onPick }) {
  const start = new Date(Date.UTC(year, 0, 1));
  const offset = (start.getUTCDay() + 6) % 7; // weeks start Monday
  const daysIn = (Date.UTC(year + 1, 0, 1) - start) / 86400000;
  const max = Math.max(0, ...values.values());
  const weeks = Math.ceil((daysIn + offset) / 7);
  const cells = [];
  for (let i = 0; i < daysIn; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    cells.push({ d, v: values.get(d) || 0, col: Math.floor((i + offset) / 7), row: (i + offset) % 7 });
  }
  const months = Array.from({ length: 12 }, (_, m) => ({ m, col: Math.floor((((Date.UTC(year, m, 1) - start) / 86400000) + offset) / 7) }));
  return (
    <TipArea className="heatmap-wrap">
      <div className="heatmap" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
        {months.map((x) => (
          <span key={x.m} className="heatmap-month" style={{ gridColumn: `${x.col + 1} / span 4`, gridRow: 1 }}>
            {new Date(Date.UTC(year, x.m, 1)).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}
          </span>
        ))}
        {cells.map((c) => (
          <HeatCell key={c.d} c={c} step={rampStep(c.v, max)} label={`${new Date(`${c.d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${c.v ? format(c.v) : 'nothing'}`} onPick={onPick} />
        ))}
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span className="muted small">Less</span>
        {[0, 1, 2, 3, 4, 5, 6].map((s) => (
          <i key={s} className={`heat s${s}`} />
        ))}
        <span className="muted small">More</span>
      </div>
    </TipArea>
  );
}
function HeatCell({ c, step, label, onPick }) {
  const tip = useTip(label);
  return <i className={`heat s${step}`} style={{ gridColumn: c.col + 1, gridRow: c.row + 2 }} {...tip} aria-label={label} onClick={() => onPick?.(c.d)} />;
}

/** Vertical columns, one series. data: [{ label, value, tip }] */
export function Columns({ data, height = 160, format = (v) => v.toLocaleString(), highlight }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <TipArea>
      <div className="columns" style={{ height }}>
        {data.map((d, i) => (
          <Column key={d.label + i} d={d} h={(d.value / max) * 100} format={format} on={highlight === i} />
        ))}
      </div>
      <div className="columns-axis">
        {data.map((d, i) => (
          <span key={d.label + i}>{d.short ?? d.label}</span>
        ))}
      </div>
    </TipArea>
  );
}
function Column({ d, h, format, on }) {
  const tip = useTip(
    <>
      <b>{d.label}</b>
      <span>{d.tip || format(d.value)}</span>
    </>
  );
  return (
    <div className="col-slot" {...tip} aria-label={`${d.label}: ${d.tip || format(d.value)}`}>
      <i className={`col ${on ? 'on' : ''}`} style={{ height: `${Math.max(d.value ? 2 : 0, h)}%` }} />
    </div>
  );
}

/** Ranked horizontal bars with labels and optional image. rows: [{ key, label, value, sub, img, href, tip }] */
export function RankBars({ rows, format = (v) => v.toLocaleString(), max: maxIn, limit = 10, onPick }) {
  const max = maxIn || Math.max(1, ...rows.map((r) => r.value));
  return (
    <TipArea>
      <ol className="rank-bars">
        {rows.slice(0, limit).map((r, i) => (
          <RankRow key={r.key ?? r.label} r={r} i={i} pct={(r.value / max) * 100} format={format} onPick={onPick} />
        ))}
      </ol>
    </TipArea>
  );
}
function RankRow({ r, i, pct, format, onPick }) {
  const tip = useTip(
    <>
      <b>{r.label}</b>
      <span>{r.tip || format(r.value)}</span>
    </>
  );
  const body = (
    <>
      <span className="rank-n">{i + 1}</span>
      {r.img !== undefined && <span className="rank-img">{r.img ? <img src={r.img} alt="" loading="lazy" /> : <span>{r.label[0]}</span>}</span>}
      <span className="rank-main">
        <span className="rank-label">
          <b>{r.label}</b>
          <span className="rank-value">{format(r.value)}</span>
        </span>
        <span className="rank-track">
          <i style={{ width: `${Math.max(2, pct)}%` }} />
        </span>
        {r.sub && <span className="muted small rank-sub">{r.sub}</span>}
      </span>
    </>
  );
  return (
    <li className={`rank-row ${r.img !== undefined ? 'has-img' : ''}`} {...tip}>
      {onPick ? (
        <button className={`as-button rank-btn ${r.img !== undefined ? 'has-img' : ''}`} onClick={() => onPick(r)}>
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}

/** Your rating (y) against the world's rating (x). points: [{ x, y, label }] */
export function Scatter({ points, size = 260 }) {
  const pad = 30;
  const s = (v, lo, hi) => pad + ((v - lo) / (hi - lo)) * (size - pad * 1.5);
  return (
    <TipArea className="scatter-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} className="scatter" role="img" aria-label="Your rating compared with the TMDB average">
        {[2, 4, 6, 8, 10].map((t) => (
          <g key={t}>
            <line x1={pad} x2={size - pad / 2} y1={size - s(t, 0, 10)} y2={size - s(t, 0, 10)} className="grid" />
            <text x={pad - 8} y={size - s(t, 0, 10) + 4} className="axis-t" textAnchor="end">
              {t}
            </text>
            <text x={s(t, 0, 10)} y={size - pad + 18} className="axis-t" textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <line x1={s(0, 0, 10)} y1={size - s(0, 0, 10)} x2={s(10, 0, 10)} y2={size - s(10, 0, 10)} className="diag" />
        {points.map((p, i) => (
          <Dot key={i} p={p} cx={s(p.x, 0, 10)} cy={size - s(p.y, 0, 10)} />
        ))}
      </svg>
    </TipArea>
  );
}
function Dot({ p, cx, cy }) {
  const tip = useTip(
    <>
      <b>{p.label}</b>
      <span>
        You {p.y}/10 · TMDB {p.x.toFixed(1)}
      </span>
    </>
  );
  return (
    <g {...tip} className="dot-g">
      <circle cx={cx} cy={cy} r="10" fill="transparent" />
      <circle cx={cx} cy={cy} r="4.5" className="pt" />
    </g>
  );
}

/** One big number with a label. */
export function Kpi({ value, label, sub }) {
  return (
    <div className="kpi">
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}

/** A 100% bar split into named parts (≤ 6), with a legend. parts: [{ label, value }] */
export function SplitBar({ parts, format = (v) => v.toLocaleString() }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <TipArea>
      <div className="split-bar">
        {parts.map((p, i) => (
          <SplitPart key={p.label} p={p} i={i} pct={(p.value / total) * 100} format={format} />
        ))}
      </div>
      <ul className="legend">
        {parts.map((p, i) => (
          <li key={p.label}>
            <i className={`sw s${6 - i}`} />
            {p.label} <span className="muted">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </TipArea>
  );
}
function SplitPart({ p, i, pct, format }) {
  const tip = useTip(
    <>
      <b>{p.label}</b>
      <span>
        {format(p.value)} · {Math.round(pct)}%
      </span>
    </>
  );
  return <i className={`split s${6 - i}`} style={{ width: `${pct}%` }} {...tip} />;
}
