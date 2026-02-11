# TARX Status Bar - Visual Layout

## Status Bar Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ File  Edit  View  ... │ $(check) TARX │ ... │ 🏠 Qwen 8.2B │ UTF-8 │ Ln 1, Col 1 │
└─────────────────────────────────────────────────────────────────────────────────┘
     ↑                    ↑                      ↑
     Regular items       Health (left)        Model (right)
```

## Health Indicator States

### All Healthy
```
┌──────────────┐
│ $(check) TARX │ ← Green checkmark, default background
└──────────────┘

Tooltip:
🟢 Inference: Qwen 8.2B (18 tok/s)
🟢 Mesh: 0 peers
🟢 Embeddings: Online
Memory: 44 items

Click for details
```

### Partial Degradation (Embeddings Down)
```
┌────────────────┐
│ $(warning) TARX │ ← Yellow warning, yellow background
└────────────────┘

Tooltip:
🟢 Inference: Qwen 8.2B (18 tok/s)
🟢 Mesh: 0 peers
🔴 Embeddings: Offline

Click for details
```

### Critical (Inference Down)
```
┌──────────────┐
│ $(error) TARX │ ← Red X, red background
└──────────────┘

Tooltip:
🔴 Inference: Offline
🟢 Mesh: 0 peers
🟢 Embeddings: Online

Click for details
```

## Model Indicator States

### Local Mode (Default)
```
┌───────────────┐
│ 🏠 Qwen 8.2B │
└───────────────┘

Tooltip:
Current: TARX Local
Click to switch
```

### Mesh Mode
```
┌──────────┐
│ 🌐 Mesh │
└──────────┘

Tooltip:
Current: TARX Mesh
Click to switch
```

### Cloud Mode
```
┌───────────┐
│ ☁️ Cloud │
└───────────┘

Tooltip:
Current: TARX Cloud
Click to switch
```

## Click Interactions

### Health Indicator Click → System Status Dialog

```
┌─────────────────────────────────────────┐
│  ℹ️  Information                         │
├─────────────────────────────────────────┤
│  === TARX System Status ===             │
│                                          │
│  Inference (11435): ✓ Online            │
│    Latency: 45ms                         │
│    Model: Qwen 8.2B                      │
│    Speed: 18 tok/s                       │
│  Mesh (11436): ✗ Offline                │
│  Embeddings (11437): ✓ Online           │
│    Latency: 23ms                         │
│                                          │
│  Memory: 44 items                        │
│                                          │
│                              [ OK ]      │
└─────────────────────────────────────────┘
```

### Model Indicator Click → Model Selection QuickPick

```
┌─────────────────────────────────────────────────────────┐
│  TARX Model Selection                                   │
├─────────────────────────────────────────────────────────┤
│  > Type to filter...                                    │
├─────────────────────────────────────────────────────────┤
│  $(home) Local                                          │
│    TARX Local (Qwen 8.2B on localhost)                 │
│    Available                                            │
│                                                         │
│  $(globe) Mesh                                          │
│    TARX Mesh (Distributed inference)                   │
│    Offline                                              │
│                                                         │
│  $(cloud) Cloud                                         │
│    TARX Cloud (Remote inference)                       │
│    Coming soon                                          │
└─────────────────────────────────────────────────────────┘
```

## Notifications

### Inference Server Down
```
┌────────────────────────────────────────────────────────┐
│  ⚠️  Warning                                            │
│  TARX: Inference server offline. Local AI unavailable. │
│                                              [ OK ]     │
└────────────────────────────────────────────────────────┘
```

### Inference Server Restored
```
┌────────────────────────────────────────────────────────┐
│  ℹ️  Information                                        │
│  TARX: Inference server restored. Local AI ready.      │
│                                              [ OK ]     │
└────────────────────────────────────────────────────────┘
```

## State Transitions

### Startup Sequence
```
1. Extension activates
   └─> TarxStatusBarManager created
       └─> Both items created and shown
           └─> Initial health check triggered
               └─> 30s polling interval started

2. Health check completes
   └─> Status bars updated with real data
       └─> Notifications sent if services down
```

### Health Status Change
```
Inference goes offline:
1. Health check detects failure
   └─> currentHealth.inference = false
       └─> checkHealthChanges() called
           └─> Notification shown (if cooldown passed)
               └─> updateHealthItem() called
                   └─> Icon: $(check) → $(error)
                   └─> Background: default → red
                   └─> Tooltip: 🟢 → 🔴

Inference recovers:
1. Health check detects success
   └─> currentHealth.inference = true
       └─> checkHealthChanges() called
           └─> Notification shown (if cooldown passed)
               └─> updateHealthItem() called
                   └─> Icon: $(error) → $(check)
                   └─> Background: red → default
                   └─> Tooltip: 🔴 → 🟢
```

### Model Switch
```
User clicks model indicator:
1. QuickPick opens
   └─> User selects "Mesh"
       └─> currentRoute = 'mesh'
           └─> updateModelItem() called
               └─> Text: 🏠 Qwen 8.2B → 🌐 Mesh
               └─> Tooltip updated
           └─> Confirmation message shown
```

## Priority and Positioning

### Left Side (High Priority)
```
Priority: 1000 (very high)
Position: Far left, before most items
Alignment: StatusBarAlignment.Left
```

### Right Side (Medium Priority)
```
Priority: 100 (medium-high)
Position: Before language indicator (typically priority 90-95)
Alignment: StatusBarAlignment.Right
```

## Accessibility

### Icons
- `$(check)` - VS Code Codicon checkmark (success)
- `$(warning)` - VS Code Codicon warning triangle
- `$(error)` - VS Code Codicon error X
- `$(home)` - VS Code Codicon home (local)
- `$(globe)` - VS Code Codicon globe (network)
- `$(cloud)` - VS Code Codicon cloud

### Colors
- Default background: Matches theme
- Yellow background: `statusBarItem.warningBackground` (theme color)
- Red background: `statusBarItem.errorBackground` (theme color)

All colors respect user's theme for accessibility.
