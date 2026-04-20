import { redirect } from 'next/navigation';

/** 發票私帳已併入進項發票頁同一分頁。 */
export default function OwnerExpensesPage() {
  redirect('/sales?view=privateLedger');
}
