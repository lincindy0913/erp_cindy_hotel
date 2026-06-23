'use client';

import Navigation from '@/components/Navigation';
import ModuleGuideCard from '@/components/ModuleGuideCard';
import OwnerExpensesPanel from '@/components/owner-expenses/OwnerExpensesPanel';

/** 業主發票私帳 — 依發票抬頭每月登記一次（與發票登錄頁「業主私帳月結」分頁同一功能） */
export default function OwnerExpensesPage() {
  return (
    <div className="min-h-screen page-bg-sales">
      <Navigation borderColor="border-green-500" />
      <div className="max-w-screen-xl mx-auto px-4 pt-4">
        <ModuleGuideCard
          title="業主私帳流程指引"
          color="blue"
          storageKey="guide-owner-expenses"
          steps={[
            { label: '選擇業主與月份', desc: '依發票抬頭（業主）選擇對應月份的帳期' },
            { label: '登記私帳發票', desc: '將屬於業主個人的費用發票登記到私帳中' },
            { label: '月結確認', desc: '月底核對無誤後執行月結，鎖定該期間記錄' },
          ]}
        />
      </div>
      <OwnerExpensesPanel embedded={false} nestedInLayout />
    </div>
  );
}
