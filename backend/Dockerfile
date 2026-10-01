# Railway deploy for the Umuburo AI API (FastAPI in backend/).
# Works with Root Directory set to /backend, or from the repo root with
# RAILWAY_DOCKERFILE_PATH=backend/Dockerfile.
FROM python:3.12-slim
WORKDIR /src
COPY . .
RUN mkdir -p /app \
 && if [ -f backend/main.py ]; then cp -a backend/. /app/; else cp -a . /app/; fi \
 && rm -rf /src
WORKDIR /app
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 8000
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
