import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { handleApiError } from '@/lib/error-handler';

function readPackageVersion() {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const v = JSON.parse(raw).version;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const pkgVersion = readPackageVersion();

    const isProd = process.env.NODE_ENV === 'production';
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      // version and environment omitted in production to reduce info exposure
      ...(!isProd && {
        version: process.env.npm_package_version || pkgVersion || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
