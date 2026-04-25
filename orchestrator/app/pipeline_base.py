"""Abstract pipeline interface shared by Mode A (Gemini Live) and Mode B (local)."""
from __future__ import annotations

from abc import ABC, abstractmethod

from .state import BotState


class BasePipeline(ABC):
    """Base class for per-bot AI pipelines.

    Implementations receive raw PCM chunks from the bot worker, process them
    through their underlying AI stack, and drive TTS playback to PulseAudio.
    """

    bot_state: BotState

    @abstractmethod
    async def connect(self) -> None:
        """Establish upstream connections (e.g. WebSocket)."""

    @abstractmethod
    async def process(self, audio_pcm: bytes) -> None:
        """Handle a single PCM chunk from the bot worker."""

    @abstractmethod
    async def close(self) -> None:
        """Tear down upstream resources."""
