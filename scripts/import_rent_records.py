"""
Import rent records from Excel into rental_income_payments (and rental_incomes).
Source: docs/operational-excellence/rent record.xls
Target: Railway PostgreSQL DB

Key logic for income month:
- If billing_start is unique per property (no repeat), use billing_start.month directly.
- If billing_start repeats for the same property, each row covers the NEXT month(s).
  Sequential offset is computed from cumulative months covered by prior rows.
- If no billing_start, fall back to pay_date.month.
"""
import xlrd
import psycopg2
from datetime import date
from collections import defaultdict
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB_URL = 'postgresql://postgres:EqnGlCVFOtVhPVAvdlPcojEGKCTbVmlF@interchange.proxy.rlwy.net:33523/railway'
XLS_PATH = 'd:/erp_cindy/docs/operational-excellence/rent record.xls'

DRY_RUN = '--dry-run' in sys.argv

PROP_ALIAS = {
    '停車場1(丼物園)羅紘程': '停車位1(丼物園)',
    '停車場2(BNX-8989)謝雯萍': '停車位2(BNX-8989)',
    '停車場3(8W-3799)鄢品洋': '停車位3(8W-3799)',
}

def excel_date(val):
    if not val or val == '':
        return None
    try:
        t = xlrd.xldate_as_tuple(float(val), 0)
        return date(t[0], t[1], t[2]) if t[0] > 0 else None
    except Exception:
        return None

def add_months(d, n):
    """Add n months to date d, returning (year, month)."""
    m = d.month - 1 + n
    return (d.year + m // 12, m % 12 + 1)

def count_months_in_period(period_str):
    """Return how many income months this period string covers."""
    rp = str(period_str).strip()
    if '.' in rp:
        return len(rp.split('.'))
    if '-' in rp and not rp.startswith('-'):
        parts = rp.split('-')
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            return int(parts[1]) - int(parts[0]) + 1
    return 1

def make_months_from_base(base_year, base_month, period_str):
    """Return list of (year, month) starting at base, using period_str pattern."""
    rp = str(period_str).strip()
    if '.' in rp:
        count = len(rp.split('.'))
        return [add_months(date(base_year, base_month, 1), i) for i in range(count)]
    if '-' in rp and not rp.startswith('-'):
        parts = rp.split('-')
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            count = int(parts[1]) - int(parts[0]) + 1
            return [add_months(date(base_year, base_month, 1), i) for i in range(max(1, count))]
    return [(base_year, base_month)]

def find_contract(contracts_by_prop, prop_id, income_year, income_month):
    month_start = date(income_year, income_month, 1)
    if income_month == 12:
        month_end = date(income_year + 1, 1, 1)
    else:
        month_end = date(income_year, income_month + 1, 1)

    candidates = contracts_by_prop.get(prop_id, [])
    for c in candidates:
        cs, ce = c['start_date'], c['end_date']
        if cs and ce and cs <= month_end and ce >= month_start:
            return c
    if candidates:
        return sorted(candidates, key=lambda x: x['start_date'] or date(1900, 1, 1))[-1]
    return None

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Load properties
    cur.execute('SELECT id, name FROM rental_properties')
    prop_map = {r[1]: r[0] for r in cur.fetchall()}

    # Load contracts
    cur.execute('''
        SELECT id, property_id, tenant_id, start_date, end_date,
               monthly_rent, rent_account_id, payment_due_day, preferred_pay_method
        FROM rental_contracts ORDER BY id
    ''')
    contracts_by_prop = {}
    for row in cur.fetchall():
        cid, pid, tid, sd, ed, rent, acct, due_day, pay_method = row
        try:
            sd_d = date.fromisoformat(sd) if sd else None
            ed_d = date.fromisoformat(ed) if ed else None
        except Exception:
            sd_d = ed_d = None
        c = {
            'id': cid, 'property_id': pid, 'tenant_id': tid,
            'start_date': sd_d, 'end_date': ed_d,
            'monthly_rent': float(rent) if rent else 0,
            'rent_account_id': acct, 'payment_due_day': due_day or 5,
            'preferred_pay_method': pay_method,
        }
        contracts_by_prop.setdefault(pid, []).append(c)

    # --- Pass 1: read all valid Excel rows into raw_rows ---
    wb = xlrd.open_workbook(XLS_PATH, encoding_override='cp950')
    ws = wb.sheet_by_index(0)

    raw_rows = []  # (excel_row, prop_id, prop_name, pay_date, amount, period_str, billing_start, note, pay_method_raw)

    for r in range(2, ws.nrows):
        row = [ws.cell_value(r, c) for c in range(ws.ncols)]
        prop_name_raw = str(row[1]).strip()
        tenant_name = str(row[2]).strip()
        item_type = str(row[5]).strip()
        if item_type != '月租':
            continue
        if not prop_name_raw or '空房' in tenant_name:
            continue

        pay_date = excel_date(row[3])
        if not pay_date:
            continue

        try:
            amount = float(row[4])
        except Exception:
            continue
        if amount <= 0:
            continue

        prop_name = PROP_ALIAS.get(prop_name_raw, prop_name_raw)
        prop_id = prop_map.get(prop_name)
        if not prop_id:
            continue

        billing_start = excel_date(row[7])
        period_str = str(row[6]).strip()
        note = str(row[9]).strip()
        pay_method_raw = str(row[10]).strip()

        raw_rows.append((r, prop_id, prop_name, pay_date, amount, period_str, billing_start, note, pay_method_raw))

    # --- Pass 2: compute income months using sequential offset for repeated billing_start ---
    # Group by (prop_id, billing_start) to detect repeats
    # For each group: sort by pay_date, assign sequential month offsets
    # For no billing_start: use pay_date.month directly

    # First, separate rows with and without billing_start
    has_bs = [(r, pid, pname, pd, amt, ps, bs, note, pm)
              for (r, pid, pname, pd, amt, ps, bs, note, pm) in raw_rows if bs is not None]
    no_bs = [(r, pid, pname, pd, amt, ps, bs, note, pm)
             for (r, pid, pname, pd, amt, ps, bs, note, pm) in raw_rows if bs is None]

    # Group has_bs by (prop_id, billing_start)
    bs_groups = defaultdict(list)
    for row_data in has_bs:
        r, pid, pname, pd, amt, ps, bs, note, pm = row_data
        bs_groups[(pid, bs)].append(row_data)

    # Sort each group by pay_date
    for key in bs_groups:
        bs_groups[key].sort(key=lambda x: x[3])  # sort by pay_date

    # Build final records list
    records = []
    skipped = []

    # Process has_bs groups: assign sequential months
    for (pid, bs), group in bs_groups.items():
        month_offset = 0
        for row_data in group:
            r, _pid, pname, pd, amt, ps, _bs, note, pm = row_data
            base_y, base_m = add_months(bs, month_offset)
            months = make_months_from_base(base_y, base_m, ps)
            months_count = count_months_in_period(ps)
            month_offset += months_count

            for (inc_year, inc_month) in months:
                contract = find_contract(contracts_by_prop, pid, inc_year, inc_month)
                if not contract:
                    skipped.append((r, f'no contract for prop={pname} {inc_year}/{inc_month}'))
                    continue
                records.append({
                    'row': r, 'prop_name': pname, 'prop_id': pid,
                    'contract_id': contract['id'], 'tenant_id': contract['tenant_id'],
                    'inc_year': inc_year, 'inc_month': inc_month,
                    'pay_date': pd, 'amount': amt,
                    'account_id': contract['rent_account_id'],
                    'expected_amount': contract['monthly_rent'],
                    'payment_due_day': contract['payment_due_day'],
                    'pay_method': contract['preferred_pay_method'] or pm or '現金',
                    'note': note,
                })

    # Process no_bs rows: use pay_date.month
    for row_data in no_bs:
        r, pid, pname, pd, amt, ps, bs, note, pm = row_data
        inc_year, inc_month = pd.year, pd.month
        contract = find_contract(contracts_by_prop, pid, inc_year, inc_month)
        if not contract:
            skipped.append((r, f'no contract for prop={pname} {inc_year}/{inc_month}'))
            continue
        records.append({
            'row': r, 'prop_name': pname, 'prop_id': pid,
            'contract_id': contract['id'], 'tenant_id': contract['tenant_id'],
            'inc_year': inc_year, 'inc_month': inc_month,
            'pay_date': pd, 'amount': amt,
            'account_id': contract['rent_account_id'],
            'expected_amount': contract['monthly_rent'],
            'payment_due_day': contract['payment_due_day'],
            'pay_method': contract['preferred_pay_method'] or pm or '現金',
            'note': note,
        })

    print(f'Records to import: {len(records)}')
    print(f'Skipped: {len(skipped)}')
    for s in skipped:
        print(f'  row {s[0]}: {s[1]}')

    if DRY_RUN:
        print('\n--- DRY RUN: monthly summary ---')
        by_month = defaultdict(lambda: {'count': 0, 'total': 0, 'props': set()})
        for rec in records:
            key = f"{rec['inc_year']}/{rec['inc_month']:02d}"
            by_month[key]['count'] += 1
            by_month[key]['total'] += rec['amount']
            by_month[key]['props'].add(rec['prop_name'])
        for k in sorted(by_month.keys()):
            v = by_month[k]
            print(f"  {k}: {v['count']} payments, total={v['total']:,.0f}")

        print('\n--- DRY RUN: first 20 records ---')
        for rec in records[:20]:
            print(f"  prop={rec['prop_name']} contract={rec['contract_id']} "
                  f"{rec['inc_year']}/{rec['inc_month']:02d} "
                  f"pay={rec['pay_date']} amt={rec['amount']:,.0f}")
        conn.close()
        return

    # Group by (contract_id, inc_year, inc_month) for DB insert
    groups = defaultdict(list)
    for rec in records:
        key = (rec['contract_id'], rec['inc_year'], rec['inc_month'])
        groups[key].append(rec)

    print(f'Income groups: {len(groups)}')
    print('Inserting...')

    income_inserted = 0
    income_skipped = 0
    payment_inserted = 0

    try:
        for (contract_id, inc_year, inc_month), recs in groups.items():
            r0 = recs[0]
            due_day = min(r0['payment_due_day'], 28)
            due_date = f"{inc_year}-{inc_month:02d}-{due_day:02d}"
            expected = r0['expected_amount']

            cur.execute('''
                INSERT INTO rental_incomes
                    (contract_id, property_id, tenant_id, income_year, income_month,
                     due_date, expected_amount, actual_amount, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 0, 'pending', NOW())
                ON CONFLICT (contract_id, income_year, income_month) DO NOTHING
                RETURNING id
            ''', (contract_id, r0['prop_id'], r0['tenant_id'],
                  inc_year, inc_month, due_date, expected))
            row = cur.fetchone()
            if row:
                income_id = row[0]
                income_inserted += 1
            else:
                cur.execute('''
                    SELECT id FROM rental_incomes
                    WHERE contract_id=%s AND income_year=%s AND income_month=%s
                ''', (contract_id, inc_year, inc_month))
                income_id = cur.fetchone()[0]
                income_skipped += 1

            cur.execute('SELECT COALESCE(MAX(sequence_no), 0) FROM rental_income_payments WHERE rental_income_id=%s', (income_id,))
            seq = cur.fetchone()[0]

            for rec in recs:
                seq += 1
                cur.execute('''
                    INSERT INTO rental_income_payments
                        (rental_income_id, sequence_no, amount, payment_date,
                         account_id, payment_method, match_note)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                ''', (income_id, seq, rec['amount'],
                      rec['pay_date'].isoformat(),
                      rec['account_id'], rec['pay_method'],
                      rec['note'] or None))
                payment_inserted += 1

            cur.execute('SELECT COALESCE(SUM(amount), 0) FROM rental_income_payments WHERE rental_income_id=%s', (income_id,))
            total_paid = float(cur.fetchone()[0])
            if total_paid >= expected:
                new_status = 'paid'
            elif total_paid > 0:
                new_status = 'partial'
            else:
                new_status = 'pending'

            cur.execute('''
                UPDATE rental_incomes
                SET actual_amount=%s, status=%s, updated_at=NOW()
                WHERE id=%s
            ''', (total_paid, new_status, income_id))

        conn.commit()
        print(f'\nDone!')
        print(f'  rental_incomes inserted: {income_inserted}')
        print(f'  rental_incomes already existed: {income_skipped}')
        print(f'  rental_income_payments inserted: {payment_inserted}')

    except Exception as e:
        conn.rollback()
        print(f'\nERROR: {e}')
        import traceback
        traceback.print_exc()
        raise
    finally:
        conn.close()

if __name__ == '__main__':
    main()
