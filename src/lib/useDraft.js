import { useState, useEffect } from 'react';
import { loadJson, saveJson, removeKey } from './storage';

/**
 * useState for unsent form input that survives a refresh or an accidental tab close.
 * The draft is stored under `key` (include the database and term so drafts never mix)
 * and removed again once it is reset to `initial` (e.g. after a successful save).
 * clear() removes it at once: use it when the form closes right after saving, because an
 * unmounted component's effect never runs to remove the stored copy.
 */
export function useDraft(key, initial) {
  const storageKey = `vocab_draft:${key}`;
  const read = () => loadJson('local', storageKey) ?? initial;
  const [state, setState] = useState(() => ({ key: storageKey, value: read() }));
  // If the key changes while mounted (another term or database), switch to that draft
  const value = state.key === storageKey ? state.value : read();

  useEffect(() => {
    if (state.key !== storageKey) return;
    if (JSON.stringify(state.value) === JSON.stringify(initial)) removeKey('local', storageKey);
    else saveJson('local', storageKey, state.value);
    // initial is a literal default; comparing by value above is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, storageKey]);

  const setValue = (next) => setState(prev => {
    const current = prev.key === storageKey ? prev.value : read();
    return { key: storageKey, value: typeof next === 'function' ? next(current) : next };
  });

  const clear = () => {
    removeKey('local', storageKey);
    setState({ key: storageKey, value: initial });
  };

  return [value, setValue, clear];
}
