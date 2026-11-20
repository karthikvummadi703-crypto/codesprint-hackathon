"""Circuit breaker state for the LLM provider chain.

The breaker is a speed optimisation only: while it is open the caller uses the
grounded fallback instead of paying for another doomed provider round trip. A
successful probe after the cooldown closes it again.
"""

from __future__ import annotations

import time

from logging_config import get_logger

log = get_logger("airguard.ai")


class CircuitBreaker:
    def __init__(self, threshold: int = 3, cooldown_s: float = 30.0) -> None:
        self.threshold = threshold
        self.cooldown_s = cooldown_s
        self.streak = 0
        self.open_until = 0.0

    def record_rate_limit(self, reason: str) -> None:
        self.streak += 1
        if self.streak >= self.threshold:
            self.open_until = time.monotonic() + self.cooldown_s
            log.warning(
                "llm breaker open after %d rate limits; grounded fallback for %ds (last: %s)",
                self.streak,
                int(self.cooldown_s),
                reason,
            )

    def record_success(self) -> None:
        self.streak = 0
        self.open_until = 0.0

    def is_open(self) -> bool:
        return time.monotonic() < self.open_until

    def reset(self) -> None:
        self.streak = 0
        self.open_until = 0.0
