/**
 * GET /api/engineering/dashboard-stats
 *
 * 用 groupBy 一次回傳工程儀表板所需的彙整數字，取代前端分別撈
 * engineeringIncome / engineeringInputInvoice / engineeringOutputInvoice 全表。
 *
 * Response:
 *   totalIncome, totalInputInvoices, totalOutputInvoices
 *   byProject: { [projectId]: { income, inputInvoices, outputInvoices } }
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
    const [incGroups, inputGroups, outputGroups] = await Promise.all([
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
    ]);

    const byProject = {};

    for (const r of incGroups) {
      const pid = String(r.projectId);
      if (!byProject[pid]) byProject[pid] = { income: 0, inputInvoices: 0, outputInvoices: 0 };
      byProject[pid].income = Number(r._sum.amount || 0);
    }
    for (const r of inputGroups) {
      const pid = String(r.projectId);
      if (!byProject[pid]) byProject[pid] = { income: 0, inputInvoices: 0, outputInvoices: 0 };
      byProject[pid].inputInvoices = Number(r._sum.totalAmount || 0);
    }
    for (const r of outputGroups) {
      const pid = String(r.projectId);
      if (!byProject[pid]) byProject[pid] = { income: 0, inputInvoices: 0, outputInvoices: 0 };
      byProject[pid].outputInvoices = Number(r._sum.totalAmount || 0);
    }

    const totalIncome        = incGroups.reduce((s, r) => s + Number(r._sum.amount || 0), 0);
    const totalInputInvoices  = inputGroups.reduce((s, r) => s + Number(r._sum.totalAmount || 0), 0);
    const totalOutputInvoices = outputGroups.reduce((s, r) => s + Number(r._sum.totalAmount || 0), 0);

    return NextResponse.json({ totalIncome, totalInputInvoices, totalOutputInvoices, byProject });
  } catch (error) {
    return handleApiError(error);
  }
}
