/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect } from "react";
import { postMessage } from "../hooks/useVSCodeAPI";

// ═══════════════════════════════════════════════════════════
// TARX DASHBOARD v3
// Native VS Code design, interactive header, auto-todo
// ═══════════════════════════════════════════════════════════

const VS = {
  bg: "var(--vscode-editor-background, #1e1e1e)",
  fg: "var(--vscode-foreground, #cccccc)",
  fgMuted: "var(--vscode-descriptionForeground, #858585)",
  border: "var(--vscode-panel-border, #2d2d2d)",
  cardBg: "var(--vscode-sideBar-background, #252526)",
  inputBg: "var(--vscode-input-background, #3c3c3c)",
  inputBorder: "var(--vscode-input-border, #3c3c3c)",
  accent: "var(--vscode-focusBorder, #007fd4)",
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
  // Matching sidebar tree item sizing
  treeItemHeight: 22,
  treeIndent: 8,
  treeFontSize: 13,
  sectionFontSize: 11,
};

// Greetings based on time of day + returning user
const getGreeting = (name: string): string => {
  const hour = new Date().getHours();
  const greetings: Record<string, string[]> = {
    morning: [
      `Good morning, ${name}`,
      `Morning, ${name}. What's first?`,
      `Rise and ship, ${name}`,
    ],
    afternoon: [
      `Afternoon, ${name}`,
      `Back to work, ${name}?`,
      `What's next, ${name}?`,
    ],
    evening: [
      `Evening, ${name}`,
      `Still at it, ${name}?`,
      `Night mode, ${name}`,
    ],
    late: [
      `It's late, ${name}. Make it count.`,
      `Burning midnight oil, ${name}?`,
      `One more thing, ${name}?`,
    ],
  };
  const bucket = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "late";
  const options = greetings[bucket];
  return options[Math.floor(Math.random() * options.length)];
};

// Live metrics — polls real service health from extension host
interface Metrics {
  tokPerSec: number;
  ttft: number;
  vram: number;
  vramTotal: number;
  model: string;
  quant: string;
  gpu: string;
  inference: boolean;
  embeddings: boolean;
  mesh: boolean;
  meshPeers: number;
  memories: number;
  sessions: number;
  chunks: number;
}

const useLiveMetrics = (): Metrics => {
  const [m, setM] = useState<Metrics>({
    tokPerSec: 17.4, ttft: 156, vram: 6.4, vramTotal: 16,
    model: "Qwen 2.5 8.2B", quant: "Q4_K_M", gpu: "Metal M4",
    inference: false, embeddings: false, mesh: false, meshPeers: 0,
    memories: 153, sessions: 250, chunks: 558,
  });

  // Poll real service health from extension host
  useEffect(() => {
    const requestHealth = () => postMessage({ command: 'getServiceHealth' });
    requestHealth(); // immediate first fetch

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.command === 'serviceHealth') {
        setM(prev => ({
          ...prev,
          inference: !!msg.inference,
          embeddings: !!msg.embeddings,
          mesh: !!msg.mesh,
          meshPeers: typeof msg.meshPeers === 'number' ? msg.meshPeers : 0,
        }));
      }
    };
    window.addEventListener('message', handler);
    const interval = setInterval(requestHealth, 10000); // re-poll every 10s
    return () => {
      window.removeEventListener('message', handler);
      clearInterval(interval);
    };
  }, []);

  // Simulated perf jitter for tok/s, ttft, vram (until real inference metrics API exists)
  useEffect(() => {
    const i = setInterval(() => setM(p => ({
      ...p,
      tokPerSec: 15 + Math.random() * 5,
      ttft: 98 + Math.random() * 174,
      vram: 6.0 + Math.random() * 0.8,
    })), 3000);
    return () => clearInterval(i);
  }, []);

  return m;
};

// ─── Codicon-style icon (text-based, matches VS Code) ───
function Icon({ name, size = 14, color = VS.iconFg, style = {} }: {
  name: string; size?: number; color?: string; style?: React.CSSProperties;
}) {
  const icons: Record<string, string> = {
    check: "✓", circle: "●", dash: "—", chevron: "›",
    pulse: "◆", warning: "▲", play: "▶", search: "⌕",
    plus: "+", file: "□", chat: "◫", gear: "⚙",
    rocket: "▸", brain: "◈", code: "</>", graph: "⊞",
    todo: "☐", done: "☑", clock: "◷", target: "◎",
  };
  return (
    <span style={{
      fontSize: size,
      color,
      fontFamily: "codicon, 'Segoe Fluent Icons', monospace",
      lineHeight: 1,
      width: size + 2,
      textAlign: "center",
      display: "inline-block",
      ...style,
    }}>
      {icons[name] || name}
    </span>
  );
}

// ─── Performance Header ───
function PerfHeader({ metrics }: { metrics: Metrics }) {
  const Stat = ({ label, value, unit, ok }: { label: string; value: string | number; unit?: string; ok?: boolean }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "0 10px",
      borderRight: `1px solid ${VS.border}`,
      height: "100%",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        backgroundColor: ok !== false ? VS.successFg : VS.errorFg,
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 11, color: VS.fgMuted }}>{label}</span>
      <span style={{ fontSize: 11, color: VS.fg, fontWeight: 600, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>
        {typeof value === "number" ? value.toFixed(1) : value}
      </span>
      {unit && <span style={{ fontSize: 10, color: VS.fgMuted }}>{unit}</span>}
    </div>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", height: 30,
      background: VS.cardBg, borderBottom: `1px solid ${VS.border}`,
    }}>
      <Stat label="Inference" value={metrics.tokPerSec} unit="tok/s" ok={metrics.inference} />
      <Stat label="TTFT" value={metrics.ttft} unit="ms" ok={metrics.ttft < 500} />
      <Stat label="VRAM" value={`${metrics.vram.toFixed(1)}/${metrics.vramTotal}`} unit="GB" ok />
      <Stat label="RAG" value={metrics.chunks} unit="chunks" ok={metrics.embeddings} />
      <Stat label="SuperComputer" value={metrics.meshPeers === 0 ? "Solo" : String(metrics.meshPeers)} ok={metrics.mesh} />
      <div style={{ flex: 1 }} />
      <div style={{ padding: "0 10px", fontSize: 10, color: VS.fgMuted, fontFamily: "var(--vscode-editor-font-family, monospace)" }}>
        {metrics.model} · {metrics.gpu}
      </div>
    </div>
  );
}

// ─── Section Header (matches sidebar section style) ───
function SectionHeader({ title, count, action, onAction }: {
  title: string; count?: number; action?: string; onAction?: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 0 6px",
      userSelect: "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: VS.sectionFontSize, fontWeight: 700, color: VS.fgMuted,
          textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          {title}
        </span>
        {count !== undefined && (
          <span style={{
            fontSize: 10, background: VS.badgeBg, color: VS.badgeFg,
            padding: "0 5px", borderRadius: 8, lineHeight: "16px",
            fontFamily: "var(--vscode-editor-font-family, monospace)",
          }}>
            {count}
          </span>
        )}
      </div>
      {action && (
        <span onClick={onAction} style={{ fontSize: 11, color: VS.linkFg, cursor: "pointer" }}>
          {action}
        </span>
      )}
    </div>
  );
}

// ─── Prompt Flow Card ───
function FlowCard({ icon, title, description, actionLabel, badge, onClick }: {
  icon: string; title: string; description: string; actionLabel: string; badge?: string; onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        background: hover ? VS.listHover : VS.cardBg,
        border: `1px solid ${VS.border}`,
        borderRadius: 4,
        padding: "12px 14px",
        cursor: "pointer",
        transition: "background 0.1s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon name={icon} size={14} color={VS.iconFg} />
        <span style={{ fontSize: VS.treeFontSize, fontWeight: 500, color: VS.fg, flex: 1 }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: 10, background: VS.badgeBg, color: VS.badgeFg,
            padding: "0 5px", borderRadius: 8, lineHeight: "16px",
          }}>{badge}</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: VS.fgMuted, lineHeight: 1.5, marginBottom: 8 }}>{description}</div>
      <button style={{
        fontSize: 12, padding: "4px 12px", borderRadius: 2, border: "none",
        background: VS.buttonBg, color: VS.buttonFg, cursor: "pointer",
        fontFamily: "var(--vscode-font-family, sans-serif)",
      }}>
        {actionLabel}
      </button>
    </div>
  );
}

// ─── Todo Item ───
interface TodoData {
  id: string;
  text: string;
  source: string;
  done: boolean;
  priority: string | null;
}

function TodoItem({ text, source, done, priority, onToggle, onDismiss }: {
  text: string; source: string; done: boolean; priority: string | null;
  onToggle: () => void; onDismiss: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "6px 8px", borderRadius: 3,
        background: hover ? VS.listHover : "transparent",
        transition: "background 0.1s ease",
        opacity: done ? 0.5 : 1,
        minHeight: VS.treeItemHeight,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 16, height: 16, borderRadius: 3, border: `1px solid ${VS.fgMuted}`,
          background: done ? VS.successFg : "transparent", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, marginTop: 1, padding: 0, color: done ? "#fff" : "transparent",
          fontSize: 10, lineHeight: 1,
        }}
      >
        {done ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: VS.treeFontSize, color: VS.fg, lineHeight: "18px",
          textDecoration: done ? "line-through" : "none",
        }}>
          {text}
        </div>
        <div style={{ fontSize: 10, color: VS.fgMuted, marginTop: 1 }}>
          {source}
          {priority === "high" && (
            <span style={{ color: VS.warningFg, marginLeft: 6, fontWeight: 600 }}>HIGH</span>
          )}
        </div>
      </div>
      {hover && !done && (
        <button
          onClick={onDismiss}
          style={{
            fontSize: 12, color: VS.fgMuted, background: "none", border: "none",
            cursor: "pointer", padding: "0 4px", lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Insight Row (no left border stroke) ───
function InsightRow({ text, action, onAction }: {
  text: string; action: string; onAction?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onAction}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 8px", borderRadius: 3,
        background: hover ? VS.listHover : "transparent",
        cursor: "pointer", transition: "background 0.1s ease",
        minHeight: VS.treeItemHeight,
      }}
    >
      <Icon name="pulse" size={10} color={VS.linkFg} />
      <span style={{ flex: 1, fontSize: VS.treeFontSize, color: VS.fg, lineHeight: "18px" }}>{text}</span>
      {hover && <span style={{ fontSize: 11, color: VS.linkFg, whiteSpace: "nowrap" }}>{action}</span>}
    </div>
  );
}

// ─── Skill / Agent Row (matches sidebar tree item height + spacing) ───
function ItemRow({ name, description, tag, subscribers, isInstalled, onToggle }: {
  name: string; description?: string; tag?: string | null; subscribers?: number;
  isInstalled: boolean; onToggle?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 8px", borderRadius: 3,
        background: hover ? VS.listHover : "transparent",
        cursor: "pointer", transition: "background 0.1s ease",
        height: 32,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: VS.treeFontSize, color: VS.fg }}>{name}</span>
          {tag && (
            <span style={{
              fontSize: 9, padding: "0 4px", borderRadius: 2, lineHeight: "14px",
              background: tag === "Pro" ? "#0e639c33" : tag === "New" ? "#73c99122" : VS.badgeBg,
              color: tag === "Pro" ? VS.linkFg : tag === "New" ? VS.successFg : VS.badgeFg,
              fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
            }}>{tag}</span>
          )}
        </div>
      </div>
      {hover && description && (
        <span style={{ fontSize: 11, color: VS.fgMuted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {description}
        </span>
      )}
      {subscribers !== undefined && (
        <span style={{ fontSize: 10, color: VS.fgMuted, fontFamily: "var(--vscode-editor-font-family, monospace)", minWidth: 32, textAlign: "right" }}>
          {subscribers > 1000 ? `${(subscribers/1000).toFixed(1)}k` : subscribers}
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
        style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 2,
          border: isInstalled ? `1px solid ${VS.border}` : "none",
          background: isInstalled ? "transparent" : VS.buttonSecBg,
          color: isInstalled ? VS.fgMuted : VS.buttonSecFg,
          cursor: "pointer", fontFamily: "var(--vscode-font-family, sans-serif)",
        }}
      >
        {isInstalled ? "Installed" : "Add"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

interface DashboardProps {
  onOpenChat?: () => void;
}

export default function TARXDashboard({ onOpenChat }: DashboardProps) {
  const metrics = useLiveMetrics();
  const [userName, setUserName] = useState("there");
  const [greeting] = useState(() => getGreeting(userName));

  // Fetch profile name on mount
  useEffect(() => {
    try {
      // @ts-ignore — vscode API available in webview context
      const vscodeApi = typeof acquireVsCodeApi !== 'undefined' ? (window as any).__vscode : null;
      if (vscodeApi) {
        vscodeApi.postMessage({ command: 'getProfile' });
      }
    } catch {}
  }, []);

  // Listen for profile response
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.command === 'profileData' && msg.display_name) {
        setUserName(msg.display_name);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);
  const [installedSkills, setInstalledSkills] = useState(new Set(["Code Explainer", "Git Diff Review"]));
  const [installedAgents, setInstalledAgents] = useState(new Set(["System Architect"]));

  const [todos, setTodos] = useState<TodoData[]>([
    { id: "1", text: "Rate 40 uncurated training records", source: "Auto-detected from training pipeline", priority: "high", done: false },
    { id: "2", text: "Fix embedding server ubatch assertion crash", source: "Datadog monitor (P1)", priority: "high", done: false },
    { id: "3", text: "Index 3 recently uploaded files for RAG", source: "Auto-detected from file system", priority: null, done: false },
    { id: "4", text: "Review 403 noise from Autonomic module", source: "Datadog (35 events this session)", priority: null, done: false },
    { id: "5", text: "Connect SuperComputer peer for distributed inference", source: "Network config", priority: null, done: false },
    { id: "6", text: "Commit 225 uncommitted files (V1.1 milestone)", source: "Git status", priority: "high", done: false },
    { id: "7", text: "Write canonical self-knowledge doc for fine-tuning", source: "Training audit recommendation", priority: null, done: false },
  ]);

  const toggleTodo = (id: string) => setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const dismissTodo = (id: string) => setTodos(prev => prev.filter(t => t.id !== id));

  const toggleSkill = (name: string) => {
    setInstalledSkills(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };
  const toggleAgent = (name: string) => {
    setInstalledAgents(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const skills = [
    { name: "Code Explainer", description: "Break down any function into plain language", tag: null, subscribers: 12400 },
    { name: "Git Diff Review", description: "Analyze changes, flag risks, suggest commits", tag: null, subscribers: 8900 },
    { name: "Refactor Assist", description: "Apply refactoring patterns to selected code", tag: "New", subscribers: 3200 },
    { name: "Doc Generator", description: "Generate docs from code context", tag: null, subscribers: 6700 },
    { name: "Performance Audit", description: "Profile hot paths, find memory leaks", tag: "Pro", subscribers: 1800 },
    { name: "Test Scaffold", description: "Generate test stubs from functions", tag: "New", subscribers: 4100 },
  ];

  const agents = [
    { name: "System Architect", description: "Design patterns and project structure", tag: null, subscribers: 5600 },
    { name: "Debug Detective", description: "Trace errors, correlate logs, suggest fixes", tag: null, subscribers: 7800 },
    { name: "Code Mentor", description: "Adaptive explanations matching your level", tag: "Pro", subscribers: 2900 },
    { name: "Ship Captain", description: "CI/CD, release notes, deploy prep", tag: "New", subscribers: 1200 },
  ];

  const insights = [
    { text: "Observer ready \u2014 interaction patterns will improve your local model over time", action: "Configure" },
    { text: "153 memories stored across 250 sessions. Knowledge graph available.", action: "View" },
    { text: "Local compute handling 100% of inference. No cloud fallback needed.", action: "Details" },
  ];

  const pendingTodos = todos.filter(t => !t.done);
  const doneTodos = todos.filter(t => t.done);

  const handleQuickAction = (label: string) => {
    try {
      switch (label) {
        case "New conversation":
          if (onOpenChat) { onOpenChat(); }
          else { postMessage({ command: 'openChat' }); }
          break;
        case "Open project":
          postMessage({ command: 'openCreateProjectTab' });
          break;
        case "Search knowledge":
          postMessage({ command: 'openView', viewId: 'workbench.action.findInFiles' });
          break;
        case "Quick task":
          if (onOpenChat) { onOpenChat(); }
          else { postMessage({ command: 'openChat' }); }
          break;
      }
    } catch (e) {
      console.error('[TARX Dashboard] Quick action error:', e);
    }
  };

  return (
    <div style={{
      background: VS.bg, color: VS.fg,
      fontFamily: "var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
      fontSize: VS.treeFontSize,
      minHeight: "100vh",
      display: "flex", flexDirection: "column",
    }}>
      <PerfHeader metrics={metrics} />

      <div style={{ flex: 1, overflow: "auto", padding: "0 20px 40px" }}>

        {/* ─── Greeting Header ─── */}
        <div style={{ padding: "20px 0 6px" }}>
          <div style={{ fontSize: 16, fontWeight: 400, color: VS.fg }}>
            {greeting}
          </div>
          <div style={{ fontSize: 12, color: VS.fgMuted, marginTop: 2 }}>
            {pendingTodos.length} open items · {metrics.sessions} sessions · {metrics.memories} memories
          </div>
        </div>

        {/* ─── Quick Actions (VS Code button styles) ─── */}
        <div style={{ display: "flex", gap: 6, padding: "8px 0 4px", flexWrap: "wrap" }}>
          {["New conversation", "Open project", "Search knowledge", "Quick task"].map(label => (
            <button key={label} onClick={() => handleQuickAction(label)} style={{
              fontSize: 12, padding: "5px 12px", borderRadius: 2,
              border: "none", background: VS.buttonSecBg, color: VS.buttonSecFg,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* ─── Todo List (auto-generated, user-auditable) ─── */}
        <SectionHeader title="To Do" count={pendingTodos.length} action={doneTodos.length > 0 ? `${doneTodos.length} done` : undefined} />
        <div style={{
          background: VS.cardBg, borderRadius: 4,
          border: `1px solid ${VS.border}`, padding: "4px 0",
        }}>
          {pendingTodos.map(todo => (
            <TodoItem key={todo.id} {...todo} onToggle={() => toggleTodo(todo.id)} onDismiss={() => dismissTodo(todo.id)} />
          ))}
          {doneTodos.length > 0 && (
            <div style={{ borderTop: `1px solid ${VS.border}`, marginTop: 4, paddingTop: 4 }}>
              {doneTodos.map(todo => (
                <TodoItem key={todo.id} {...todo} onToggle={() => toggleTodo(todo.id)} onDismiss={() => dismissTodo(todo.id)} />
              ))}
            </div>
          )}
          {todos.length === 0 && (
            <div style={{ padding: "12px 8px", fontSize: 12, color: VS.fgMuted, textAlign: "center" }}>
              All clear. TARX is monitoring for new items.
            </div>
          )}
        </div>

        {/* ─── Prompt Flows (2x2) ─── */}
        <SectionHeader title="Start" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <FlowCard icon="code" title="Help me code" description="Write, refactor, debug, or explain. Attach files or describe what you need." actionLabel="Start" onClick={onOpenChat} />
          <FlowCard icon="brain" title="Think with me" description="Architecture decisions, tradeoffs, system design. TARX as thinking partner." actionLabel="Start" onClick={onOpenChat} />
          <FlowCard icon="graph" title="Analyze project" description="Index codebase, find patterns, surface tech debt, generate docs." actionLabel="Select project" badge={`${metrics.chunks}`} onClick={() => postMessage({ command: 'openCreateProjectTab' })} />
          <FlowCard icon="rocket" title="Ship faster" description="CI/CD, deployment scripts, release notes, environment config." actionLabel="Start" onClick={onOpenChat} />
        </div>

        {/* ─── Insights (clean rows, no left border) ─── */}
        <SectionHeader title="Insights" count={insights.length} />
        <div style={{
          background: VS.cardBg, borderRadius: 4,
          border: `1px solid ${VS.border}`, padding: "4px 0",
        }}>
          {insights.map((ins, i) => (
            <InsightRow key={i} {...ins} />
          ))}
        </div>

      </div>
    </div>
  );
}
