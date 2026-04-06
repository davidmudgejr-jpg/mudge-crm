import React, { useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

// Register cola layout once
cytoscape.use(cola);

const TYPE_STYLES = {
  contact:  { color: '#3B82F6', shape: 'ellipse',          w: 28, h: 28 },
  company:  { color: '#10B981', shape: 'round-rectangle',  w: 32, h: 24 },
  property: { color: '#F59E0B', shape: 'diamond',          w: 28, h: 28 },
  deal:     { color: '#8B5CF6', shape: 'ellipse',           w: 30, h: 30 },
  market:   { color: '#6B7280', shape: 'ellipse',           w: 24, h: 24 },
  decision: { color: '#EF4444', shape: 'ellipse',           w: 22, h: 22 },
};
const DEFAULT_STYLE = { color: '#9CA3AF', shape: 'ellipse', w: 24, h: 24 };

function truncate(str, max = 15) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

function isStale(node) {
  if (!node.stale_after) return false;
  return new Date(node.stale_after) < new Date();
}

function hasOpportunityTag(node) {
  const tags = node.tags;
  if (!tags) return false;
  if (Array.isArray(tags)) return tags.some((t) => t.toLowerCase().includes('opportunity'));
  return String(tags).toLowerCase().includes('opportunity');
}

const KnowledgeGraph = forwardRef(function KnowledgeGraph(
  { nodes = [], edges = [], onNodeSelect, selectedSlug, className = '' },
  ref
) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Build cytoscape elements from props
  const elements = useMemo(() => {
    const cyNodes = nodes.map((n) => {
      const s = TYPE_STYLES[n.type] || DEFAULT_STYLE;
      return {
        data: {
          id: n.slug,
          title: n.title,
          label: truncate(n.title),
          type: n.type,
          ...n,
          _color: s.color,
          _shape: s.shape,
          _w: s.w,
          _h: s.h,
          _stale: isStale(n),
          _opportunity: hasOpportunityTag(n),
        },
      };
    });

    // Filter edges to only include those where BOTH endpoints exist as nodes
    // Cytoscape crashes if an edge references a nonexistent node ID
    const nodeIds = new Set(cyNodes.map((n) => n.data.id));
    const cyEdges = edges
      .filter((e) => nodeIds.has(e.from_slug) && nodeIds.has(e.to_slug))
      .map((e, i) => ({
        data: {
          id: `e-${e.from_slug}-${e.to_slug}-${i}`,
          source: e.from_slug,
          target: e.to_slug,
          label: e.context ? e.context.slice(0, 40) : '',
        },
      }));

    return [...cyNodes, ...cyEdges];
  }, [nodes, edges]);

  // Initialize / update cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(_color)',
            shape: 'data(_shape)',
            width: 'data(_w)',
            height: 'data(_h)',
            label: 'data(label)',
            color: '#a0a0a0',
            'font-size': '9px',
            'font-family': '-apple-system, BlinkMacSystemFont, sans-serif',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-outline-color': '#1e1e1e',
            'text-outline-width': 1.5,
            'border-width': 0,
            'border-color': '#ffffff',
          },
        },
        // Stale nodes — use Cytoscape data selector (truthy check)
        {
          selector: 'node[?_stale]',
          style: {
            opacity: 0.4,
            'border-style': 'dashed',
            'border-width': 2,
            'border-color': '#808080',
          },
        },
        // Opportunity tag
        {
          selector: 'node[?_opportunity]',
          style: {
            'border-color': '#FFD60A',
            'border-width': 2,
          },
        },
        // Selected node
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#ffffff',
          },
        },
        // Edges — Obsidian-style thin lines, no arrows
        {
          selector: 'edge',
          style: {
            'line-color': '#444444',
            width: 0.75,
            'curve-style': 'haystack',
            opacity: 0.3,
          },
        },
        // Dimmed state (non-neighbors on hover)
        {
          selector: 'node.dimmed',
          style: { opacity: 0.15 },
        },
        {
          selector: 'edge.dimmed',
          style: { opacity: 0.05 },
        },
        // Highlighted state (neighbors on hover)
        {
          selector: 'node.highlighted',
          style: { opacity: 1 },
        },
        {
          selector: 'edge.highlighted',
          style: { opacity: 0.6, 'line-color': '#569cd6', width: 1.5 },
        },
      ],
      layout: {
        name: 'cola',
        animate: true,
        maxSimulationTime: 3000,
        ungrabifyWhileSimulating: false,
        nodeSpacing: 30,
        edgeLength: 150,
        convergenceThreshold: 0.01,
        padding: 50,
        randomize: true,
        avoidOverlap: true,
        handleDisconnected: true,
        infinite: false,
      },
      minZoom: 0.2,
      maxZoom: 4,
      wheelSensitivity: 0.3,
    });

    // Event handlers
    cy.on('tap', 'node', (evt) => {
      const data = evt.target.data();
      if (onNodeSelect) onNodeSelect(data);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        if (onNodeSelect) onNodeSelect(null);
      }
    });

    // Obsidian-style hover: highlight connected nodes + edges
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass('dimmed');
      neighborhood.addClass('highlighted');
    });

    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('dimmed highlighted');
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // Intentionally only rebuild when elements change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // Update selection highlight when selectedSlug changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedSlug) {
      const node = cy.getElementById(selectedSlug);
      if (node.length) node.select();
    }
  }, [selectedSlug]);

  // Expose flyToNode via ref
  useImperativeHandle(ref, () => ({
    flyToNode(slug) {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(slug);
      if (node.length) {
        cy.animate({
          center: { eles: node },
          zoom: 1.8,
          duration: 400,
        });
        node.select();
      }
    },
    fit() {
      const cy = cyRef.current;
      if (cy) cy.fit(undefined, 40);
    },
  }));

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ background: 'var(--crm-bg, #1e1e1e)' }}
    />
  );
});

export default KnowledgeGraph;
