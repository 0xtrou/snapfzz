"""SentimentBlock — user mood detection and tone adaptation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from blocks.base import Block, BlockResult, Scorecard


TONE_PROMPTS: dict[str, str] = {
    "professional": "Respond in a clear, professional tone. Be direct and thorough.",
    "casual": "Respond in a friendly, conversational tone. Keep it approachable.",
    "encouraging": (
        "The user may be frustrated or stuck. Respond with patience and encouragement. "
        "Acknowledge difficulty. Offer clear next steps."
    ),
    "concise": "Keep responses brief and actionable. Minimize explanation unless asked.",
}


@dataclass
class SentimentPolicy:
    """Sentiment detection and tone adaptation config.

    The agent loop uses this to optionally prepend tone instructions
    to the system prompt based on detected user mood.
    """

    detect: bool
    adapt: bool
    default_tone: str
    tone_prompts: dict[str, str]

    def get_tone_prompt(self, tone: str | None = None) -> str:
        t = tone or self.default_tone
        return self.tone_prompts.get(t, self.tone_prompts.get(self.default_tone, ""))


class SentimentBlock(Block):
    """Configures user mood detection and response tone adaptation.

    When enabled, injects a tone instruction into the system prompt.
    The actual sentiment detection happens at runtime in the agent loop,
    not during block configuration.

    pack.yaml keys:
        sentiment.detect: enable mood detection (default false)
        sentiment.adapt: adjust tone based on mood (default false)
        sentiment.default: default tone (default 'professional')
    """

    name = "sentiment"

    def _defaults(self) -> dict[str, Any]:
        return {
            "detect": False,
            "adapt": False,
            "default": "professional",
        }

    def _validate(self, config: dict[str, Any]) -> None:
        if config.get("default") not in TONE_PROMPTS:
            raise ValueError(
                f"Unknown tone: {config.get('default')}. "
                f"Valid: {list(TONE_PROMPTS.keys())}"
            )

    def _apply(self, context: dict[str, Any]) -> BlockResult:
        cfg = self._config
        policy = SentimentPolicy(
            detect=cfg["detect"],
            adapt=cfg["adapt"],
            default_tone=cfg["default"],
            tone_prompts=TONE_PROMPTS,
        )

        # If adaptation is enabled, prepend tone to existing system prompt
        meta: dict[str, Any] = {"sentiment_policy": policy}
        if cfg["adapt"]:
            existing = context.get("sys_prompt", "")
            tone_instruction = policy.get_tone_prompt()
            if existing:
                meta["sys_prompt"] = f"{tone_instruction}\n\n{existing}"
            else:
                meta["sys_prompt"] = tone_instruction

        return BlockResult(primitive=policy, meta=meta)

    def _evaluate(self) -> Scorecard | None:
        card = Scorecard(block_name=self.name, score=1.0)
        card.checks["tone_valid"] = self._config.get("default") in TONE_PROMPTS
        if self._config.get("adapt") and not self._config.get("detect"):
            card.checks["detect_with_adapt"] = False
            card.notes.append("adapt=true but detect=false — tone will be static")
        else:
            card.checks["detect_with_adapt"] = True
        return card
