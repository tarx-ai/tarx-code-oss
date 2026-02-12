# TARX Builder Audit

**Date:** 2026-02-11
**Repo:** ~/Desktop/tarx-builder (iCloud Documents)
**Actual Path:** ~/Library/Mobile Documents/com~apple~CloudDocs/Desktop/tarx-builder/

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Platform** | Tauri (Rust + React) |
| **Product Name** | TARX Local |
| **Version** | 0.1.0 |
| **Identifier** | com.tarx.engine |
| **Purpose** | Distributed AI inference engine with P2P mesh |
| **Window** | 1200x800, resizable |
| **Targets** | macOS, Windows, Linux |
| **Tauri Commands** | 14 |

---

## Architecture

```
tarx-builder/
├── apps/desktop/           # Frontend (React + Tauri)
│   ├── src-tauri/          #   Tauri config
│   └── src/components/     #   React UI (Chat, StatusDashboard)
├── src-tauri/              # Rust backend (core engine)
│   ├── src/
│   │   ├── logging.rs      #   Structured tracing + file logging
│   │   ├── commands/       #   Tauri IPC command handlers
│   │   ├── mesh/           #   libp2p mesh coordination
│   │   └── pipeline/       #   Distributed inference pipeline
│   └── Cargo.toml
├── pipeline-ready/         # Copy-paste implementation files
└── scripts/                # Build, test, integration scripts
```

---

## Rust Crates

### Single Crate: src-tauri

**Not** a Cargo workspace — single binary crate.

**Core Dependencies:**
| Crate | Purpose |
|-------|---------|
| `tauri` | Desktop app framework, IPC bridge |
| `libp2p` | P2P networking (mDNS discovery, TCP transport) |
| `tokio` | Async runtime |
| `serde` / `serde_json` | Serialization |
| `tracing` | Structured logging |
| `tracing-subscriber` | Log formatting |
| `tracing-appender` | File logging (rotating) |
| `futures` | Async utilities |
| `uuid` | ID generation |

---

## Tauri Commands (14)

All commands are invoked via `window.__TAURI__.invoke()` from the React frontend.

### Mesh Commands (4)
| # | Command | Parameters | Description |
|---|---------|-----------|-------------|
| 1 | `start_mesh` | — | Initialize libp2p mesh node |
| 2 | `mesh_join` | peer: String | Join specific peer |
| 3 | `mesh_inference` | prompt, maxTokens, temperature, model | Run inference (routes to local or mesh) |
| 4 | `get_mesh_status` | — | Get peer count, connections, addresses |

### Shard Commands (2)
| # | Command | Parameters | Description |
|---|---------|-----------|-------------|
| 5 | `volunteer_to_host_shard` | shardId: String | Register node as shard host |
| 6 | `check_model_availability` | modelId: String | Check if all shards available |

### Diagnostic Commands (3)
| # | Command | Parameters | Description |
|---|---------|-----------|-------------|
| 7 | `get_mesh_diagnostic` | — | Full diagnostic info |
| 8 | `get_mesh_status` | — | Basic status (alias) |
| 9 | `get_recent_logs` | lines: u32 | Tail log file |

### Chat/System Commands (5)
| # | Command | Parameters | Description |
|---|---------|-----------|-------------|
| 10 | `send_message` | message: String | Send chat message |
| 11 | `get_health_status` | — | Health check |
| 12 | `get_system_metrics` | — | CPU, memory, peer count |
| 13 | `get_shard_info` | — | Shard hosting status |
| 14 | `generate_report` | — | Export diagnostic report |

---

## Source Files

### Rust Backend (`src-tauri/src/`)

| File | Lines | Purpose |
|------|-------|---------|
| `logging.rs` | ~80 | Structured tracing setup, file output to `~/Library/Logs/TARX/tarx.log` |
| `commands/diagnostic_commands.rs` | ~60 | Mesh diagnostic Tauri commands |
| `mesh/coordinator.rs` | ~200 | MeshCoordinator: libp2p event loop, peer mgmt, `execute_distributed_inference()` |
| `pipeline/step1_pipeline_method.rs` | 89 | Distributed pipeline executor — sequential stage execution |
| `pipeline/step2_mesh_inference.rs` | 78 | Smart routing: shard check → distributed or local fallback |
| `pipeline/step3_host_shard.rs` | 26 | Shard hosting volunteer registration |

### React Frontend (`apps/desktop/src/`)

| File | Lines | Purpose |
|------|-------|---------|
| `components/Chat.tsx` | ~150 | Chat interface: messages, input, streaming response |
| `components/StatusDashboard.tsx` | ~200 | 4-tab dashboard: overview, metrics, developer, export |

---

## Distributed Pipeline Architecture

### Pipeline Stages
```
[Prompt] → Stage 1 (Node A) → Stage 2 (Node B) → ... → [Response]
```

1. **Pipeline Method** (`step1`): Executes stages sequentially, pipes output→input
2. **Mesh Inference** (`step2`): Routes to shard network if available, falls back to single-node
3. **Host Shard** (`step3`): Nodes volunteer to host model shards in `shard_registry`

### Mesh Networking
- **Protocol:** libp2p over TCP
- **Discovery:** mDNS (automatic on local network)
- **Discovery Time:** ~60 seconds for first peer
- **Port:** 7070
- **Events:** Connect, disconnect, address change, error

### Model Sharding
- Models split into shards (e.g., `tx-think-v1-shard-0`, `tx-think-v1-shard-1`)
- Each node volunteers to host specific shards
- `check_model_availability` verifies all shards present before distributed inference
- Falls back to local single-node if incomplete

---

## Logging

- **Path:** `~/Library/Logs/TARX/tarx.log`
- **Format:** Structured tracing (timestamps, levels, spans)
- **Rotation:** File-based rotating appender
- **Config:** `RUST_LOG` environment variable
- **Diagnostic tail:** `get_recent_logs(lines)` Tauri command

---

## Build & Deploy

### Prerequisites
- Rust toolchain (`cargo`)
- Node.js with pnpm
- Tauri CLI (`pnpm add -D @tauri-apps/cli`)
- Ollama (for LLM inference)

### Commands
```bash
# Development
pnpm dev              # Frontend dev server on :3000
pnpm tauri dev        # Full Tauri dev (Rust + React)

# Production
pnpm build            # Frontend bundle
cargo build --release # Rust release build
pnpm tauri build      # Full app bundle (.app / .dmg / .exe)

# Integration (copy pipeline files + build + launch)
bash integrate_and_launch.sh
```

### Output
- **macOS:** `TARX Local.app` (arm64)
- **Config:** `tauri.conf.json` (1200x800, com.tarx.engine)

---

## Scripts Inventory

### Build & Integration
| Script | Purpose |
|--------|---------|
| `integrate_and_launch.sh` | Copy pipeline files → build → launch |
| `fix-build-issues.sh` | Install toolchains, reset deps, pull models |
| `build-tauri-verbose.sh` | Verbose build output |
| `check-versions.sh` | Check tool versions |
| `quick-fixes.sh` | Quick fixes |
| `fix-all-tarx.sh` | Full reset & fix |

### Testing
| Script | Purpose |
|--------|---------|
| `test-distributed-pipeline.sh` | Test pipeline execution |
| `mesh-sanity-check.sh` | Verify peer connectivity |
| `verify-setup.sh` | Check prerequisites |
| `start-and-verify-tarx.sh` | Full startup sequence |
| `verify-mesh-test.sh` | Verify mesh test |
| `quick-mesh-test.sh` | Quick mesh test |
| `minimal-distributed-test.sh` | Minimal test |
| `monitor-tarx.sh` | Auto-restart monitor |
| `verify_and_test_tarx.py` | Python automated test |
| `test-tarx-commands.js` | Tauri command test |
| `mesh-test-commands.js` | Mesh test commands |
| `force-start-mesh.js` | Force mesh startup |

---

## Pipeline-Ready Files

Pre-built implementation files in `pipeline-ready/` — copy into `src-tauri/src/`:

| File | Lines | Target |
|------|-------|--------|
| `step1_pipeline_method.rs` | 89 | `mesh/coordinator.rs` (new method) |
| `step2_mesh_inference.rs` | 78 | `commands/mesh_commands.rs` (replace) |
| `step3_host_shard.rs` | 26 | `commands/shard_commands.rs` (new) |
| `IMPLEMENTATION_GUIDE.md` | 215 | Step-by-step integration guide |
| `QUICK_START.md` | ~100 | Quick reference |
| `browser-console-test.js` | — | Tauri IPC test script |
| `bootstrap-pipeline.sh` | — | Verification script |

---

## Documentation

| File | Lines | Purpose |
|------|-------|---------|
| `README_STARTUP.md` | 103 | Quick start (Python/Bash/manual) |
| `INTEGRATION_READY.md` | 177 | Full integration guide + troubleshooting |
| `MESH_TEST_GUIDE.md` | 87 | Two-machine mesh test procedure |
| `MESH_DIAGNOSTIC_REPORT.md` | 109 | Diagnostic output interpretation |
| `AIRDROP_SETUP.md` | 81 | File transfer via AirDrop |
| `TEST_INSTRUCTIONS.md` | 54 | Quick test reference |

---

## Relationship to tarx-code-oss

| Component | tarx-code-oss | tarx-builder |
|-----------|---------------|--------------|
| **Runtime** | Electron (VS Code) | Tauri (native) |
| **Language** | TypeScript | Rust + React |
| **LLM** | llama-server (:11435) | Ollama (direct) |
| **Mesh** | tarx-supercomputer extension (libp2p HTTP :11436) | Native libp2p (mDNS :7070) |
| **Purpose** | IDE with AI assistant | Distributed inference engine |
| **Sharding** | N/A (single-node) | Multi-node model sharding |
| **State** | Production (v1.0) | Pre-production (v0.1.0) |

The two repos are complementary: tarx-code-oss is the IDE (user-facing), tarx-builder is the distributed compute engine (infrastructure). They connect via mesh networking — tarx-supercomputer extension in the IDE communicates with tarx-builder nodes via libp2p.
