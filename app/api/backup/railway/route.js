import { NextResponse } from 'next/server';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

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
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Railway API 回應異常: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

// ── GET: fetch Railway project info + Postgres plugin + backups ──────
export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.BACKUP_VIEW, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;

  const token     = process.env.RAILWAY_API_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;
  const envId     = process.env.RAILWAY_ENVIRONMENT_ID;

  // Not configured
  if (!token) {
    return NextResponse.json({
      connected: false,
      reason: 'NOT_CONFIGURED',
      message: '請在 Railway 專案的 Variables 中設定 RAILWAY_API_TOKEN',
      setupUrl: 'https://railway.app/account/tokens',
      dashboardUrl: projectId ? `https://railway.app/project/${projectId}` : 'https://railway.app',
    });
  }

  try {
    // Step 1: Verify token works with a simple "me" query (no projectId needed)
    const meQuery = `query { me { id name email } }`;
    const meData = await railwayQuery(meQuery);
    const me = meData?.me;

    let project = null;
    let postgresPlugin = null;

    // Step 2: Get project info only if projectId is available
    if (projectId) {
      try {
        const projectQuery = `
          query GetProject($projectId: String!) {
            project(id: $projectId) {
              id
              name
              createdAt
              plugins {
                edges {
                  node {
                    id
                    name
                    friendlyName
                    status
                    databaseType
                  }
                }
              }
            }
          }
        `;
        const data = await railwayQuery(projectQuery, { projectId });
        project = data?.project;

        const plugins = project?.plugins?.edges?.map(e => e.node) || [];
        postgresPlugin = plugins.find(p =>
          p.databaseType === 'PostgreSQL' ||
          p.name?.toLowerCase().includes('postgres') ||
          p.friendlyName?.toLowerCase().includes('postgres')
        );
      } catch (err) {
        // project query failed — continue with what we have
        console.warn('Railway project query failed:', err.message);
      }
    }

    // Step 3: Try backup listing (only if we found the plugin)
    let backups = [];
    let backupError = null;

    if (postgresPlugin && projectId) {
      try {
        const backupQuery = `
          query GetBackups($pluginId: String!, $projectId: String!) {
            backupsByPlugin(pluginId: $pluginId, projectId: $projectId) {
              id
              status
              createdAt
              size
              restoreUrl
            }
          }
        `;
        const backupData = await railwayQuery(backupQuery, {
          pluginId: postgresPlugin.id,
          projectId,
        });
        backups = backupData?.backupsByPlugin || [];
      } catch (err) {
        backupError = err.message;
      }
    }

    // Step 4: Latest deployment (optional)
    let latestDeployment = null;
    if (projectId && envId) {
      try {
        const deployQuery = `
          query GetDeployments($projectId: String!, $environmentId: String!) {
            deployments(
              input: { projectId: $projectId, environmentId: $environmentId }
              first: 1
            ) {
              edges {
                node {
                  id
                  status
                  createdAt
                  updatedAt
                }
              }
            }
          }
        `;
        const deployData = await railwayQuery(deployQuery, { projectId, environmentId: envId });
        latestDeployment = deployData?.deployments?.edges?.[0]?.node || null;
      } catch { /* optional — skip silently */ }
    }

    const dashboardUrl = projectId
      ? `https://railway.app/project/${projectId}`
      : 'https://railway.app/dashboard';

    const backupTabUrl = postgresPlugin && projectId
      ? `https://railway.app/project/${projectId}/plugin/${postgresPlugin.id}?tab=backups`
      : dashboardUrl;

    return NextResponse.json({
      connected: true,
      me: me ? { id: me.id, name: me.name, email: me.email } : null,
      project: project ? { id: project.id, name: project.name, createdAt: project.createdAt } : null,
      projectIdAvailable: !!projectId,
      postgresPlugin: postgresPlugin ? {
        id: postgresPlugin.id,
        name: postgresPlugin.friendlyName || postgresPlugin.name,
        status: postgresPlugin.status,
        databaseType: postgresPlugin.databaseType,
      } : null,
      backups,
      backupError,
      latestDeployment,
      dashboardUrl,
      backupTabUrl,
    });

  } catch (err) {
    return NextResponse.json({
      connected: false,
      reason: 'API_ERROR',
      message: err.message,
      dashboardUrl: projectId ? `https://railway.app/project/${projectId}` : 'https://railway.app',
    });
  }
}
