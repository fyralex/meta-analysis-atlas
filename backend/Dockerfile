# The backend (#144). Built from the repository root, because it reads the generated map in spec/:
#   docker build -f backend/Dockerfile .
FROM python:3.11.14-slim

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
# only the generated files the backend reads
COPY spec/map.json spec/cards.json ./spec/

ENV ATLAS_SPEC_DIR=/app/spec \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health', timeout=4)" || exit 1
USER 1000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
