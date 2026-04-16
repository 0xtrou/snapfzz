"""Block: Channels — multi-channel communication adapters.

Extracted from: agentscope-ai/QwenPaw/src/qwenpaw/app/channels/

Channels let the orchestrator communicate with users through external
platforms. Snapfzz's own UI (Zone 3) is one channel; these adapters
add others so the same intelligence is reachable everywhere.

Supported channels (from QwenPaw):
    console     — local terminal (default, always enabled)
    discord     — Discord bot (bot_token, http_proxy)
    telegram    — Telegram bot (bot_token, show_typing)
    dingtalk    — DingTalk robot (client_id, client_secret, card_template)
    feishu      — Feishu/Lark app (app_id, app_secret, domain)
    qq          — QQ bot (app_id, client_secret, markdown_enabled)
    mattermost  — Mattermost bot (url, bot_token, thread_follow)
    imessage    — iMessage bridge (db_path, poll_sec, media_dir)
    mqtt        — MQTT broker (host, port, subscribe/publish topics, TLS)
    matrix      — Matrix homeserver (homeserver, user_id, access_token, encryption)
    voice       — Twilio voice (account_sid, phone_number, STT/TTS providers)
    wecom       — WeCom/WeChat Work

Base channel config (all channels):
    enabled: bool
    bot_prefix: str
    filter_tool_messages: bool
    filter_thinking: bool
    dm_policy: 'open' | 'allowlist'
    group_policy: str
    allow_from: list[str]
    require_mention: bool

Each channel runs as an async adapter inside the orchestrator process.
Channels are configured per-agent via AgentProfileConfig.channels.
"""
