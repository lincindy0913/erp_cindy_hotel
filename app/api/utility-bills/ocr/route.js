import { NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const maxDuration = 300; // 5 minutes for AI inference

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://ocr:5001';

// SSRF protection: validate that OCR_SERVICE_URL is an allowed host
function validateOcrUrl(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    // Block file://, ftp://, etc. — only http/https allowed
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    // Block common internal metadata endpoints
    const blocked = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200', '[::1]'];
    if (blocked.includes(host)) return false;
    // Block localhost unless explicitly configured (dev)
    if (host === 'localhost' || host === '127.0.0.1') {
      return process.env.NODE_ENV !== 'production';
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.EXPENSE_CREATE, PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.FINANCE_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    if (!validateOcrUrl(OCR_SERVICE_URL)) {
      console.error('[OCR] blocked SSRF-risk URL:', OCR_SERVICE_URL);
      return NextResponse.json({ error: 'OCR 服務 URL 設定異常' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const billType = formData.get('bill_type') || '電費';
    const page = formData.get('page') || '0';

    if (!file) {
      return NextResponse.json({ error: '請上傳 PDF 檔案' }, { status: 400 });
    }

    // Guard against oversized files (100MB max)
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: '檔案大小超過 100MB 上限' }, { status: 400 });
    }

    // Validate page is a numeric string to prevent injection into URL
    const pageNum = parseInt(page, 10);
    if (Number.isNaN(pageNum) || pageNum < 0) {
      return NextResponse.json({ error: 'page 參數格式錯誤' }, { status: 400 });
    }

    const ocrForm = new FormData();
    ocrForm.append('file', file);
    ocrForm.append('bill_type', billType);
    ocrForm.append('page', String(pageNum));

    const ocrRes = await fetch(
      `${OCR_SERVICE_URL}/ocr?bill_type=${encodeURIComponent(billType)}&page=${pageNum}`,
      { method: 'POST', body: ocrForm, signal: AbortSignal.timeout(290000) }
    );

    if (!ocrRes.ok) {
      const err = await ocrRes.text();
      return NextResponse.json({ error: `OCR 服務錯誤: ${err}` }, { status: 500 });
    }

    const data = await ocrRes.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error('OCR proxy error:', e);
    return NextResponse.json(
      { error: 'OCR 服務無法連線，請確認服務是否啟動' },
      { status: 503 }
    );
  }
}
