FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# libsndfile1 for soundfile, portaudio19-dev + libportaudio2 for sounddevice,
# pulseaudio-utils so we can run pactl diagnostics from inside the container.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libsndfile1 \
        libportaudio2 \
        portaudio19-dev \
        pulseaudio-utils \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY prompts ./prompts

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
