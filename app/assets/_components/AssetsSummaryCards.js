'use client';

import { SummaryCard } from './SummaryCard';
import { fmtMoney, fmtMoneyShort } from './utils';

export function AssetsSummaryCards({ properties, summary, year, activeRange }) {
  const totalTax = summary.totalHouse + summary.totalLand + summary.totalMaint;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
      <SummaryCard label="物業總數" value={`${properties.length} 間`} color="gray" small />
      <SummaryCard
        label="已出租"
        value={`${summary.rentedCount} 間`}
        sub={`空置 ${summary.availableCount} 間`}
        color="teal"
        small
      />
      <SummaryCard
        label={activeRange ? `${activeRange.start}~${activeRange.end} 租金` : `${year} 年租金收入`}
        value={`NT$ ${fmtMoneyShort(summary.totalRent)}`}
        sub={fmtMoney(summary.totalRent)}
        color="green"
      />
      <SummaryCard
        label={`${year} 年房屋稅`}
        value={`NT$ ${fmtMoneyShort(summary.totalHouse)}`}
        sub={fmtMoney(summary.totalHouse)}
        color="amber"
      />
      <SummaryCard
        label={`${year} 年地價稅`}
        value={`NT$ ${fmtMoneyShort(summary.totalLand)}`}
        sub={fmtMoney(summary.totalLand)}
        color="orange"
      />
      <SummaryCard
        label={activeRange ? `${activeRange.start}~${activeRange.end} 維護費` : `${year} 年維護費`}
        value={`NT$ ${fmtMoneyShort(summary.totalMaint)}`}
        sub={fmtMoney(summary.totalMaint)}
        color="blue"
      />
      <SummaryCard
        label="稅費合計"
        value={`NT$ ${fmtMoneyShort(totalTax)}`}
        sub={fmtMoney(totalTax)}
        color="red"
      />
      <SummaryCard
        label={activeRange ? `${activeRange.start}~${activeRange.end} 淨利` : `${year} 年淨利`}
        value={`NT$ ${fmtMoneyShort(summary.totalNet)}`}
        sub={fmtMoney(summary.totalNet)}
        color={summary.totalNet >= 0 ? 'green' : 'red'}
      />
    </div>
  );
}
