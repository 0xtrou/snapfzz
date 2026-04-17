// Per project/SparkDesignFirst: dispatch ContentBlock → Spark primitives. No hand-rolled
// media/code/markdown/thinking/tool components anywhere in this plugin.

import { Markdown, DeepThinking, OperateCard, StatusCard } from '@agentscope-ai/chat';
import { Audio, Video, Image } from '@agentscope-ai/design';
import { ToolOutlined } from '@ant-design/icons';
import type { ContentBlock, ToolUseBlock } from '../../../types';
import { MESSAGE_LINE_HEIGHT } from '../data';

interface BlockRendererProps {
  readonly block: ContentBlock;
}

// Tool-use status is surfaced in the OperateCard header description — Spark handles the
// expand/collapse UI itself, so we only translate our enum into a human-readable label.
function toolStatusLabel(status: ToolUseBlock['status']): string {
  switch (status) {
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    default:
      return 'running';
  }
}

function serializeToolInput(input: ToolUseBlock['input']): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function serializeOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

export function BlockRenderer({ block }: BlockRendererProps) {
  switch (block.type) {
    case 'text':
      return <Markdown content={block.text} baseFontSize={14} baseLineHeight={MESSAGE_LINE_HEIGHT} />;

    case 'thinking':
      return <DeepThinking title="Thinking" content={block.thinking} defaultOpen={false} />;

    case 'tool_use': {
      const status = toolStatusLabel(block.status);
      return (
        <OperateCard
          header={{
            icon: <ToolOutlined />,
            title: block.name,
            description: status,
          }}
          body={{
            defaultOpen: true,
            children: (
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
                {serializeToolInput(block.input)}
              </pre>
            ),
          }}
        />
      );
    }

    case 'tool_result': {
      const status = block.isError ? 'error' : 'success';
      return (
        <StatusCard
          title={block.name ?? 'tool result'}
          status={status}
          description={serializeOutput(block.output)}
        />
      );
    }

    case 'image':
      return <Image src={block.source} alt={block.alt ?? ''} />;

    case 'audio':
      return <Audio src={block.source} controls />;

    case 'video':
      return <Video src={block.source} controls />;
  }
}

export default BlockRenderer;
