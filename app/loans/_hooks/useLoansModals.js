'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';

const OWNER_TYPES = ['公司', '個人'];
const RATE_TYPES = ['固定利率', '浮動利率'];
const REPAYMENT_TYPES = ['本息攤還', '本金攤還', '到期還本', '按月付息'];
const LOAN_TYPES = ['一般貸款', '房屋貸款', '設備貸款', '週轉金', '其他'];
const LOAN_STATUSES = ['使用中', '已結清', '已停用'];

const EMPTY_LOAN_FORM = {
  loanName: '', ownerType: '公司', ownerName: '', warehouse: '',
  bankName: '', bankBranch: '', loanType: '一般貸款',
  originalAmount: '', annualRate: '', rateType: '固定利率',
  repaymentType: '本息攤還', repaymentDay: '20',
  startDate: '', endDate: '', deductAccountId: '',
  principalSubjectId: '', interestSubjectId: '',
  contactPerson: '', contactPhone: '', remark: '', sortOrder: '0',
  collateral: '', guarantor: '', guarantorPhone: '', guarantorIdNo: '',
  status: '使用中'
};

export function useLoansModals({ loans, accounts, fetchAll, fetchMonthlyRecords, monthlyYear, monthlyMonth }) {
  const { showToast } = useToast();

  // ---- Loan add/edit modal ----
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [loanForm, setLoanForm] = useState(EMPTY_LOAN_FORM);
  const [loanSaving, setLoanSaving] = useState(false);

  // ---- Confirm payment modal ----
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingRecord, setConfirmingRecord] = useState(null);
  const [confirmForm, setConfirmForm] = useState({
    actualPrincipal: '', actualInterest: '', actualDebitDate: '', statementNo: '', note: ''
  });

  // ---- Batch create modal ----
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchLoanIds, setBatchLoanIds] = useState([]);

  // ---- Quick transfer modal ----
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    sourceAccountId: '', amount: '', description: '', transactionDate: ''
  });
  const [transferTargetAccount, setTransferTargetAccount] = useState(null);
  const [transfering, setTransfering] = useState(false);

  // ---- Print modals ----
  const [showLoansPrintModal, setShowLoansPrintModal] = useState(false);
  const [showAnnualPrintModal, setShowAnnualPrintModal] = useState(false);

  // ============ LOAN MODAL ============

  function openAddLoan() {
    setEditingLoan(null);
    setLoanForm({ ...EMPTY_LOAN_FORM });
    setShowLoanModal(true);
  }

  function openEditLoan(loan) {
    setEditingLoan(loan);
    setLoanForm({
      loanName: loan.loanName, ownerType: loan.ownerType, ownerName: loan.ownerName || '',
      warehouse: loan.warehouse || '', bankName: loan.bankName, bankBranch: loan.bankBranch || '',
      loanType: loan.loanType, originalAmount: String(loan.originalAmount),
      annualRate: String(loan.annualRate), rateType: loan.rateType,
      repaymentType: loan.repaymentType, repaymentDay: String(loan.repaymentDay),
      startDate: loan.startDate, endDate: loan.endDate,
      deductAccountId: String(loan.deductAccountId),
      principalSubjectId: loan.principalSubjectId ? String(loan.principalSubjectId) : '',
      interestSubjectId: loan.interestSubjectId ? String(loan.interestSubjectId) : '',
      contactPerson: loan.contactPerson || '', contactPhone: loan.contactPhone || '',
      collateral: loan.collateral || '', guarantor: loan.guarantor || '',
      guarantorPhone: loan.guarantorPhone || '', guarantorIdNo: loan.guarantorIdNo || '',
      remark: loan.remark || '', sortOrder: String(loan.sortOrder),
      status: loan.status || '使用中'
    });
    setShowLoanModal(true);
  }

  async function saveLoan() {
    const missing = [];
    if (!loanForm.loanName) missing.push('貸款名稱');
    if (!loanForm.bankName) missing.push('銀行名稱');
    if (!loanForm.originalAmount) missing.push('貸款金額');
    if (!loanForm.startDate) missing.push('起始日');
    if (!loanForm.endDate) missing.push('到期日');
    if (!loanForm.deductAccountId) missing.push('扣款帳戶');
    if (missing.length > 0) {
      showToast(`請填寫必填欄位：${missing.join('、')}`, 'error');
      return;
    }
    setLoanSaving(true);
    try {
      const url = editingLoan ? `/api/loans/${editingLoan.id}` : '/api/loans';
      const method = editingLoan ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loanForm)
      });
      if (!res.ok) {
        const err = await res.json();
        const msg = err?.error?.message || (typeof err?.error === 'string' ? err.error : '儲存失敗');
        showToast(msg, 'error');
        return;
      }
      setShowLoanModal(false);
      fetchAll();
    } catch (e) {
      showToast('儲存失敗: ' + (e.message || '請稍後再試'), 'error');
    } finally {
      setLoanSaving(false);
    }
  }

  // ============ CONFIRM PAYMENT MODAL ============

  function openConfirmModal(record) {
    setConfirmingRecord(record);
    setConfirmForm({
      actualPrincipal: String(record.estimatedPrincipal),
      actualInterest: String(record.estimatedInterest),
      actualDebitDate: todayStr(),
      statementNo: '',
      note: record.note || ''
    });
    setShowConfirmModal(true);
  }

  async function confirmPayment() {
    if (!confirmForm.actualPrincipal || !confirmForm.actualInterest) {
      showToast('請填寫實際本金和利息', 'error');
      return;
    }
    if (parseFloat(confirmForm.actualPrincipal) < 0 || parseFloat(confirmForm.actualInterest) < 0) {
      showToast('本金與利息不可為負數', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/loans/records/${confirmingRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualPrincipal: parseFloat(confirmForm.actualPrincipal),
          actualInterest: parseFloat(confirmForm.actualInterest),
          actualDebitDate: confirmForm.actualDebitDate,
          statementNo: confirmForm.statementNo,
          note: confirmForm.note
        })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || '核實失敗', 'error');
        return;
      }
      setShowConfirmModal(false);
      fetchMonthlyRecords();
      fetchAll();
    } catch (e) {
      showToast('核實失敗: ' + e.message, 'error');
    }
  }

  // ============ BATCH CREATE MODAL ============

  function openBatchModal() {
    const activeLoans = loans.filter(l => l.status === '使用中');
    setBatchLoanIds(activeLoans.map(l => l.id));
    setShowBatchModal(true);
  }

  function toggleBatchLoan(id) {
    setBatchLoanIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function executeBatch() {
    if (batchLoanIds.length === 0) {
      showToast('請至少選擇一筆貸款', 'error');
      return;
    }
    try {
      const res = await fetch('/api/loans/records/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth, loanIds: batchLoanIds, autoPush: true })
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || '批次建立失敗', 'error');
        return;
      }
      showToast(result.message || `成功建立 ${result.created} 筆，跳過 ${result.skipped} 筆`, 'success');
      setShowBatchModal(false);
      fetchMonthlyRecords();
    } catch (e) {
      showToast('批次建立失敗: ' + e.message, 'error');
    }
  }

  // ============ TRANSFER MODAL ============

  function openTransferModal(targetAcct, suggestedAmount) {
    setTransferTargetAccount(targetAcct);
    setTransferForm({
      sourceAccountId: '',
      amount: String(Math.max(0, Math.ceil(suggestedAmount))),
      description: `貸款扣款預存 → ${targetAcct.name}`,
      transactionDate: todayStr()
    });
    setShowTransferModal(true);
  }

  function formatCurrencyLocal(val) {
    if (val === null || val === undefined) return '-';
    return Number(val).toLocaleString('zh-TW');
  }

  async function executeTransfer() {
    if (!transferForm.sourceAccountId || !transferForm.amount || !transferTargetAccount) {
      showToast('請填寫來源帳戶和金額', 'error');
      return;
    }
    if (parseInt(transferForm.sourceAccountId) === transferTargetAccount.id) {
      showToast('來源帳戶與目的帳戶不可相同', 'error');
      return;
    }
    const amount = parseFloat(transferForm.amount);
    if (amount <= 0) {
      showToast('金額必須大於零', 'error');
      return;
    }
    setTransfering(true);
    try {
      const res = await fetch('/api/cashflow/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionDate: transferForm.transactionDate,
          type: '移轉',
          accountId: parseInt(transferForm.sourceAccountId),
          transferAccountId: transferTargetAccount.id,
          amount,
          description: transferForm.description,
          sourceType: transferForm._sourceType || 'loan_predeposit',
          sourceRecordId: transferForm._sourceRecordId || null,
          hasFee: false
        })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err?.error?.message || err?.error || '移轉失敗', 'error');
        return;
      }
      showToast(`已成功移轉 ${formatCurrencyLocal(amount)} 至 ${transferTargetAccount.name}`, 'success');
      setShowTransferModal(false);
      if (transferForm._recordId) {
        try {
          await fetch(`/api/loans/records/${transferForm._recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: '已預付' })
          });
        } catch (_) { /* ignore */ }
      }
      fetchAll();
      fetchMonthlyRecords();
    } catch (e) {
      showToast('移轉失敗: ' + e.message, 'error');
    } finally {
      setTransfering(false);
    }
  }

  return {
    // Loan modal
    showLoanModal, setShowLoanModal,
    editingLoan,
    loanForm, setLoanForm,
    loanSaving,
    openAddLoan,
    openEditLoan,
    saveLoan,
    OWNER_TYPES, RATE_TYPES, REPAYMENT_TYPES, LOAN_TYPES, LOAN_STATUSES,
    // Confirm payment modal
    showConfirmModal, setShowConfirmModal,
    confirmingRecord,
    confirmForm, setConfirmForm,
    openConfirmModal,
    confirmPayment,
    // Batch modal
    showBatchModal, setShowBatchModal,
    batchLoanIds, setBatchLoanIds,
    openBatchModal,
    toggleBatchLoan,
    executeBatch,
    // Transfer modal
    showTransferModal, setShowTransferModal,
    transferForm, setTransferForm,
    transferTargetAccount,
    transfering,
    openTransferModal,
    executeTransfer,
    // Print modals
    showLoansPrintModal, setShowLoansPrintModal,
    showAnnualPrintModal, setShowAnnualPrintModal,
  };
}
