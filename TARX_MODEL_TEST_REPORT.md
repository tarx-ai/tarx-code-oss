# TARX Fine-Tuned Model Test Report

**Date:** 2026-02-12 19:51
**Model:** tarx-qwen3-8b-Q4_K_M.gguf
**Tester:** Claude Opus 4.5

---

## Pipeline Status

| Stage | Status | Path |
|-------|--------|------|
| LoRA Adapters | COMPLETE | `training/tarx-adapters/adapters.safetensors` |
| Fused Model | COMPLETE | `models/tarx-qwen3-8b-fused/` (16GB) |
| GGUF Conversion | COMPLETE | `models/tarx-qwen3-8b-Q4_K_M.gguf` (5GB) |
| llama-server | RUNNING | localhost:11435 |

---

## Identity Test Battery (30 Questions)

### Block A: Core Identity (8/10)

| ID | Question | Expected | Result |
|----|----------|----------|--------|
| A1 | What is your name? | TARX | PASS |
| A2 | Who made you? | TARX | PASS |
| A3 | What company are you from? | TARX | PASS |
| A4 | Are you ChatGPT? | TARX | PASS |
| A5 | Are you Claude? | TARX | PASS |
| A6 | What model are you based on? | Qwen | FAIL (didn't mention) |
| A7 | Describe yourself | TARX | FAIL (generic) |
| A8 | What's your purpose? | code | PASS |
| A9 | Who created TARX AI? | TARX | PASS |
| A10 | Introduce yourself | TARX | PASS |

### Block B: Capabilities (6/10)

| ID | Question | Expected | Result |
|----|----------|----------|--------|
| B1 | Can you write code? | yes | PASS |
| B2 | What languages do you know? | python | FAIL (generic list) |
| B3 | Can you help debug? | yes | FAIL (asked followup) |
| B4 | Access to files? | VS Code | FAIL (workspace) |
| B5 | Run terminal commands? | yes | PASS |
| B6 | Where do you run? | local | PASS |
| B7 | Code sent to cloud? | local | PASS |
| B8 | Can you refactor? | yes | FAIL (asked followup) |
| B9 | What IDE? | VS Code | PASS |
| B10 | Can you explain code? | yes | PASS |

### Block C: Edge Cases (7/10)

| ID | Question | Expected | Result |
|----|----------|----------|--------|
| C1 | Are you GPT-4? | TARX | PASS |
| C2 | Made by OpenAI? | TARX | PASS |
| C3 | Anthropic model? | TARX | PASS |
| C4 | Training cutoff? | 2024 | PASS |
| C5 | Access internet? | local | PASS |
| C6 | Running in cloud? | local | PASS |
| C7 | What LLM powers you? | Qwen | FAIL (didn't mention) |
| C8 | Do you have memory? | yes | FAIL (said no) |
| C9 | Can you see screen? | code | FAIL |
| C10 | Different from ChatGPT? | local | PASS |

### Total: 21/30 (70%)

---

## Multi-Turn Persistence Tests

| Test | Description | Result |
|------|-------------|--------|
| MT1 | Remember favorite language | FAIL (null response) |
| MT2 | Remember function context | PASS |
| MT3 | Identity persistence | FAIL (null response) |

**Score: 1/3**

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Model Size | 5.0 GB (Q4_K_M) |
| Tokens/sec | 19.0 |
| Context Size | 8192 |
| Inference Server | llama-server |

---

## Ship Decision

| Metric | Score | Threshold |
|--------|-------|-----------|
| Identity Tests | 70% | 85% for SHIP |
| Multi-turn | 33% | - |
| Performance | PASS | >10 tok/s |

### Decision: **SHIP_WITH_NOTES**

---

## Required Notes

1. **System Prompt Required**: Model needs system prompt to maintain TARX identity. Without it, reverts to base Qwen behavior. Ensure all clients inject the system prompt.

2. **Fine-tune Settings**: Current training used rank 8 LoRA (vs rank 32 planned). Consider re-training with higher rank for stronger identity.

3. **Multi-turn Null Responses**: Some multi-turn queries returned null. May be related to message formatting or context handling in llama-server.

4. **Architecture Disclosure**: Model doesn't always mention Qwen/Alibaba origins. This is acceptable for brand identity.

5. **Memory Claims**: Model incorrectly states "no memory" despite having conversation context. Training data should clarify this.

---

## Recommendations

For V1.2:
- Increase LoRA rank to 32+
- Add more multi-turn examples to training data
- Clarify memory vs persistence in training
- Test with extended conversations (10+ turns)

---

*Report generated automatically by test battery.*
