import { useState, useCallback } from 'react';
import { readHash, updateHash } from './urlState';
import { loadJson, saveJson } from './storage';

const DEFAULTS = { hops: 2, showAll: false, hierarchy: true, terms: true, unconnected: null, deprecated: true };

/**
 * Settings shared by Graph View and Designer View (docs/graph-views.md). The focused class is
 * kept in the URL (a link opens the same picture); the switches are remembered per browser.
 */
export function useGraphControls() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...(loadJson('local', 'vocab_graph_settings') || {}) }));
  const [focus, setFocusState] = useState(() => readHash().get('focus'));
  const [selected, setSelected] = useState(() => readHash().get('focus'));

  const set = useCallback((patch) => setSettings(s => {
    const next = { ...s, ...patch };
    saveJson('local', 'vocab_graph_settings', { ...next, showAll: false });
    return next;
  }), []);

  /** Centre the picture on a class (null = whole graph) and select it */
  const setFocus = useCallback((id) => {
    setFocusState(id);
    if (id) setSelected(id);
    updateHash({ focus: id || null });
    if (id) setSettings(s => ({ ...s, showAll: false }));
  }, []);

  const showEverything = useCallback(() => {
    setFocusState(null);
    updateHash({ focus: null });
    setSettings(s => ({ ...s, showAll: true }));
  }, []);

  return { ...settings, set, focus, setFocus, showEverything, selected, setSelected };
}
