/**
 * Where the user is (database, page, selected term, search) lives in the URL hash,
 * so a refresh, a bookmark or a shared link lands on the same screen.
 * Example: #db=my_db&view=explore&term=http%3A%2F%2Fexample.org%2FThing
 */
export function readHash() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

/** Merge updates into the hash; null/'' removes a key. Uses replaceState (no history spam). */
export function updateHash(updates) {
  const params = readHash();
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const hash = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`);
}
