import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET - RTO/RPO compliance dashboard
// Returns current compliance status, drill history trends, and actionable recommendations
export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.BACKUP_VIEW, PERMISSIONS.SETTINGS_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const [config, latestBackup, recentDrills, latestByTier] = await Promise.all([
      prisma.backupConfig.findFirst({ orderBy: { id: 'asc' } }),
      prisma.backupRecord.findFirst({
        where: { status: { in: ['completed', 'verified'] } },
        orderBy: { completedAt: 'desc' },
      }),
      prisma.restoreDrill.findMany({
        where: { status: { in: ['passed', 'failed'] } },
        orderBy: { startedAt: 'desc' },
        take: 30,
        include: {
          backup: { select: { id: true, tier: true, completedAt: true } },
        },
      }),
      Promise.all([
        prisma.backupRecord.findFirst({ where: { tier: 'tier1_full', status: { in: ['completed', 'verified'] } }, orderBy: { completedAt: 'desc' } }),
        prisma.backupRecord.findFirst({ where: { tier: 'tier2_snapshot', status: { in: ['completed', 'verified'] } }, orderBy: { completedAt: 'desc' } }),
      ]),
    ]);

    const rtoTarget = config?.rtoTargetMinutes || 60;
    const rpoTarget = config?.rpoTargetHours || 24;
    const drillFreq = config?.drillFrequencyDays || 7;
    const drillEnabled = config?.drillEnabled !== false;

    const now = Date.now();

    // ── Current RPO (based on latest backup age) ──
    let currentRpoMinutes = null;
    let currentRpoCompliant = false;
    if (latestBackup?.completedAt) {
      currentRpoMinutes = Math.round((now - new Date(latestBackup.completedAt).getTime()) / 60000);
      currentRpoCompliant = currentRpoMinutes <= rpoTarget * 60;
    }

    // ── RPO per tier ──
    const [tier1Backup, tier2Backup] = latestByTier;
    const tierRpo = {
      tier1_full: tier1Backup?.completedAt
        ? Math.round((now - new Date(tier1Backup.completedAt).getTime()) / 60000)
        : null,
      tier2_snapshot: tier2Backup?.completedAt
        ? Math.round((now - new Date(tier2Backup.completedAt).getTime()) / 60000)
        : null,
    };

    // ── Drill compliance ──
    const lastDrill = recentDrills[0] || null;
    const daysSinceLastDrill = lastDrill?.startedAt
      ? Math.floor((now - new Date(lastDrill.startedAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const drillOverdue = daysSinceLastDrill == null || daysSinceLastDrill >= drillFreq;
    const nextDrillDue = lastDrill?.startedAt
      ? new Date(new Date(lastDrill.startedAt).getTime() + drillFreq * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // ── Trend: last 30 drills ──
    const passCount = recentDrills.filter(d => d.status === 'passed').length;
    const rtoPassCount = recentDrills.filter(d => d.rtoCompliant === true).length;
    const rpoPassCount = recentDrills.filter(d => d.rpoCompliant === true).length;
    const avgRestoreMs = recentDrills.filter(d => d.restoreDurationMs != null).length > 0
      ? Math.round(recentDrills.filter(d => d.restoreDurationMs != null).reduce((s, d) => s + d.restoreDurationMs, 0) / recentDrills.filter(d => d.restoreDurationMs != null).length)
      : null;
    const maxRestoreMs = recentDrills.filter(d => d.restoreDurationMs != null).length > 0
      ? Math.max(...recentDrills.filter(d => d.restoreDurationMs != null).map(d => d.restoreDurationMs))
      : null;

    // ── Overall health score (0-100) ──
    let healthScore = 0;
    const healthFactors = [];

    // Factor 1: Recent drill pass rate (40 points)
    if (recentDrills.length > 0) {
      const drillPassRate = passCount / recentDrills.length;
      const drillPoints = Math.round(drillPassRate * 40);
      healthScore += drillPoints;
      healthFactors.push({ factor: '演練通過率', score: drillPoints, max: 40, detail: `${passCount}/${recentDrills.length}` });
    } else {
      healthFactors.push({ factor: '演練通過率', score: 0, max: 40, detail: '尚無演練紀錄' });
    }

    // Factor 2: Current RPO compliance (25 points)
    if (currentRpoCompliant) {
      healthScore += 25;
      healthFactors.push({ factor: 'RPO 合規', score: 25, max: 25, detail: `${formatMinutes(currentRpoMinutes)} < ${rpoTarget}h 目標` });
    } else if (currentRpoMinutes != null) {
      healthFactors.push({ factor: 'RPO 合規', score: 0, max: 25, detail: `${formatMinutes(currentRpoMinutes)} > ${rpoTarget}h 目標` });
    } else {
      healthFactors.push({ factor: 'RPO 合規', score: 0, max: 25, detail: '無可用備份' });
    }

    // Factor 3: RTO compliance from drills (25 points)
    if (recentDrills.length > 0) {
      const rtoRate = rtoPassCount / recentDrills.length;
      const rtoPoints = Math.round(rtoRate * 25);
      healthScore += rtoPoints;
      healthFactors.push({ factor: 'RTO 合規', score: rtoPoints, max: 25, detail: `${rtoPassCount}/${recentDrills.length}` });
    } else {
      healthFactors.push({ factor: 'RTO 合規', score: 0, max: 25, detail: '尚無演練紀錄' });
    }

    // Factor 4: Drill freshness (10 points)
    if (!drillOverdue) {
      healthScore += 10;
      healthFactors.push({ factor: '演練頻率', score: 10, max: 10, detail: `${daysSinceLastDrill} 天前` });
    } else {
      healthFactors.push({ factor: '演練頻率', score: 0, max: 10, detail: drillOverdue ? '已逾期' : '未知' });
    }

    // ── Recommendations ──
    const recommendations = [];
    if (!latestBackup) {
      recommendations.push({ level: 'critical', message: '系統尚無任何成功備份，請立即執行備份' });
    }
    if (drillOverdue) {
      recommendations.push({ level: 'warning', message: `還原演練已逾期（上次: ${daysSinceLastDrill != null ? daysSinceLastDrill + ' 天前' : '從未執行'}，頻率目標: 每 ${drillFreq} 天）` });
    }
    if (!currentRpoCompliant && currentRpoMinutes != null) {
      recommendations.push({ level: 'warning', message: `目前 RPO 超標: 最近備份距今 ${formatMinutes(currentRpoMinutes)}，超過 ${rpoTarget} 小時目標` });
    }
    if (avgRestoreMs != null && avgRestoreMs > rtoTarget * 60 * 1000) {
      recommendations.push({ level: 'warning', message: `平均還原時間 ${formatMs(avgRestoreMs)} 超過 RTO 目標 ${rtoTarget} 分鐘` });
    }
    if (!drillEnabled) {
      recommendations.push({ level: 'info', message: '定期還原演練已停用，建議啟用以確保備份可還原性' });
    }
    if (recentDrills.length === 0) {
      recommendations.push({ level: 'critical', message: '從未執行還原演練，無法確認備份是否可還原' });
    }
    if (passCount < recentDrills.length && recentDrills.length > 0) {
      const failRate = ((recentDrills.length - passCount) / recentDrills.length * 100).toFixed(0);
      recommendations.push({ level: 'warning', message: `近期演練失敗率 ${failRate}%，請檢查備份流程` });
    }

    return NextResponse.json({
      healthScore,
      healthGrade: healthScore >= 80 ? 'A' : healthScore >= 60 ? 'B' : healthScore >= 40 ? 'C' : 'D',
      healthFactors,
      targets: {
        rtoTargetMinutes: rtoTarget,
        rpoTargetHours: rpoTarget,
        drillFrequencyDays: drillFreq,
        drillEnabled,
      },
      currentStatus: {
        rpoMinutes: currentRpoMinutes,
        rpoFormatted: currentRpoMinutes != null ? formatMinutes(currentRpoMinutes) : null,
        rpoCompliant: currentRpoCompliant,
        tierRpo: {
          tier1_full: tierRpo.tier1_full != null ? formatMinutes(tierRpo.tier1_full) : null,
          tier2_snapshot: tierRpo.tier2_snapshot != null ? formatMinutes(tierRpo.tier2_snapshot) : null,
        },
        latestBackupAt: latestBackup?.completedAt?.toISOString() || null,
        latestBackupTier: latestBackup?.tier || null,
      },
      drillStatus: {
        lastDrillAt: lastDrill?.startedAt?.toISOString() || null,
        lastDrillStatus: lastDrill?.status || null,
        lastRtoCompliant: lastDrill?.rtoCompliant ?? null,
        lastRpoCompliant: lastDrill?.rpoCompliant ?? null,
        lastRestoreMs: lastDrill?.restoreDurationMs ?? null,
        lastRestoreFormatted: lastDrill?.restoreDurationMs != null ? formatMs(lastDrill.restoreDurationMs) : null,
        daysSinceLastDrill,
        drillOverdue,
        nextDrillDue,
      },
      trend: {
        totalDrills: recentDrills.length,
        passRate: recentDrills.length > 0 ? `${passCount}/${recentDrills.length}` : null,
        rtoPassRate: recentDrills.length > 0 ? `${rtoPassCount}/${recentDrills.length}` : null,
        rpoPassRate: recentDrills.length > 0 ? `${rpoPassCount}/${recentDrills.length}` : null,
        avgRestoreMs,
        avgRestoreFormatted: avgRestoreMs != null ? formatMs(avgRestoreMs) : null,
        maxRestoreMs,
        maxRestoreFormatted: maxRestoreMs != null ? formatMs(maxRestoreMs) : null,
      },
      recommendations,
    });
  } catch (error) {
    return handleApiError(error, '/api/backup/rto-rpo-status');
  }
}

function formatMinutes(mins) {
  if (mins == null) return '-';
  if (mins < 60) return `${mins} 分鐘`;
  const h = (mins / 60).toFixed(1);
  return `${h} 小時`;
}

function formatMs(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)} 分鐘`;
}
