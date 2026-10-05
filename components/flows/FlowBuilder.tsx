"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Save, MessageSquare, List, HelpCircle, Tag, UserRound, Flag, FlaskConical, GalleryHorizontal } from "lucide-react";
import type { AssignableUser, FlowGraph, FlowNodeData, FlowNodeType, FlowValidationError, Template } from "@/types";
import { ADDABLE_STEPS, STEP_META, defaultData, outputsOf, uid } from "@/lib/flows";
import { StepNode, type StepFlowNode } from "./StepNode";
import { StepEditor } from "./StepEditor";
import { FlowSimulator } from "./FlowSimulator";

const nodeTypes = {
  trigger: StepNode,
  message: StepNode,
  list: StepNode,
  carousel: StepNode,
  question: StepNode,
  tag: StepNode,
  assign: StepNode,
  end: StepNode,
};

const PALETTE_ICONS: Partial<Record<FlowNodeType, React.ComponentType<{ className?: string }>>> = {
  message: MessageSquare,
  list: List,
  carousel: GalleryHorizontal,
  question: HelpCircle,
  tag: Tag,
  assign: UserRound,
  end: Flag,
};

const EDGE_DEFAULTS = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#9CA3AF" },
  style: { stroke: "#9CA3AF", strokeWidth: 1.5 },
};

function toRfNodes(graph: FlowGraph): StepFlowNode[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data },
    deletable: n.type !== "trigger",
  }));
}

function toRfEdges(graph: FlowGraph): Edge[] {
  return graph.edges.map((e) => ({ ...EDGE_DEFAULTS, id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target }));
}

export interface FlowBuilderProps {
  initialGraph: FlowGraph;
  templates: Template[];
  agents: AssignableUser[];
  readOnly: boolean;
  saving: boolean;
  serverErrors: FlowValidationError[];
  /** Resolves true when the flow was saved (the "unsaved changes" marker clears). */
  onSave: (graph: FlowGraph) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}

export function FlowBuilder({ initialGraph, templates, agents, readOnly, saving, serverErrors, onSave, onDirtyChange }: FlowBuilderProps) {
  const [nodes, setNodes] = useState<StepFlowNode[]>(() => toRfNodes(initialGraph));
  const [edges, setEdges] = useState<Edge[]>(() => toRfEdges(initialGraph));
  const [selectedId, setSelectedId] = useState<string | null>(initialGraph.nodes[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const markDirty = useCallback(() => setDirty(true), []);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Server problems by step, shown on the cards and in the editor.
  const problemsByNode = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const e of serverErrors) if (e.nodeId) (m[e.nodeId] ||= []).push(e.message);
    return m;
  }, [serverErrors]);
  const generalProblems = serverErrors.filter((e) => !e.nodeId).map((e) => e.message);

  const displayNodes = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, problems: problemsByNode[n.id], active: testing && n.id === activeNodeId } })),
    [nodes, problemsByNode, testing, activeNodeId],
  );

  const variables = useMemo(() => {
    const out: string[] = [];
    for (const n of nodes) {
      const v = typeof n.data.variable === "string" ? n.data.variable : "";
      if (v && !out.includes(v)) out.push(v);
    }
    return out;
  }, [nodes]);

  const onNodesChange = useCallback((changes: NodeChange<StepFlowNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type !== "select" && c.type !== "dimensions")) markDirty();
    for (const c of changes) {
      if (c.type === "select" && c.selected) setSelectedId(c.id);
      if (c.type === "remove") setSelectedId((s) => (s === c.id ? null : s));
    }
  }, [markDirty]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
    if (changes.some((c) => c.type !== "select")) markDirty();
  }, [markDirty]);

  // One output leads to one step: connecting an output that's already wired
  // replaces its old edge instead of forking.
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    const handle = c.sourceHandle || "next";
    setEdges((es) => [
      ...es.filter((e) => !(e.source === c.source && (e.sourceHandle || "next") === handle)),
      { ...EDGE_DEFAULTS, id: uid("e"), source: c.source, sourceHandle: handle, target: c.target },
    ]);
    markDirty();
  }, [markDirty]);

  const isValidConnection: IsValidConnection = useCallback(
    (c) => c.source !== c.target && nodes.find((n) => n.id === c.target)?.type !== "trigger",
    [nodes],
  );

  const updateData = useCallback((id: string, data: FlowNodeData) => {
    let type: FlowNodeType | undefined;
    setNodes((ns) => ns.map((n) => {
      if (n.id !== id) return n;
      type = n.type;
      return { ...n, data };
    }));
    // A removed button/option takes its branch with it.
    setEdges((es) => {
      if (!type) return es;
      const valid = new Set(outputsOf(type, data).map(([h]) => h));
      return es.filter((e) => e.source !== id || valid.has(e.sourceHandle || "next"));
    });
    markDirty();
  }, [markDirty]);

  const deleteNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id || n.type === "trigger"));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
    markDirty();
  }, [markDirty]);

  // New steps appear to the right of the selected one and, if it has an
  // unconnected output, get wired to it — so building a branch is click, click.
  const addStep = useCallback((type: FlowNodeType) => {
    const id = uid(type);
    const from = nodes.find((n) => n.id === selectedId) || nodes[nodes.length - 1];
    let freeHandle: string | null = null;
    if (from) {
      const used = new Set(edges.filter((e) => e.source === from.id).map((e) => e.sourceHandle || "next"));
      freeHandle = outputsOf(from.type, from.data).map(([h]) => h).find((h) => !used.has(h)) ?? null;
    }
    const siblings = from ? edges.filter((e) => e.source === from.id).length : 0;
    const position = from
      ? { x: from.position.x + 320, y: from.position.y + siblings * 170 }
      : { x: 0, y: 0 };
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { id, type, position, data: defaultData(type), deletable: true, selected: true },
    ]);
    if (from && freeHandle) {
      setEdges((es) => [...es, { ...EDGE_DEFAULTS, id: uid("e"), source: from.id, sourceHandle: freeHandle, target: id }]);
    }
    setSelectedId(id);
    markDirty();
  }, [nodes, edges, selectedId, markDirty]);

  const snapshot = (): FlowGraph => ({
      nodes: nodes.map((n) => {
        const data: FlowNodeData = { ...n.data };
        delete data.problems; // display-only, from the last save attempt
        delete data.active;
        return { id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data };
      }),
      edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle || "next", target: e.target })),
  });

  const save = async () => {
    if (await onSave(snapshot())) setDirty(false);
  };

  const selected = nodes.find((n) => n.id === selectedId) || null;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Palette */}
      {!readOnly && (
        <aside className="w-52 shrink-0 border-r border-gray-100 bg-white p-3 space-y-1.5 overflow-y-auto">
          <p className="text-[11px] font-bold tracking-wider uppercase text-gray-400 px-1 pb-1">Add a step</p>
          {ADDABLE_STEPS.map((t) => {
            const Icon = PALETTE_ICONS[t]!;
            const meta = STEP_META[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => addStep(t)}
                className="w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
              >
                <span className="w-7 h-7 rounded-md flex items-center justify-center text-white shrink-0" style={{ background: meta.color }}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[13px] font-semibold text-gray-800">
                    {meta.label} <Plus className="w-3 h-3 text-gray-400" />
                  </span>
                  <span className="block text-[11px] text-gray-400 leading-snug">{meta.hint}</span>
                </span>
              </button>
            );
          })}
          <p className="text-[11px] text-gray-400 leading-relaxed px-1 pt-3">
            Select a step, then add the next one — it connects to the first free output. Drag from an output dot to connect by hand. Select a line and press Delete to remove it.
          </p>
        </aside>
      )}

      {/* Canvas */}
      <div className="flex-1 min-w-0 relative bg-[#f9f9f8]">
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={readOnly ? undefined : onNodesChange}
          onEdgesChange={readOnly ? undefined : onEdgesChange}
          onConnect={readOnly ? undefined : onConnect}
          isValidConnection={isValidConnection}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.3}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="#e5e7eb" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-white !border !border-gray-200 !rounded-lg" maskColor="rgba(0,0,0,0.04)" />
        </ReactFlow>

        {generalProblems.length > 0 && (
          <div className="absolute top-3 left-3 right-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 shadow-sm">
            {generalProblems.map((p, i) => <p key={i} className="text-[12px] text-red-600">{p}</p>)}
          </div>
        )}

        <div className="absolute bottom-4 right-4 flex items-center gap-3">
            {dirty && !readOnly && <span className="text-[12px] text-gray-500 bg-white/90 rounded-md px-2 py-1 border border-gray-200">Unsaved changes</span>}
            <button
              type="button"
              onClick={() => { setTesting((t) => !t); setActiveNodeId(null); }}
              className={`inline-flex items-center gap-2 text-[13px] font-semibold rounded-xl px-4 py-2.5 shadow-md border ${testing ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}
            >
              <FlaskConical className="w-4 h-4" /> {testing ? "Close test" : "Test"}
            </button>
            {!readOnly && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-[#3B694C] hover:bg-[#2f5840] disabled:opacity-60 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5 shadow-md"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save flow"}
            </button>
            )}
          </div>
      </div>

      {/* Step editor */}
      <aside className="w-[340px] shrink-0 border-l border-gray-100 bg-white flex flex-col min-h-0">
        {testing ? (
          <FlowSimulator graph={snapshot()} templates={templates} onClose={() => { setTesting(false); setActiveNodeId(null); }} onActiveNode={setActiveNodeId} />
        ) : selected ? (
          <StepEditor
            key={selected.id}
            nodeId={selected.id}
            type={selected.type}
            data={selected.data}
            problems={problemsByNode[selected.id] || []}
            onChange={(d) => updateData(selected.id, d)}
            onDelete={() => deleteNode(selected.id)}
            templates={templates}
            agents={agents}
            variables={variables}
            readOnly={readOnly}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-2">
            <p className="text-[14px] font-semibold text-gray-700">Select a step to edit it</p>
            <p className="text-[12px] text-gray-400">Start with the Start step: add the campaign template&apos;s buttons, then build what happens after each tap.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
