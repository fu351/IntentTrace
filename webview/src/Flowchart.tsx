import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import type { FlowGraph, FlowNode } from './vscodeApi';

interface FlowchartProps {
  graph: FlowGraph;
  selectedNodeId: string | null;
  onSelectNode: (node: FlowNode) => void;
}

function _safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9]/g, '_');
}

function _buildMermaid(graph: FlowGraph): string {
  const parts: string[] = [];
  parts.push('flowchart LR');

  const idMap: Record<string, string> = {};
  graph.nodes.forEach((node, idx) => {
    const nid = `N${idx}_${_safeId(node.nodeId)}`;
    idMap[node.nodeId] = nid;
    const label = `${node.kind}: ${node.title}`.replace(/"/g, "'");
    parts.push(`${nid}["${label}"]`);
  });

  (graph.edges || []).forEach(edge => {
    const s = idMap[edge.source] ?? _safeId(edge.source);
    const t = idMap[edge.target] ?? _safeId(edge.target);
    if (edge.label) {
      const lbl = String(edge.label).replace(/"/g, "'");
      parts.push(`${s} -->|${lbl}| ${t}`);
    } else {
      parts.push(`${s} --> ${t}`);
    }
  });

  // class definitions for node statuses
  parts.push('classDef relevant fill:#e6ffed,stroke:#2da44e,stroke-width:1.5px');
  parts.push('classDef vestigial fill:#f3f4f6,stroke:#6e7781,stroke-width:1px,opacity:0.6');
  parts.push('classDef warning fill:#fff7e6,stroke:#9a6700,stroke-width:1.5px');
  parts.push('classDef error fill:#fff0f0,stroke:#cf222e,stroke-width:1.5px');
  parts.push('classDef unsupported stroke-dasharray: 5 5,fill:#ffffff,stroke:#6e7781');

  // assign classes to nodes
  graph.nodes.forEach((node) => {
    const nid = idMap[node.nodeId];
    if (!nid) return;
    const cls = node.status ?? 'unsupported';
    parts.push(`class ${nid} ${cls}`);
  });

  return parts.join('\n');
}

export function Flowchart({ graph, selectedNodeId, onSelectNode }: FlowchartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const diagram = _buildMermaid(graph);
    let cancelled = false;

    const renderFallback = () => {
      container.innerHTML = '';
      const frag = document.createDocumentFragment();
      graph.nodes.forEach((node, index) => {
        const item = document.createElement('div');
        item.className = 'flow-step';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flow-node';
        btn.dataset.status = node.status;
        btn.dataset.selected = String(node.nodeId === selectedNodeId);
        btn.onclick = () => onSelectNode(node);

        const kind = document.createElement('span');
        kind.className = 'node-kind';
        kind.textContent = node.kind;
        btn.appendChild(kind);

        const title = document.createElement('span');
        title.className = 'node-title';
        title.textContent = node.title;
        btn.appendChild(title);

        const desc = document.createElement('span');
        desc.className = 'node-description';
        desc.textContent = node.description;
        btn.appendChild(desc);

        if (node.warningIds.length > 0) {
          const w = document.createElement('span');
          w.className = 'node-warning-count';
          w.textContent = `${node.warningIds.length} warning${node.warningIds.length === 1 ? '' : 's'}`;
          btn.appendChild(w);
        }

        item.appendChild(btn);
        if (index < graph.nodes.length - 1) {
          const edge = document.createElement('div');
          edge.className = 'flow-edge';
          edge.setAttribute('aria-hidden', 'true');
          item.appendChild(edge);
        }

        frag.appendChild(item);
      });
      container.appendChild(frag);
    };

    // If mermaid is available, render into container; otherwise fallback to list view
    if (mermaid && typeof mermaid.render === 'function') {
      (async () => {
        try {
          const id = `mermaid_${Math.random().toString(36).slice(2, 9)}`;
          mermaid.initialize({ startOnLoad: false, theme: 'base' });
          const rendered = await mermaid.render(id, diagram);
          if (cancelled) return;
          container.innerHTML = typeof rendered === 'string' ? rendered : rendered.svg;
        } catch (e) {
          if (cancelled) return;
          container.innerHTML = '<pre></pre>';
          const pre = container.querySelector('pre');
          if (pre) {
            pre.textContent = diagram;
          }
        }
      })();
    } else {
      renderFallback();
    }

    return () => {
      cancelled = true;
    };
  }, [graph, selectedNodeId, onSelectNode]);

  return (
    <section className="flowchart" aria-label="Semantic flowchart">
      <div ref={containerRef} />
    </section>
  );
}
