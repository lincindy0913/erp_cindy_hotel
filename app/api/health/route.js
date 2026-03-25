import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/error-handler';

export async function GET() {
  try {
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
