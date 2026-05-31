export const serializeTerm = (t) => ({
  ...t,
  amount: Number(t.amount),
  retentionAmount: Number(t.retentionAmount ?? 0),
  termType: t.termType ?? 'regular',
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

export const serializeMaterial = (m) => ({
  ...m,
  quantity: Number(m.quantity),
  unitPrice: Number(m.unitPrice),
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
});

export const serializeContract = (c) => ({
  ...c,
  totalAmount:      Number(c.totalAmount),
  retentionRate:    Number(c.retentionRate ?? 0),
  currentVersion:   c.currentVersion ?? 1,
  contractType:     c.contractType ?? '主合約',
  parentContractId: c.parentContractId ?? null,
  terms:       (c.terms       || []).map(serializeTerm),
  materials:   (c.materials   || []).map(serializeMaterial),
  // 子合約：僅序列化摘要欄位（不遞迴展開，避免深度巢狀）
  subContracts: (c.subContracts || []).map(s => ({
    id: s.id, contractNo: s.contractNo, contractType: s.contractType,
    totalAmount: Number(s.totalAmount), retentionRate: Number(s.retentionRate ?? 0),
    status: s.status, signDate: s.signDate,
    supplier: s.supplier ? { id: s.supplier.id, name: s.supplier.name } : null,
    terms: (s.terms || []).map(serializeTerm),
    subContracts: (s.subContracts || []).map(g => ({
      id: g.id, contractNo: g.contractNo, contractType: g.contractType,
      totalAmount: Number(g.totalAmount), retentionRate: Number(g.retentionRate ?? 0),
      status: g.status, signDate: g.signDate,
      supplier: g.supplier ? { id: g.supplier.id, name: g.supplier.name } : null,
      terms: (g.terms || []).map(serializeTerm),
      subContracts: [],
    })),
  })),
});
