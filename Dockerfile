FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for reportlab/pdf generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Train/verify ML model artifacts on build
RUN python ml/train_classifier.py

EXPOSE 8000

# Use shell form so $PORT is expanded at runtime (required for Render deployment)
CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
