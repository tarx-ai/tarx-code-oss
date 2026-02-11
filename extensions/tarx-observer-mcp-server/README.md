# TARX Observer MCP Server

Passive intelligence layer that makes the local model smarter about each user over time.

**Not a tool you invoke. A system that's always learning.**

## Architecture

```
Collectors (passive, zero-latency)     Analyzers (background, 30m/1h/24h)
├── ResponseQualityCollector           ├── PreferenceAnalyzer
├── CorrectionCollector                ├── DomainAnalyzer
├── StyleCollector                     ├── GapAnalyzer
└── ToolUseCollector                   └── GrowthAnalyzer

Producers (outputs)                    MCP Tools (8)
├── SystemPromptProducer               ├── observer_status
├── TrainingDataProducer               ├── observer_insights
├── MemoryGraphProducer                ├── observer_export
└── InsightProducer                    ├── observer_correct
                                       ├── observer_forget
                                       ├── observer_train
                                       ├── observer_preferences
                                       └── observer_growth
```

## Tools

| Tool | Description |
|------|-------------|
| `observer_status` | Overview: interactions, preferences, gaps, queue size, system prompt |
| `observer_insights` | What Observer has learned, filtered by category |
| `observer_export` | Export curated training data as JSONL/JSON |
| `observer_correct` | Explicitly correct a model belief → training pair + gap |
| `observer_forget` | Remove data from Observer's memory (privacy) |
| `observer_train` | Trigger training run (future: mesh distributed) |
| `observer_preferences` | List/update/delete learned preferences |
| `observer_growth` | Cognitive growth dashboard with trends |

## Database

SQLite at `~/Library/Application Support/tarx/observer.db`

9 tables: interactions, preferences, domain_knowledge, model_gaps, training_queue, training_runs, growth_metrics, prompt_fragments, meta

## Build

```bash
cd extensions/tarx-observer-mcp-server
npm install
npm run build
```

## MCP Config

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "tarx-observer": {
      "command": "node",
      "args": ["/Users/master/Desktop/tarx-code-oss/extensions/tarx-observer-mcp-server/dist/index.js"]
    }
  }
}
```
