// Per feedback/five-layer: thin composition — pulls observation + events and passes to layout.
// No business logic here.

import { useModelPickerObservation } from './observation';
import { useModelPickerEvents } from './events';
import { ModelPickerLayout } from './layout';

export function ModelPicker() {
  const obs = useModelPickerObservation();
  const events = useModelPickerEvents({
    selectedId: obs.selectedId,
    pinnedIds: obs.pinnedIds,
    onRefresh: obs.refresh,
    onToggleOpenState: obs.setOpen,
    onSearchState: obs.setSearch,
    onSelectState: obs.setSelected,
    onPinnedState: obs.setPinned,
  });

  return <ModelPickerLayout observation={obs} events={events} />;
}

export default ModelPicker;
