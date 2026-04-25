"""Per-bot pipeline lifecycle manager."""
from __future__ import annotations

import asyncio
import logging

from .audio_buffer import AudioBuffer
from .audio_player import AudioPlayer
from .config import Settings
from .pipeline_base import BasePipeline
from .pipeline_gemini_live import GeminiLivePipeline
from .state import BotStateRegistry

log = logging.getLogger(__name__)


class SessionManager:
    def __init__(
        self,
        settings: Settings,
        registry: BotStateRegistry,
        audio_player: AudioPlayer,
    ) -> None:
        self.settings = settings
        self.registry = registry
        self.audio_player = audio_player
        self._pipelines: dict[int, BasePipeline] = {}
        self._buffers: dict[int, AudioBuffer] = {}
        self._lock = asyncio.Lock()

    def _build_pipeline(self, bot_id: int) -> BasePipeline:
        state = self.registry.get(bot_id)
        if state is None:
            raise RuntimeError(f"BotState missing for bot {bot_id}")
        mode = self.settings.pipeline_mode.lower()
        if mode == "gemini_live":
            return GeminiLivePipeline(
                settings=self.settings,
                bot_state=state,
                audio_player=self.audio_player,
            )
        raise RuntimeError(
            f"Unsupported PIPELINE_MODE='{self.settings.pipeline_mode}'. "
            "Only 'gemini_live' is implemented in this branch."
        )

    async def start(self, bot_id: int, control_url: str | None = None) -> None:
        async with self._lock:
            state = await self.registry.get_or_create(bot_id)
            if control_url:
                state.control_url = control_url
            if bot_id in self._pipelines:
                log.info("[bot=%s] Session already active; refreshing control URL.", bot_id)
                return
            pipeline = self._build_pipeline(bot_id)
            await pipeline.connect()
            self._pipelines[bot_id] = pipeline
            self._buffers[bot_id] = AudioBuffer()
            log.info("[bot=%s] Session started.", bot_id)

    async def stop(self, bot_id: int) -> None:
        async with self._lock:
            pipeline = self._pipelines.pop(bot_id, None)
            self._buffers.pop(bot_id, None)
            if pipeline is not None:
                try:
                    await pipeline.close()
                finally:
                    log.info("[bot=%s] Session stopped.", bot_id)
            await self.registry.remove(bot_id)

    async def ingest_chunk(self, bot_id: int, pcm: bytes) -> str:
        """Append a chunk to the bot's buffer; flush & forward when full."""
        pipeline = self._pipelines.get(bot_id)
        if pipeline is None:
            return "no-session"

        state = self.registry.get(bot_id)
        if state is None:
            return "no-state"
        if state.bot_is_speaking and self.settings.self_mute_enabled:
            return "muted"

        buf = self._buffers.setdefault(bot_id, AudioBuffer())
        buf.append(pcm)
        if buf.duration_seconds >= self.settings.audio_chunk_seconds:
            chunk = buf.flush()
            asyncio.create_task(pipeline.process(chunk))
            return "forwarded"
        return "buffered"

    async def shutdown(self) -> None:
        for bot_id in list(self._pipelines.keys()):
            await self.stop(bot_id)
