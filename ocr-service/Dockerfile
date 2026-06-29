FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgl1 \
    curl \
    tesseract-ocr \
    tesseract-ocr-chi-tra \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# 換用高品質 tessdata_best 的 chi_tra/eng（標準版讀不出小字表格的使用度數欄）
RUN curl -fsSL -o /usr/share/tesseract-ocr/5/tessdata/chi_tra.traineddata \
        https://github.com/tesseract-ocr/tessdata_best/raw/main/chi_tra.traineddata && \
    curl -fsSL -o /usr/share/tesseract-ocr/5/tessdata/eng.traineddata \
        https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Run as non-root user for security
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser
USER appuser

EXPOSE 5001

# Railway injects $PORT dynamically; fall back to 5001 for local Docker Compose
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-5001}"]
