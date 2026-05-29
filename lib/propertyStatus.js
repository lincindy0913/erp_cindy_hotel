export const PROPERTY_STATUSES = [
  { value: 'available',   label: '空置',   color: 'bg-green-100 text-green-800' },
  { value: 'rented',      label: '已出租', color: 'bg-blue-100 text-blue-800' },
  { value: 'maintenance', label: '維護中', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'renovation',  label: '裝修中', color: 'bg-orange-100 text-orange-800' },
  { value: 'pending',     label: '洽談中', color: 'bg-purple-100 text-purple-800' },
  { value: 'inactive',    label: '停用',   color: 'bg-gray-100 text-gray-500' },
];

/** value → label 快查（給 assets/page.js 等需要 object lookup 的地方用） */
export const PROPERTY_STATUS_LABEL = Object.fromEntries(
  PROPERTY_STATUSES.map(s => [s.value, s.label])
);
