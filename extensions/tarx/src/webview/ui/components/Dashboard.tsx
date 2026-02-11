/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════
// TARX DASHBOARD v7
// Smart start rows, skill/agent cards
// ═══════════════════════════════════════════════════════════

const VS = {
  bg: "var(--vscode-editor-background, #1e1e1e)",
  fg: "var(--vscode-foreground, #cccccc)",
  fgMuted: "var(--vscode-descriptionForeground, #858585)",
  border: "var(--vscode-panel-border, #2d2d2d)",
  cardBg: "var(--vscode-sideBar-background, #252526)",
  inputBg: "var(--vscode-input-background, #3c3c3c)",
  buttonBg: "var(--vscode-button-background, #0e639c)",
  buttonFg: "var(--vscode-button-foreground, #ffffff)",
  buttonSecBg: "var(--vscode-button-secondaryBackground, #3a3d41)",
  buttonSecFg: "var(--vscode-button-secondaryForeground, #cccccc)",
  badgeBg: "var(--vscode-badge-background, #4d4d4d)",
  badgeFg: "var(--vscode-badge-foreground, #ffffff)",
  listHover: "var(--vscode-list-hoverBackground, #2a2d2e)",
  successFg: "var(--vscode-testing-iconPassed, #73c991)",
  errorFg: "var(--vscode-testing-iconFailed, #f14c4c)",
  warningFg: "var(--vscode-editorWarning-foreground, #cca700)",
  linkFg: "var(--vscode-textLink-foreground, #3794ff)",
  iconFg: "var(--vscode-icon-foreground, #c5c5c5)",
};

// ── File Types ──
const FILE_TYPES: Record<string, { icon: string; color: string }> = {
  ts: { icon: "TS", color: "#3178c6" }, tsx: { icon: "TX", color: "#3178c6" },
  js: { icon: "JS", color: "#f7df1e" }, jsx: { icon: "JX", color: "#61dafb" },
  rs: { icon: "RS", color: "#dea584" }, py: { icon: "PY", color: "#3572a5" },
  css: { icon: "CS", color: "#563d7c" }, html: { icon: "H5", color: "#e34c26" },
  sql: { icon: "SQ", color: "#e38c00" }, sh: { icon: "SH", color: "#89e051" },
  json: { icon: "{ }", color: "#f7df1e" }, jsonl: { icon: "JL", color: "#cca700" },
  csv: { icon: "≡≡", color: "#73c991" }, db: { icon: "DB", color: "#00b4d8" },
  md: { icon: "MD", color: "#519aba" }, txt: { icon: "TX", color: "#858585" },
  pdf: { icon: "PD", color: "#f14c4c" }, toml: { icon: "TM", color: "#9c4221" },
  yaml: { icon: "YM", color: "#cb171e" }, yml: { icon: "YM", color: "#cb171e" },
  env: { icon: ".E", color: "#ecd53f" }, lock: { icon: "LK", color: "#858585" },
  png: { icon: "▣", color: "#a87fd1" }, svg: { icon: "◇", color: "#ffb13b" },
  jpg: { icon: "▣", color: "#a87fd1" }, diff: { icon: "±", color: "#f14c4c" },
  log: { icon: "▤", color: "#858585" }, _default: { icon: "□", color: "#858585" },
};
const getFileType = (name: string) => FILE_TYPES[name.split(".").pop()?.toLowerCase() || ""] || FILE_TYPES._default;

// ── Project Colors ──
const PROJECT_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  "V1 Ship Bugs":          { color: "#00E5A0", bg: "#00E5A018", label: "Ship" },
  "TARX System Knowledge": { color: "#00C8FF", bg: "#00C8FF18", label: "System" },
  "Claude Training":       { color: "#7B61FF", bg: "#7B61FF18", label: "Training" },
  "MCP Testing":           { color: "#FF2E97", bg: "#FF2E9718", label: "MCP" },
  "TARX Chat":             { color: "#FF6B35", bg: "#FF6B3518", label: "Chat" },
  "Claude Memory":         { color: "#00D4AA", bg: "#00D4AA18", label: "Memory" },
  "System Optimization":   { color: "#4D9BFF", bg: "#4D9BFF18", label: "Optimize" },
  "TARX Autonomic":        { color: "#E040FB", bg: "#E040FB18", label: "Autonomic" },
};
const getPS = (p: string) => PROJECT_COLORS[p] || { color: VS.fgMuted, bg: VS.badgeBg + "44", label: p?.slice(0, 8) || "—" };

const getGreeting = (name: string) => {
  const h = new Date().getHours();
  const g = h < 12 ? [`Morning, ${name}`, `Good morning, ${name}. What's first?`]
    : h < 17 ? [`Afternoon, ${name}`, `Back to work, ${name}?`]
    : h < 22 ? [`Evening, ${name}`, `Still at it, ${name}?`]
    : [`It's late, ${name}. Make it count.`];
  return g[Math.floor(Math.random() * g.length)];
};

const useLiveMetrics = () => {
  const [m, setM] = useState({
    tokPerSec: 17.4, ttft: 156, vram: 6.4, vramTotal: 16,
    model: "Qwen 2.5 8.2B", gpu: "Metal M4",
    inference: true, embeddings: false, mesh: true, meshPeers: 0,
    memories: 153, sessions: 250, chunks: 558,
  });
  useEffect(() => {
    const i = setInterval(() => setM(p => ({
      ...p, tokPerSec: 15 + Math.random() * 5, ttft: 98 + Math.random() * 174, vram: 6.0 + Math.random() * 0.8,
    })), 3000);
    return () => clearInterval(i);
  }, []);
  return m;
};

// ═══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════

function FileIcon({ filename, size = 18 }: { filename: string; size?: number }) {
  const ft = getFileType(filename);
  return (
    <div style={{
      width: size, height: size, borderRadius: 2,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size <= 18 ? 7 : 9, fontWeight: 700,
      fontFamily: "var(--vscode-editor-font-family, monospace)",
      color: ft.color, background: ft.color + "18", flexShrink: 0, lineHeight: 1,
    }}>{ft.icon}</div>
  );
}

function ProjectTag({ project }: { project?: string }) {
  if (!project) return null;
  const ps = getPS(project);
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 2, lineHeight: "14px",
      background: ps.bg, color: ps.color, fontWeight: 600,
      whiteSpace: "nowrap", flexShrink: 0,
    }}>{ps.label}</span>
  );
}

function PerfHeader({ metrics }: { metrics: ReturnType<typeof useLiveMetrics> }) {
  const S = ({ label, value, unit, ok }: { label: string; value: string | number; unit?: string; ok?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", borderRight: `1px solid ${VS.border}`, height: "100%" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: ok !== false ? VS.successFg : VS.errorFg, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: VS.fgMuted }}>{label}</span>
      <span style={{ fontSize: 11, color: VS.fg, fontWeight: 600, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>
        {typeof value === "number" ? value.toFixed(1) : value}
      </span>
      {unit && <span style={{ fontSize: 10, color: VS.fgMuted }}>{unit}</span>}
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", height: 30, background: VS.cardBg, borderBottom: `1px solid ${VS.border}`, flexShrink: 0 }}>
      <S label="Inference" value={metrics.tokPerSec} unit="tok/s" ok={metrics.inference} />
      <S label="TTFT" value={metrics.ttft} unit="ms" ok={metrics.ttft < 500} />
      <S label="VRAM" value={`${metrics.vram.toFixed(1)}/${metrics.vramTotal}`} unit="GB" ok />
      <S label="RAG" value={metrics.chunks} unit="chunks" ok={metrics.embeddings} />
      <S label="Mesh" value={metrics.meshPeers === 0 ? "Solo" : metrics.meshPeers} ok={metrics.mesh} />
      <div style={{ flex: 1 }} />
      <div style={{ padding: "0 10px", fontSize: 10, color: VS.fgMuted, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>{metrics.model} · {metrics.gpu}</div>
    </div>
  );
}

function SectionHeader({ title, count, action, onAction }: { title: string; count?: number; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: VS.fgMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{title}</span>
        {count !== undefined && <span style={{ fontSize: 10, background: VS.badgeBg, color: VS.badgeFg, padding: "0 5px", borderRadius: 8, lineHeight: "16px", fontFamily: "var(--vscode-editor-font-family, monospace)" }}>{count}</span>}
      </div>
      {action && <span onClick={onAction} style={{ fontSize: 11, color: VS.linkFg, cursor: "pointer" }}>{action}</span>}
    </div>
  );
}

function ProjectFilters({ projects, active, onToggle }: { projects: string[]; active: string | null; onToggle: (p: string | null) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "8px 0" }}>
      <button onClick={() => onToggle(null)}
        style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, border: `1px solid ${active === null ? VS.fg : VS.border}`, background: active === null ? VS.fg + "15" : "transparent", color: active === null ? VS.fg : VS.fgMuted, cursor: "pointer", fontFamily: "inherit" }}>All</button>
      {projects.map(p => {
        const ps = getPS(p);
        const on = active === p;
        return (
          <button key={p} onClick={() => onToggle(p)}
            style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, border: `1px solid ${on ? ps.color : VS.border}`, background: on ? ps.bg : "transparent", color: on ? ps.color : VS.fgMuted, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: ps.color, marginRight: 5, verticalAlign: "middle" }} />{ps.label}
          </button>
        );
      })}
    </div>
  );
}

function CommandBar({ onClick }: { onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", margin: "10px 0", background: hover ? VS.inputBg : VS.cardBg, border: `1px solid ${VS.border}`, borderRadius: 4, cursor: "text" }}>
      <span style={{ fontSize: 12, color: VS.fgMuted }}>Ask TARX anything...</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: VS.inputBg, color: VS.fgMuted, border: `1px solid ${VS.border}`, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>⌘K</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ARTIFACT CARD
// ═══════════════════════════════════════════════════════════

function ArtifactCard({ name, project, modified, linesChanged, status }: { name: string; project: string; modified: string; linesChanged?: number; status?: string }) {
  const [hover, setHover] = useState(false);
  const ps = getPS(project);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ minWidth: 200, maxWidth: 240, padding: "10px 12px", background: hover ? VS.listHover : VS.cardBg, border: `1px solid ${VS.border}`, borderTop: `2px solid ${ps.color}`, borderRadius: 4, cursor: "pointer", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <FileIcon filename={name} size={22} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: VS.fg, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ fontSize: 10, color: VS.fgMuted }}>File</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ProjectTag project={project} />
        {linesChanged && <span style={{ fontSize: 10, fontFamily: "var(--vscode-editor-font-family, monospace)", color: linesChanged > 0 ? VS.successFg : VS.errorFg }}>{linesChanged > 0 ? "+" : ""}{linesChanged}</span>}
        {status && <span style={{ fontSize: 9, padding: "0 4px", borderRadius: 2, background: status === "modified" ? "#cca70022" : "#73c99122", color: status === "modified" ? VS.warningFg : VS.successFg, fontWeight: 600, textTransform: "uppercase" }}>{status}</span>}
        <span style={{ fontSize: 10, color: VS.fgMuted, marginLeft: "auto" }}>{modified}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RUNNING TASK
// ═══════════════════════════════════════════════════════════

function RunningTask({ title, project, progress, elapsed }: { title: string; project: string; progress?: number; elapsed: string }) {
  const ps = getPS(project);
  return (
    <div style={{ padding: "8px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: VS.warningFg, animation: "pulse 1.5s ease infinite", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: VS.fg, flex: 1 }}>{title}</span>
        <ProjectTag project={project} />
        <span style={{ fontSize: 10, color: VS.fgMuted, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>{elapsed}</span>
      </div>
      {progress !== undefined && (
        <div style={{ height: 2, background: VS.inputBg, borderRadius: 1, marginTop: 2 }}>
          <div style={{ height: 2, background: ps.color, borderRadius: 1, width: `${progress}%`, transition: "width 0.5s ease" }} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APPROVAL ITEM
// ═══════════════════════════════════════════════════════════

interface ApprovalFile { name: string; changes?: number }
interface ApprovalProps {
  title: string; description: string; source: string; impact?: string;
  project: string; status: string; files?: ApprovalFile[];
  onApprove?: () => void; onReject?: () => void;
}

function ApprovalItem({ title, description, source, impact, project, status, files, onApprove, onReject }: ApprovalProps) {
  const [hover, setHover] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ padding: "10px 12px", borderRadius: 3, background: hover ? VS.listHover : "transparent" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: status === "ready" ? VS.linkFg : VS.successFg }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span onClick={() => setExpanded(!expanded)} style={{ fontSize: 13, color: VS.fg, fontWeight: 500, cursor: "pointer" }}>{title}</span>
            <ProjectTag project={project} />
            {impact && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2, fontWeight: 600, textTransform: "uppercase", background: impact === "high" ? "#f14c4c22" : impact === "medium" ? "#cca70022" : "#73c99122", color: impact === "high" ? VS.errorFg : impact === "medium" ? VS.warningFg : VS.successFg }}>{impact}</span>}
          </div>
          <div style={{ fontSize: 11, color: VS.fgMuted, marginTop: 2 }}>{source}</div>
          {expanded && (
            <div style={{ marginTop: 6, padding: "8px 10px", background: VS.inputBg, borderRadius: 3 }}>
              <div style={{ fontSize: 12, color: VS.fgMuted, lineHeight: 1.5 }}>{description}</div>
              {files && files.length > 0 && (
                <div style={{ marginTop: 8, borderTop: `1px solid ${VS.border}`, paddingTop: 6 }}>
                  <div style={{ fontSize: 10, color: VS.fgMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Files affected</div>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                      <FileIcon filename={f.name} size={14} />
                      <span style={{ fontSize: 11, color: VS.fg, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>{f.name}</span>
                      {f.changes && <span style={{ fontSize: 10, color: f.changes > 0 ? VS.successFg : VS.errorFg, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>{f.changes > 0 ? "+" : ""}{f.changes}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {status === "ready" && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={onApprove} style={{ fontSize: 11, padding: "3px 12px", borderRadius: 2, border: "none", background: VS.buttonBg, color: VS.buttonFg, cursor: "pointer", fontFamily: "inherit" }}>Approve</button>
              <button onClick={onReject} style={{ fontSize: 11, padding: "3px 12px", borderRadius: 2, border: "none", background: VS.buttonSecBg, color: VS.buttonSecFg, cursor: "pointer", fontFamily: "inherit" }}>Skip</button>
              <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 2, border: "none", background: "transparent", color: VS.linkFg, cursor: "pointer", fontFamily: "inherit" }}>{expanded ? "Collapse" : "Details"}</button>
            </div>
          )}
          {status === "approved" && <div style={{ fontSize: 11, color: VS.successFg, marginTop: 4 }}>Approved — executing</div>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TODO ITEM
// ═══════════════════════════════════════════════════════════

function TodoItem({ text, source, project, done, onToggle, onDismiss }: { text: string; source?: string; project?: string; done: boolean; onToggle: () => void; onDismiss: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 10px", borderRadius: 3, background: hover ? VS.listHover : "transparent", opacity: done ? 0.45 : 1 }}>
      <button onClick={onToggle} style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${VS.fgMuted}`, background: done ? VS.successFg : "transparent", cursor: "pointer", flexShrink: 0, marginTop: 2, padding: 0, color: done ? "#fff" : "transparent", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? "✓" : ""}</button>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: VS.fg, textDecoration: done ? "line-through" : "none" }}>{text}</span>
          <ProjectTag project={project} />
        </div>
        {source && <div style={{ fontSize: 10, color: VS.fgMuted, marginTop: 1 }}>{source}</div>}
      </div>
      {hover && !done && <button onClick={onDismiss} style={{ fontSize: 11, color: VS.fgMuted, background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>✕</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CONVERSATION ROW
// ═══════════════════════════════════════════════════════════

function ConversationRow({ title, project, messageCount, lastActive, hasUnread }: { title: string; project: string; messageCount: number; lastActive: string; hasUnread?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 3, background: hover ? VS.listHover : "transparent", cursor: "pointer" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: VS.fg, fontWeight: hasUnread ? 600 : 400 }}>{title}</span>
          <ProjectTag project={project} />
          {hasUnread && <span style={{ width: 6, height: 6, borderRadius: "50%", background: VS.linkFg, flexShrink: 0 }} />}
        </div>
        <div style={{ fontSize: 11, color: VS.fgMuted }}>{messageCount} messages</div>
      </div>
      <span style={{ fontSize: 10, color: VS.fgMuted, whiteSpace: "nowrap" }}>{lastActive}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SMART START ROW — contextual, not generic
// ═══════════════════════════════════════════════════════════

function StartRow({ title, subtitle, reason, icon, accentColor, onClick }: { title: string; subtitle: string; reason?: string; icon: string; accentColor?: string; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 3,
        background: hover ? VS.listHover : "transparent",
        cursor: "pointer", transition: "background 0.1s ease",
      }}>
      <div style={{
        width: 28, height: 28, borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, background: (accentColor || VS.linkFg) + "18",
        color: accentColor || VS.linkFg, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: VS.fg, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 11, color: VS.fgMuted, marginTop: 1 }}>{subtitle}</div>
      </div>
      {reason && (
        <span style={{
          fontSize: 9, padding: "1px 6px", borderRadius: 2,
          background: (accentColor || VS.linkFg) + "18",
          color: accentColor || VS.linkFg,
          fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0,
        }}>{reason}</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SKILL / AGENT CARD (horizontal scroll)
// ═══════════════════════════════════════════════════════════

function SkillAgentCard({ name, description, icon, subscribers, tag, isSuggested, isInstalled, accentColor, onToggle }: {
  name: string; description: string; icon: string; subscribers: number;
  tag?: string; isSuggested?: boolean; isInstalled?: boolean; accentColor?: string; onToggle?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        minWidth: 180, maxWidth: 210, padding: "12px 14px",
        background: hover ? VS.listHover : VS.cardBg,
        border: `1px solid ${isSuggested ? (accentColor || VS.linkFg) + "44" : VS.border}`,
        borderRadius: 4, cursor: "pointer", flexShrink: 0,
        transition: "background 0.1s ease, border-color 0.1s ease",
        position: "relative",
      }}>
      {/* Suggested badge */}
      {isSuggested && (
        <span style={{
          position: "absolute", top: -1, right: 10,
          fontSize: 8, padding: "1px 5px", borderRadius: "0 0 3px 3px",
          background: VS.linkFg, color: "#fff", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>Suggested</span>
      )}

      {/* Icon + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, background: (accentColor || VS.iconFg) + "18",
          color: accentColor || VS.iconFg, flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, color: VS.fg, fontWeight: 600 }}>{name}</span>
            {tag && <span style={{ fontSize: 8, padding: "0 3px", borderRadius: 2, background: tag === "Pro" ? "#0e639c33" : "#73c99122", color: tag === "Pro" ? VS.linkFg : VS.successFg, fontWeight: 700, textTransform: "uppercase" }}>{tag}</span>}
          </div>
          <span style={{ fontSize: 10, color: VS.fgMuted, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>
            {subscribers > 1000 ? `${(subscribers / 1000).toFixed(1)}k` : subscribers} users
          </span>
        </div>
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: VS.fgMuted, lineHeight: 1.4, marginBottom: 10, minHeight: 30 }}>{description}</div>

      {/* Action */}
      <button onClick={(e) => { e.stopPropagation(); onToggle?.(); }} style={{
        width: "100%", fontSize: 11, padding: "4px 0", borderRadius: 2,
        border: isInstalled ? `1px solid ${VS.border}` : "none",
        background: isInstalled ? "transparent" : isSuggested ? VS.buttonBg : VS.buttonSecBg,
        color: isInstalled ? VS.fgMuted : isSuggested ? VS.buttonFg : VS.buttonSecFg,
        cursor: "pointer", fontFamily: "inherit",
      }}>{isInstalled ? "Installed" : "Add"}</button>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════

interface DashboardProps {
  onOpenChat?: () => void;
}

export default function TARXDashboard({ onOpenChat }: DashboardProps) {
  const metrics = useLiveMetrics();
  const [greeting] = useState(() => getGreeting("John"));
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [installedSkills, setInstalledSkills] = useState(new Set(["Code Explainer", "Git Diff Review"]));
  const [installedAgents, setInstalledAgents] = useState(new Set(["System Architect"]));

  const allProjects = ["V1 Ship Bugs", "TARX System Knowledge", "Claude Training", "MCP Testing", "TARX Chat", "Claude Memory"];

  // ── DATA ──

  const artifacts = [
    { name: "extension.ts", project: "V1 Ship Bugs", modified: "12m ago", linesChanged: 47, status: "modified" },
    { name: "OBSERVER_MCP_SPEC.md", project: "TARX System Knowledge", modified: "1h ago", linesChanged: 312, status: "new" },
    { name: "training-export-0211.jsonl", project: "Claude Training", modified: "2h ago", status: "new" },
    { name: "inference_engine.rs", project: "V1 Ship Bugs", modified: "3h ago", linesChanged: -23, status: "modified" },
    { name: "V1_SHIP_PLAN.md", project: "V1 Ship Bugs", modified: "5h ago", linesChanged: 18, status: "modified" },
    { name: "mcp-tool-audit.json", project: "MCP Testing", modified: "8h ago", status: "new" },
    { name: "persona-v4.jsonl", project: "Claude Training", modified: "10h ago" },
    { name: "tauri.conf.json", project: "V1 Ship Bugs", modified: "12h ago", linesChanged: 5, status: "modified" },
  ];

  const runningTasks = [
    { title: "Indexing 3 uploaded files for RAG", project: "Claude Memory", progress: 67, elapsed: "1m 12s" },
  ];

  // Smart start suggestions — contextual, driven by system state
  const startSuggestions = [
    { title: "Debug embedding server crash", subtitle: "Sentry NODE-E has a P1 with stack trace ready to analyze", reason: "P1", icon: "⚡", accentColor: VS.errorFg },
    { title: "Review 225 uncommitted changes", subtitle: "Diff is ready. Commit as V1.1 milestone when you're happy.", reason: "Git", icon: "±", accentColor: VS.warningFg },
    { title: "Continue training session 4", subtitle: "12 messages in, persona alignment at ~78%. 22% gap remaining.", reason: "Resume", icon: "◈", accentColor: "#7B61FF" },
    { title: "Pair on a new feature", subtitle: "Describe what you want to build. TARX writes, you approve.", icon: "▸", accentColor: VS.successFg },
    { title: "Think through architecture", subtitle: "Whiteboard a system design, tradeoff analysis, or decision.", icon: "◇", accentColor: VS.linkFg },
    { title: "Ship something", subtitle: "CI/CD, deploy, release notes, version bump.", icon: "▲", accentColor: "#00E5A0" },
  ];

  const [approvals, setApprovals] = useState([
    { id: "a1", status: "ready", impact: "high", project: "V1 Ship Bugs", title: "Fix embedding server crash (ubatch assertion)", description: "Add --ubatch-size 512 --batch-size 512 to embedding server spawn args. Unblocks all RAG/memory.", source: "Sentry NODE-E · P1", files: [{ name: "extension.ts", changes: 4 }, { name: "inference_engine.rs", changes: 12 }] },
    { id: "a2", status: "ready", impact: "high", project: "V1 Ship Bugs", title: "Add singleton guard for llama-server", description: "Check health before spawn. Prevents zombie processes.", source: "Launch audit · P1", files: [{ name: "extension.ts", changes: 28 }] },
    { id: "a3", status: "ready", impact: "medium", project: "V1 Ship Bugs", title: "Commit 225 files as V1.1 milestone", description: "Stage all, structured commit by component.", source: "Git status" },
    { id: "a4", status: "ready", impact: "medium", project: "Claude Training", title: "Generate 50 synthetic training pairs", description: "Top 10 correction patterns × 5 variations. quality ≥ 0.7", source: "Observer analysis", files: [{ name: "training-export-0211.jsonl", changes: 50 }] },
    { id: "a5", status: "ready", impact: "low", project: "TARX System Knowledge", title: "Backoff Sentry 403 polling", description: "Exponential backoff: 60s → max 900s.", source: "Sentry · P2", files: [{ name: "sentry-client.ts", changes: 15 }] },
  ]);

  const [todos, setTodos] = useState([
    { id: "t1", text: "Rate 40 uncurated training records", source: "Training pipeline", project: "Claude Training", done: false },
    { id: "t2", text: "Write canonical self-knowledge doc", source: "3–5K words", project: "Claude Training", done: false },
    { id: "t3", text: "Review MCP tool consolidation", source: "54 tools / 3 servers", project: "MCP Testing", done: false },
  ]);

  const conversations = [
    { title: "Chat Context Audit", project: "TARX System Knowledge", messageCount: 2, lastActive: "6m ago", hasUnread: true },
    { title: "Persona Training — Session 4", project: "Claude Training", messageCount: 12, lastActive: "1h ago" },
    { title: "Embedding Server Fix", project: "V1 Ship Bugs", messageCount: 5, lastActive: "2h ago" },
    { title: "Self-Training: MCP Integration", project: "Claude Training", messageCount: 8, lastActive: "10h ago" },
    { title: "Memory Pipeline Debug", project: "Claude Memory", messageCount: 17, lastActive: "1d ago" },
  ];

  const skills = [
    { name: "Test Scaffold", description: "Generate test stubs and assertions from function signatures", icon: "⬡", subscribers: 4100, tag: "New", isSuggested: true, accentColor: VS.successFg },
    { name: "Performance Audit", description: "Profile hot paths, find memory leaks, suggest optimizations", icon: "◎", subscribers: 1800, tag: "Pro", isSuggested: true, accentColor: VS.warningFg },
    { name: "Code Explainer", description: "Break down functions into plain language explanations", icon: "≡", subscribers: 12400, accentColor: VS.linkFg },
    { name: "Git Diff Review", description: "Analyze staged changes, flag risks before commit", icon: "±", subscribers: 8900, accentColor: "#dea584" },
    { name: "Refactor Assist", description: "Apply refactoring patterns: extract, rename, simplify", icon: "⟳", subscribers: 3200, tag: "New", accentColor: "#7B61FF" },
    { name: "Doc Generator", description: "Generate READMEs, JSDoc, and inline comments from code", icon: "¶", subscribers: 6700, accentColor: "#519aba" },
  ];

  const agents = [
    { name: "Debug Detective", description: "Trace errors through stack, logs, and Sentry. Suggests fixes.", icon: "⚡", subscribers: 7800, isSuggested: true, accentColor: VS.errorFg },
    { name: "Ship Captain", description: "CI/CD prep, version bump, release notes, deploy checks", icon: "▲", subscribers: 1200, tag: "New", isSuggested: true, accentColor: "#00E5A0" },
    { name: "System Architect", description: "Design patterns, structure decisions, dependency analysis", icon: "◇", subscribers: 5600, accentColor: VS.linkFg },
    { name: "Code Mentor", description: "Adaptive teaching. Explains at your level, levels you up.", icon: "◈", subscribers: 2900, tag: "Pro", accentColor: "#7B61FF" },
  ];

  // ── Filtering ──
  const f = (item: { project: string }) => !projectFilter || item.project === projectFilter;
  const filteredApprovals = approvals.filter(f);
  const filteredTodos = todos.filter(f);
  const filteredConversations = conversations.filter(f);
  const filteredArtifacts = artifacts.filter(f);
  const filteredRunning = runningTasks.filter(f);

  const handleApprove = (id: string) => setApprovals(p => p.map(a => a.id === id ? { ...a, status: "approved" } : a));
  const handleReject = (id: string) => setApprovals(p => p.filter(a => a.id !== id));
  const toggleTodo = (id: string) => setTodos(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const dismissTodo = (id: string) => setTodos(p => p.filter(t => t.id !== id));
  const toggleSkill = (n: string) => setInstalledSkills(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });
  const toggleAgent = (n: string) => setInstalledAgents(p => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });

  const pendingApprovals = filteredApprovals.filter(a => a.status === "ready");
  const pendingTodos = filteredTodos.filter(t => !t.done);

  return (
    <div style={{ background: VS.bg, color: VS.fg, fontFamily: "var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)", fontSize: 13, height: "100%", display: "flex", flexDirection: "column" }}>
      <PerfHeader metrics={metrics} />

      <div style={{ flex: 1, overflow: "auto", padding: "0 20px 40px" }}>

        {/* Greeting */}
        <div style={{ padding: "16px 0 0" }}>
          <div style={{ fontSize: 16, fontWeight: 400, color: VS.fg }}>{greeting}</div>
          <div style={{ fontSize: 12, color: VS.fgMuted, marginTop: 2 }}>
            {pendingApprovals.length} pending · {pendingTodos.length} tasks · {filteredRunning.length > 0 ? `${filteredRunning.length} running · ` : ""}{metrics.memories} memories
          </div>
        </div>

        <CommandBar onClick={onOpenChat} />
        <ProjectFilters projects={allProjects} active={projectFilter} onToggle={p => setProjectFilter(prev => prev === p ? null : p)} />

        {/* Artifacts */}
        <SectionHeader title="Recent files" count={filteredArtifacts.length} action="View all" />
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin" }}>
          {filteredArtifacts.map((a, i) => <ArtifactCard key={i} {...a} />)}
          {filteredArtifacts.length === 0 && <div style={{ padding: 20, fontSize: 12, color: VS.fgMuted }}>No recent files</div>}
        </div>

        {/* Running */}
        {filteredRunning.length > 0 && (
          <>
            <SectionHeader title="Running now" count={filteredRunning.length} />
            <div style={{ background: VS.cardBg, borderRadius: 4, border: `1px solid ${VS.border}`, padding: "2px 0" }}>
              {filteredRunning.map((t, i) => <RunningTask key={i} {...t} />)}
            </div>
          </>
        )}

        {/* Approvals */}
        <SectionHeader title="Needs your approval" count={pendingApprovals.length} />
        <div style={{ background: VS.cardBg, borderRadius: 4, border: `1px solid ${VS.border}`, padding: "2px 0" }}>
          {filteredApprovals.length > 0 ? filteredApprovals.map(a => (
            <ApprovalItem key={a.id} {...a} onApprove={() => handleApprove(a.id)} onReject={() => handleReject(a.id)} />
          )) : (
            <div style={{ padding: "14px 12px", fontSize: 12, color: VS.fgMuted, textAlign: "center" }}>All clear. TARX is scanning.</div>
          )}
        </div>

        {/* Todos */}
        {filteredTodos.length > 0 && (
          <>
            <SectionHeader title="Your tasks" count={pendingTodos.length} />
            <div style={{ background: VS.cardBg, borderRadius: 4, border: `1px solid ${VS.border}`, padding: "4px 0" }}>
              {filteredTodos.map(t => <TodoItem key={t.id} {...t} onToggle={() => toggleTodo(t.id)} onDismiss={() => dismissTodo(t.id)} />)}
            </div>
          </>
        )}

        {/* Continue */}
        <SectionHeader title="Continue" count={filteredConversations.length} action="New conversation" />
        <div style={{ background: VS.cardBg, borderRadius: 4, border: `1px solid ${VS.border}`, padding: "2px 0" }}>
          {filteredConversations.length > 0 ? filteredConversations.map((c, i) => <ConversationRow key={i} {...c} />) : (
            <div style={{ padding: "14px 12px", fontSize: 12, color: VS.fgMuted, textAlign: "center" }}>No conversations</div>
          )}
        </div>

        {/* ── START — Smart contextual rows ── */}
        <SectionHeader title="Start something new" count={startSuggestions.length} />
        <div style={{ background: VS.cardBg, borderRadius: 4, border: `1px solid ${VS.border}`, padding: "2px 0" }}>
          {startSuggestions.map((s, i) => <StartRow key={i} {...s} />)}
        </div>

        {/* ── SKILLS — Horizontal cards ── */}
        <SectionHeader title="Skills" count={skills.length} action="Browse all" />
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin" }}>
          {skills.map(s => (
            <SkillAgentCard key={s.name} {...s}
              isInstalled={installedSkills.has(s.name)}
              onToggle={() => toggleSkill(s.name)}
            />
          ))}
        </div>

        {/* ── AGENTS — Horizontal cards ── */}
        <SectionHeader title="Agents" count={agents.length} action="Browse all" />
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "thin" }}>
          {agents.map(a => (
            <SkillAgentCard key={a.name} {...a}
              isInstalled={installedAgents.has(a.name)}
              onToggle={() => toggleAgent(a.name)}
            />
          ))}
        </div>

      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button:hover { filter: brightness(1.15); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        ::-webkit-scrollbar { width: 8px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, #424242); border-radius: 4px; }
      `}</style>
    </div>
  );
}
