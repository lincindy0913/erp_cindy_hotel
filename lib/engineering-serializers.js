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
  totalAmount:    Number(c.totalAmount),
  retentionRate:  Number(c.retentionRate ?? 0),
  currentVersion: c.currentVersion ?? 1,
  terms:     (c.terms     || []).map(serializeTerm),
  materials: (c.materials || []).map(serializeMaterial),
});
