import React, { useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';

cytoscape.use(cola);

// ── Obsidian-style palette (Tokyo Night) ────────────────────────────────
const NODE_COLORS = {
  contact:  '#7AA2F7',  // blue
  company:  '#9ECE6A',  // green
  property: '#BB9AF7',  // purple
  deal:     '#F7768E',  // pink
  market:   '#BB9AF7',  // purple (same family as properties)
  decision: '#FF9E64',  // orange
};
const DEFAULT_COLOR = '#565A6E';
const NODE_RADIUS = 10;       // small dots — 10px radius = 20px diameter

// ── Helpers ─────────────────────────────────────────────────────────────
function truncate(str, max = 20) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

function isStale(node) {
  if (!node.stale_after) return false;
  return new Date(node.stale_after) < new Date();
}

function hasTag(node, tag) {
  const tags = node.tags;
  if (!tags) return false;
  if (Array.isArray(tags)) return tags.some((t) => String(t).toLowerCase().includes(tag));
  return String(tags).toLowerCase().includes(tag);
}

function isPendingReview(node) {
  return node.status === 'pending-review';
}

// ── Component ───────────────────────────────────────────────────────────
const KnowledgeGraph = forwardRef(function KnowledgeGraph(
  { nodes = [], edges = [], onNodeSelect, selectedSlug, className = '', clusterByType = false },
  ref
) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Build Cytoscape elements from API data
  const elements = useMemo(() => {
    const cyNodes = nodes.map((n) => ({
      data: {
        id: n.slug,
        label: truncate(n.title),
        type: n.type,
        _color: NODE_COLORS[n.type] || DEFAULT_COLOR,
        _stale: isStale(n),
        _opportunity: hasTag(n, 'opportunity'),
        _pending: isPendingReview(n),
        // Pass through for detail panel
        ...n,
      },
    }));

    // Only include edges where both endpoints exist in the current node set
    const nodeIds = new Set(cyNodes.map((n) => n.data.id));
    const cyEdges = edges
      .filter((e) => nodeIds.has(e.from_slug) && nodeIds.has(e.to_slug))
      .map((e, i) => ({
        data: {
          id: `e-${e.from_slug}-${e.to_slug}-${i}`,
          source: e.from_slug,
          target: e.to_slug,
        },
      }));

    return [...cyNodes, ...cyEdges];
  }, [nodes, edges]);

  // ── Initialize Cytoscape ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (cyRef.current) cyRef.current.destroy();

    const cy = cytoscape({
      container: containerRef.current,
      elements,

      // ── Stylesheet (Obsidian aesthetic) ──────────────────────────
      style: [
        // Default node — small colored circle
        {
          selector: 'node',
          style: {
            'background-color': 'data(_color)',
            shape: 'ellipse',
            width: NODE_RADIUS * 2,
            height: NODE_RADIUS * 2,
            // Label
            label: 'data(label)',
            color: '#a9b1d6',
            'font-size': '11px',
            'font-family': '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 5,
            'text-outline-color': '#1a1b26',
            'text-outline-width': 2,
            'min-zoomed-font-size': 8,
            // No border by default
            'border-width': 0,
            // Transitions
            'transition-property': 'opacity, border-width, border-color, width, height',
            'transition-duration': '0.15s',
          },
        },

        // Stale nodes — faded
        {
          selector: 'node[?_stale]',
          style: {
            opacity: 0.35,
            'border-style': 'dashed',
            'border-width': 1,
            'border-color': '#565A6E',
          },
        },

        // Opportunity tag — golden glow
        {
          selector: 'node[?_opportunity]',
          style: {
            'border-width': 2,
            'border-color': '#E0AF68',
            'border-opacity': 0.9,
            width: NODE_RADIUS * 2.4,
            height: NODE_RADIUS * 2.4,
          },
        },

        // Pending review — pulsing outline
        {
          selector: 'node[?_pending]',
          style: {
            'border-width': 2,
            'border-color': '#FF9E64',
            'border-style': 'solid',
            'overlay-color': '#FF9E64',
            'overlay-padding': 4,
            'overlay-opacity': 0.15,
          },
        },

        // Selected node — white ring
        {
          selector: 'node:selected',
          style: {
            'border-width': 2,
            'border-color': '#c0caf5',
            width: NODE_RADIUS * 2.5,
            height: NODE_RADIUS * 2.5,
          },
        },

        // ── Edges — thin white lines at low opacity ──────────────
        {
          selector: 'edge',
          style: {
            'line-color': '#ffffff',
            width: 0.5,
            'curve-style': 'haystack',
            'haystack-radius': 0.5,
            opacity: 0.15,
            'transition-property': 'opacity, line-color, width',
            'transition-duration': '0.15s',
          },
        },

        // ── Hover states ─────────────────────────────────────────
        // Dimmed (non-neighbors)
        {
          selector: 'node.dimmed',
          style: {
            opacity: 0.1,
            'text-opacity': 0,
          },
        },
        {
          selector: 'edge.dimmed',
          style: {
            opacity: 0.03,
          },
        },

        // Highlighted (hovered node + neighbors)
        {
          selector: 'node.highlighted',
          style: {
            opacity: 1,
            'text-opacity': 1,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            opacity: 0.5,
            'line-color': '#7AA2F7',
            width: 1,
            label: 'data(label)',
            color: '#565A6E',
            'font-size': '8px',
            'text-rotation': 'autorotate',
            'text-outline-color': '#1a1b26',
            'text-outline-width': 1,
          },
        },

        // The hovered node itself — slightly larger
        {
          selector: 'node.hovered',
          style: {
            width: NODE_RADIUS * 2.8,
            height: NODE_RADIUS * 2.8,
            'border-width': 1.5,
            'border-color': '#c0caf5',
          },
        },
      ],

      // ── Layout — force-directed via cola ────────────────────────
      layout: {
        name: 'cola',
        animate: true,
        maxSimulationTime: 4000,
        ungrabifyWhileSimulating: false,
        fit: true,
        padding: 60,
        nodeSpacing: 25,
        edgeLength: 120,
        convergenceThreshold: 0.001,
        randomize: true,
        avoidOverlap: true,
        handleDisconnected: true,
        infinite: false,
      },

      // ── Interaction ─────────────────────────────────────────────
      minZoom: 0.15,
      maxZoom: 5,
      wheelSensitivity: 0.4,
      boxSelectionEnabled: false,
      autoungrabify: false,
    });

    // ── Event: tap node → select ──────────────────────────────────
    cy.on('tap', 'node', (evt) => {
      if (onNodeSelect) onNodeSelect(evt.target.data());
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy && onNodeSelect) onNodeSelect(null);
    });

    // ── Event: hover → neighborhood highlight ─────────────────────
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass('dimmed');
      neighborhood.addClass('highlighted');
      node.addClass('hovered');
    });

    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('dimmed highlighted hovered');
    });

    // ── Event: zoom → toggle labels ───────────────────────────────
    // Hide labels when zoomed out far, show when zoomed in
    const updateLabelVisibility = () => {
      const zoom = cy.zoom();
      if (zoom < 0.6) {
        cy.style().selector('node').style('text-opacity', 0).update();
      } else {
        cy.style().selector('node').style('text-opacity', 1).update();
      }
    };
    cy.on('zoom', updateLabelVisibility);
    // Run once after layout settles
    cy.one('layoutstop', updateLabelVisibility);

    // ── Pending review pulse animation ────────────────────────────
    // Toggle overlay on pending nodes to create a breathing effect
    let pulseOn = false;
    const pulseInterval = setInterval(() => {
      const pendingNodes = cy.nodes('[?_pending]');
      if (pendingNodes.length === 0) return;
      pulseOn = !pulseOn;
      pendingNodes.style('overlay-opacity', pulseOn ? 0.25 : 0.08);
    }, 1200);

    cyRef.current = cy;

    return () => {
      clearInterval(pulseInterval);
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // ── Re-layout when cluster mode changes ────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.elements().length === 0) return;

    if (clusterByType) {
      // Group nodes by type using cola with alignment constraints
      const types = [...new Set(cy.nodes().map(n => n.data('type')))];
      const groups = {};
      types.forEach((t, i) => { groups[t] = i; });

      cy.layout({
        name: 'cola',
        animate: true,
        maxSimulationTime: 2000,
        nodeSpacing: 20,
        edgeLength: 100,
        padding: 60,
        randomize: false,
        avoidOverlap: true,
        handleDisconnected: true,
        // Group by type — nodes of same type cluster together
        alignment: (node) => ({ x: 0, y: (groups[node.data('type')] || 0) * 200 }),
      }).run();
    } else {
      cy.layout({
        name: 'cola',
        animate: true,
        maxSimulationTime: 2000,
        nodeSpacing: 25,
        edgeLength: 120,
        padding: 60,
        randomize: false,
        avoidOverlap: true,
        handleDisconnected: true,
      }).run();
    }
  }, [clusterByType]);

  // ── Sync selection state ───────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (selectedSlug) {
      const node = cy.getElementById(selectedSlug);
      if (node.length) node.select();
    }
  }, [selectedSlug]);

  // ── Imperative API via ref ─────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    flyToNode(slug) {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(slug);
      if (node.length) {
        cy.animate({ center: { eles: node }, zoom: 2, duration: 500 });
        node.select();
      }
    },
    fit() {
      const cy = cyRef.current;
      if (cy) cy.animate({ fit: { padding: 60 }, duration: 400 });
    },
  }));

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ background: '#1a1b26' }}
    />
  );
});

export default KnowledgeGraph;
