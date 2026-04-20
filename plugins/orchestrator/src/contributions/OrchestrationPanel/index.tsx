// Per feedback/five-layer: thin composition — observation (read side) +
// events (write side) → layout (presentational). No logic lives here.

import { useOrchestrationEvents } from './events';
import { useOrchestrationObservation } from './observation';
import { OrchestrationPanelLayout } from './layout';

export default function OrchestrationPanel() {
  const { setSelectedAgentId, setSelectedChatId, refresh, ...observation } =
    useOrchestrationObservation();

  const events = useOrchestrationEvents({
    onSelectAgentState: setSelectedAgentId,
    onSelectChatState: setSelectedChatId,
    onRefreshState: refresh,
  });

  return <OrchestrationPanelLayout observation={observation} events={events} />;
}
