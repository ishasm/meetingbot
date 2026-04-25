#!/bin/bash
# Entrypoint for the Google Meet voice-assistant bot.
#
# Unlike the standard meet bot we do NOT start our own PulseAudio server.
# Instead we rely on the host PulseAudio socket mounted at /run/pulse/native,
# which already exposes the BotSpeaker sink and BotMic virtual source created
# by setup-pulse.sh on the host.
#
# We verify BotSpeaker/BotMic exist, set BotMic as the default source so
# Chromium picks it up as its microphone, and then launch the bot.

set -e

echo "[entrypoint] Setting up XDG_RUNTIME_DIR..."
export XDG_RUNTIME_DIR=/tmp/runtime-$USER
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

echo "[entrypoint] Starting virtual display..."
Xvfb :99 -screen 0 1920x1080x24 &

echo "[entrypoint] Starting window manager..."
fluxbox &

: "${PULSE_SERVER:=unix:/tmp/pulse-socket}"
export PULSE_SERVER
echo "[entrypoint] Using PULSE_SERVER=$PULSE_SERVER"

: "${PULSE_SINK:=BotSpeaker}"
: "${PULSE_SOURCE:=BotMic}"
export PULSE_SINK PULSE_SOURCE

echo "[entrypoint] Waiting for PulseAudio socket to become reachable..."
for i in $(seq 1 30); do
  if pactl info >/dev/null 2>&1; then
    echo "[entrypoint] PulseAudio server reachable."
    break
  fi
  sleep 1
done

if ! pactl info >/dev/null 2>&1; then
  echo "[entrypoint] ERROR: Cannot reach PulseAudio at $PULSE_SERVER" >&2
  echo "[entrypoint] Did you run setup-pulse.sh on the host and mount /run/pulse?" >&2
  exit 1
fi

echo "[entrypoint] Existing sinks:"
pactl list short sinks || true
echo "[entrypoint] Existing sources:"
pactl list short sources || true

if ! pactl list short sinks | awk '{print $2}' | grep -qx "$PULSE_SINK"; then
  echo "[entrypoint] ERROR: Required sink '$PULSE_SINK' is missing." >&2
  exit 1
fi
if ! pactl list short sources | awk '{print $2}' | grep -qx "$PULSE_SOURCE"; then
  echo "[entrypoint] ERROR: Required source '$PULSE_SOURCE' is missing." >&2
  exit 1
fi

echo "[entrypoint] Setting '$PULSE_SOURCE' as default source..."
pactl set-default-source "$PULSE_SOURCE" || true

echo "[entrypoint] Starting bot..."
pnpm run dev
