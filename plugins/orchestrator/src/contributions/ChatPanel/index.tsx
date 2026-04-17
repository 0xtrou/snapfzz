// Per A005/PluginArchitecture + feedback/five-layer: top-level composition that assembles
// the layers and hands fully-resolved props to the pure layout.
// Per A013/ModelPicker: wraps with PluginRuntimeProvider so ModelPicker's observation
// can access plugin storage. ModelPicker chip is threaded as composerPrefix.

import { useChat } from '../../hooks/use-chat';
import { SUGGESTION_PROMPTS } from './data';
import { useChatPanelObservation } from './observation';
import { useChatPanelEvents } from './events';
import { ChatPanelLayout } from './layout';
import { PluginRuntimeProvider } from '../runtime';
import { ModelPicker } from '../ModelPicker';
import { ComposerActions } from '../ComposerActions';

function ChatPanelInner() {
  // Observation pulls read-only state from the chat runtime; events need the send/stop
  // handles, so we read those directly rather than piping through observation.
  const { send, stop } = useChat();
  const observation = useChatPanelObservation();
  const events = useChatPanelEvents({ isStreaming: observation.isStreaming, send, stop });

  return (
    <ChatPanelLayout
      observation={observation}
      events={events}
      suggestions={SUGGESTION_PROMPTS}
      composerPrefix={
        <>
          <ComposerActions />
          <ModelPicker />
        </>
      }
    />
  );
}

export function ChatPanel() {
  return (
    <PluginRuntimeProvider>
      <ChatPanelInner />
    </PluginRuntimeProvider>
  );
}

export default ChatPanel;
