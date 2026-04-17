// Per feedback/small-components + project/SparkDesignFirst: empty-state hero wrapping Spark
// WelcomePrompts. Presentational leaf — accepts suggestions + onPick, emits clicks.

import { WelcomePrompts } from '@agentscope-ai/chat';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { SuggestionPrompt } from '../contracts';

interface EmptyHeroProps {
  readonly suggestions: readonly SuggestionPrompt[];
  readonly onPick: (prompt: string) => void;
  readonly disabled?: boolean;
}

export function EmptyHero({ suggestions, onPick, disabled = false }: EmptyHeroProps) {
  const handleClick = (query: string) => {
    if (disabled) return;
    onPick(query);
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '24px 20px',
        // Per A001/Performance: paint-contained hero isolates empty-state layout from parent reflow.
        contain: 'content',
      }}
    >
      <WelcomePrompts
        greeting="What do you want to build?"
        description="Describe an app, site, or flow. Pick a starter or write your own."
        avatar={<ThunderboltOutlined />}
        prompts={suggestions as unknown as Array<{ value: string }>}
        onClick={handleClick}
      />
    </div>
  );
}

export default EmptyHero;
