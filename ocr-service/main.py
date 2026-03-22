import os
import re
import base64
import traceback
import httpx
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_VISION_API_KEY = os.environ.get("GOOGLE_VISION_API_KEY", "")
GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


# ─────────────────────────────────────────────────────────────
# PDF page → base64 PNG via PyMuPDF
# ─────────────────────────────────────────────────────────────
def pdf_page_to_base64(pdf_bytes: bytes, page_num: int, dpi: int = 200) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img_bytes = pix.tobytes("png")
    doc.close()
    return base64.b64encode(img_bytes).decode("utf-8")


# ─────────────────────────────────────────────────────────────
# Call Google Vision API → return full text
# ─────────────────────────────────────────────────────────────
async def google_vision_ocr(img_b64: str) -> str:
    if not GOOGLE_VISION_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_VISION_API_KEY 未設定，請在環境變數中加入")

    payload = {
        "requests": [{
            "image": {"content": img_b64},
            "features": [{"type": "DOCUMENT_TEXT_DETECTION"}]
        }]
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{GOOGLE_VISION_URL}?key={GOOGLE_VISION_API_KEY}",
            json=payload,
        )
        resp.raise_for_status()

    responses = resp.json().get("responses", [])
    if not responses:
        return ""
    return responses[0].get("fullTextAnnotation", {}).get("text", "")


# ─────────────────────────────────────────────────────────────
# Field parsers
# ─────────────────────────────────────────────────────────────
def parse_electricity_page(text: str, page_num: int, billing_period: str = None) -> dict:
    result = {
        "館別": "麗軒",
        "類型": "電費",
        "繳費期限": None,
        "地址": None,
        "電號": None,
        "尖峰度數": None,
        "半尖峰度數": None,
        "離峰度數": None,
        "使用度數": None,
        "電費金額": None,
        "應繳稅額": None,
        "應繳總金額": None,
        "_page": page_num,
    }

    # Edge case: no usage this period
    if "本期沒有" in text or "本期無用電" in text:
        result.update({"使用度數": "0", "尖峰度數": "0", "半尖峰度數": "0", "離峰度數": "0",
                       "電費金額": "0", "應繳稅額": "0", "應繳總金額": "0"})

    def clean_amount(v):
        """Remove commas and parse decimal amounts like 15068.0 → 15068"""
        if v is None:
            return None
        v = v.replace(",", "").strip()
        try:
            return str(int(float(v)))
        except Exception:
            return v

    # 繳費期限 Due Date — value is on the NEXT line after "繳費期限 Due Date"
    # Format: "繳費期限 Due Date\n113/04/22"
    m = re.search(r'繳費期限\s*Due\s*Date\s*\n\s*(\d{3}/\d{2}/\d{2})', text, re.IGNORECASE)
    if not m:
        # fallback: value on same line or after colon
        m = re.search(r'繳費期限[^0-9\n]*(\d{3}/\d{2}/\d{2})', text)
    result["繳費期限"] = m.group(1).strip() if m else "未辨識"

    # 地址 — "用電地址:花蓮縣..." value on same line
    m = re.search(r'用電地址[：:]\s*(.+?)(?=\n|$)', text)
    if not m:
        m = re.search(r'(?:裝設地址|地址)[：:]\s*(.+?)(?=\n|$)', text)
    result["地址"] = m.group(1).strip() if m else "未辨識"

    # 電號 (format: DD-DD-DDDD-DD-D)
    m = re.search(r'(\d{2}-\d{2}-\d{4}-\d{2}-\d)', text)
    if not m:
        m = re.search(r'電號[：:\s]*([0-9\-]{8,20})', text)
    result["電號"] = m.group(1).strip() if m else "未辨識"

    # 尖峰度數 — try multiple label formats
    if not result["尖峰度數"]:
        m = re.search(r'經常[\(（]尖峰[\)）]度數\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'經常[\(（]尖峰[\)）]度數\s+([\d,]+)', text)
        if not m:
            # Plain "尖峰度數" without 經常 prefix (but not 半尖峰度數)
            m = re.search(r'(?<!半)尖峰度數\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'(?<!半)尖峰度數\s+([\d,]+)', text)
        if not m:
            # Table format: label "尖峰" alone at line start
            m = re.search(r'(?m)^尖峰\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'(?m)^尖峰\s+([\d,]+)', text)
        if not m:
            m = re.search(r'尖峰電能\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'尖峰電能\s+([\d,]+)', text)
        result["尖峰度數"] = m.group(1).replace(",", "") if m else "0"

    # 半尖峰度數 — try multiple label formats
    if not result["半尖峰度數"]:
        m = re.search(r'週六半尖峰度數\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'週六半尖峰度數\s+([\d,]+)', text)
        if not m:
            m = re.search(r'半尖峰度數\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'半尖峰度數\s+([\d,]+)', text)
        if not m:
            m = re.search(r'(?m)^半尖峰\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'(?m)^半尖峰\s+([\d,]+)', text)
        if not m:
            m = re.search(r'半尖峰電能\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'半尖峰電能\s+([\d,]+)', text)
        result["半尖峰度數"] = m.group(1).replace(",", "") if m else "0"

    # 離峰度數 — try multiple label formats
    if not result["離峰度數"]:
        m = re.search(r'離峰度數\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'離峰度數\s+([\d,]+)', text)
        if not m:
            m = re.search(r'(?m)^離峰\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'(?m)^離峰\s+([\d,]+)', text)
        if not m:
            m = re.search(r'離峰電能\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'離峰電能\s+([\d,]+)', text)
        if not m:
            m = re.search(r'非尖峰度數\s*\n\s*([\d,]+)', text)
        if not m:
            m = re.search(r'非尖峰度數\s+([\d,]+)', text)
        result["離峰度數"] = m.group(1).replace(",", "") if m else "0"

    # ── COLUMNAR FALLBACK ──────────────────────────────────────────────────────
    # Google Vision sometimes reads TaiPower bills column-by-column:
    #   Left column labels first (尖峰度數, 半尖峰度數, 離峰度數 …)
    #   then right column values — no label adjacent to its value.
    #
    # Two OCR merge patterns observed in this bill format:
    #   A) Integer merged with adjustment decimal:  "3200.877" = 320 (度數) + 0.877 (調整係數)
    #   B) Two integers on one line:                "16080"    = 160 (尖峰) + 80 (半尖峰)
    #
    # Extra: 電力需量 tariff pages prepend a 最高需量 demand value (e.g. 34)
    # before the kWh values → skip it with offset=1.
    if result["尖峰度數"] == "0" and result["半尖峰度數"] == "0" and result["離峰度數"] == "0":
        lines = text.split('\n')
        peak_pos = semi_pos = off_pos = None
        for i, raw in enumerate(lines):
            s = raw.strip()
            if peak_pos is None and re.match(r'經常[\(（]尖峰[\)）]度數', s):
                peak_pos = i
            elif semi_pos is None and re.match(r'(?:週六)?半尖峰度數', s):
                semi_pos = i
            elif off_pos is None and semi_pos is not None and re.match(r'離峰度數', s):
                off_pos = i

        if peak_pos is not None and semi_pos is not None and off_pos is not None:
            last_label = max(peak_pos, semi_pos, off_pos)
            vals = []
            for i in range(last_label + 1, min(last_label + 25, len(lines))):
                s = lines[i].strip()

                # Case A: pure integer line (e.g. "320", "80", "16080")
                if re.match(r'^[\d,]+$', s):
                    v = int(s.replace(',', ''))
                    if v >= 10:
                        vals.append(v)

                # Case B: integer merged with adjustment decimal  e.g. "3200.877"
                # Pattern: digits immediately followed by "0.<3-4 digits>" at end-of-line.
                # Python re backtracks: (\d+)(0\.\d{3,4}) matches "320"+"0.877" in "3200.877".
                elif re.match(r'^[\d,]+\.\d+$', s):
                    m2 = re.match(r'^([\d,]+)(0\.\d{3,4})$', s)
                    if m2:
                        v = int(m2.group(1).replace(',', ''))
                        if v >= 10:
                            vals.append(v)
                    # else: plain decimal like "0.877" standalone → skip

            # ── post-process: split merged integer pairs (Case B for integers) ──
            # If we still have too few values, one entry may be two kWh readings
            # concatenated without separator (e.g. "16080" = 160 + 80).
            # Strategy: try every split position; if exactly one split gives both
            # parts ≥ 10 with no leading zeros, apply it.
            if len(vals) < 4:   # generous threshold; real need is 3 (or 4 with offset)
                expanded = []
                for v in vals:
                    sv = str(v)
                    splits = [
                        (int(sv[:j]), int(sv[j:]))
                        for j in range(2, len(sv))
                        if sv[j] != '0'           # no leading zero in right part
                        and int(sv[:j]) >= 10
                        and int(sv[j:]) >= 10
                    ]
                    if len(splits) == 1:          # unambiguous split → expand
                        expanded.extend([splits[0][0], splits[0][1]])
                    else:
                        expanded.append(v)        # keep as-is (ambiguous or no split)
                vals = expanded

            # 電力需量 tariff: 最高需量 demand value is injected first → skip it
            offset = 1 if re.search(r'最高需量', text) else 0

            if len(vals) >= 3 + offset:
                result["尖峰度數"]   = str(vals[offset])
                result["半尖峰度數"] = str(vals[offset + 1])
                result["離峰度數"]   = str(vals[offset + 2])
    # ───────────────────────────────────────────────────────────────────────────

    # 使用度數 — always compute as sum of three sub-fields (no explicit total line)
    if not result["使用度數"]:
        total = (int(result.get("尖峰度數") or 0) +
                 int(result.get("半尖峰度數") or 0) +
                 int(result.get("離峰度數") or 0))
        result["使用度數"] = str(total) if total > 0 else "未辨識"

    # 電費金額 (稅前應繳總金額) — 2-column table layout:
    #   稅前應繳總金額  ← label 1
    #   營業稅          ← label 2
    #   56571.0元       ← value 1  (this is what we want)
    #   2829.0元        ← value 2
    if not result["電費金額"]:
        # Skip one non-digit label line, then capture first number
        m = re.search(r'稅前應繳總金額\s*\n[^\d\n][^\n]*\n\s*([\d,]+(?:\.\d+)?)', text)
        if not m:
            # fallback: value directly after label
            m = re.search(r'稅前應繳總金額\s*\n\s*([\d,]+(?:\.\d+)?)', text)
        if not m:
            m = re.search(r'稅前應繳總金額\s+([\d,]+(?:\.\d+)?)', text)
        result["電費金額"] = clean_amount(m.group(1)) if m else "未辨識"

    # 應繳總金額 — parse BEFORE 應繳稅額 so math computation works
    if not result["應繳總金額"]:
        m = re.search(r'應繳總金額\s*\n\s*([\d,]+)元', text)
        if not m:
            m = re.search(r'應繳總金額\s+([\d,]+)元', text)
        if not m:
            m = re.search(r'應繳總金額\s*[\n\s]*([\d,]{4,})', text)
        result["應繳總金額"] = clean_amount(m.group(1)) if m else "未辨識"

    # 應繳稅額 (營業稅) — compute as 應繳總金額 - 電費金額 (most reliable)
    if not result["應繳稅額"]:
        fee = result.get("電費金額", "")
        total = result.get("應繳總金額", "")
        if fee and total and str(fee).isdigit() and str(total).isdigit():
            computed_tax = int(total) - int(fee)
            if 0 <= computed_tax < int(total):
                result["應繳稅額"] = str(computed_tax)
        if not result["應繳稅額"]:
            # regex fallback
            m = re.search(r'稅前應繳總金額\s*\n[^\d\n][^\n]*\n[^\n]+\n\s*([\d,]+(?:\.\d+)?)', text)
            if not m:
                m = re.search(r'營業稅\s*\n[^\d@\n][^\n]*\n\s*([\d,]+(?:\.\d+)?)', text)
            result["應繳稅額"] = clean_amount(m.group(1)) if m else "未辨識"

    # Fill remaining None
    for k in ["繳費期限", "地址", "電號", "尖峰度數", "半尖峰度數", "離峰度數",
              "使用度數", "電費金額", "應繳稅額", "應繳總金額"]:
        if result[k] is None:
            result[k] = "未辨識"

    return result


def parse_water_page(text: str, page_num: int, billing_period: str = None) -> dict:
    result = {
        "館別": "麗軒",
        "類型": "水費",
        "計費期間": billing_period,
        "用水地址": None,
        "水號": None,
        "用水量": None,
        "基本費": None,
        "水費": None,
        "營業稅": None,
        "其他費用": None,
        "總金額": None,
        "_page": page_num,
    }

    if not result["計費期間"]:
        m = re.search(r'(\d{2,3}年\d{1,2}月)', text)
        result["計費期間"] = m.group(1).strip() if m else "未辨識"

    m = re.search(r'(?:水號|用戶編號)[：:\s]*([0-9\-]{6,15})', text)
    result["水號"] = m.group(1).strip() if m else "未辨識"

    m = re.search(r'(?:用水地址|地址)[：:]\s*(.+?)(?=\n|$)', text)
    result["用水地址"] = m.group(1).strip() if m else "未辨識"

    m = re.search(r'(?:用水量|本期用水)[：:\s]*(\d[\d,]+)', text)
    result["用水量"] = m.group(1).replace(",", "") if m else "未辨識"

    m = re.search(r'基本費[：:\s]*([\d,]+)', text)
    result["基本費"] = m.group(1).replace(",", "") if m else "未辨識"

    m = re.search(r'(?:^|\s)水費[：:\s]*([\d,]+)', text, re.MULTILINE)
    result["水費"] = m.group(1).replace(",", "") if m else "未辨識"

    m = re.search(r'營業稅[：:\s]*([\d,]+)', text)
    result["營業稅"] = m.group(1).replace(",", "") if m else "未辨識"

    m = re.search(r'(?:本期應繳|總金額|合計)[：:\s]*([\d,]+)', text)
    result["總金額"] = m.group(1).replace(",", "") if m else "未辨識"

    return result


# ─────────────────────────────────────────────────────────────
# Step 8: Validate electricity bill totals
# ─────────────────────────────────────────────────────────────
EXPECTED_TOTALS = {
    "使用度數": 38390,
    "電費金額": 159555,
    "應繳稅額": 7978,
    "應繳總金額": 167533,
}


def safe_int(v) -> int:
    try:
        return int(str(v).replace(",", "").strip())
    except Exception:
        return 0


def validate_totals(records: list) -> dict:
    computed = {k: sum(safe_int(r.get(k)) for r in records) for k in EXPECTED_TOTALS}
    passed = all(computed[k] == EXPECTED_TOTALS[k] for k in EXPECTED_TOTALS)
    return {"computed": computed, "expected": EXPECTED_TOTALS, "passed": passed}


# ─────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────
# Main OCR endpoint — processes ALL pages
# ─────────────────────────────────────────────────────────────
@app.post("/ocr")
async def ocr_pdf(
    file: UploadFile = File(...),
    bill_type: str = Query(default="電費"),
    page: int = Query(default=0),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        num_pages = len(doc)
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF open failed: {str(e)}")

    records = []
    billing_period = None

    try:
        for page_idx in range(num_pages):
            img_b64 = pdf_page_to_base64(pdf_bytes, page_idx)
            text = await google_vision_ocr(img_b64)

            # Detect billing period from first page
            if page_idx == 0 and not billing_period:
                m = re.search(r'(\d{2,3}年\d{1,2}月)', text)
                if m:
                    billing_period = m.group(1).strip()

            if bill_type == "電費":
                rec = parse_electricity_page(text, page_idx + 1, billing_period)
            else:
                rec = parse_water_page(text, page_idx + 1, billing_period)

            records.append(rec)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

    # Clean internal fields
    clean_records = [{k: v for k, v in r.items() if not k.startswith("_")} for r in records]

    # Validate totals (electricity only)
    validation = validate_totals(clean_records) if bill_type == "電費" else {}

    # Backward-compat: first record as single parsed object
    first = clean_records[0] if clean_records else {}

    return {
        "records": clean_records,
        "parsed": first,
        "raw": "",
        "num_pages": num_pages,
        "count": len(clean_records),
        "validation": validation,
    }
