/**
 * TOTP 雙因素驗證設定 API
 *
 * GET    → 產生新的 TOTP secret + QR code（尚未儲存）
 * POST   → 驗證使用者輸入的 6 位碼正確後，啟用 2FA 並儲存 secret
 * DELETE → 停用 2FA（需再次驗證密碼）
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { encryptField, decryptField } from '@/lib/field-encryption';

export const dynamic = 'force-dynamic';

const APP_NAME = 'ERP系統';

// ── GET: 產生 secret + QR code（preview 用，尚未儲存） ──
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return createErrorResponse('UNAUTHORIZED', '請先登入', 401);

    const secret = authenticator.generateSecret(20);
    const otpauth = authenticator.keyuri(session.user.email || session.user.name || 'user', APP_NAME, secret);
    const qrCode  = await QRCode.toDataURL(otpauth);

    return NextResponse.json({ secret, qrCode });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── POST: 驗證 token 正確後啟用 2FA ──
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return createErrorResponse('UNAUTHORIZED', '請先登入', 401);

    const { secret, token } = await request.json();
    if (!secret || !token) return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少 secret 或驗證碼', 400);

    // 驗證使用者輸入的 6 位碼
    authenticator.options = { window: 1 }; // 允許前後 1 個 30秒視窗的誤差
    const isValid = authenticator.verify({ token: String(token).replace(/\s/g, ''), secret });
    if (!isValid) return createErrorResponse('INVALID_TOKEN', '驗證碼錯誤，請重新掃描 QR code', 400);

    // 產生 8 組備用碼（一次性，明文顯示後不再顯示）
    const backupCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );

    await prisma.user.update({
      where: { id: parseInt(session.user.id) },
      data: {
        totpSecret:      encryptField(secret),
        totpEnabled:     true,
        totpBackupCodes: JSON.stringify(backupCodes),
      },
    });

    return NextResponse.json({ ok: true, backupCodes });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── DELETE: 停用 2FA（需提供密碼確認） ──
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return createErrorResponse('UNAUTHORIZED', '請先登入', 401);

    const { password } = await request.json();
    if (!password) return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供密碼以確認操作', 400);

    const user = await prisma.user.findUnique({
      where: { id: parseInt(session.user.id) },
      select: { password: true },
    });
    if (!user) return createErrorResponse('NOT_FOUND', '找不到使用者', 404);

    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) return createErrorResponse('INVALID_CREDENTIALS', '密碼錯誤', 403);

    await prisma.user.update({
      where: { id: parseInt(session.user.id) },
      data: { totpSecret: null, totpEnabled: false, totpBackupCodes: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
