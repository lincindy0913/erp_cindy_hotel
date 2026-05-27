"""
Update rental_properties with:
1. category  (湯三姐 / 公司) from Excel 付款方式
2. sort_order (sequential from Excel row order)
3. monthly_rent update for active contracts where rent changed
"""
import openpyxl, psycopg2, sys, io
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB_URL = 'postgresql://postgres:EqnGlCVFOtVhPVAvdlPcojEGKCTbVmlF@interchange.proxy.rlwy.net:33523/railway'
XLS = 'd:/erp_cindy/docs/PROPERTY.xlsx'
DRY_RUN = '--dry-run' in sys.argv

# --- Read Excel ---
wb = openpyxl.load_workbook(XLS, data_only=True)
ws = wb.active

# Headers: KEY, 序列, 房間編號, 租客姓名, 連絡電話, 繳款項目, 押金, 月租, 付款方式, 合約開始日, 合約結束日, ...

excel_props = {}  # room_name -> {category, sort_order, latest record}
sort_counter = 1

seen = set()
for row in ws.iter_rows(min_row=4, values_only=True):
    room = row[2]
    if not room or not str(room).strip():
        continue
    room = str(room).strip()
    if room in ('水費', '電費', '技師費', '百豐土木包', '源慶營造', '廣泰企業'):
        continue  # skip non-property rows
    if '房間編號' in room:
        continue

    pay_method = str(row[8] or '').strip()
    tenant = str(row[3] or '').strip()
    rent = row[7]
    end_date = row[16]
    status_excel = str(row[14] or '').strip()

    # Determine category
    if '湯三姐' in pay_method:
        category = '湯三姐'
    else:
        category = '公司'

    if room not in seen:
        seen.add(room)
        excel_props[room] = {
            'category': category,
            'sort_order': sort_counter,
            'records': [],
        }
        sort_counter += 1

    excel_props[room]['records'].append({
        'tenant': tenant,
        'rent': float(rent) if rent else None,
        'end_date': end_date,
        'status': status_excel,
        'pay_method': pay_method,
    })

print(f'Excel properties parsed: {len(excel_props)}')

# --- Connect DB ---
conn = psycopg2.connect(DB_URL)
conn.autocommit = False
cur = conn.cursor()

cur.execute('SELECT id, name, category, sort_order FROM rental_properties ORDER BY id')
db_props = {r[1]: {'id': r[0], 'category': r[2], 'sort_order': r[3]} for r in cur.fetchall()}

print(f'DB properties: {len(db_props)}')
print()

# --- Match and update ---
updates = []
no_match = []

for room_name, excel_data in excel_props.items():
    db = db_props.get(room_name)
    if not db:
        no_match.append(room_name)
        continue

    # Get latest record for this property
    latest = sorted(
        [r for r in excel_data['records'] if r['end_date']],
        key=lambda r: r['end_date'],
        reverse=True
    )
    latest = latest[0] if latest else excel_data['records'][-1]

    updates.append({
        'id': db['id'],
        'name': room_name,
        'category': excel_data['category'],
        'sort_order': excel_data['sort_order'],
        'old_category': db['category'],
        'old_sort': db['sort_order'],
        'latest_tenant': latest['tenant'],
        'latest_rent': latest['rent'],
        'latest_end': latest['end_date'],
        'status': latest['status'],
    })

print(f'Will update: {len(updates)} properties')
print(f'No match in DB: {len(no_match)} - {no_match[:10]}')
print()

if DRY_RUN:
    print('--- Preview (first 30) ---')
    for u in updates[:30]:
        cat_chg = f'{u["old_category"]} → {u["category"]}' if u["old_category"] != u["category"] else u["category"]
        so_chg = f'{u["old_sort"]} → {u["sort_order"]}' if u["old_sort"] != u["sort_order"] else str(u["sort_order"])
        print(f'  [{u["id"]:3d}] {u["name"]:28s}  cat={cat_chg:20s}  sort={so_chg:10s}  tenant={u["latest_tenant"]:10s}  rent={u["latest_rent"]}')
    conn.close()
    sys.exit(0)

# --- Apply updates ---
updated = 0
for u in updates:
    cur.execute('''
        UPDATE rental_properties
        SET category = %s, sort_order = %s, updated_at = NOW()
        WHERE id = %s
    ''', (u['category'], u['sort_order'], u['id']))
    updated += 1

conn.commit()
print(f'Updated {updated} rental_properties with category + sort_order.')

# --- Update status: sync rented/available from Excel ---
status_updates = 0
for u in updates:
    excel_status = u['status']
    if '已租' in excel_status:
        new_status = 'rented'
    elif '到期' in excel_status:
        new_status = 'available'
    else:
        continue
    cur.execute('''
        UPDATE rental_properties SET status = %s, updated_at = NOW()
        WHERE id = %s AND status != %s
    ''', (new_status, u['id'], new_status))
    if cur.rowcount:
        status_updates += 1

conn.commit()
print(f'Updated {status_updates} property statuses.')
conn.close()
print('Done.')
