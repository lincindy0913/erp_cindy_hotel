/**
 * GET /api/engineering/dashboard-stats
 *
 * 用 groupBy 一次回傳工程儀表板所需的彙整數字，取代前端分別撈
 * engineeringIncome / engineeringInputInvoice / engineeringOutputInvoice 全表。
 *
 * Response:
 *   totalIncome, totalInputInvoices, totalOutputInvoices, totalMaterialCost
 *   byProject: { [projectId]: { income, inputInvoices, outputInvoices, materialCost } }
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const [incGroups, inputGroups, outputGroups, materials] = await Promise.all([
      prisma.engineeringIncome.groupBy({
        by: ['projectId'],
        _sum: { amount: true },
      }),
      prisma.engineeringInputInvoice.groupBy({
        by: ['projectId'],
        _sum: { totalAmount: true },
      }),
      prisma.engineeringOutputInvoice.groupBy({
        by: ['projectId'],
        _sum: { totalAmount: true },
      }),
      // 材料成本：totalAmount 有值直接用，否則 quantity × unitPrice
      prisma.engineeringMaterial.findMany({
        select: { projectId: true, quantity: true, unitPrice: true, totalAmount: true },
      }),
    ]);

    const byProject = {};
    const ensure = (pid) => {
      const k = String(pid);
      if (!byProject[k]) byProject[k] = { income: 0, inputInvoices: 0, outputInvoices: 0, materialCost: 0 };
      return k;
    };

    for (const r of incGroups)    byProject[ensure(r.projectId)].income        = Number(r._sum.amount      || 0);
    for (const r of inputGroups)  byProject[ensure(r.projectId)].inputInvoices = Number(r._sum.totalAmount || 0);
    for (const r of outputGroups) byProject[ensure(r.projectId)].outputInvoices= Number(r._sum.totalAmount || 0);
    for (const m of materials) {
      const k    = ensure(m.projectId);
      const cost = m.totalAmount != null
        ? Number(m.totalAmount)
        : Number(m.quantity || 0) * Number(m.unitPrice || 0);
      byProject[k].materialCost += cost;
    }

    const totalIncome         = incGroups.reduce((s, r)  => s + Number(r._sum.amount      || 0), 0);
    const totalInputInvoices  = inputGroups.reduce((s, r) => s + Number(r._sum.totalAmount || 0), 0);
    const totalOutputInvoices = outputGroups.reduce((s, r)=> s + Number(r._sum.totalAmount || 0), 0);
    const totalMaterialCost   = Object.values(byProject).reduce((s, p) => s + p.materialCost, 0);

    return NextResponse.json({
      totalIncome, totalInputInvoices, totalOutputInvoices, totalMaterialCost, byProject,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
