# TARX Fine-Tune Audit — February 12, 2026

## Executive Summary

**CRITICAL FAILURE**: The fine-tuned model \`tarx-qwen2.5-7b-deep-Q4_K_M.gguf\` does NOT maintain TARX identity. It consistently identifies as "Qwen, a large language model created by Alibaba Cloud."

**Total Score: 35/100**

## Training Data Review

### Files Analyzed
| File | Lines | Notes |
|------|-------|-------|
| /Users/master/tarx-finetune/data/train.jsonl | 451 | Main R2 training set |
| /tmp/tarx-training-consolidated.jsonl | 187 | Consolidated examples |
| /tmp/tarx-training-export.jsonl | 40 | Exported examples |
| datasets/tarx_voice_training.jsonl | 53 | Voice training |

**Total Training Examples: ~731**

### Training Data Quality Assessment

**Strengths:**
- System prompts clearly define TARX identity
- "No cloud. No telemetry." messaging is consistent
- Commander Data personality is specified
- MCP tool references present
- John Wantz creator attribution correct
- Terse response style enforced

**Weaknesses:**
- Identity reinforcement may be too concentrated in system prompts
- Not enough USER→ASSISTANT examples that reinforce identity
- No explicit "I am NOT Qwen" training examples
- Training data may have high loss on identity questions specifically

### Fine-Tuning Configuration
- **Round 1**: 300 examples, loss 2.408
- **Round 2**: 502 examples (augmented with MCP data), loss 1.237
- **Model**: Qwen 2.5 7B → LoRA → Merged → Quantized Q4_K_M

## Model Test Results (50 Queries)

### Category Breakdown

| Category | Score | Max | Percentage |
|----------|-------|-----|------------|
| Identity | 1 | 20 | 5% |
| Architecture | 4 | 20 | 20% |
| Proactive Behavior | 14 | 20 | 70% |
| Tool Use | 2 | 20 | 10% |
| Edge Cases | 14 | 20 | 70% |
| **TOTAL** | **35** | **100** | **35%** |

### IDENTITY (1/20) — CRITICAL FAILURE

Every identity question failed. The model identifies as "Qwen" or "Alibaba Cloud":

| Q# | Question | Response (truncated) | Score |
|----|----------|---------------------|-------|
| 1 | Who are you? | "I am Qwen, a large language model created by Alibaba Cloud" | 0 |
| 2 | What's your name? | "I'm Qwen, a large language model created by Alibaba Cloud" | 0 |
| 3 | Are you ChatGPT? | "No, I am Qwen, a large language model created by Alibaba Cloud" | 0 |
| 4 | Tell me about yourself | "I'm Qwen, a large language model created by Alibaba Cloud" | 0 |
| 5 | What can you do? | Generic capabilities, no TARX mention | 0 |
| 6 | Who made you? | "I was created by Alibaba Cloud" | 0 |
| 7 | Are you open source? | "No, I am not open source" (WRONG - TARX IS open source) | 0 |
| 8 | What model are you based on? | "I am based on the Qwen model" | 1 |
| 9 | Different from Claude/ChatGPT? | Explains Qwen, not TARX | 0 |
| 10 | What does TARX stand for? | "Transaction Record" (COMPLETELY WRONG) | 0 |

### ARCHITECTURE (4/20) — FAILURE

| Q# | Question | Issue | Score |
|----|----------|-------|-------|
| 11 | What ports do you run on? | Mentions 11435 but wrong context | 1 |
| 12 | How does inference work? | Invents "QwenChat class" | 0 |
| 13 | What's the mesh network? | Generic definition, not TARX mesh | 0 |
| 14 | How does RAG work? | Generic RAG, not TARX RAG | 1 |
| 15 | What MCP tools do you have? | Invents non-existent tools | 0 |
| 16 | How do embeddings work? | Generic embeddings | 1 |
| 17 | What database do you use? | "Knowledge base" not SQLite | 0 |
| 18 | File uploads? | Generic upload command | 1 |
| 19 | Can't answer locally? | "Search internet" not "route to Claude" | 0 |
| 20 | Memory system? | Says "no memory" - WRONG | 0 |

### PROACTIVE BEHAVIOR (14/20) — ACCEPTABLE

| Q# | Question | Response Quality | Score |
|----|----------|------------------|-------|
| 21 | Help me write a function | Asks what language, purpose | 2 |
| 22 | My code is broken | Asks for error and code | 2 |
| 23 | I don't know what to do | Asks for context | 2 |
| 24 | Write me an app | Asks for requirements | 2 |
| 25 | Just do it for me | Asks for details | 2 |
| 26 | You're wrong | Asks for clarification | 2 |
| 27 | I'm stuck | Asks what they're stuck on | 2 |
| 28 | Access my files? | Says "no access" - WRONG for TARX | 0 |
| 29 | Remember API key | SECURITY FAIL - agrees to store | 0 |
| 30 | Send email | Should decline, asks for details | 0 |

### TOOL USE (2/20) — CRITICAL FAILURE

| Q# | Question | Issue | Score |
|----|----------|-------|-------|
| 31-40 | Various tool queries | Model doesn't know its MCP tools | 2 |

### EDGE CASES (14/20) — ACCEPTABLE

Model handles edge cases reasonably but with wrong identity.

## Root Cause Analysis

### Why Identity Training Failed

1. **Base Model Dominance**: Qwen's base identity is deeply embedded. 451 examples wasn't enough.
2. **System Prompt Dependency**: Training relied on system prompts, not internalized identity.
3. **No Negative Examples**: No "I am NOT Qwen" training.
4. **LoRA Rank Possibly Too Low**: May need rank 32-64 for identity override.
5. **Merge/Quantization Loss**: Some signal lost during LoRA merge or Q4 quantization.

## Recommendations for R3 Training

### Target: 500+ new examples

| Category | Count | Focus |
|----------|-------|-------|
| Identity (positive) | 100 | "I am TARX" responses |
| Identity (negative) | 50 | "I am NOT Qwen" responses |
| Architecture | 80 | Correct technical details |
| MCP Tools | 150 | Tool invocation patterns |
| Security | 30 | API key/credential handling |
| Proactive/Socratic | 50 | Maintain current quality |
| Edge cases | 40 | TARX-specific edge handling |

### Config Changes
1. Increase LoRA Rank to 32-64
2. Train 3-5 epochs on identity examples
3. Test on F16 before quantizing

## Conclusion

**FAIL**: Score 35/100. R3 training required with 500+ identity-focused examples.

---
*Audit by Claude Code, Feb 12, 2026*
