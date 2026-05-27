import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
conn = psycopg2.connect('postgresql://postgres:EqnGlCVFOtVhPVAvdlPcojEGKCTbVmlF@interchange.proxy.rlwy.net:33523/railway')
cur = conn.cursor()

cur.execute('SELECT COUNT(*) FROM rental_incomes')
print('Total rental_incomes:', cur.fetchone()[0])
cur.execute('SELECT COUNT(*) FROM rental_income_payments')
print('Total payments:', cur.fetchone()[0])

cur.execute('''
    SELECT ri.income_year, ri.income_month, COUNT(*) as incomes, SUM(rip.amount)
    FROM rental_incomes ri
    JOIN rental_income_payments rip ON rip.rental_income_id = ri.id
    GROUP BY ri.income_year, ri.income_month ORDER BY 1, 2
''')
print('\nPayments by month:')
for r in cur.fetchall():
    print(f'  {r[0]}/{r[1]:02d}: {r[2]} incomes, total={r[3]:,}')

# Check for over-paid incomes
cur.execute('''
    SELECT rp.name, ri.income_year, ri.income_month, ri.expected_amount, ri.actual_amount
    FROM rental_incomes ri
    JOIN rental_properties rp ON rp.id = ri.property_id
    WHERE ri.actual_amount > ri.expected_amount * 1.2 AND ri.actual_amount > 0
    ORDER BY rp.name, ri.income_year, ri.income_month
''')
rows = cur.fetchall()
print(f'\nOver-paid incomes (actual > 120% expected): {len(rows)}')
for r in rows:
    print(f'  {r[0]} {r[1]}/{r[2]:02d}: expected={r[3]:,} actual={r[4]:,}')

cur.execute("SELECT status, COUNT(*) FROM rental_incomes GROUP BY status")
print('\nStatus summary:')
for r in cur.fetchall(): print(f'  {r[0]}: {r[1]}')

conn.close()
