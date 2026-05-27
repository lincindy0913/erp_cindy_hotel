"""
匯入 115年平和段607-1地號-工程用料支出表 到工程模組
Target tables:
  engineering_projects   → 建立 1 筆專案
  engineering_materials  → 從「黃德文工資」sheet 逐筆匯入費用明細
"""

import openpyxl
import psycopg2
from datetime import date, datetime
import sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB_URL = 'postgresql://postgres:EqnGlCVFOtVhPVAvdlPcojEGKCTbVmlF@interchange.proxy.rlwy.net:33523/railway'
XLS_PATH = 'ocr-service/115年平和段607-1地號-工程用料支出表-1150505.xlsx'

DRY_RUN = '--dry-run' in sys.argv

# ── 日期轉換：民國整數 or 字串 → 西元 'YYYY-MM-DD' ──────────────────
def roc_to_iso(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    if isinstance(val, date):
        return val.strftime('%Y-%m-%d')
    try:
        s = str(int(val)).strip()
        if len(s) == 7:                         # e.g. 1140421
            y = int(s[:3]) + 1911
            m = int(s[3:5])
            d = int(s[5:7])
            return f'{y:04d}-{m:02d}-{d:02d}'
        if len(s) == 6:                         # e.g. 114042 (missing day?)
            return None
    except Exception:
        pass
    return None

# ── 讀 Excel ─────────────────────────────────────────────────────────
wb = openpyxl.load_workbook(XLS_PATH, data_only=True)

# ── 1. 專案基本資料（從 總支出表 header 解析）────────────────────────
PROJECT = {
    'code'                  : 'ENG-115-PINGHE',
    'name'                  : '壽豐鄉平和段607-1地號新建農業設施工程',
    'client_name'           : '徐慈華',
    'location'              : '花蓮縣壽豐鄉平和段607-1地號',
    'permit_no'             : '花建執照字第113A0187號',
    'budget'                : 7_840_000,        # 合約總價 784萬
    'client_contract_amount': 7_840_000,
    'start_date'            : '2025-04-21',     # 第一筆支出日 1140421
    'status'                : '進行中',
    'note'                  : '工程造價$1,080,000，面積65.34坪，12萬/坪',
}

# ── 2. 費用明細（黃德文工資 sheet）─────────────────────────────────
ws = wb['黃德文工資']
materials = []          # list of dict → engineering_materials

last_category = None
last_vendor   = None

for row in ws.iter_rows(min_row=3, values_only=True):
    seq, date_val, category, vendor, description, amount, _ = (list(row) + [None]*7)[:7]

    # 跳過合計行 / 無金額行
    if amount is None or not isinstance(amount, (int, float)):
        continue
    if description in ('合計',) or str(description or '').startswith('合計'):
        continue
    if date_val in ('合計', None) or str(date_val or '').startswith('合計'):
        continue

    # Forward-fill 科目 / 廠商
    if category is not None and str(category).strip():
        last_category = str(category).strip()
    if vendor is not None and str(vendor).strip():
        last_vendor = str(vendor).strip()

    iso_date = roc_to_iso(date_val)

    materials.append({
        'used_at'    : iso_date,
        'description': str(description or '').strip(),
        'category'   : last_category,
        'vendor'     : last_vendor,
        'amount'     : float(amount),
        'quantity'   : 1,
        'unit_price' : float(amount),
        'note'       : f'{last_vendor or ""} / {last_category or ""}',
    })

# ── 預覽 ─────────────────────────────────────────────────────────────
print(f'\n=== 專案資料 ===')
for k, v in PROJECT.items():
    print(f'  {k}: {v}')

print(f'\n=== 費用明細（共 {len(materials)} 筆）===')
for i, m in enumerate(materials):
    print(f"  [{i+1:02d}] {m['used_at']}  {m['category']:<12} {m['vendor']:<16} {m['description'][:30]:<32} ${m['amount']:,.0f}")

if DRY_RUN:
    print('\n[DRY RUN] 不寫入資料庫')
    sys.exit(0)

# ── 寫入資料庫 ────────────────────────────────────────────────────────
print('\n正在連線資料庫...')
conn = psycopg2.connect(DB_URL)
cur  = conn.cursor()

try:
    # 檢查專案是否已存在
    cur.execute("SELECT id FROM engineering_projects WHERE code = %s", (PROJECT['code'],))
    existing = cur.fetchone()

    if existing:
        project_id = existing[0]
        print(f'專案已存在 (id={project_id})，跳過建立。')
    else:
        cur.execute("""
            INSERT INTO engineering_projects
              (code, name, client_name, location, permit_no, budget,
               client_contract_amount, start_date, status, note,
               created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
            RETURNING id
        """, (
            PROJECT['code'], PROJECT['name'], PROJECT['client_name'],
            PROJECT['location'], PROJECT['permit_no'], PROJECT['budget'],
            PROJECT['client_contract_amount'], PROJECT['start_date'],
            PROJECT['status'], PROJECT['note'],
        ))
        project_id = cur.fetchone()[0]
        print(f'✅ 建立專案 id={project_id}')

    # 匯入費用明細（清除後重新匯入）
    cur.execute("DELETE FROM engineering_materials WHERE project_id = %s", (project_id,))
    print(f'清除舊材料紀錄')

    inserted = 0
    for m in materials:
        cur.execute("""
            INSERT INTO engineering_materials
              (project_id, description, quantity, unit_price, used_at, note,
               created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,NOW(),NOW())
        """, (
            project_id,
            f"[{m['category'] or ''}] {m['description']}",
            m['quantity'],
            m['unit_price'],
            m['used_at'],
            m['note'],
        ))
        inserted += 1

    conn.commit()
    print(f'\n✅ 匯入完成！專案 id={project_id}，費用明細 {inserted} 筆')

except Exception as e:
    conn.rollback()
    print(f'❌ 錯誤：{e}')
    raise
finally:
    cur.close()
    conn.close()

print("""
══════════════════════════════════════════════════════════
缺少的資料 / 無法自動填入：
──────────────────────────────────────────────────────────
1. EngineeringContract（廠商合約）
   → 需要廠商已在「供應商」模組建立並有 supplierId
   → Excel 只有廠商名稱，無合約編號、合約日期
   → 需手動在工程模組逐筆建立合約

2. EngineeringMaterial.contractId / termId
   → 費用與哪份合約/期數連結，需手動對應

3. EngineeringMaterial.quantity & unit（數量/單位）
   → Excel 只有總金額，未記錄數量（如公噸、m³）
   → quantity 預設填 1，unitPrice = 總金額

4. 結束日期 (end_date)
   → Excel 未明確記錄工程竣工日

5. EngineeringIncome（工程收款）
   → Excel 無工程款收款紀錄（僅有支出）

6. 發票資料（進/銷項）
   → 無發票號碼，無法建立 EngineeringInputInvoice
══════════════════════════════════════════════════════════
""")
