"""FastAPI entrypoint for the Gemini Live voice-assistant orchestrator."""
from __future__ import annotations

import base64
import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Body, FastAPI, HTTPException, Path
from pydantic import BaseModel, Field

from .audio_player import AudioPlayer
from .config import settings
from .session_manager import SessionManager
from .state import registry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


audio_player = AudioPlayer(sink_name=settings.pulse_sink)
session_manager = SessionManager(
    settings=settings,
    registry=registry,
    audio_player=audio_player,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "Orchestrator starting: mode=%s model=%s sink=%s",
        settings.pipeline_mode,
        settings.gemini_model,
        settings.pulse_sink,
    )
    try:
        yield
    finally:
        log.info("Orchestrator shutting down; closing sessions…")
        await session_manager.shutdown()


app = FastAPI(title="MeetingBot Voice Orchestrator", lifespan=lifespan)


class StartRequest(BaseModel):
    control_url: str | None = Field(
        default=None,
        description="HTTP base URL on the bot worker for mute/unmute callbacks.",
    )


class AudioChunkRequest(BaseModel):
    bot_id: int = Field(..., description="ID of the bot session this chunk belongs to.")
    audio_b64: str = Field(..., description="Base64-encoded 16 kHz mono s16le PCM.")
    ts: float | None = None


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "mode": settings.pipeline_mode,
        "model": settings.gemini_model,
        "active_sessions": [s.bot_id for s in registry.all()],
    }


@app.post("/bots/{bot_id}/start")
async def start_bot(
    bot_id: Annotated[int, Path(ge=1)],
    body: StartRequest = Body(default_factory=StartRequest),
) -> dict[str, object]:
    if settings.pipeline_mode.lower() != "gemini_live":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported PIPELINE_MODE '{settings.pipeline_mode}'",
        )
    if not settings.gemini_api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
    try:
        await session_manager.start(bot_id, control_url=body.control_url)
    except Exception as exc:  # noqa: BLE001
        log.exception("Failed to start session for bot %s", bot_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "started", "bot_id": bot_id}


@app.post("/bots/{bot_id}/stop")
async def stop_bot(bot_id: Annotated[int, Path(ge=1)]) -> dict[str, object]:
    await session_manager.stop(bot_id)
    return {"status": "stopped", "bot_id": bot_id}


@app.post("/audio-chunk")
async def audio_chunk(body: AudioChunkRequest) -> dict[str, object]:
    try:
        pcm = base64.b64decode(body.audio_b64, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid base64: {exc}") from exc
    status = await session_manager.ingest_chunk(body.bot_id, pcm)
    return {"status": status, "bytes": len(pcm)}
