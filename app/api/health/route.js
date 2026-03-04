import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/error-handler';

export async function GET() {
  try {
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
