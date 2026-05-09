'use client';

import { useState } from 'react';
import { formatNumber } from './pmsIncomeFormatters';

const PALETTE = ['#0d9488', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// ── SVG Line/Area chart for annual view ──
function LineChart({ data, warehouses }) {
  const [hovered, setHovered] = useState(null);
  const W = 600, H = 220, PL = 64, PR = 16, PT = 20, PB = 36;
  const cw = W - PL - PR, ch = H - PT - PB;
  const months = data.map(d => d.month);
  const allTotals = data.map(d => d.total);
  const maxVal = Math.max(...allTotals, 1);
  const minVal = Math.min(...allTotals.filter(v => v > 0), 0);
  const range = maxVal - minVal || 1;

  const xOf = (i) => PL + (i / (months.length - 1)) * cw;
  const yOf = (v) => PT + (1 - (v - minVal) / range) * ch;

  // Build path for total line
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(d.total).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xOf(data.length - 1).toFixed(1)},${(PT + ch).toFixed(1)} L${xOf(0).toFixed(1)},${(PT + ch).toFixed(1)} Z`;

  // Y grid lines
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = minVal + (range * i) / gridCount;
    return { y: yOf(v), label: v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0) };
  });

  // Per-warehouse lines if available
  const whLines = (warehouses || []).map((wh, wi) => ({
    wh, color: PALETTE[wi + 1] || PALETTE[wi],
    points: data.map((d, i) => ({ x: xOf(i), y: yOf(d.byWarehouse?.[wh]?.net || 0) })),
  }));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}
        onMouseLeave={() => setHovered(null)}>
        {/* Grid */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PL - 4} y={g.y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{g.label}</text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="#0d9488" fillOpacity="0.08" />

        {/* Per-warehouse lines */}
        {whLines.map(wl => (
          <polyline key={wl.wh}
            points={wl.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none" stroke={wl.color} strokeWidth="1.5" strokeDasharray="4,2" strokeOpacity="0.6" />
        ))}

        {/* Total line */}
        <path d={linePath} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points + hover */}
        {data.map((d, i) => (
          <g key={i} onMouseEnter={() => setHovered(i)} style={{ cursor: 'pointer' }}>
            <circle cx={xOf(i)} cy={yOf(d.total)} r="4" fill={hovered === i ? '#0d9488' : '#fff'} stroke="#0d9488" strokeWidth="2" />
            <text x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#6b7280">{d.month}月</text>
          </g>
        ))}

        {/* Tooltip */}
        {hovered !== null && (() => {
          const d = data[hovered];
          const x = xOf(hovered), y = yOf(d.total);
          const bx = Math.min(x, W - PR - 90);
          return (
            <g>
              <rect x={bx} y={Math.max(PT, y - 36)} width={90} height={30} rx={4} fill="rgba(0,0,0,0.75)" />
              <text x={bx + 6} y={Math.max(PT, y - 36) + 12} fontSize="9" fill="#fff">{d.month}月 {d.importedDays}/{d.totalDays}天</text>
              <text x={bx + 6} y={Math.max(PT, y - 36) + 24} fontSize="10" fill="#5eead4" fontWeight="bold">{formatNumber(d.total)}</text>
            </g>
          );
        })()}
      </svg>

      {/* Warehouse legend */}
      {whLines.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-1 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block w-6 h-0.5 bg-teal-500" style={{ display: 'inline-block', height: 2, width: 20 }} />
            合計
          </span>
          {whLines.map(wl => (
            <span key={wl.wh} className="flex items-center gap-1">
              <span style={{ display: 'inline-block', height: 2, width: 14, background: wl.color, borderTop: `2px dashed ${wl.color}` }} />
              {wl.wh}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Horizontal bar chart for single-month accounting breakdown ──
function BarChart({ items }) {
  if (!items || items.length === 0) return <p className="text-gray-500 text-center py-8">無資料</p>;
  const maxVal = Math.max(...items.map(i => Math.abs(i.net)));
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = maxVal > 0 ? (Math.abs(item.net) / maxVal) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-32 text-right text-sm text-gray-700 truncate" title={item.accountingName}>
              {item.accountingCode} {item.accountingName}
            </div>
            <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${item.net >= 0 ? 'bg-teal-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                {formatNumber(item.net)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PmsIncomeStatsChart({ statsData }) {
  if (!statsData) return null;

  // Single month — accounting code breakdown bar chart
  if (statsData.byAccountingCode) {
    return <BarChart items={statsData.byAccountingCode} />;
  }

  // Annual — SVG line chart
  if (Array.isArray(statsData) && statsData.length > 0) {
    const warehouses = Object.keys(statsData.find(d => d.byWarehouse) ? statsData[0].byWarehouse || {} : {});
    return <LineChart data={statsData} warehouses={warehouses.length > 1 ? warehouses : []} />;
  }

  return null;
}
