import React from 'react';

const TYPE_COLORS = {
  contact: '#7AA2F7',
  company: '#9ECE6A',
  property: '#BB9AF7',
  deal: '#F7768E',
  market: '#BB9AF7',
  decision: '#FF9E64',
};

function Badge({ type }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
      style={{ backgroundColor: TYPE_COLORS[type] || '#565A6E' }}
    >
      {type}
    </span>
  );
}

export default function KnowledgeListView({ nodes, onNodeSelect }) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-crm-muted text-sm">
        No knowledge nodes found
      </div>
    );
  }

  // Sort by type then title
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (a.title || '').localeCompare(b.title || '');
  });

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-crm-card border-b border-crm-border">
          <tr className="text-left text-xs text-crm-muted">
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium hidden sm:table-cell">Status</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">Last Verified</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">Tags</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((node) => {
            const isStale = node.stale_after && new Date(node.stale_after) < new Date();
            return (
              <tr
                key={node.slug}
                onClick={() => onNodeSelect?.(node)}
                className={`border-b border-crm-border/30 cursor-pointer hover:bg-crm-hover transition-colors ${
                  isStale ? 'opacity-50' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <Badge type={node.type} />
                </td>
                <td className="px-3 py-2 text-crm-text font-medium">{node.title}</td>
                <td className="px-3 py-2 text-crm-muted hidden sm:table-cell">
                  <span className={`text-xs ${isStale ? 'text-yellow-500' : ''}`}>
                    {node.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-crm-muted text-xs hidden md:table-cell">
                  {node.last_verified || '--'}
                </td>
                <td className="px-3 py-2 hidden md:table-cell">
                  {Array.isArray(node.tags) && node.tags.length > 0 ? (
                    <div className="flex gap-1 flex-wrap">
                      {node.tags.map((t) => (
                        <span key={t} className="px-1 py-0.5 text-[10px] rounded bg-crm-hover text-crm-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-crm-muted">--</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
