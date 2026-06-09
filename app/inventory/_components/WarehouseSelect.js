'use client';

export default function WarehouseSelect({ value, onChange, warehouseList, placeholder = '全部', className = '', required = false }) {
  const buildings = warehouseList.filter(w => w.type === 'building');
  const standalone = warehouseList.filter(w => w.type !== 'building' && !w.parentId);

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className} required={required}>
      <option value="">{placeholder}</option>
      {buildings.map(b => {
        const children = warehouseList.filter(w => w.parentId === b.id);
        return (
          <optgroup key={b.id} label={`🏢 ${b.name}`}>
            <option value={b.name}>全部 {b.name}（館別）</option>
            {children.map(c => (
              <option key={c.id} value={c.name}>&nbsp;&nbsp;{c.name}</option>
            ))}
          </optgroup>
        );
      })}
      {standalone.length > 0 && (
        <optgroup label="其他倉庫">
          {standalone.map(s => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// Helper: get departments for a selected warehouse name
export function getDepartmentsForWarehouse(warehouseList, selectedName) {
  if (!selectedName) return [];
  const match = warehouseList.find(w => w.name === selectedName);
  if (!match) return [];
  if (match.type === 'building') return match.departments || [];
  if (match.parentId) {
    const parent = warehouseList.find(w => w.id === match.parentId);
    return parent?.departments || [];
  }
  return [];
}
