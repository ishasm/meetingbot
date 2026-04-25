"""Per-bot runtime state used to coordinate audio routing and mute control."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field


@dataclass
class BotState:
    bot_id: int
    bot_is_speaking: bool = False
    is_processing: bool = False
    control_url: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class BotStateRegistry:
    def __init__(self) -> None:
        self._states: dict[int, BotState] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(self, bot_id: int) -> BotState:
        async with self._lock:
            state = self._states.get(bot_id)
            if state is None:
                state = BotState(bot_id=bot_id)
                self._states[bot_id] = state
            return state

    def get(self, bot_id: int) -> BotState | None:
        return self._states.get(bot_id)

    async def remove(self, bot_id: int) -> BotState | None:
        async with self._lock:
            return self._states.pop(bot_id, None)

    def all(self) -> list[BotState]:
        return list(self._states.values())


registry = BotStateRegistry()
