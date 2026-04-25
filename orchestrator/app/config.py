"""Environment-driven configuration for the orchestrator."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    pipeline_mode: str
    orchestrator_port: int
    audio_chunk_seconds: int
    trigger_phrase: str
    trigger_phrases: tuple[str, ...]
    engagement_window_seconds: int
    bot_name: str
    self_mute_enabled: bool

    pulse_sink: str
    pulse_source: str

    gemini_api_key: str
    gemini_model: str
    gemini_voice: str
    proactive_audio: bool

    system_prompt_file: str

    meetingbot_api_url: str

    @property
    def system_prompt(self) -> str:
        path = Path(self.system_prompt_file)
        if not path.is_absolute():
            path = Path(__file__).resolve().parent.parent / path
        if path.exists():
            return path.read_text(encoding="utf-8").strip()
        return (
            f'You are an AI meeting assistant named "{self.bot_name}". '
            "Only respond when participants directly address you. "
            "Keep responses to 2-3 sentences; speak naturally without markdown."
        )


def load_settings() -> Settings:
    return Settings(
        pipeline_mode=os.getenv("PIPELINE_MODE", "gemini_live"),
        orchestrator_port=_int("ORCHESTRATOR_PORT", 8080),
        audio_chunk_seconds=_int("AUDIO_CHUNK_SECONDS", 5),
        trigger_phrase=os.getenv("TRIGGER_PHRASE", "hey bot"),
        trigger_phrases=tuple(
            p.strip().lower()
            for p in os.getenv("TRIGGER_PHRASES", os.getenv("TRIGGER_PHRASE", "hey bot")).split(",")
            if p.strip()
        ),
        engagement_window_seconds=_int("ENGAGEMENT_WINDOW_SECONDS", 30),
        bot_name=os.getenv("BOT_NAME", "AI Assistant"),
        self_mute_enabled=_bool("SELF_MUTE_ENABLED", True),
        pulse_sink=os.getenv("PULSE_SINK", "BotSpeaker"),
        pulse_source=os.getenv("PULSE_SOURCE", "BotMic"),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.1-flash-live-preview"),
        gemini_voice=os.getenv("GEMINI_VOICE", "Aoede"),
        proactive_audio=_bool("PROACTIVE_AUDIO", True),
        system_prompt_file=os.getenv("SYSTEM_PROMPT_FILE", "prompts/gemini_live.txt"),
        meetingbot_api_url=os.getenv("MEETINGBOT_API_URL", "http://server:3000"),
    )


settings = load_settings()
