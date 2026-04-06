import React, { useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

// Register cola layout once
cytoscape.use(cola);

const TYPE_STYLES = {
  contact:  { color: '#3B82F6', shape: 'ellipse',          w: 40, h: 40 },
  company:  { color: '#10B981', shape: 'round-rectangle',  w: 50, h: 35 },
  property: { color: '#F59E0B', shape: 'diamond',          w: 40, h: 40 },
  deal:     { color: '#8B5CF6', shape: 'pentagon',          w: 45, h: 45 },
  market:   { color: '#6B7280', shape: 'hexagon',           w: 35, h: 35 },
  decision: { color: '#EF4444', shape: 'triangle',          w: 35, h: 35 },
};
const DEFAULT_STYLE = { color: '#9CA3AF', shape: 'ellipse', w: 36, h: 36 };

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

    const cyEdges = edges.map((e, i) => ({
      data: {
        id: `e-${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        label: e.relation || '',
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
            color: '#d4d4d4',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-outline-color': '#1e1e1e',
            'text-outline-width': 2,
            'border-width': 0,
            'border-color': '#ffffff',
          },
        },
        // Stale nodes
        {
          selector: 'node[_stale]',
          style: {
            opacity: (el) => (el.data('_stale') ? 0.4 : 1),
            'border-style': (el) => (el.data('_stale') ? 'dashed' : 'solid'),
            'border-width': (el) => (el.data('_stale') ? 2 : 0),
            'border-color': '#808080',
          },
        },
        // Opportunity tag
        {
          selector: 'node[_opportunity]',
          style: {
            'border-color': (el) => (el.data('_opportunity') ? '#FFD60A' : '#ffffff'),
            'border-width': (el) => (el.data('_opportunity') ? 2 : 0),
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
        // Edges
        {
          selector: 'edge',
          style: {
            'line-color': '#555555',
            width: 1,
            'curve-style': 'bezier',
            opacity: 0.4,
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#555555',
            'arrow-scale': 0.6,
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 600,
        nodeRepulsion: 8000,
        idealEdgeLength: 120,
        edgeElasticity: 80,
        nestingFactor: 1.2,
        gravity: 0.25,
        numIter: 1000,
        padding: 40,
        randomize: true,
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
