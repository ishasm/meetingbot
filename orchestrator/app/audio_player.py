"""Audio playback to the PulseAudio BotSpeaker sink.

Uses the `pacat` CLI (pulseaudio-utils) as the playback backend. We prefer
`pacat` over `sounddevice` because the orchestrator runs inside a Docker
container that shares the host's PulseAudio socket, and `pacat` can target a
specific sink by name without needing ALSA/PortAudio device indices.

The player serialises playback through an asyncio lock so that the
`bot_is_speaking` flag is monotonic per bot.
"""
from __future__ import annotations

import asyncio
import logging
import shutil
from dataclasses import dataclass

import httpx

from .state import BotState

log = logging.getLogger(__name__)


async def _notify_bot(state: BotState, action: str) -> None:
    """Ask the bot worker to unmute/mute its Meet microphone."""
    if not state.control_url:
        return
    url = state.control_url.rstrip("/") + "/control"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(url, json={"action": action})
    except Exception as exc:  # noqa: BLE001 - best-effort signalling
        log.warning("Failed to notify bot %s control (%s): %s", state.bot_id, action, exc)


@dataclass
class AudioPlayer:
    sink_name: str
    sample_rate: int = 24000
    channels: int = 1
    sample_format: str = "s16le"

    def __post_init__(self) -> None:
        if shutil.which("pacat") is None:
            log.warning("pacat not found on PATH; audio playback will be a no-op.")

    async def play(self, state: BotState, pcm_bytes: bytes) -> None:
        if not pcm_bytes:
            return

        async with state.lock:
            state.bot_is_speaking = True
            await _notify_bot(state, "unmute")
            try:
                await self._spawn_pacat(pcm_bytes)
            finally:
                state.bot_is_speaking = False
                await _notify_bot(state, "mute")

    async def _spawn_pacat(self, pcm_bytes: bytes) -> None:
        if shutil.which("pacat") is None:
            # Estimate duration and sleep so the caller's timing still works.
            bytes_per_sec = self.sample_rate * self.channels * 2
            duration = len(pcm_bytes) / bytes_per_sec if bytes_per_sec else 0.0
            await asyncio.sleep(duration)
            return

        cmd = [
            "pacat",
            "--playback",
            f"--device={self.sink_name}",
            f"--rate={self.sample_rate}",
            f"--channels={self.channels}",
            f"--format={self.sample_format}",
            "--raw",
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            assert proc.stdin is not None
            proc.stdin.write(pcm_bytes)
            await proc.stdin.drain()
            proc.stdin.close()
            await proc.wait()
        except Exception as exc:  # noqa: BLE001
            log.error("pacat playback failed: %s", exc)
            if proc.returncode is None:
                proc.kill()
                await proc.wait()
