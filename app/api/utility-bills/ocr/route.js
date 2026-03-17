import { NextResponse } from 'next/server';

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://ocr:5001';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: '請上傳 PDF 檔案' }, { status: 400 });
    }

    // Forward the PDF to the Python OCR service
    const ocrForm = new FormData();
    ocrForm.append('file', file);

    const ocrRes = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: 'POST',
      body: ocrForm,
    });

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
