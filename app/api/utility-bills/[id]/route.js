import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const record = await prisma.utilityBillRecord.findUnique({
      where: { id },
    });
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      id: record.id,
      warehouse: record.warehouse,
      billYear: record.billYear,
      billMonth: record.billMonth,
      billType: record.billType,
      summaryJson: typeof record.summaryJson === 'string' ? JSON.parse(record.summaryJson) : record.summaryJson,
      fileName: record.fileName,
      createdAt: record.createdAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  try {
    await getServerSession(authOptions);
    const id = parseInt(params.id, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    const body = await request.json();
    const { summaryJson, fileName } = body;

    const update = {};
    if (summaryJson != null) {
      update.summaryJson = typeof summaryJson === 'string' ? summaryJson : JSON.stringify(summaryJson);
    }
    if (fileName !== undefined) update.fileName = fileName ? String(fileName).trim() : null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const record = await prisma.utilityBillRecord.update({
      where: { id },
      data: update,
    });

    return NextResponse.json({
      id: record.id,
      message: '已更新',
      warehouse: record.warehouse,
      billYear: record.billYear,
      billMonth: record.billMonth,
      billType: record.billType,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
