/**
 * Full-text search over the help articles (src/lib/helpContent.js). Runs in the browser,
 * no index to build: the help is small enough to scan on every keystroke.
 */

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'by', 'with', 'is', 'it', 'i', 'how', 'do', 'can', 'my', 'what', 'does']);

/** Lowercase words, without stop words, with a plural "s" removed ("mappings" → "mapping") */
export function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[`*]/g, '').split(/[^a-z0-9]+/)
    .filter(t => t && !STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

/** All readable text of one block, for searching */
function blockText(block) {
  return [block.title, block.text, ...(block.items || []), ...(block.head || []), ...(block.rows || []).flat(), block.label]
    .filter(Boolean).join(' ');
}

/** All readable text of an article body, markdown marks removed */
export function articleText(article) {
  return article.body.map(blockText).join(' \n').replace(/[`*]/g, '');
}

/** How well one query word matches a list of words: exact beats prefix ("map" finds "mapping") */
function matchCount(term, tokens) {
  let n = 0;
  for (const t of tokens) if (t === term) n += 1; else if (t.startsWith(term)) n += 0.6;
  return n;
}

/** A short excerpt of the body around the first query word found */
function snippet(text, terms, size = 170) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.search(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return text.slice(0, size).trim() + (text.length > size ? '…' : '');
  const start = Math.max(0, at - 50);
  const end = Math.min(text.length, start + size);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

/**
 * Articles that contain every query word (in the title, keywords, summary or body),
 * best first. Title and keyword hits outrank body hits; the exact phrase earns a bonus.
 * Returns [{ article, score, snippet, terms }].
 */
export function searchHelp(articles, query, { limit = 20 } = {}) {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];
  const phrase = query.trim().toLowerCase();

  const results = [];
  for (const article of articles) {
    const body = articleText(article);
    const fields = {
      title: tokenize(article.title),
      keywords: tokenize((article.keywords || []).join(' ')),
      summary: tokenize(article.summary),
      body: tokenize(body),
    };
    let score = 0;
    let all = true;
    for (const term of terms) {
      const title = matchCount(term, fields.title);
      const keywords = matchCount(term, fields.keywords);
      const summary = matchCount(term, fields.summary);
      const inBody = matchCount(term, fields.body);
      if (!title && !keywords && !summary && !inBody) { all = false; break; }
      score += title * 10 + keywords * 6 + summary * 3 + Math.min(inBody, 5);
    }
    if (!all) continue;
    if (terms.length > 1 && (article.title.toLowerCase().includes(phrase) || body.toLowerCase().includes(phrase))) score += 8;
    results.push({ article, score, snippet: snippet(body, [phrase, ...terms]), terms });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
