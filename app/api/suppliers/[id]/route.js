import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PURCHASING_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt((await params).id);
    const supplier = await prisma.supplier.findUnique({ where: { id } });

    if (!supplier) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
    }
    return NextResponse.json(supplier);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requireAnyPermission([
    PERMISSIONS.PURCHASING_EDIT,
    PERMISSIONS.PURCHASING_CREATE,
    PERMISSIONS.PURCHASING_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
    PERMISSIONS.SETTINGS_VIEW,
  ]);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt((await params).id);
    const data = await request.json();

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
    }

    if (!data.name || !String(data.name).trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請填寫廠商名稱', 400);
    }

    // 統一編號唯一性檢查（排除自身，含已停用廠商）
    const taxId = data.taxId && String(data.taxId).trim() ? String(data.taxId).trim() : null;
    if (taxId) {
      const dup = await prisma.supplier.findFirst({
        where: { taxId, id: { not: id } },
        select: { id: true, name: true, isActive: true },
      });
      if (dup) {
        return NextResponse.json({
          error: `統一編號 ${taxId} 已被廠商「${dup.name}」使用${!dup.isActive ? '（已停用）' : ''}，不可重複`,
          code: 'SUPPLIER_TAX_ID_DUPLICATE',
        }, { status: 409 });
      }
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name: String(data.name).trim(),
        taxId: data.taxId && String(data.taxId).trim() ? String(data.taxId).trim() : null,
        contact: data.contact && String(data.contact).trim() ? String(data.contact).trim() : null,
        personInCharge: data.personInCharge && String(data.personInCharge).trim() ? String(data.personInCharge).trim() : null,
        phone: data.phone && String(data.phone).trim() ? String(data.phone).trim() : null,
        address: data.address || null,
        email: data.email || null,
        paymentTerms: data.paymentTerms || '月結',
        contractDate: data.contractDate || null,
        contractEndDate: data.contractEndDate || null,
        paymentStatus: data.paymentStatus || '未付款',
        remarks: data.remarks || null,
        checkPayee: data.checkPayee && String(data.checkPayee).trim() ? String(data.checkPayee).trim() : null,
        industryCategory: data.industryCategory && String(data.industryCategory).trim() ? String(data.industryCategory).trim() : null,
        sortOrder: data.sortOrder != null && data.sortOrder !== '' ? parseInt(data.sortOrder) : null,
        rating: data.rating != null && data.rating !== '' ? parseInt(data.rating) : null,
        isBlacklisted: data.isBlacklisted === true || data.isBlacklisted === 'true',
        blacklistReason: data.blacklistReason?.trim() || null,
        blacklistedAt: (data.isBlacklisted === true || data.isBlacklisted === 'true')
          ? (data.blacklistedAt ? new Date(data.blacklistedAt) : new Date())
          : null,
      }
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.SUPPLIER_UPDATE,
      targetModule: 'suppliers',
      targetRecordId: id,
      beforeState: { name: existing.name, paymentTerms: existing.paymentTerms },
      afterState: { name: updated.name, paymentTerms: updated.paymentTerms },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAnyPermission([
    PERMISSIONS.PURCHASING_EDIT,
    PERMISSIONS.PURCHASING_CREATE,
    PERMISSIONS.PURCHASING_VIEW,
    PERMISSIONS.SETTINGS_EDIT,
  ]);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    const { searchParams } = new URL(request.url);
    const deactivate = searchParams.get('deactivate') === 'true';

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '廠商不存在', 404);
    }

    // ── 軟刪除路徑：停用，不管有無引用 ─────────────────────────
    if (deactivate) {
      await prisma.supplier.update({ where: { id }, data: { isActive: false } });
      await auditFromSession(prisma, auth.session, {
        action: AUDIT_ACTIONS.SUPPLIER_DEACTIVATE,
        targetModule: 'suppliers',
        targetRecordId: id,
        targetRecordNo: existing.supplierCode || String(id),
        beforeState: { isActive: true },
        afterState: { isActive: false },
        note: `停用廠商「${existing.name}」`,
      });
      return NextResponse.json({ message: '廠商已停用' });
    }

    // ── 硬刪除路徑：先查三方引用 ────────────────────────────────
    const [purchaseCount, paymentCount, allowanceCount] = await Promise.all([
      prisma.purchaseMaster.count({ where: { supplierId: id } }),
      prisma.paymentOrder.count({ where: { supplierId: id } }),
      prisma.purchaseAllowance.count({ where: { supplierId: id } }),
    ]);

    if (purchaseCount + paymentCount + allowanceCount > 0) {
      return NextResponse.json({
        error: `廠商「${existing.name}」有 ${purchaseCount} 筆進貨、${paymentCount} 筆付款單、${allowanceCount} 筆折讓單，無法直接刪除。建議改用停用（傳 ?deactivate=true）。`,
        code: 'SUPPLIER_REFERENCED',
        counts: { purchaseCount, paymentCount, allowanceCount },
      }, { status: 409 });
    }

    // 無引用 → 真正刪除
    await prisma.supplier.delete({ where: { id } });
    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.SUPPLIER_DELETE,
      targetModule: 'suppliers',
      targetRecordId: id,
      targetRecordNo: existing.supplierCode || String(id),
      beforeState: { name: existing.name, supplierCode: existing.supplierCode },
      note: `刪除廠商「${existing.name}」`,
    });
    return NextResponse.json({ message: '廠商已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
