import os
import base64
import traceback
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3-vl:4b")

PROMPT = """你是一個專業的台灣電費/水費帳單辨識助手。
請仔細閱讀這張帳單圖片，找出以下欄位並以 JSON 格式回傳（若找不到填 null）：

電費帳單欄位：
- 地址 (用電地址/裝設地址)
- 電號 (電費戶號/用戶編號)
- 使用度數 (本期用電度數)
- 電費金額 (流動電費/本期電費)
- 應繳稅額 (營業稅/稅額)
- 應繳總金額 (本期應繳金額/應繳電費)
- 計費期間

只回傳 JSON，不要其他說明文字。範例格式：
{"地址":"台北市...","電號":"12345678","使用度數":"1234","電費金額":"5678","應繳稅額":"284","應繳總金額":"5962","計費期間":"113年04月"}
"""

WATER_PROMPT = """你是一個專業的台灣水費帳單辨識助手。
請仔細閱讀這張帳單圖片，找出以下欄位並以 JSON 格式回傳（若找不到填 null）：

水費帳單欄位：
- 用水地址
- 水號 (水費戶號/用戶編號)
- 用水量
- 基本費
- 水費
- 營業稅
- 其他費用
- 總金額 (本期應繳金額)
- 計費期間

只回傳 JSON，不要其他說明文字。"""


def pdf_page_to_base64(pdf_bytes: bytes, page_num: int = 0, dpi: int = 120) -> str:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    img_bytes = pix.tobytes("png")
    doc.close()
    return base64.b64encode(img_bytes).decode("utf-8")


@app.get("/health")
def health():
    return {"status": "ok"}


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
        target_page = min(page, num_pages - 1)
        img_b64 = pdf_page_to_base64(pdf_bytes, target_page)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF conversion failed: {str(e)}")

    prompt = WATER_PROMPT if bill_type == "水費" else PROMPT

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "images": [img_b64],
                    "stream": False,
                    "options": {"temperature": 0.1},
                },
            )
            resp.raise_for_status()
            result = resp.json()
            raw_text = result.get("response", "")
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Ollama 服務無法連線，請確認 Ollama 容器是否啟動")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ollama 呼叫失敗: {str(e)}")

    # Try to extract JSON from response
    import re, json
    json_match = re.search(r'\{[^{}]+\}', raw_text, re.DOTALL)
    parsed = {}
    if json_match:
        try:
            parsed = json.loads(json_match.group())
        except Exception:
            pass

    return {
        "raw": raw_text,
        "parsed": parsed,
        "num_pages": num_pages,
        "page_used": target_page + 1,
    }
