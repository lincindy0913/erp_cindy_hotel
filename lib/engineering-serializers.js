export const serializeTerm = (t) => ({
  ...t,
  amount: Number(t.amount),
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
  totalAmount: Number(c.totalAmount),
  terms: (c.terms || []).map(serializeTerm),
  materials: (c.materials || []).map(serializeMaterial),
});
