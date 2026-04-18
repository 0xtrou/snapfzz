// Per A013/ChatPanel: Spark's default `ToolCall` renders `output` in a plain
// code-style Block — which shows raw markdown like `**flagship**` as literal text
// instead of bolding it. For tools whose outputs are human-prose (shell, file
// reads, agent calls), we want the same Markdown pipeline Spark's `Message.tsx`
// uses. This component is registered via `options.customToolRenderConfig` for
// the relevant tool names and swaps the output renderer accordingly.
//
// Shape of `data` (from Spark's `Tool.tsx`):
//   data.content[0].data.arguments  → tool input args
//   data.content[1].data.output     → tool output (string | TextBlock[] | object)

import { Markdown, ToolCall } from '@agentscope-ai/chat';
import type React from 'react';

interface MarkdownToolCallProps {
  readonly data: {
    content?: Array<{ data?: { name?: string; arguments?: unknown; output?: unknown } }>;
    status?: string;
  };
}

/** Best-effort stringify for tool outputs that might be TextBlock arrays or raw strings. */
function extractText(output: unknown): string | null {
  if (output == null) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    // TextBlock arrays: [{ type: 'text', text: '…' }, …]
    const texts = output
      .map((item) => {
        if (item && typeof item === 'object' && 'text' in item && typeof (item as { text: unknown }).text === 'string') {
          return (item as { text: string }).text;
        }
        return null;
      })
      .filter((t): t is string => t !== null);
    if (texts.length > 0) return texts.join('\n');
  }
  // Not a shape we markdown-render — caller falls back to Block.
  return null;
}

const MarkdownToolCall: React.FC<MarkdownToolCallProps> = ({ data }) => {
  const content = data.content ?? [];
  const toolName = (content[0]?.data?.name as string) ?? 'tool';
  const input = content[0]?.data?.arguments ?? '';
  const rawOutput = content[1]?.data?.output;
  const prose = extractText(rawOutput);
  const loading = data.status === 'in_progress';

  // When the output is markdown-friendly prose, render it via `<Markdown>`
  // inline under the input Block. Spark's ToolCall still provides the
  // collapsible header + Input code block, which is what we want.
  if (prose !== null) {
    return (
      <ToolCall
        loading={loading}
        defaultOpen={false}
        title={toolName}
        input={input as string | Record<string, unknown>}
        // Pass the markdown-rendered node as `output`. Spark's Block renders
        // string outputs via its own code pipeline; passing a ReactNode would
        // break its types — so we render markdown ourselves in a sibling.
        output=""
        outputBlock={{ language: 'text' }}
      >
        <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
          <Markdown content={prose} />
        </div>
      </ToolCall>
    );
  }

  // Unrecognised output shape → fall through to default ToolCall (JSON block).
  return (
    <ToolCall
      loading={loading}
      defaultOpen={false}
      title={toolName}
      input={input as string | Record<string, unknown>}
      output={(rawOutput ?? '') as string | Record<string, unknown>}
    />
  );
};

/**
 * Tools whose outputs are typically prose/markdown rather than structured JSON.
 * For anything else, Spark's default ToolCall (JSON block) is already correct.
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
