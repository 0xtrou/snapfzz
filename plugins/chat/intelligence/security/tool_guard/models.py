"""Security models — findings, severity, results.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/security/tool_guard/models.py

ToolGuardResult:
    tool_name, params, timestamp, findings[], guardian_names[], failures[]
    is_safe -> no CRITICAL/HIGH findings
    max_severity, get_findings_by_severity()

GuardFinding:
    id, rule_id, threat_category, severity (SAFE|LOW|MEDIUM|HIGH|CRITICAL),
    title, description, remediation, matched_value, matched_pattern, snippet
"""

# TODO: Extract security models from QwenPaw repo
