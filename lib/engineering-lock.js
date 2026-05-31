/**
 * 工程專案鎖定檢查
 *
 * 當專案 status = '已結案' 時，所有寫入操作均被封鎖。
 *
 * Usage:
 *   await assertEngineeringProjectOpen(projectId);
 */
import prisma from '@/lib/prisma';

export async function assertEngineeringProjectOpen(projectId) {
  if (!projectId) return;
  const project = await prisma.engineeringProject.findUnique({
    where: { id: parseInt(projectId) },
    select: { id: true, name: true, status: true },
  });
  if (!project) {
    const err = new Error('找不到工程專案');
    err.statusCode = 404;
    throw err;
  }
  if (project.status === '已結案') {
    const err = new Error(`ENGINEERING_LOCKED:「${project.name}」已結案，資料不可修改`);
    err.statusCode = 423;
    throw err;
  }
}
