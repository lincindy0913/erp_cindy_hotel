import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 50;
    const action = searchParams.get('action');
    const level = searchParams.get('level');
    const targetModule = searchParams.get('targetModule');
    const userEmail = searchParams.get('userEmail');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const keyword = searchParams.get('keyword');

    const where = {};

    if (action) where.action = action;
    if (level) where.level = level;
    if (targetModule) where.targetModule = targetModule;
    if (userEmail) where.userEmail = { contains: userEmail };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    if (keyword) {
      where.OR = [
        { targetRecordNo: { contains: keyword } },
        { note: { contains: keyword } },
        { userName: { contains: keyword } },
      ];
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs.map(log => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
