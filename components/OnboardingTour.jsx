'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'erp_onboarding_done';

const STEPS = [
  {
    icon: '👋',
    title: '歡迎使用 ERP 系統',
    body: '這個系統整合了採購、財務、出納、PMS收入、租屋、工程等業務。第一次使用只需要了解幾個核心概念，就能上手。',
    tip: null,
  },
  {
    icon: '🏢',
    title: '館別設定',
    body: '系統支援多館別管理。進貨、費用、PMS收入都需要指定「館別」，資料才能正確歸帳。請先確認您負責的館別名稱。',
    tip: '管理員可在「資料設定 → 系統設定」中新增館別。',
  },
  {
    icon: '💳',
    title: '付款流程：草稿 → 出納',
    body: '所有付款須經過兩個步驟：① 在「付款」頁建立付款單（草稿）並送出核准；② 到「出納」頁執行實際匯款。送出後不會自動到出納，需要手動切換頁面。',
    tip: null,
  },
  {
    icon: '📅',
    title: '月結概念',
    body: '每月底需到「月結」頁執行結帳，鎖定當月所有資料。月結前請確認進貨、費用、付款都已完成。月結後資料不可修改（除非先解鎖）。',
    tip: '遇到問題可查閱「使用說明」→「二十三、常見問題 FAQ」。',
  },
];

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage blocked (private mode etc.)
    }
  }, []);

  function finish() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setVisible(false);
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else finish();
  }

  function prev() {
    if (step > 0) setStep(s => s - 1);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-1 bg-blue-500 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="px-8 py-7">
          {/* Step indicator */}
          <p className="text-xs text-gray-400 mb-4 font-medium">
            {step + 1} / {STEPS.length}
          </p>

          {/* Icon + Title */}
          <div className="text-4xl mb-3">{current.icon}</div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">{current.title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{current.body}</p>

          {/* Tip */}
          {current.tip && (
            <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5">
              <p className="text-xs text-blue-700">💡 {current.tip}</p>
            </div>
          )}

          {/* Last step: link to manual */}
          {isLast && (
            <div className="mt-4">
              <Link
                href="/manual"
                target="_blank"
                className="text-xs text-blue-600 underline hover:text-blue-800"
                onClick={finish}
              >
                開啟完整使用說明手冊 →
              </Link>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="px-8 pb-7 flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            跳過導覽
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
              >
                上一步
              </button>
            )}
            <button
              onClick={next}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {isLast ? '開始使用' : '下一步'}
            </button>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 pb-5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-blue-500' : 'bg-gray-200'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
