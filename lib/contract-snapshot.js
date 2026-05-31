/**
 * 合約版本快照 helper
 *
 * 在任何結構性修約前呼叫，將當前狀態存入 engineering_contract_versions。
 * 結構性修約 = 金額/內容/期數新增刪除修改（不含付款狀態更新）。
 *
 * 版號規則：
 *   - 合約建立時 currentVersion=1，不產生歷史記錄
 *   - 第一次修約前：快照 v1 → currentVersion 變 2
 *   - 第二次修約前：快照 v2 → currentVersion 變 3
 */

import prisma from '@/lib/prisma';

export async function snapshotContract(contractId, { reason = null, tx } = {}) {
  const client = tx || prisma;

  const contract = await client.engineeringContract.findUnique({
    where: { id: contractId },
    include: { terms: { orderBy: { termNo: 'asc' } } },
  });
  if (!contract) return;

  const snapshot = JSON.stringify({
    contractNo:    contract.contractNo,
    totalAmount:   Number(contract.totalAmount),
    retentionRate: Number(contract.retentionRate),
    signDate:      contract.signDate,
    content:       contract.content,
    note:          contract.note,
    terms: (contract.terms || []).map(t => ({
      termNo:          t.termNo,
      termType:        t.termType,
      termName:        t.termName,
      amount:          Number(t.amount),
      retentionAmount: Number(t.retentionAmount || 0),
      dueDate:         t.dueDate,
      status:          t.status,
      content:         t.content,
      note:            t.note,
    })),
  });

  await client.engineeringContractVersion.create({
    data: {
      contractId,
      version:      contract.currentVersion,
      changeReason: reason,
      snapshot,
    },
  });

  await client.engineeringContract.update({
    where: { id: contractId },
    data:  { currentVersion: contract.currentVersion + 1 },
  });
}
