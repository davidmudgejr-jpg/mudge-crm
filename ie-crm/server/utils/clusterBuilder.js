/**
 * Union-Find clustering for dedup candidates.
 * Groups overlapping pairs into clusters: if A-B and B-C both exist, returns {A, B, C}.
 */

const MAX_CLUSTER_SIZE = 10;

class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  find(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x))); // path compression
    }
    return this.parent.get(x);
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // union by rank
    const rankA = this.rank.get(ra);
    const rankB = this.rank.get(rb);
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }
}

/**
 * Build clusters from an array of candidate pairs.
 *
 * @param {Array} candidates - rows from dedup_candidates / contact_dedup_candidates / company_dedup_candidates
 * @param {string} idACol - column name for entity A id (e.g. 'property_a_id')
 * @param {string} idBCol - column name for entity B id (e.g. 'property_b_id')
 * @returns {Array<{ clusterId: string, entityIds: string[], candidates: Array, confidence: string, matchTypes: string[] }>}
 */
function buildClusters(candidates, idACol, idBCol) {
  if (!candidates || candidates.length === 0) return [];

  const uf = new UnionFind();

  // Union all pairs
  for (const c of candidates) {
    uf.union(c[idACol], c[idBCol]);
  }

  // Group candidates by cluster root
  const clusterMap = new Map(); // root -> { entityIds: Set, candidates: [], confidences: Set, matchTypes: Set }
  for (const c of candidates) {
    const root = uf.find(c[idACol]);
    if (!clusterMap.has(root)) {
      clusterMap.set(root, {
        entityIds: new Set(),
        candidates: [],
        confidences: new Set(),
        matchTypes: new Set(),
      });
    }
    const cluster = clusterMap.get(root);
    cluster.entityIds.add(c[idACol]);
    cluster.entityIds.add(c[idBCol]);
    cluster.candidates.push(c);
    if (c.confidence) cluster.confidences.add(c.confidence);
    if (c.match_type) cluster.matchTypes.add(c.match_type);
  }

  // Convert to array, pick highest confidence, cap cluster size
  const CONF_RANK = { high: 0, medium: 1, low: 2 };
  const results = [];

  for (const [root, data] of clusterMap) {
    const entityIds = [...data.entityIds];
    const confidences = [...data.confidences];
    confidences.sort((a, b) => (CONF_RANK[a] ?? 3) - (CONF_RANK[b] ?? 3));
    const topConfidence = confidences[0] || 'medium';

    // If cluster exceeds max size, split into chunks
    if (entityIds.length > MAX_CLUSTER_SIZE) {
      for (let i = 0; i < entityIds.length; i += MAX_CLUSTER_SIZE) {
        const chunk = entityIds.slice(i, i + MAX_CLUSTER_SIZE);
        const chunkCandidates = data.candidates.filter(
          c => chunk.includes(c[idACol]) || chunk.includes(c[idBCol])
        );
        results.push({
          clusterId: `${root}-${i}`,
          entityIds: chunk,
          candidates: chunkCandidates,
          confidence: topConfidence,
          matchTypes: [...data.matchTypes],
        });
      }
    } else {
      results.push({
        clusterId: root,
        entityIds,
        candidates: data.candidates,
        confidence: topConfidence,
        matchTypes: [...data.matchTypes],
      });
    }
  }

  // Sort: high confidence first, then by cluster size descending
  results.sort((a, b) => {
    const confDiff = (CONF_RANK[a.confidence] ?? 3) - (CONF_RANK[b.confidence] ?? 3);
    if (confDiff !== 0) return confDiff;
    return b.entityIds.length - a.entityIds.length;
  });

  return results;
}

module.exports = { buildClusters };
