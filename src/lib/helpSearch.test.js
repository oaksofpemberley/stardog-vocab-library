import { describe, it, expect } from 'vitest';
import { searchHelp, tokenize, articleText } from './helpSearch';
import { HELP_ARTICLES } from './helpContent';

const ARTICLES = [
  { id: 'map', title: 'Mappings between groups', summary: 'Relate terms', keywords: ['skos'], body: [{ type: 'p', text: 'A **close match** links two concepts.' }] },
  { id: 'status', title: 'Lifecycle status', summary: 'Draft to retired', keywords: ['deprecate'], body: [{ type: 'p', text: 'Set a status. Mappings are elsewhere.' }] },
  { id: 'export', title: 'Export', summary: 'Download', keywords: [], body: [{ type: 'cannot', items: ['Import files'] }] },
];

describe('tokenize', () => {
  it('drops stop words and plural endings, keeps "ss"', () => {
    expect(tokenize('How do I map the Mappings across classes?')).toEqual(['map', 'mapping', 'across', 'classe']);
    expect(tokenize('access')).toEqual(['access']);
  });
});

describe('searchHelp', () => {
  it('ranks a title hit above a body hit', () => {
    const ids = searchHelp(ARTICLES, 'mappings').map(r => r.article.id);
    expect(ids).toEqual(['map', 'status']);
  });

  it('matches word prefixes ("map" finds "mappings")', () => {
    expect(searchHelp(ARTICLES, 'map').map(r => r.article.id)).toContain('map');
  });

  it('requires every query word', () => {
    expect(searchHelp(ARTICLES, 'close match').map(r => r.article.id)).toEqual(['map']);
    expect(searchHelp(ARTICLES, 'close export')).toEqual([]);
  });

  it('searches keywords and list items, not just paragraphs', () => {
    expect(searchHelp(ARTICLES, 'deprecate')[0].article.id).toBe('status');
    expect(searchHelp(ARTICLES, 'import')[0].article.id).toBe('export');
  });

  it('returns a snippet around the match, without markdown marks', () => {
    const [hit] = searchHelp(ARTICLES, 'close match');
    expect(hit.snippet).toContain('close match links');
    expect(hit.snippet).not.toContain('**');
  });

  it('returns nothing for an empty or stop-word-only query', () => {
    expect(searchHelp(ARTICLES, '')).toEqual([]);
    expect(searchHelp(ARTICLES, 'how do I')).toEqual([]);
  });
});

describe('help content', () => {
  it('has unique ids and every article is findable by its own title', () => {
    const ids = HELP_ARTICLES.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of HELP_ARTICLES) {
      expect(searchHelp(HELP_ARTICLES, a.title).map(r => r.article.id)).toContain(a.id);
      expect(articleText(a).length).toBeGreaterThan(0);
    }
  });

  it('answers the common "can it…?" questions', () => {
    const top = (q) => searchHelp(HELP_ARTICLES, q).slice(0, 3).map(r => r.article.id);
    expect(top('import')).toContain('limits');
    expect(top('delete term')).toContain('limits');
    expect(top('orders of magnitude')).toContain('shared-terms');
    expect(top('close match')).toContain('mappings');
    expect(top('approve')).toContain('review-queue');
    expect(top('quick start')).toContain('quick-start');
    expect(top('stardog refused')).toContain('secured-demo');
    expect(top('server audit log')).toContain('audit-log');
    expect(top('how many terms')).toContain('scale');
  });

  it('only links to pages that exist', () => {
    const views = new Set(['quickstart', 'help', 'explore', 'graph', 'designer', 'groups', 'shared', 'mappings', 'queue', 'audit', 'analytics', 'import']);
    for (const a of HELP_ARTICLES) {
      for (const b of a.body) if (b.type === 'goto') expect(views.has(b.view), `${a.id} → ${b.view}`).toBe(true);
      for (const id of a.related || []) expect(ids(HELP_ARTICLES)).toContain(id);
    }
  });
});

const ids = (articles) => articles.map(a => a.id);
