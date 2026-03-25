FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Run as non-root user for security
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser
USER appuser

EXPOSE 5001

# Railway injects $PORT dynamically; fall back to 5001 for local Docker Compose
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-5001}"]
