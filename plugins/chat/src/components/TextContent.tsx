import type { RenderableTextBlock } from '../types';
import { CodeBlock } from './CodeBlock';
import InlineRenderer from './InlineRenderer';

interface TextContentProps {
  block: RenderableTextBlock;
}

export function TextContent({ block }: TextContentProps) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {block.segments.map((segment, index) => {
        const key = `${segment.kind}-${index}`;

        if (segment.kind === 'heading') {
          const headingStyle: React.CSSProperties = {
            margin: 0,
            fontSize: Math.max(16, 24 - segment.level * 2),
            lineHeight: 1.3,
            color: 'var(--text-primary)',
          };

          const Tag = `h${segment.level}` as keyof JSX.IntrinsicElements;
          return (
            <Tag key={key} style={headingStyle}>
              <InlineRenderer tokens={segment.inlines} />
            </Tag>
          );
        }

        if (segment.kind === 'list') {
          const ListTag = segment.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={key}
              style={{
                margin: 0,
                paddingInlineStart: 20,
                color: 'var(--text-primary)',
                display: 'grid',
                gap: 6,
              }}
            >
              {segment.items.map((tokens, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`}>
                  <InlineRenderer tokens={tokens} />
                </li>
              ))}
            </ListTag>
          );
        }

        if (segment.kind === 'code') {
          return <CodeBlock key={key} code={segment.code} language={segment.language} />;
        }

        return (
          <p key={key} style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            <InlineRenderer tokens={segment.inlines} />
          </p>
        );
      })}
    </div>
  );
}
