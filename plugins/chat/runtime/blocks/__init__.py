"""9-block intelligence scaffolding for AgentScope.

Composition layer between pack.yaml config and AgentScope primitives.
Each block reads declarative config, wraps an AgentScope feature, and
exposes configure/apply/evaluate lifecycle methods.

Usage:
    from blocks import BlockPipeline
    pipeline = BlockPipeline.from_pack("../pack/pack.yaml")
    agent = pipeline.build()
"""

from blocks.base import Block, BlockResult, Scorecard
from blocks.pipeline import BlockPipeline

__all__ = ["Block", "BlockResult", "Scorecard", "BlockPipeline"]
