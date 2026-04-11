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

  const token      = process.env.RAILWAY_API_TOKEN;
  const projectId  = process.env.RAILWAY_PROJECT_ID;
  const envId      = process.env.RAILWAY_ENVIRONMENT_ID;

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
    // Step 1: Get project + plugins info
    const projectQuery = `
      query GetProject($projectId: String!) {
        project(id: $projectId) {
          id
          name
          description
          createdAt
          updatedAt
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
          services {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `;

    let project = null;
    let postgresPlugin = null;

    if (projectId) {
      const data = await railwayQuery(projectQuery, { projectId });
      project = data?.project;

      // Find the Postgres plugin
      const plugins = project?.plugins?.edges?.map(e => e.node) || [];
      postgresPlugin = plugins.find(p =>
        p.databaseType === 'PostgreSQL' ||
        p.name?.toLowerCase().includes('postgres') ||
        p.friendlyName?.toLowerCase().includes('postgres')
      );
    }

    // Step 2: Try to get backup list for the Postgres plugin
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
        // Backup listing may not be available in all Railway plans
        backupError = err.message;
      }
    }

    // Step 3: Get latest deployment info for the app service
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
                  url
                }
              }
            }
          }
        `;
        const deployData = await railwayQuery(deployQuery, { projectId, environmentId: envId });
        latestDeployment = deployData?.deployments?.edges?.[0]?.node || null;
      } catch { /* optional */ }
    }

    const dashboardUrl = projectId
      ? `https://railway.app/project/${projectId}`
      : 'https://railway.app/dashboard';

    const backupTabUrl = postgresPlugin
      ? `https://railway.app/project/${projectId}/plugin/${postgresPlugin.id}?tab=backups`
      : dashboardUrl;

    return NextResponse.json({
      connected: true,
      project: project ? {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
      } : null,
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
