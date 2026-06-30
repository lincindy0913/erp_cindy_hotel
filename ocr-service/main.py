import os
import re
import base64
import logging
import traceback
import httpx
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

app = FastAPI()

# ALLOWED_ORIGINS: comma-separated list of allowed origins.
# Default "*" for local dev — restrict to your Next.js host in production,
# e.g. ALLOWED_ORIGINS=https://erp.example.com
_origins_env = os.environ.get("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _origins_env.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

GOOGLE_VISION_API_KEY = os.environ.get("GOOGLE_VISION_API_KEY", "")
GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"


@app.on_event("startup")
async def startup_check():
    if not GOOGLE_VISION_API_KEY:
        logger.warning(
            "GOOGLE_VISION_API_KEY is not set — OCR endpoints will return HTTP 500 "
            "until a key is provided. Set it in .env and restart: "
            "docker compose --env-file .env up -d ocr"
        )


# ─────────────────────────────────────────────────────────────
# PDF page → text (direct extraction, no API needed)
# Works for digital PDFs (台電 / 自來水 bills are typically digital)
# ─────────────────────────────────────────────────────────────
def pdf_page_to_text_direct(pdf_bytes: bytes, page_num: int) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    text = page.get_text("text")
    doc.close()
    return text.strip()


# ─────────────────────────────────────────────────────────────
# PDF page → base64 PNG via PyMuPDF (for scanned PDFs only)
# ─────────────────────────────────────────────────────────────
def pdf_page_to_base64(pdf_bytes: bytes, page_num: int, dpi: int = 200, auto_rotate: bool = True) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    rect = page.rect
    # Auto-rotate landscape pages to portrait for better OCR
    if auto_rotate and rect.width > rect.height:
        mat = fitz.Matrix(dpi / 72, dpi / 72).prerotate(-90)
    else:
        mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img_bytes = pix.tobytes("png")
    doc.close()
    return base64.b64encode(img_bytes).decode("utf-8")


# ─────────────────────────────────────────────────────────────
# Call Google Vision API → return full text (fallback for scanned PDFs)
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
# Normalize OCR text: Tesseract often inserts a space between every CJK
# glyph (e.g. "稅 前 應 繳 總 金 額"), which breaks label matching. Collapse
# spaces that sit *between two CJK characters* (no-op for engines that don't
# add them, e.g. Google Vision / Debian Tesseract).
# ─────────────────────────────────────────────────────────────
_CJK_SPACE_RE = re.compile(r'(?<=[一-鿿])[ \t]+(?=[一-鿿])')

def normalize_ocr_text(text: str) -> str:
    return _CJK_SPACE_RE.sub('', text)


# ─────────────────────────────────────────────────────────────
# Local OCR via Tesseract (no API key needed, works offline)
# Handles scanned 台電 / 自來水 bills that have no text layer.
# ─────────────────────────────────────────────────────────────
def tesseract_ocr_page(pdf_bytes: bytes, page_num: int, dpi: int = 300, psm: int = None) -> str:
    import io
    import pytesseract
    from PIL import Image

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    rect = page.rect
    # Auto-rotate landscape pages to portrait for better OCR
    if rect.width > rect.height:
        mat = fitz.Matrix(dpi / 72, dpi / 72).prerotate(-90)
    else:
        mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    doc.close()
    # chi_tra (Traditional Chinese) + eng for the mixed-language bills.
    # psm=6 (uniform block) reads the dense summary TABLE far better.
    config = f"--psm {psm}" if psm else ""
    text = pytesseract.image_to_string(img, lang="chi_tra+eng", config=config)
    return normalize_ocr_text(text).strip()


# ─────────────────────────────────────────────────────────────
# Smart text extractor: direct → Vision (if key) → Tesseract (local)
# ─────────────────────────────────────────────────────────────
_MIN_TEXT_LEN = 80  # threshold: fewer chars → likely scanned → need OCR

async def extract_page_text(pdf_bytes: bytes, page_num: int) -> tuple[str, str]:
    """Returns (text, method): 'direct', 'vision', 'tesseract', or 'direct_fallback'."""
    direct_text = pdf_page_to_text_direct(pdf_bytes, page_num)
    if len(direct_text) >= _MIN_TEXT_LEN:
        return direct_text, "direct"

    # Scanned page — try Google Vision first if a key is configured.
    # Render at 300 DPI (not the 200 default) so Vision reads degraded scans
    # such as the 麗格 summary table's 使用度數 column reliably.
    if GOOGLE_VISION_API_KEY:
        try:
            img_b64 = pdf_page_to_base64(pdf_bytes, page_num, dpi=300)
            vision_text = await google_vision_ocr(img_b64)
            if len(vision_text) >= 10:
                return vision_text, "vision"
        except Exception:
            pass  # invalid key / quota / network — fall through to Tesseract

    # Local Tesseract OCR — no API key, works for scanned PDFs
    try:
        tess_text = tesseract_ocr_page(pdf_bytes, page_num)
        if len(tess_text) >= 10:
            return tess_text, "tesseract"
    except Exception:
        traceback.print_exc()

    return direct_text, "direct_fallback"


# ─────────────────────────────────────────────────────────────
# Electricity SUMMARY-TABLE parser (麗格 page-1 style)
# One page lists every meter in a grid:
#   序號 地址 電號 使用度數 電費金額 營業稅 應繳總金額
# Far cleaner to OCR than the 9 detailed bill pages.
# ─────────────────────────────────────────────────────────────
_ACCT_RE = re.compile(r'(\d{2}-\d{2}-\d{4}-\d{2}-\d)')
_NUM_RE = re.compile(r'\d[\d,]+')          # 2+ char numbers (skips single-digit 序號)
_ADDR_RE = re.compile(r'([一-鿿]{1,8}?[街路段巷弄][一-鿿\dA-Za-z~\-、，.·]*?\d+號[一-鿿\dA-Za-z~\-、，.·]*)')


# ─────────────────────────────────────────────────────────────
# 固定電表登記簿：電號 → (館別, 地址)。地址/電號每月不變，OCR 只需讀
# 變動的「使用度數 / 金額」，再用此表還原地址、修正電號 OCR 誤差。
# 新增館別時把該館所有電表加進來即可。
# ─────────────────────────────────────────────────────────────
METER_REGISTRY = {
    # 麗軒（中美路99-1號）
    "13-04-0525-49-0": ("麗軒", "中美路99-1號B1B2公設"),
    "13-04-0525-50-4": ("麗軒", "中美路99-1號B1"),
    "13-04-0525-53-7": ("麗軒", "中美路99-1號1F"),
    "13-04-0525-55-9": ("麗軒", "中美路99-1號2F"),
    "13-04-0525-57-1": ("麗軒", "中美路99-1號3F"),
    "13-04-0525-59-3": ("麗軒", "中美路99-1號4F"),
    "13-04-0525-61-7": ("麗軒", "中美路99-1號5F"),
    "13-04-0525-63-9": ("麗軒", "中美路99-1號6F"),
    "13-04-0525-65-1": ("麗軒", "中美路99-1號7F"),
    "13-04-0525-67-3": ("麗軒", "中美路99-1號8F"),
    "13-04-0525-69-5": ("麗軒", "中美路99-1號9F"),
    # 麗格（商校街）
    "13-11-2085-00-4": ("麗格", "商校街258號BF~7樓 公設"),
    "13-11-2085-10-6": ("麗格", "商校街258號地下2~7樓，260、262號地下1樓"),
    "13-11-2085-30-0": ("麗格", "商校街258號1樓"),
    "13-11-2086-40-3": ("麗格", "商校街260號2·3樓"),
    "13-11-2087-40-4": ("麗格", "商校街262號2·3樓"),
    "13-11-2086-50-6": ("麗格", "商校街260號4·5樓"),
    "13-11-2087-50-7": ("麗格", "商校街262號4·5樓"),
    "13-11-2086-60-8": ("麗格", "商校街260號6·7樓"),
    "13-11-2087-60-9": ("麗格", "商校街262號6·7樓"),
}

def _lev(a: str, b: str) -> int:
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            prev, dp[j] = dp[j], min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
    return dp[n]

def match_meter(acct: str, taken: set):
    """OCR 電號還原成登記簿的正確電號（貪婪比對：已配對者不重複用）。"""
    if acct in METER_REGISTRY and acct not in taken:
        return acct
    a = acct.replace('-', '')
    cands = sorted((_lev(a, k.replace('-', '')), k) for k in METER_REGISTRY if k not in taken)
    return cands[0][1] if cands and cands[0][0] <= 2 else acct


# ─────────────────────────────────────────────────────────────
# 固定水表登記簿：水號 → (館別, 用水地址)。同電表登記簿概念——水號/地址
# 每期不變，OCR 只需讀「使用度數 / 應繳總金額」，再用此表還原地址、
# 修正水號 OCR 誤差。新增館別/水表時把該水號加進來即可。
# ─────────────────────────────────────────────────────────────
WATER_REGISTRY = {
    # 麗軒（中美路99-1號）
    "9A022021025": ("麗軒", "中美路99-1號"),
    # 麗格（商校街）— 待提供水號後補上
}

# 水號樣式：數字+1~2英文字母+8~11碼數字（例：9A022021025、9AM07951027）
_WATER_ACCT_RE = re.compile(r'\d\s*[A-Z]{1,2}\s*\d[\d\s]{6,12}\d')

def _norm_water(s: str) -> str:
    """水號正規化：只留英數、轉大寫，方便比對（去掉 OCR 的空白/破折號）。"""
    return re.sub(r'[^0-9A-Za-z]', '', str(s or '')).upper()

def match_water(acct: str, taken: set):
    """OCR 水號還原成登記簿的正確水號（貪婪比對：已配對者不重複用）。"""
    a = _norm_water(acct)
    if a in WATER_REGISTRY and a not in taken:
        return a
    cands = sorted((_lev(a, k), k) for k in WATER_REGISTRY if k not in taken)
    return cands[0][1] if cands and cands[0][0] <= 2 else (a or acct)

def parse_electricity_summary(text: str) -> list:
    """Parse a Taipower summary table; returns one record per meter row.

    Tesseract reads the table row-by-row but often splits a single row across
    several lines, so we scan the WHOLE page (not line-by-line): anchor on each
    distinct 電號, take the first 4 multi-digit numbers that follow it
    (使用度數/電費金額/營業稅/應繳總金額), and the address that precedes it.
    """
    # Keep the first occurrence of each distinct 電號 in document order.
    # (A detail bill page repeats the same 電號 → only 1 distinct → returns [].)
    seen = set()
    matches = []
    for m in _ACCT_RE.finditer(text):
        if m.group(1) not in seen:
            seen.add(m.group(1))
            matches.append(m)
    if len(matches) < 2:
        return []

    records = []
    for idx, m in enumerate(matches):
        acct = m.group(1)
        seg_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        seg_after = _DATE_TOKEN_RE.sub(' ', text[m.end():seg_end])  # 去掉「115/6/16」日期
        nums = [n.replace(',', '') for n in _NUM_RE.findall(seg_after)
                if n.replace(',', '').isdigit()]
        # address sits before the 電號 (after the previous row's amounts)
        seg_before = text[(matches[idx - 1].end() if idx > 0 else 0):m.start()]
        am = _ADDR_RE.search(seg_before)
        addr = am.group(1).strip() if am else ''
        records.append({
            "館別": "麗格",
            "類型": "電費",
            "繳費期限": "未辨識",
            "地址": addr or "未辨識",
            "電號": acct,
            "尖峰度數": "0", "半尖峰度數": "0", "離峰度數": "0",
            "使用度數": nums[0] if len(nums) > 0 else "0",
            "電費金額": nums[1] if len(nums) > 1 else "0",
            "應繳稅額": nums[2] if len(nums) > 2 else "0",
            "應繳總金額": nums[3] if len(nums) > 3 else "0",
        })
    return records


def parse_summary_totals(text: str) -> dict | None:
    """Parse the 總計 row of a Taipower summary table → expected column totals.

    e.g. "總計 應繳金額 : 25,400 119,094 5,956 125,050"
    Used to validate that the per-meter rows sum correctly (replaces the old
    hard-coded expected totals, which were for a different property).
    """
    m = re.search(r'總\s*計[^\d]*([\d,]+)[^\d]+([\d,]+)[^\d]+([\d,]+)[^\d]+([\d,]+)', text)
    if not m:
        return None
    keys = ["使用度數", "電費金額", "應繳稅額", "應繳總金額"]
    try:
        return {k: int(m.group(i + 1).replace(',', '')) for i, k in enumerate(keys)}
    except Exception:
        return None


# Summary-table number (allows '.' or ',' as a misread thousands separator)
_SUM_NUM_RE = re.compile(r'\d[\d.,]*\d|\d')
# 日期 token（如「115/6/16製表」「115/5/4-115/6/1」）會夾在電號與金額之間，
# 先抽掉，避免「115」被當成使用度數（Vision 把首列欄位標題＋製表日插在第一筆）。
_DATE_TOKEN_RE = re.compile(r'\d{1,3}/\d{1,2}/\d{1,2}')

def parse_summary_table_hi(text: str, detail_totals: dict = None,
                           detail_usage: dict = None) -> list:
    """Parse a high-DPI / PSM-6 / Vision summary table → one record per meter.

    地址/電號 come from METER_REGISTRY (fixed key); the noisier 電號 OCR is
    restored by fuzzy match. 應繳總金額 is overridden by the detail page's
    big-font/barcode value, and 使用度數 falls back to the detail page's
    三段度數相加 (detail_usage) when the summary cell is blank/zero.
    """
    detail_totals = detail_totals or {}
    detail_usage = detail_usage or {}
    records = []
    taken = set()
    ms = list(_ACCT_RE.finditer(text))
    for i, m in enumerate(ms):
        seg = text[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(text)]
        seg = _DATE_TOKEN_RE.sub(' ', seg)   # 去掉日期，否則「115/6/16」會被當成度數
        nums = [int(re.sub(r'[.,]', '', t)) for t in _SUM_NUM_RE.findall(seg)]
        acct = match_meter(m.group(0), taken)
        if acct in taken:
            continue
        taken.add(acct)
        reg = METER_REGISTRY.get(acct)
        warehouse = reg[0] if reg else ("麗軒" if acct.startswith("13-04") else "麗格")
        addr = reg[1] if reg else "未辨識"
        usage = nums[0] if len(nums) > 0 else 0
        fee = nums[1] if len(nums) > 1 else 0
        tax = nums[2] if len(nums) > 2 else 0
        total = nums[3] if len(nums) > 3 else (fee + tax)
        if (not usage) and detail_usage.get(acct):   # 彙總表讀不到→用明細頁三段度數相加
            usage = detail_usage[acct]
        if acct in detail_totals:          # 明細頁(大字+條碼)較準
            total = detail_totals[acct]
        records.append({
            "館別": warehouse, "類型": "電費", "繳費期限": "未辨識",
            "地址": addr, "電號": acct,
            "尖峰度數": "0", "半尖峰度數": "0", "離峰度數": "0",
            "使用度數": str(usage), "電費金額": str(fee),
            "應繳稅額": str(tax), "應繳總金額": str(total),
        })
    return records


# Detail-page amount anchors (tolerant of noisy Tesseract output, verified
# against a real 9-meter 台電 bill → all 9 電費/稅/總額 match exactly).
_FEE_RE = re.compile(r'稅前應繳總[^\d]{0,30}(\d[\d,]{2,})')           # 稅前應繳總金額 → 電費金額
_FEE_FALLBACK_RE = re.compile(r'(?<!\d)(\d{4,6})0\s+\d(?!\d)')        # "361020 7" → 36102 (.0 dropped)
_TAX_RE = re.compile(r'營業稅[^\d元]{0,12}(\d{2,6})[^\d]{0,3}元')   # value must be a real amount ending in 元
_TAXCOL_RE = re.compile(r'(\d{1,5})\.\s?0?\s*元[^\d]{0,18}應[繳繼線總]')  # columnar 營業稅 (value just before 應繳總金額)
_ETOTAL_BARCODE_RE = re.compile(r'0000[0-9A-Z.]?0000(\d{4,7})')      # total embedded in bottom barcode
_COMMA_AMT_RE = re.compile(r'(\d{1,3}(?:,\d{3})+)\s*元')             # clean comma amount before 元
_EDATE_RE = re.compile(r'(\d{3}/\d{2}/\d{2})')
# 計費度數 sub-fields (must end in 度數 so we don't catch 需量/契約 values).
# 容忍 Vision 在標籤裡插入的空白（如「經常 (尖峰) 度數」）及值落在下一行：
# \s* 吃掉標籤內空白、\D{0,8} 吃掉到數字前的換行/雜訊（夠小，不會抓到遠處數字）。
_PEAK_RE = re.compile(r'經常\s*[(（]?\s*尖峰\s*[)）]?\s*度數\D{0,8}(\d{1,6})')        # 經常(尖峰)度數
_SEMIPEAK_RE = re.compile(r'(?:週六)?\s*半\s*[人入]?\s*尖峰\s*度數\D{0,8}(\d{1,6})')  # (週六)半尖峰度數
_OFFPEAK_RE = re.compile(r'離峰\s*度數\D{0,8}(\d{1,6})')                              # 離峰度數


def _amt(m):
    return int(m.group(1).replace(',', '')) if m else None


def _extract_total(text: str):
    """應繳總金額 is the largest *comma-grouped* amount on the bill (it appears
    several times and is bigger than any decimal sub-amount, which never carry a
    comma). Falls back to the bottom barcode."""
    cands = [int(m.replace(',', '')) for m in _COMMA_AMT_RE.findall(text)]
    bc = _ETOTAL_BARCODE_RE.search(text)
    if bc:
        cands.append(int(bc.group(1)))
    return max(cands) if cands else None


def build_electricity_backfill(page_texts: list) -> dict:
    """From the summary-table page, map 電號 → reliable amounts for the rows OCR
    could read. Used to fill gaps where a detail page's Chinese labels are noisy."""
    backfill = {}

    def _i(v):
        v = str(v).replace(',', '')
        return int(v) if v.isdigit() else None

    for p in page_texts:
        for r in parse_electricity_summary(p["text"]):
            acct = r["電號"]
            if acct not in backfill:
                backfill[acct] = {
                    "fee": _i(r["電費金額"]), "tax": _i(r["應繳稅額"]),
                    "total": _i(r["應繳總金額"]), "usage": _i(r["使用度數"]),
                    "addr": r.get("地址"),
                }
    return backfill


def parse_electricity_detail(text: str, page_num: int, backfill: dict = None,
                             billing_period: str = None) -> dict:
    """Parse ONE Taipower detail bill page (one meter per page).

    Extracts 電費金額(稅前應繳總額) / 營業稅 / 應繳總金額 from the noisy detail
    page, fills gaps from the summary-table backfill, then reconciles so that
    電費金額 + 營業稅 == 應繳總金額 (the bill's own invariant).
    """
    backfill = backfill or {}
    am = _ACCT_RE.search(text)
    acct = am.group(1) if am else "未辨識"

    # Direct extractions from THIS page (most reliable when present)
    total = _extract_total(text)
    fee_d = _amt(_FEE_RE.search(text))
    tax_d = _amt(_TAX_RE.search(text)) or _amt(_TAXCOL_RE.search(text))
    # 稅前 label garbled → recover from "NNNNN0 N" (decimal .0 dropped) pattern;
    # require a meaningful gap below total so we don't grab the total itself.
    if fee_d is None:
        cands = [int(x) for x in _FEE_FALLBACK_RE.findall(text) if (not total or int(x) < total - 50)]
        if cands:
            fee_d = max(cands)

    bf = backfill.get(acct) or {}
    total = total or bf.get("total")

    # Reconcile to 電費金額 + 營業稅 == 應繳總金額, preferring page-direct values
    # over the (noisier) summary-table backfill.
    if total and tax_d is not None and total > tax_d:
        fee, tax = total - tax_d, tax_d
    elif total and fee_d is not None and total > fee_d:
        fee, tax = fee_d, total - fee_d
    elif total and bf.get("fee") and total > bf["fee"]:
        fee, tax = bf["fee"], total - bf["fee"]
    elif total and bf.get("tax") and total > bf["tax"]:
        fee, tax = total - bf["tax"], bf["tax"]
    elif fee_d is not None and tax_d is not None:
        fee, tax, total = fee_d, tax_d, fee_d + tax_d
    elif total:
        fee, tax = total, 0
    elif fee_d is not None:
        fee, tax, total = fee_d, 0, fee_d
    else:
        fee = tax = total = 0

    # 計費度數 breakdown — Vision 讀三段度數很乾淨；空白容忍版 regex（見上）能
    # 把「經常 (尖峰) 度數」與值落在下一行的情況都抓到。
    pm = _PEAK_RE.search(text)
    sm = _SEMIPEAK_RE.search(text)
    om = _OFFPEAK_RE.search(text)
    peak = int(pm.group(1)) if pm else 0
    semi = int(sm.group(1)) if sm else 0
    off = int(om.group(1)) if om else 0
    # 使用度數: prefer summary backfill; else the sum of whichever tiers read
    usage = bf.get("usage") if (bf and bf.get("usage")) else None
    if not usage:
        s = peak + semi + off
        usage = s if s > 0 else None

    dm = _EDATE_RE.search(text)
    due = dm.group(1) if dm else "未辨識"
    addr = bf.get("addr") if (bf and bf.get("addr") not in (None, "", "未辨識")) else None
    if not addr:
        am2 = _ADDR_RE.search(text)
        addr = am2.group(1).strip() if am2 else "未辨識"

    return {
        "館別": "麗格",
        "類型": "電費",
        "繳費期限": due,
        "地址": addr,
        "電號": acct,
        "尖峰度數": str(peak), "半尖峰度數": str(semi), "離峰度數": str(off),
        "使用度數": str(usage) if usage else "0",
        "電費金額": str(fee),
        "應繳稅額": str(tax),
        "應繳總金額": str(total),
    }


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
    """Parse a single water bill page from OCR text.

    Handles columnar reading where Google Vision reads labels and values
    separately (e.g. all left-column labels first, then right-column values).
    Landscape pages are auto-rotated before OCR.
    """
    result = {
        "類型": "水費",
        "水號": None,
        "用水地址": None,
        "繳費年月": billing_period,
        "用水度數": None,
        "本期實用度數": None,
        "基本費": None,
        "用水費": None,
        "水費項目小計": None,
        "營業稅": None,
        "代徵費用小計": None,
        "水源保育與回饋費": None,
        "總金額": None,
        "_page": page_num,
    }

    # ── 水號 (Water account number) ──
    # OCR patterns: "水號 9A 07951017 8" or "水號\n9AM\n07951027\n2"
    m = re.search(r'水號\s+(\w{1,4})\s+(\d{7,10})\s+(\d{1,2})', text)
    if m:
        result["水號"] = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    else:
        m = re.search(r'(?:水號|用戶編號|用水戶號)[：:\s]*([A-Z0-9\-\s]{6,20})', text)
        result["水號"] = m.group(1).strip().replace("  ", " ") if m else "未辨識"

    # ── 用水地址 ──
    # Google Vision separates "用水地址" label from the actual address (columnar).
    # Strategy: find address pattern (county/city/street/number) near "用水地址" label.
    addr_pat = r'((?:花蓮|台北|新北|桃園|台中|台南|高雄|基隆|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|台東|澎湖|金門|連江)(?:縣|市).{2,40}?(?:號|樓)[A-Z\d\-]*)'
    # Try after "用水地址" label first
    idx = text.find('用水地址')
    if idx >= 0:
        m = re.search(addr_pat, text[idx:idx+200])
        if m:
            result["用水地址"] = m.group(1).strip()
    # Fallback: first address pattern in entire text
    if not result["用水地址"]:
        all_addrs = re.findall(addr_pat, text)
        result["用水地址"] = all_addrs[0].strip() if all_addrs else "未辨識"

    # ── 繳費年月 (format: "114/06" or "114年06月") ──
    if not result["繳費年月"]:
        # Direct match: "繳費年月\n...(up to 100 chars)...\n114/06"
        m = re.search(r'繳費年月[\s\S]{0,100}?(\d{2,3}/\d{2})', text)
        if m:
            result["繳費年月"] = m.group(1)
        else:
            # Fallback: "114年06月" anywhere
            m = re.search(r'(\d{2,3})年\s*(\d{1,2})\s*月', text)
            if m:
                result["繳費年月"] = f"{m.group(1)}/{m.group(2).zfill(2)}"
            else:
                result["繳費年月"] = "未辨識"

    # ── 用水度數 (使用度數；綠色標示) — 容忍冒號/換行 ──
    m = re.search(r'用水度數[^\d]{0,10}(\d+)', text)
    result["用水度數"] = m.group(1) if m else "0"

    # ── 本期實用度數 ──
    # Columnar reading may insert other labels between "本期實用度數" and the value
    # e.g. "本期實用度數\n本期總表指針數\n25\n1411"
    m = re.search(r'本期實用度數\s+(\d+)', text)
    if not m:
        m = re.search(r'本期實用度數\D{0,40}?(\d+)', text)
    if not m:
        # Fallback: find in the "實用度數 / 日平均度數" table section
        m = re.search(r'實用度數[\s\S]{0,30}?本期\s+(\d+)', text)
    if not m:
        m = re.search(r'實用度數\D{0,30}?(\d+)', text)
    result["本期實用度數"] = m.group(1) if m else "0"

    # ── 水費項目小計 ("$327元"、"水費項目小計：6024元") — reliable anchor ──
    m = re.search(r'水費項目小計\s*[:：]?\s*\$?([\d,]+)\s*元', text)
    result["水費項目小計"] = m.group(1).replace(",", "") if m else "0"

    # ── 基本費 & 用水費 ──
    # Strategy 1: direct match "基本費\n132.30元" 或 "基本費：392.7元"
    m_base = re.search(r'基本費\s*[:：]?\s*([\d,]+(?:\.\s?\d+)?)\s*元', text)
    m_water = re.search(r'用水費\s*[:：]?\s*([\d,]+(?:\.\s?\d+)?)\s*元', text)

    if m_base:
        result["基本費"] = m_base.group(1).replace(",", "").replace(" ", "")
    if m_water:
        result["用水費"] = m_water.group(1).replace(",", "").replace(" ", "")

    # Strategy 2 (columnar fallback): after "水費項目小計 $NNN元",
    # the next two decimal values (NNN.NN元) are 基本費 and 用水費.
    if not m_base or not m_water:
        subtotal_m = re.search(r'水費項目小計\s*\$?[\d,]+\s*元', text)
        if subtotal_m:
            after = text[subtotal_m.end():]
            decimals = re.findall(r'([\d,]+\.\s?\d+)\s*元', after[:300])
            if len(decimals) >= 2:
                if not m_base:
                    result["基本費"] = decimals[0].replace(",", "").replace(" ", "")
                if not m_water:
                    result["用水費"] = decimals[1].replace(",", "").replace(" ", "")
            elif len(decimals) == 1 and not m_base:
                result["基本費"] = decimals[0].replace(",", "").replace(" ", "")
    if result["基本費"] is None:
        result["基本費"] = "0"
    if result["用水費"] is None:
        result["用水費"] = "0"

    # ── 營業稅 ──
    # "營業稅：287" / "營業稅\n16元"：取緊接其後的數字（容忍冒號，不強制要 元，
    # 避免抓到後面的應繳總金額）。
    m = re.search(r'營業稅\s*[:：]?\s*([\d,]{1,7})', text)
    result["營業稅"] = m.group(1).replace(",", "") if m else "0"

    # ── 代徵費用小計 ("$9元"、"代徵費用小計：268元") ──
    m = re.search(r'代徵費用小計\s*[:：]?\s*\$?([\d,]+)\s*元', text)
    result["代徵費用小計"] = m.group(1).replace(",", "") if m else "0"

    # ── 水源保育與回饋費 ("9元") ──
    m = re.search(r'水源保育與回饋費\s+([\d,]+)\s*元', text)
    if not m:
        m = re.search(r'水源保育[與及]?回饋費?\s*[：:\s]*([\d,]+)', text)
    result["水源保育與回饋費"] = m.group(1).replace(",", "") if m else "0"

    # ── 應繳總金額 / 代繳(代收)總金額 ──
    # 台水新版：「應繳總金額：NT$6292元」；舊版：「代繳(代收)總金額 336元」。
    m = re.search(r'應繳總金額\s*[:：]?\s*(?:NT\s*\$|\$)?\s*([\d,]+)\s*元', text)
    if not m:
        m = re.search(r'代繳\s*[\(（]代收[\)）]\s*總金額\s+([\d,]+)\s*元?', text)
    if not m:
        m = re.search(r'總金額\s*[:：]?\s*(?:NT\s*\$|\$)?\s*([\d,]+)\s*元', text)
    if not m:
        m = re.search(r'(?:本期應繳|合計)[：:\s]*([\d,]+)', text)
    result["總金額"] = m.group(1).replace(",", "") if m else "0"

    return result


# ─────────────────────────────────────────────────────────────
# Step 8: Validate electricity bill totals
# Expected totals come from the 總計 row of the bill's own summary table
# (parse_summary_totals); there is no hard-coded per-property expectation.
# ─────────────────────────────────────────────────────────────
def safe_int(v) -> int:
    try:
        return int(str(v).replace(",", "").strip())
    except Exception:
        return 0


def validate_totals(records: list, expected: dict) -> dict:
    computed = {k: sum(safe_int(r.get(k)) for r in records) for k in expected}
    passed = all(computed[k] == expected[k] for k in expected)
    return {"computed": computed, "expected": expected, "passed": passed}


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

    billing_period = None
    methods_used: list[str] = []
    page_texts: list[dict] = []

    try:
        for page_idx in range(num_pages):
            text, method = await extract_page_text(pdf_bytes, page_idx)
            methods_used.append(method)
            page_texts.append({"pageNum": page_idx + 1, "text": text})

            # Detect billing period from first page
            if page_idx == 0 and not billing_period:
                m = re.search(r'繳費年月\s+(\d{2,3}/\d{1,2})', text)
                if m:
                    billing_period = m.group(1).strip()
                else:
                    m = re.search(r'(\d{2,3}年\d{1,2}月)', text)
                    if m:
                        billing_period = m.group(1).strip()

        records = []
        expected_totals = None
        if bill_type == "電費":
            # Classify pages: a DETAIL page has exactly one distinct 電號,
            # a SUMMARY page lists many.
            detail_pages = []
            summary_idx = None
            for i, p in enumerate(page_texts):
                accts = set(_ACCT_RE.findall(p["text"]))
                if len(accts) == 1:
                    detail_pages.append(p)
                elif len(accts) >= 3 and summary_idx is None:
                    summary_idx = i

            # Detail pages give the reliable 電號 + 應繳總金額 (big font + barcode)
            # and the three time-of-use 度數 → 使用度數 (經常尖峰+週六半尖峰+離峰).
            backfill = build_electricity_backfill(page_texts)
            detail_recs = [parse_electricity_detail(p["text"], p["pageNum"], backfill, billing_period)
                           for p in detail_pages]
            detail_totals = {}
            detail_usage = {}
            detail_tiers = {}
            _t = set()
            for r in detail_recs:
                a = match_meter(r["電號"], _t)
                _t.add(a)
                try:
                    detail_totals[a] = int(r["應繳總金額"])
                except Exception:
                    pass
                pk = safe_int(r.get("尖峰度數"))
                sm = safe_int(r.get("半尖峰度數"))
                of = safe_int(r.get("離峰度數"))
                if pk or sm or of:
                    detail_tiers[a] = (pk, sm, of)   # 明細頁三段度數分項
                u = pk + sm + of
                if u > 0:
                    detail_usage[a] = u

            # PRIMARY: parse the summary grid → 使用度數/金額 per meter. Prefer the
            # high-quality Vision text when available; else re-OCR at 400 DPI/PSM 6
            # for the dense grid. 使用度數 falls back to detail 三段度數相加.
            if summary_idx is not None:
                cand_texts = []
                if methods_used[summary_idx] == "vision":
                    cand_texts.append(page_texts[summary_idx]["text"])
                else:
                    try:
                        cand_texts.append(tesseract_ocr_page(pdf_bytes, summary_idx, dpi=400, psm=6))
                    except Exception:
                        traceback.print_exc()
                    cand_texts.append(page_texts[summary_idx]["text"])
                best, best_score, best_text = [], -1, ""
                for ct in cand_texts:
                    recs = parse_summary_table_hi(ct, detail_totals, detail_usage)
                    score = sum(1 for r in recs if safe_int(r.get("使用度數")) > 0)
                    if score > best_score:
                        best, best_score, best_text = recs, score, ct
                records = best
                # 總計列驗證（best-effort；版面零散讀不準時跳過，避免誤報紅字）
                exp = parse_summary_totals(best_text) or parse_summary_totals(page_texts[summary_idx]["text"])
                if exp and exp.get("應繳總金額"):
                    max_row = max((safe_int(r.get("應繳總金額")) for r in records), default=0)
                    if exp["應繳總金額"] >= max_row:   # 真正的總計必大於任一筆
                        expected_totals = exp

            # Fallbacks: detail-page records, then per-page parse
            if len(records) < 2:
                records = detail_recs
            if len(records) < 2:
                for p in page_texts:
                    summary = parse_electricity_summary(p["text"])
                    if len(summary) >= 2:
                        records = summary
                        break
            if not records:
                records = [parse_electricity_page(p["text"], p["pageNum"], billing_period)
                           for p in page_texts]

            # 統一套用固定登記簿：還原正確電號、地址、館別（不論走哪條解析路徑），
            # 並用明細頁三段度數補上彙總表沒有的「尖峰/半尖峰/離峰」分項。
            _seen = set()
            for r in records:
                acct = match_meter(r.get("電號", ""), _seen)
                _seen.add(acct)
                r["電號"] = acct
                reg = METER_REGISTRY.get(acct)
                if reg:
                    r["館別"] = reg[0]
                    if r.get("地址") in (None, "", "未辨識"):
                        r["地址"] = reg[1]
                # 補三段度數：僅在目前分項全為 0、且三段相加 == 合計度數時才填，
                # 確保「尖峰+半尖峰+離峰 == 使用度數」一致（避免顯示對不上的分項）。
                tiers = detail_tiers.get(acct)
                cur_usage = safe_int(r.get("使用度數"))
                cur_tier_sum = (safe_int(r.get("尖峰度數")) + safe_int(r.get("半尖峰度數"))
                                + safe_int(r.get("離峰度數")))
                if tiers and cur_tier_sum == 0:
                    pk, sm, of = tiers
                    if cur_usage == 0 or pk + sm + of == cur_usage:
                        r["尖峰度數"], r["半尖峰度數"], r["離峰度數"] = str(pk), str(sm), str(of)
                        if cur_usage == 0:
                            r["使用度數"] = str(pk + sm + of)
        else:
            # 水費：一張帳單常跨多頁（本期實用度數/應繳總金額 在後頁）。
            # 依「水號」分頁分組（含水號的頁起新帳單，後續無水號頁併入），
            # 每組合併文字解析成一筆，再用固定登記簿還原水號/用水地址/館別。
            groups = []
            for p in page_texts:
                if ('水號' in p["text"]) or not groups:
                    groups.append([p])
                else:
                    groups[-1].append(p)

            records = []
            taken = set()
            for g in groups:
                combined = "\n".join(pg["text"] for pg in g)
                rec = parse_water_page(combined, g[0]["pageNum"], billing_period)
                # 套用固定水表登記簿：修正水號 OCR 誤差、還原用水地址/館別
                acct = match_water(rec.get("水號", ""), taken)
                taken.add(acct)
                rec["水號"] = acct
                reg = WATER_REGISTRY.get(acct)
                if reg:                       # 登記簿為準：水號/地址固定
                    rec["館別"] = reg[0]
                    rec["用水地址"] = reg[1]
                records.append(rec)

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

    # Clean internal fields
    clean_records = [{k: v for k, v in r.items() if not k.startswith("_")} for r in records]

    # Validate per-meter rows against the 總計 row (only when we have it)
    validation = (validate_totals(clean_records, expected_totals)
                  if (bill_type == "電費" and expected_totals) else {})

    # Backward-compat: first record as single parsed object
    first = clean_records[0] if clean_records else {}

    raw_text = "\n\n".join(f"--- 第 {p['pageNum']} 頁 ---\n{p['text']}" for p in page_texts)

    return {
        "records": clean_records,
        "parsed": first,
        "raw": raw_text,
        "page_texts": page_texts,
        "num_pages": num_pages,
        "count": len(clean_records),
        "validation": validation,
        "extraction_methods": methods_used,
    }
