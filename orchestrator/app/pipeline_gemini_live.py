"""Gemini Live (Mode A) pipeline.

One WebSocket session per bot. Audio chunks from the bot worker are forwarded
as `realtimeInput.audio` messages. Proactive Audio lets Gemini itself decide
when the bot was addressed, so there is no client-side trigger matching.

Response audio (24 kHz s16le PCM) is streamed back over the socket and
dispatched to the AudioPlayer for playback on the BotSpeaker sink.

The session supports resumption via `sessionResumption.handle` so the ~30
minute Gemini Live session cap can be spanned transparently.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed

from .audio_player import AudioPlayer
from .config import Settings
from .pipeline_base import BasePipeline
from .state import BotState

log = logging.getLogger(__name__)

GEMINI_WS_URL_TEMPLATE = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta."
    "GenerativeService.BidiGenerateContent"
    "?key={api_key}"
)


class GeminiLivePipeline(BasePipeline):
    def __init__(
        self,
        settings: Settings,
        bot_state: BotState,
        audio_player: AudioPlayer,
    ) -> None:
        self.settings = settings
        self.bot_state = bot_state
        self.audio_player = audio_player

        self._ws: websockets.WebSocketClientProtocol | None = None
        self._receive_task: asyncio.Task[None] | None = None
        self._reconnect_task: asyncio.Task[None] | None = None
        self._closed = False
        self._resumption_handle: str | None = None
        self._response_audio_buffer = bytearray()
        self._send_lock = asyncio.Lock()

    @property
    def _ws_url(self) -> str:
        if not self.settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        return GEMINI_WS_URL_TEMPLATE.format(api_key=self.settings.gemini_api_key)

    def _build_setup_message(self) -> dict[str, Any]:
        setup: dict[str, Any] = {
            "model": f"models/{self.settings.gemini_model}",
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": self.settings.gemini_voice,
                        }
                    }
                },
            },
            "systemInstruction": {
                "parts": [{"text": self.settings.system_prompt}],
            },
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
            "sessionResumption": (
                {"handle": self._resumption_handle}
                if self._resumption_handle
                else {}
            ),
        }
        # Note: the `proactivity` field was removed from the Gemini Live setup
        # schema. We rely on the system prompt's trigger-phrase instruction
        # ("Only respond when the user says 'Hey bot'") to achieve the same
        # behavior. self.settings.proactive_audio is kept for future use.
        return {"setup": setup}

    async def connect(self) -> None:
        if self._closed:
            raise RuntimeError("Pipeline is closed")

        log.info("[bot=%s] Connecting to Gemini Live…", self.bot_state.bot_id)
        self._ws = await websockets.connect(
            self._ws_url,
            max_size=8 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=20,
        )
        setup_msg = self._build_setup_message()
        await self._ws.send(json.dumps(setup_msg))
        log.info(
            "[bot=%s] Gemini Live session established (model=%s, voice=%s, proactive=%s).",
            self.bot_state.bot_id,
            self.settings.gemini_model,
            self.settings.gemini_voice,
            self.settings.proactive_audio,
        )
        self._receive_task = asyncio.create_task(
            self._receive_loop(), name=f"gemini-recv-{self.bot_state.bot_id}"
        )

    async def process(self, audio_pcm: bytes) -> None:
        if not audio_pcm or self._closed:
            return
        if self.bot_state.bot_is_speaking:
            return
        ws = self._ws
        if ws is None:
            log.debug("[bot=%s] Drop chunk: WebSocket not connected yet.", self.bot_state.bot_id)
            return

        message = {
            "realtimeInput": {
                "audio": {
                    "data": base64.b64encode(audio_pcm).decode("ascii"),
                    "mimeType": "audio/pcm;rate=16000",
                }
            }
        }
        try:
            async with self._send_lock:
                await ws.send(json.dumps(message))
        except ConnectionClosed:
            log.warning("[bot=%s] Send failed (ws closed), scheduling reconnect.", self.bot_state.bot_id)
            self._schedule_reconnect()

    async def close(self) -> None:
        self._closed = True
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:  # noqa: BLE001
                pass
            self._ws = None

    # ----------------------------- internals -----------------------------

    async def _receive_loop(self) -> None:
        ws = self._ws
        assert ws is not None
        try:
            async for raw in ws:
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    log.warning("[bot=%s] Non-JSON frame from Gemini.", self.bot_state.bot_id)
                    continue
                await self._handle_message(payload)
        except ConnectionClosed as exc:
            log.info(
                "[bot=%s] Gemini Live socket closed: code=%s reason=%s",
                self.bot_state.bot_id,
                getattr(exc, "code", "?"),
                getattr(exc, "reason", ""),
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.exception("[bot=%s] Receive loop error: %s", self.bot_state.bot_id, exc)
        finally:
            if not self._closed:
                self._schedule_reconnect()

    async def _handle_message(self, payload: dict[str, Any]) -> None:
        if "setupComplete" in payload:
            log.debug("[bot=%s] Gemini setup complete.", self.bot_state.bot_id)
            return

        session_update = payload.get("sessionResumptionUpdate")
        if session_update and session_update.get("resumable") and session_update.get("newHandle"):
            self._resumption_handle = session_update["newHandle"]
            log.debug("[bot=%s] Got new session resumption handle.", self.bot_state.bot_id)

        if payload.get("goAway"):
            log.info("[bot=%s] Gemini goAway received; will reconnect.", self.bot_state.bot_id)

        server_content = payload.get("serverContent")
        if not server_content:
            return

        model_turn = server_content.get("modelTurn") or {}
        for part in model_turn.get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and "data" in inline:
                try:
                    audio_bytes = base64.b64decode(inline["data"])
                except (ValueError, TypeError):
                    continue
                self._response_audio_buffer.extend(audio_bytes)

        if server_content.get("turnComplete"):
            if self._response_audio_buffer:
                pcm = bytes(self._response_audio_buffer)
                self._response_audio_buffer.clear()
                asyncio.create_task(self.audio_player.play(self.bot_state, pcm))

        in_t = server_content.get("inputTranscription")
        if in_t and in_t.get("text"):
            log.info("[bot=%s] [User] %s", self.bot_state.bot_id, in_t["text"].strip())
        out_t = server_content.get("outputTranscription")
        if out_t and out_t.get("text"):
            log.info("[bot=%s] [Bot]  %s", self.bot_state.bot_id, out_t["text"].strip())

    def _schedule_reconnect(self) -> None:
        if self._closed:
            return
        if self._reconnect_task and not self._reconnect_task.done():
            return
        self._reconnect_task = asyncio.create_task(
            self._reconnect(), name=f"gemini-reconnect-{self.bot_state.bot_id}"
        )

    async def _reconnect(self) -> None:
        backoff = 1.0
        while not self._closed:
            try:
                if self._ws is not None:
                    try:
                        await self._ws.close()
                    except Exception:  # noqa: BLE001
                        pass
                    self._ws = None
                await asyncio.sleep(backoff)
                await self.connect()
                return
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "[bot=%s] Gemini reconnect failed (%s); retrying in %.1fs",
                    self.bot_state.bot_id,
                    exc,
                    backoff,
                )
                backoff = min(backoff * 2, 30.0)
