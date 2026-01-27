# Changelog

All notable changes to TARX CODE will be documented in this file.

## [1.0.0-beta.1] - 2026-01-26

### Added

#### Core Extension (tarx)
- @tarx chat participant for conversational AI coding
- System prompt optimized for direct, no-nonsense responses
- Vague request detection with clarification prompts
- Problem spotting: security issues, bugs, anti-patterns, deprecated APIs
- Voice transcription normalization (50+ common corrections)
- Conversation history persistence via JSON database
- `tarx.getConversationHistory` command for sidebar integration

#### TARX Sidebar
- Custom TarxSidebarPart replacing vanilla SidebarPart
- Quick chat input with voice and send buttons
- Quick action buttons: Explain, Fix, Test
- Dynamic greeting based on time of day
- Navigation: Chat, Voice, CREATE, CODE, PROJECTS, History
- Collapsible sections with state persistence
- History section with time-based grouping (Today, Yesterday, This Week, This Month)
- SuperComputer toggle in header

#### Local LLM (tarx-local)
- llama-server integration for local inference
- Automatic model path detection from Ollama
- Health check and server lifecycle management
- Custom design tokens for TARX theme

#### SuperComputer Mesh (tarx-supercomputer)
- P2P mesh network using libp2p
- Peer discovery and connection
- Resource sharing capabilities
- mesh-node binary for ARM64 macOS

#### CLI Tool (tarx-dev)
- `tarx-dev chat "message"` - Test system prompt
- `tarx-dev test` - Run 5 validation tests
- `tarx-dev benchmark` - Performance baseline
- Mock LLM for offline testing

### Fixed
- Black screen on Apple Silicon (GPU acceleration disabled)
- CSS transitions causing rendering issues (disabled in debug mode)
- TarxSidebarPart initialization with deferred DOM operations

### Known Issues
- See KNOWN_ISSUES.md for current limitations

## [0.1.0] - 2026-01-22

### Added
- Initial TARX fork from VS Code
- Basic @tarx chat participant
- TARX branding (icons, colors, name)
- Local llama-server connection
