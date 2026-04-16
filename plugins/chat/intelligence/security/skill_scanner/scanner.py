"""Skill scanner — static code analysis for injected skills.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/security/skill_scanner/scanner.py

scan_skill(skill_dir) -> ScanResult:
    - Discovers files, runs analyzers, deduplicates findings
    - Handles symlinks, oversized files, configurable skip-extensions
    - Categories: prompt_injection, command_injection, etc.
    - Graceful analyzer failure handling

ScanResult:
    skill_name, findings[], scan_duration, analyzers_used/failed, timestamp
    is_safe -> no CRITICAL/HIGH findings

Config:
    mode: "block" | "warn" | "off" (default "warn")
    timeout: 5-300s (default 30)
    whitelist: [{skill_name, content_hash (SHA-256)}]
"""

# TODO: Extract SkillScanner from QwenPaw repo
