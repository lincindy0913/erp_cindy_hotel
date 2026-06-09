'use client';

import { formatNum } from '@/lib/format-utils';
import { getDueDateLabel } from './shared';

const urgencyStyles = {
  overdue: { bar: 'bg-red-500', bg: 'bg-red-50 border-red-300', dot: 'bg-red-500', text: 'text-red-700' },
  today:   { bar: 'bg-orange-500', bg: 'bg-orange-50 border-orange-300', dot: 'bg-orange-500', text: 'text-orange-700' },
  soon:    { bar: 'bg-yellow-400', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-700' },
  upcoming:{ bar: 'bg-blue-300', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-400', text: 'text-blue-600' },
  later:   { bar: 'bg-gray-200', bg: 'bg-white border-gray-100', dot: 'bg-gray-300', text: 'text-gray-500' }
};

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

export default function ScheduleTab({
  scheduleRange, setScheduleRange,
  getScheduleData,
  openClear,
}) {
  const days = getScheduleData();
  const overdueCount = days.find(d => d.date === 'overdue');
  const totalPayable = days.reduce((s, d) => s + d.payable.length, 0);
  const totalReceivable = days.reduce((s, d) => s + d.receivable.length, 0);

  return (
    <div className="space-y-4">
      {/* Controls and legend */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-base text-gray-600">顯示範圍:</span>
          <button onClick={() => setScheduleRange(7)}
            className={`px-3 py-1 text-base rounded-lg ${scheduleRange === 7 ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            7 天
          </button>
          <button onClick={() => setScheduleRange(30)}
            className={`px-3 py-1 text-base rounded-lg ${scheduleRange === 30 ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            30 天
          </button>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-red-500"></span><span className="text-gray-500">逾期</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-orange-500"></span><span className="text-gray-500">今日</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-yellow-400"></span><span className="text-gray-500">1-3 天</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-blue-300"></span><span className="text-gray-500">4-7 天</span></div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-gray-200"></span><span className="text-gray-500">7 天後</span></div>
        </div>
      </div>

      {/* Quick summary */}
      <div className="flex items-center gap-4 text-base bg-gray-50 rounded-lg px-4 py-2">
        {overdueCount && overdueCount.payable.length + overdueCount.receivable.length > 0 && (
          <span className="text-red-600 font-medium">逾期 {overdueCount.payable.length + overdueCount.receivable.length} 筆</span>
        )}
        <span className="text-gray-500">應付 {totalPayable} 筆</span>
        <span className="text-gray-500">應收 {totalReceivable} 筆</span>
      </div>

      {/* Timeline */}
      <div className="relative space-y-0">
        {days.map((day, idx) => {
          const hasData = day.payable.length > 0 || day.receivable.length > 0;
          const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
          const style = urgencyStyles[day.urgency] || urgencyStyles.later;
          const isOverdue = day.date === 'overdue';
          const isLast = idx === days.length - 1;

          return (
            <div key={day.date} className="flex">
              {/* Timeline column */}
              <div className="flex flex-col items-center w-8 flex-shrink-0">
                <div className={`w-3 h-3 rounded-full ${hasData ? style.dot : 'bg-gray-200'} ring-2 ring-white z-10`}></div>
                {!isLast && <div className="w-0.5 flex-1 bg-gray-200 min-h-[20px]"></div>}
              </div>

              {/* Content card */}
              <div className={`flex-1 mb-2 border rounded-lg overflow-hidden ${hasData ? style.bg : (isWeekend ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100')}`}>
                {hasData && <div className={`h-1 ${style.bar}`}></div>}

                <div className="flex items-center px-4 py-2 gap-4">
                  <div className="w-32 flex-shrink-0">
                    {isOverdue ? (
                      <div className="text-base font-bold text-red-600">{day.label}</div>
                    ) : (
                      <>
                        <div className={`text-base font-medium ${style.text}`}>{day.date}</div>
                        <div className="text-sm text-gray-400">({weekDays[day.dayOfWeek]}){day.urgency === 'today' ? ' 今日' : ''}</div>
                      </>
                    )}
                  </div>
                  {hasData ? (
                    <div className="flex-1 flex items-center gap-6 text-base">
                      {day.payable.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-400"></span>
                          <span className="text-red-600">應付 {day.payable.length} 筆</span>
                          <span className="font-medium text-red-700">-${formatNum(day.payableTotal)}</span>
                        </div>
                      )}
                      {day.receivable.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-400"></span>
                          <span className="text-green-600">應收 {day.receivable.length} 筆</span>
                          <span className="font-medium text-green-700">+${formatNum(day.receivableTotal)}</span>
                        </div>
                      )}
                      <div className={`ml-auto font-bold ${day.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        淨額: {day.net >= 0 ? '+' : ''}${formatNum(day.net)}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 text-sm text-gray-300">-- 無到期支票 --</div>
                  )}
                </div>

                {hasData && (
                  <div className="border-t border-gray-100 px-4 py-2">
                    <div className="space-y-1">
                      {[...day.payable, ...day.receivable].map(c => (
                        <div key={c.id} className="flex items-center gap-3 text-sm">
                          <span className={`w-1.5 h-1.5 rounded-full ${c.checkType === 'payable' ? 'bg-red-400' : 'bg-green-400'}`}></span>
                          <span className="font-mono">{c.checkNumber}</span>
                          <span className={c.checkType === 'payable' ? 'text-red-600' : 'text-green-600'}>
                            {c.checkType === 'payable' ? '應付' : '應收'}
                          </span>
                          <span className="font-medium">${formatNum(c.amount)}</span>
                          <span className="text-gray-400">{c.drawerName || c.payeeName || ''}</span>
                          <span className="text-gray-300">{c.checkType === 'payable' ? c.sourceAccount?.name : c.destinationAccount?.name}</span>
                          {isOverdue && c.dueDate && (
                            <span className="text-red-500 text-sm">{getDueDateLabel(c.dueDate)}</span>
                          )}
                          {(c.status === 'pending' || c.status === 'due') && (
                            <button onClick={() => openClear(c)}
                              className="ml-auto px-2 py-0.5 bg-green-50 text-green-700 rounded hover:bg-green-100">
                              兌現
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
