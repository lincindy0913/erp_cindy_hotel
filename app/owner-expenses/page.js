'use client';

import Navigation from '@/components/Navigation';
import OwnerExpensesPanel from '@/components/owner-expenses/OwnerExpensesPanel';

/** 業主發票私帳 — 依發票抬頭每月登記一次（與發票登錄頁「業主私帳月結」分頁同一功能） */
export default function OwnerExpensesPage() {
  return (
    <div className="min-h-screen page-bg-sales">
      <Navigation borderColor="border-green-500" />
      <OwnerExpensesPanel embedded={false} nestedInLayout />
    </div>
  );
}
