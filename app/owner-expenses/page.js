import { redirect } from 'next/navigation';

/** 業主發票私帳已整合至業主費用管理頁。 */
export default function OwnerExpensesPage() {
  redirect('/sales');
}
