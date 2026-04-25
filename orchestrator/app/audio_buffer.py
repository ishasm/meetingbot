"""Rolling PCM audio buffer that flushes on a fixed duration window."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AudioBuffer:
    sample_rate: int = 16000
    sample_width_bytes: int = 2
    channels: int = 1
    _chunks: list[bytes] = field(default_factory=list)
    _total_bytes: int = 0

    @property
    def bytes_per_second(self) -> int:
        return self.sample_rate * self.sample_width_bytes * self.channels

    @property
    def duration_seconds(self) -> float:
        if self.bytes_per_second == 0:
            return 0.0
        return self._total_bytes / self.bytes_per_second

    def append(self, pcm: bytes) -> None:
        if not pcm:
            return
        self._chunks.append(pcm)
        self._total_bytes += len(pcm)

    def flush(self) -> bytes:
        data = b"".join(self._chunks)
        self._chunks.clear()
        self._total_bytes = 0
        return data

    def clear(self) -> None:
        self._chunks.clear()
        self._total_bytes = 0
