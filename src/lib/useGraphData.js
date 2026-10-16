import { useState, useEffect, useMemo } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { querySparql, getBindings, val } from './sparql';
import { SUBCLASS_QUERY } from './ontologyQueries';
import { useCommunityData } from './useCommunityData';
import { buildGraph } from './graphModel';

/**
 * Everything Graph View and Designer View draw: the class graph (with the hierarchy when
 * showHierarchy), statuses, and the groups' data for the vocabulary-term overlay.
 */
export function useGraphData({ showHierarchy, showDeprecated }) {
  const { endpoint, db, token, classes, properties, getTermStatus } = useStardog();
  const community = useCommunityData();
  const [subclasses, setSubclasses] = useState([]);

  useEffect(() => {
    let live = true;
    querySparql(endpoint, db, token, SUBCLASS_QUERY)
      .then(res => { if (live) setSubclasses(getBindings(res).map(b => ({ child: val(b, 'child'), parent: val(b, 'parent') }))); })
      .catch(() => { if (live) setSubclasses([]); });
    return () => { live = false; };
  }, [endpoint, db, token]);

  const graph = useMemo(() => {
    const conceptUris = new Set(community.concepts.map(c => c.uri));
    const g = buildGraph({ classes, properties, subclasses, conceptUris, showHierarchy });
    const status = new Map(g.nodes.map(n => [n.id, getTermStatus(n.id)]));
    if (showDeprecated) return { ...g, status };
    const hidden = new Set(g.nodes.filter(n => ['Deprecated', 'Retired'].includes(status.get(n.id))).map(n => n.id));
    return {
      nodes: g.nodes.filter(n => !hidden.has(n.id)),
      edges: g.edges.filter(e => !hidden.has(e.source) && !hidden.has(e.target)),
      status,
    };
  }, [classes, properties, subclasses, community.concepts, showHierarchy, showDeprecated, getTermStatus]);

  return { graph, community, properties };
}
