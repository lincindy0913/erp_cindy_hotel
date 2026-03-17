import { NextResponse } from 'next/server';

export const maxDuration = 300; // 5 minutes for AI inference

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://ocr:5001';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const billType = formData.get('bill_type') || '電費';
    const page = formData.get('page') || '0';

    if (!file) {
      return NextResponse.json({ error: '請上傳 PDF 檔案' }, { status: 400 });
    }

    const ocrForm = new FormData();
    ocrForm.append('file', file);
    ocrForm.append('bill_type', billType);
    ocrForm.append('page', page);

    const ocrRes = await fetch(
      `${OCR_SERVICE_URL}/ocr?bill_type=${encodeURIComponent(billType)}&page=${page}`,
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
