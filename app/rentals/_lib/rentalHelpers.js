import { todayStr } from '@/lib/localDate';

export const CONTRACT_STATUSES = [
  { value: 'pending',    label: '待審核', color: 'bg-gray-100   text-gray-800'   },
  { value: 'active',     label: '生效中', color: 'bg-green-100  text-green-800'  },
  { value: 'expired',    label: '已到期', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'terminated', label: '已終止', color: 'bg-red-100    text-red-800'    },
];

export const INCOME_STATUSES = [
  { value: 'pending',   label: '待收',   color: 'bg-yellow-100 text-yellow-800' },
  { value: 'completed', label: '已收',   color: 'bg-green-100  text-green-800'  },
  { value: 'paid',      label: '已收',   color: 'bg-green-100  text-green-800'  },
  { value: 'partial',   label: '部分收', color: 'bg-orange-100 text-orange-800' },
  { value: 'overdue',   label: '逾期',   color: 'bg-red-100    text-red-800'    },
];

export const TAX_STATUSES = [
  { value: 'pending', label: '待繳', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'paid',    label: '已繳', color: 'bg-green-100  text-green-800'  },
];

export function getContractDisplayStatus(c) {
  if (c.status === 'active' && c.endDate && c.endDate < todayStr()) {
    return 'expired';
  }
  return c.status;
}

export function getTenantDisplayName(tenant) {
  if (!tenant) return '-';
  return tenant.tenantType === 'company' ? tenant.companyName : tenant.fullName;
}
