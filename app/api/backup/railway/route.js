import { NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { PrismaClient } from '@prisma/client';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

const RAILWAY_GQL = 'https://backboard.railway.app/graphql/v2';

async function railwayQuery(query, variables = {}) {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) throw new Error('RAILWAY_API_TOKEN 未設定');

  const res = await fetch(RAILWAY_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Railway API HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.BACKUP_VIEW, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;

  const token     = process.env.RAILWAY_API_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const envId     = process.env.RAILWAY_ENVIRONMENT_ID;

  const dashboardUrl = projectId
    ? `https://railway.app/project/${projectId}`
    : 'https://railway.app/dashboard';

  // ── 1. Test DB connectivity directly ────────────────────────────────
  let dbConnected = false;
  let dbError = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch (err) {
    dbError = err?.message || '資料庫連線失敗';
  }

  // ── 2. No token configured ───────────────────────────────────────────
  if (!token) {
    return NextResponse.json({
      connected: false,
      apiWorking: false,
      reason: 'NOT_CONFIGURED',
      message: '請在 .env 中設定 RAILWAY_API_TOKEN',
      dbConnected,
      dbError,
      projectId,
      dashboardUrl,
      backupTabUrl: projectId
        ? `https://railway.app/project/${projectId}`
        : 'https://railway.app/dashboard',
    });
  }

  // ── 3. Try Railway API ───────────────────────────────────────────────
  let apiWorking = false;
  let me = null;
  let project = null;
  let latestDeployment = null;
  let apiError = null;

  try {
    const meData = await railwayQuery(`query { me { id name email } }`);
    me = meData?.me || null;
    apiWorking = !!me;
  } catch (err) {
    apiError = err.message;
  }

  if (apiWorking && projectId) {
    try {
      const data = await railwayQuery(`
        query GetProject($projectId: String!) {
          project(id: $projectId) {
            id name createdAt
          }
        }`, { projectId });
      project = data?.project || null;
    } catch { /* optional */ }

    try {
      const data = await railwayQuery(`
        query GetDeployments($projectId: String!, $environmentId: String!) {
          deployments(
            input: { projectId: $projectId, environmentId: $environmentId }
            first: 1
          ) {
            edges { node { id status createdAt updatedAt } }
          }
        }`, { projectId, environmentId: envId });
      latestDeployment = data?.deployments?.edges?.[0]?.node || null;
    } catch { /* optional */ }
  }

  const backupTabUrl = projectId
    ? `https://railway.app/project/${projectId}`
    : 'https://railway.app/dashboard';

  return NextResponse.json({
    connected: true,
    apiWorking,
    apiError,
    me,
    project,
    projectId,
    projectIdAvailable: !!projectId,
    dbConnected,
    dbError,
    latestDeployment,
    dashboardUrl,
    backupTabUrl,
    // Backups must be viewed directly on Railway dashboard
    // (Railway API backup listing requires paid plan + specific scopes)
    backupNote: 'Railway 備份紀錄需在 Railway Dashboard 查看',
  });
}
