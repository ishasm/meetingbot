#!/bin/bash
#
# setup-pulse.sh — One-time host setup for the Gemini Live Voice Assistant.
#
# Creates two PulseAudio devices:
#   - BotSpeaker  (null sink)        : the orchestrator plays TTS audio here.
#   - BotMic      (virtual source)   : fed from BotSpeaker.monitor; Chromium
#                                      inside the meet-voice bot container uses
#                                      this as its microphone input.
#
# Both the bot container and the orchestrator container must have the
# host's PulseAudio socket mounted into /run/pulse, with
# PULSE_SERVER=unix:/run/pulse/native in their environment.
#
# On typical desktop Linux, PulseAudio runs in *user* mode and its socket
# lives at $XDG_RUNTIME_DIR/pulse/native (e.g. /run/user/1000/pulse).
# This script auto-detects that path, makes it traversable by container
# users, and prints the value you should export as PULSE_RUNTIME_PATH in
# .env so docker-compose mounts the correct host directory.
#
# Run once on the host before `docker compose up`. Safe to re-run; existing
# modules are detected and left in place.

set -euo pipefail

PULSE_SINK_NAME="${PULSE_SINK:-BotSpeaker}"
PULSE_SOURCE_NAME="${PULSE_SOURCE:-BotMic}"

if ! command -v pactl >/dev/null 2>&1; then
  echo "ERROR: pactl not found. Install pulseaudio-utils first." >&2
  exit 1
fi

if ! pactl info >/dev/null 2>&1; then
  echo "ERROR: PulseAudio is not running on the host." >&2
  echo "       Start it with: pulseaudio --start --exit-idle-time=-1" >&2
  exit 1
fi

echo "[setup-pulse] PulseAudio server OK."

# Detect the actual pulse runtime dir (user-mode vs system-mode).
PULSE_RUNTIME_PATH=""
if [ -S "/run/pulse/native" ]; then
  PULSE_RUNTIME_PATH="/run/pulse"
elif [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -S "${XDG_RUNTIME_DIR}/pulse/native" ]; then
  PULSE_RUNTIME_PATH="${XDG_RUNTIME_DIR}/pulse"
elif [ -S "/run/user/$(id -u)/pulse/native" ]; then
  PULSE_RUNTIME_PATH="/run/user/$(id -u)/pulse"
else
  echo "ERROR: Could not locate the PulseAudio UNIX socket." >&2
  echo "       Checked /run/pulse/native, \$XDG_RUNTIME_DIR/pulse/native, /run/user/\$UID/pulse/native." >&2
  exit 1
fi

echo "[setup-pulse] Pulse socket: ${PULSE_RUNTIME_PATH}/native"

# Container users (uid != owner of the socket dir) need traverse permission
# on the directory. The socket itself is already world-rw.
if [ "$(stat -c '%a' "${PULSE_RUNTIME_PATH}")" != "755" ]; then
  echo "[setup-pulse] chmod 755 ${PULSE_RUNTIME_PATH} (to allow container users to traverse)."
  chmod 755 "${PULSE_RUNTIME_PATH}" || {
    echo "WARN: could not chmod ${PULSE_RUNTIME_PATH}; containers may fail to open the socket." >&2
  }
fi

# The default PulseAudio UNIX socket uses cookie-based auth, which does not
# work for container users whose uid differs from the host user. Expose a
# second, auth-anonymous socket alongside it for container clients. This is
# only reachable on the host filesystem, not over the network.
ANON_SOCKET="${PULSE_RUNTIME_PATH}/anon-native"
if pactl list short modules | awk '{print $2 " " $3}' | grep -q "module-native-protocol-unix.*socket=${ANON_SOCKET}"; then
  echo "[setup-pulse] Anonymous socket already loaded, skipping."
else
  echo "[setup-pulse] Loading auth-anonymous socket at ${ANON_SOCKET}..."
  pactl load-module module-native-protocol-unix \
    socket="${ANON_SOCKET}" \
    auth-anonymous=1 >/dev/null
fi
chmod 666 "${ANON_SOCKET}" 2>/dev/null || true

# Create BotSpeaker null sink if it doesn't already exist.
if pactl list short sinks | awk '{print $2}' | grep -qx "${PULSE_SINK_NAME}"; then
  echo "[setup-pulse] Sink '${PULSE_SINK_NAME}' already exists, skipping."
else
  echo "[setup-pulse] Creating null sink '${PULSE_SINK_NAME}'..."
  pactl load-module module-null-sink \
    sink_name="${PULSE_SINK_NAME}" \
    sink_properties=device.description="Bot_Speaker" >/dev/null
fi

# Create BotMic virtual source fed from the sink monitor if missing.
if pactl list short sources | awk '{print $2}' | grep -qx "${PULSE_SOURCE_NAME}"; then
  echo "[setup-pulse] Source '${PULSE_SOURCE_NAME}' already exists, skipping."
else
  echo "[setup-pulse] Creating virtual source '${PULSE_SOURCE_NAME}'..."
  pactl load-module module-virtual-source \
    source_name="${PULSE_SOURCE_NAME}" \
    master="${PULSE_SINK_NAME}.monitor" \
    source_properties=device.description="Bot_Mic" >/dev/null
fi

echo ""
echo "PulseAudio virtual mic ready."
echo "  Sink   (orchestrator plays TTS here):   ${PULSE_SINK_NAME}"
echo "  Source (Chromium mic inside the bot):   ${PULSE_SOURCE_NAME}"
echo ""
echo "Add this line to your .env (or export it before docker compose up):"
echo "  PULSE_RUNTIME_PATH=${PULSE_RUNTIME_PATH}"
echo ""
echo "Verify with:"
echo "  aplay   -D pulse:${PULSE_SINK_NAME}   /usr/share/sounds/alsa/Front_Center.wav"
echo "  arecord -D pulse:${PULSE_SOURCE_NAME} -f S16_LE -r 16000 -c 1 test.wav"
