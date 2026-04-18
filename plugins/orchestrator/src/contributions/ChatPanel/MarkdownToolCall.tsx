// Per A013/ChatPanel: custom tool-call card for prose/JSON-returning tools.
//
// Spark ships a preset `ToolCall` (from `@agentscope-ai/chat/OperateCard/
// preset/ToolCall.tsx`) that renders `input`/`output` as plain-text code
// blocks — which means (a) markdown like `**bold**` shows up as literal
// characters, and (b) JSON strings with escaped newlines show up as `{\n "x":
// "y"}` garbage. For the tools we enable (shell, file reads, agent ops), the
// payload is usually one of two shapes:
//
//   • AgentScope TextBlock array  — `[{type: 'text', text: '...'}]`
//   • JSON-stringified object     — `'{"agents":[{"id":"..."}]}'` with \n
//
// We unpack both into readable form and render them via `<Markdown>` with a
// `json` / `text` code fence so the Markdown component handles syntax
// highlighting + line wrapping. `OperateCard` gives us Spark's collapsible
// card chrome so the visual matches the default `ToolCall` 1:1.

import { Markdown, OperateCard } from '@agentscope-ai/chat';
import { SparkLoadingLine, SparkToolLine } from '@agentscope-ai/icons';
import type React from 'react';

interface ToolCallData {
  readonly content?: Array<{
    data?: {
      name?: string;
      arguments?: unknown;
      output?: unknown;
    };
  }>;
  readonly status?: string;
}

interface MarkdownToolCallProps {
  readonly data: ToolCallData;
}

// ─── Payload normalisation ───────────────────────────────────────────────────

/** AgentScope TextBlock shape — `{type: 'text', text: '...'}`. */
function textFromBlocks(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const texts = value
    .map((item) =>
      item && typeof item === 'object' && 'text' in item && typeof (item as { text: unknown }).text === 'string'
        ? (item as { text: string }).text
        : null,
    )
    .filter((t): t is string => t !== null);
  return texts.length > 0 ? texts.join('\n') : null;
}

/** Try to interpret `raw` as JSON — either an object/array directly, or a string that parses to one. */
function toJson(raw: unknown): unknown | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Decide how to display a tool payload, returning a fenced markdown string.
 *   • JSON-shaped   → ```json\n{pretty}\n```
 *   • Plain string  → the string as-is (Markdown will still render it)
 *   • TextBlock[]   → concatenated text (same as Message.tsx behaviour)
 *   • Anything else → ```json\n{JSON.stringify}\n```
 */
function payloadToMarkdown(payload: unknown): string {
  if (payload == null || payload === '') return '';
  const asText = textFromBlocks(payload);
  if (asText !== null) {
    const asJson = toJson(asText);
    if (asJson !== null) {
      return '```json\n' + JSON.stringify(asJson, null, 2) + '\n```';
    }
    return asText;
  }
  const asJson = toJson(payload);
  if (asJson !== null) {
    return '```json\n' + JSON.stringify(asJson, null, 2) + '\n```';
  }
  if (typeof payload === 'string') return payload;
  return '```json\n' + JSON.stringify(payload, null, 2) + '\n```';
}

// ─── Body sections ───────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  padding: '10px 12px',
  background: 'var(--bg-subtle)',
  borderRadius: 6,
  fontSize: 12,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 6,
};

function Section({ label, body }: { label: string; body: string }) {
  if (!body) return null;
  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>{label}</div>
      <Markdown content={body} />
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

const MarkdownToolCall: React.FC<MarkdownToolCallProps> = ({ data }) => {
  const content = data.content ?? [];
  const toolName = (content[0]?.data?.name as string) ?? 'tool';
  const inputMd = payloadToMarkdown(content[0]?.data?.arguments);
  const outputMd = payloadToMarkdown(content[1]?.data?.output);
  const loading = data.status === 'in_progress';

  return (
    <OperateCard
      header={{
        icon: loading ? <SparkLoadingLine spin /> : <SparkToolLine />,
        title: toolName,
      }}
      body={{
        defaultOpen: false,
        children: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 12px 12px' }}>
            <Section label="Input" body={inputMd} />
            <Section label="Output" body={outputMd} />
          </div>
        ),
      }}
    />
  );
};

/**
 * Tools whose outputs are typically prose or JSON rather than binary/media.
 * For anything else, Spark's default `Tool.tsx` falls through to its plain
 * preset `ToolCall`, which is already fine.
 */
export const MARKDOWN_OUTPUT_TOOLS = [
  'execute_shell_command',
  'read_file',
  'edit_file',
  'grep_search',
  'glob_search',
  'list_agents',
  'chat_with_agent',
  'submit_to_agent',
  'check_agent_task',
  'get_current_time',
  'get_token_usage',
] as const;

/** Builds the `customToolRenderConfig` map to pass into Spark's options. */
export function buildCustomToolRenderers(): Record<string, React.FC<MarkdownToolCallProps>> {
  return Object.fromEntries(
    MARKDOWN_OUTPUT_TOOLS.map((name) => [name, MarkdownToolCall]),
  );
}

export default MarkdownToolCall;
