"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertCircle, MessageSquare, List, HelpCircle, Tag, UserRound, Flag, Play, GalleryHorizontal, Images } from "lucide-react";
import type { FlowNodeData, FlowNodeType } from "@/types";
import { STEP_META, outputsOf, previewOf } from "@/lib/flows";

export type StepNodeData = FlowNodeData & { problems?: string[]; active?: boolean };
export type StepFlowNode = Node<StepNodeData, FlowNodeType>;

const ICONS: Record<FlowNodeType, React.ComponentType<{ className?: string }>> = {
  trigger: Play,
  message: MessageSquare,
  list: List,
  carousel: GalleryHorizontal,
  cards: Images,
  question: HelpCircle,
  tag: Tag,
  assign: UserRound,
  end: Flag,
};

// One card per step. Inputs on the left (every step but Start), one output
// row per button/option/"then" on the right, each with its own handle so a
// branch is drawn from exactly the choice it belongs to.
function StepNodeImpl({ type, data, selected }: NodeProps<StepFlowNode>) {
  const meta = STEP_META[type];
  const Icon = ICONS[type];
  const outputs = outputsOf(type, data);
  const problems = data.problems || [];

  return (
    <div
      className={`w-[240px] rounded-xl bg-white shadow-sm border transition-shadow ${
        problems.length ? "border-red-300" : selected ? "border-[#3B694C]" : "border-gray-200"
      } ${selected ? "shadow-md ring-2 ring-[#3B694C]/20" : ""} ${data.active ? "ring-4 ring-amber-300 shadow-lg" : ""}`}
    >
      {type !== "trigger" && (
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-white !border-2 !border-gray-400" />
      )}

      <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl border-b border-gray-100" style={{ background: `${meta.color}12` }}>
        <span className="w-6 h-6 rounded-md flex items-center justify-center text-white" style={{ background: meta.color }}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="text-[12px] font-bold text-gray-800">{meta.label}</span>
        {data.variable ? (
          <span className="ml-auto text-[10px] font-mono text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 truncate max-w-[90px]">
            {data.variable}
          </span>
        ) : null}
        {problems.length > 0 && <AlertCircle className={`w-4 h-4 text-red-500 shrink-0 ${data.variable ? "" : "ml-auto"}`} />}
      </div>

      <p className="px-3 py-2 text-[12px] text-gray-600 leading-snug line-clamp-3 whitespace-pre-wrap break-words">
        {previewOf({ type, data })}
      </p>

      {outputs.length > 0 && (
        <div className="border-t border-gray-100 py-1">
          {outputs.map(([handleId, label]) => (
            <div key={handleId} className="relative px-3 py-1 text-[11px] text-gray-500 text-right pr-5 truncate">
              {label}
              <Handle
                type="source"
                id={handleId}
                position={Position.Right}
                className="!w-3 !h-3 !border-2 !border-white"
                style={{ background: meta.color }}
              />
            </div>
          ))}
        </div>
      )}

      {problems.length > 0 && (
        <ul className="px-3 py-2 border-t border-red-100 bg-red-50/60 rounded-b-xl space-y-0.5">
          {problems.slice(0, 3).map((p, i) => (
            <li key={i} className="text-[11px] text-red-600 leading-snug">{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const StepNode = memo(StepNodeImpl);
