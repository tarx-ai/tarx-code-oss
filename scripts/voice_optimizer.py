#!/usr/bin/env python3
"""
TARX Voice Recursive Optimizer

Automatically optimizes voice configuration by running cycles of:
1. Generate test prompts
2. Synthesize → LLM → score
3. If score < threshold, mutate config
4. Repeat until convergence

Usage:
    python voice_optimizer.py --cycles 100 --threshold 0.85
    python voice_optimizer.py --cycles 50 --output best-config.json
"""

import argparse
import json
import subprocess
import random
import time
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Configuration
INFERENCE_PORT = 11435
CLI_PATH = Path(__file__).parent.parent / "bin" / "tarx-cli.js"
CONFIG_FILE = Path("/tmp/tarx-voice-config.json")

# Default config
DEFAULT_CONFIG = {
    "vad_timeout_ms": 1000,
    "rms_threshold": 0.015,
    "silence_threshold_ms": 3000,
    "max_response_tokens": 150
}

# Test prompts with expected response patterns
TEST_CASES = [
    {"prompt": "Hello TARX", "expect_short": True},
    {"prompt": "What's a mutex?", "expect_short": True},
    {"prompt": "Count to five", "expect_pattern": ["1", "2", "3", "4", "5"]},
    {"prompt": "What time is it?", "expect_short": True},
    {"prompt": "Tell me a very brief joke", "expect_short": True},
    {"prompt": "Say goodbye", "expect_short": True},
    {"prompt": "What's your name?", "expect_short": True},
    {"prompt": "How are you?", "expect_short": True},
    {"prompt": "What can you help with?", "expect_short": True},
    {"prompt": "Thank you", "expect_short": True},
]

# Hallucination filler patterns
FILLER_PATTERNS = [
    "yeah", "uh-huh", "uh huh", "what's going on", "i see",
    "hmm", "okay okay", "right right", "so so"
]

# Corporate speak to penalize
CORPORATE_PHRASES = [
    "i'd be happy to", "i'm here to help", "great question",
    "absolutely", "certainly", "of course"
]


def check_inference_health() -> bool:
    """Check if inference server is running."""
    try:
        import urllib.request
        req = urllib.request.Request(
            f"http://localhost:{INFERENCE_PORT}/health",
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def send_prompt(prompt: str, max_tokens: int = 100) -> Optional[str]:
    """Send a prompt to the inference server and get response."""
    try:
        import urllib.request
        import json as json_lib

        data = json_lib.dumps({
            "model": "ollama-7b",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens
        }).encode()

        req = urllib.request.Request(
            f"http://localhost:{INFERENCE_PORT}/v1/chat/completions",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json_lib.loads(resp.read().decode())
            return result.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        print(f"  Error: {e}", file=sys.stderr)
        return None


def calculate_hallucination_score(text: str) -> float:
    """Calculate hallucination score based on filler words."""
    if not text:
        return 0.0

    text_lower = text.lower()
    filler_count = sum(text_lower.count(p) for p in FILLER_PATTERNS)
    words = len(text.split())

    if words == 0:
        return 0.0

    return min(1.0, filler_count / max(words * 0.1, 1))


def score_response(prompt: str, response: str, test_case: Dict) -> float:
    """Score a response based on quality metrics."""
    if not response or not response.strip():
        return 0.0

    score = 1.0
    response_lower = response.lower()
    words = len(response.split())

    # Penalize very long responses for simple questions
    if test_case.get("expect_short") and words > 50:
        score -= 0.3

    # Check for expected patterns
    if "expect_pattern" in test_case:
        for pattern in test_case["expect_pattern"]:
            if pattern.lower() not in response_lower:
                score -= 0.1

    # Penalize hallucination fillers
    hallucination = calculate_hallucination_score(response)
    score -= hallucination * 0.5

    # Penalize corporate speak
    for phrase in CORPORATE_PHRASES:
        if phrase in response_lower:
            score -= 0.15

    # Penalize very short non-responses
    if words < 3 and not test_case.get("expect_short"):
        score -= 0.2

    return max(0.0, min(1.0, score))


def mutate_config(config: Dict, direction: str = "random") -> Dict:
    """Mutate config values to explore better settings."""
    new_config = config.copy()

    mutations = [
        ("vad_timeout_ms", -100, 100, 500, 3000),
        ("rms_threshold", -0.002, 0.002, 0.005, 0.05),
        ("silence_threshold_ms", -200, 200, 1000, 5000),
        ("max_response_tokens", -10, 10, 50, 300),
    ]

    # Pick 1-2 random mutations
    num_mutations = random.randint(1, 2)
    chosen = random.sample(mutations, min(num_mutations, len(mutations)))

    for key, neg_delta, pos_delta, min_val, max_val in chosen:
        delta = random.uniform(neg_delta, pos_delta)
        new_val = config[key] + delta

        # Round appropriately
        if key == "rms_threshold":
            new_val = round(new_val, 4)
        else:
            new_val = round(new_val)

        new_config[key] = max(min_val, min(max_val, new_val))

    return new_config


def run_optimization_cycle(config: Dict, verbose: bool = False) -> Tuple[float, List[Dict]]:
    """Run one optimization cycle with current config."""
    scores = []

    # Use a subset of test cases for speed
    test_subset = random.sample(TEST_CASES, min(5, len(TEST_CASES)))

    for test_case in test_subset:
        prompt = test_case["prompt"]

        if verbose:
            print(f"  Testing: {prompt[:30]}...", end=" ", flush=True)

        response = send_prompt(prompt, config.get("max_response_tokens", 100))

        if response is not None:
            score = score_response(prompt, response, test_case)
            scores.append({
                "prompt": prompt,
                "score": score,
                "response_length": len(response),
                "hallucination": calculate_hallucination_score(response)
            })
            if verbose:
                print(f"score={score:.2f}")
        else:
            scores.append({
                "prompt": prompt,
                "score": 0.0,
                "error": "No response"
            })
            if verbose:
                print("failed")

    avg_score = sum(s["score"] for s in scores) / len(scores) if scores else 0.0
    return avg_score, scores


def save_config(config: Dict, path: Path = CONFIG_FILE):
    """Save config to file."""
    path.write_text(json.dumps(config, indent=2))


def load_config(path: Path = CONFIG_FILE) -> Dict:
    """Load config from file or return default."""
    if path.exists():
        try:
            return {**DEFAULT_CONFIG, **json.loads(path.read_text())}
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


def main():
    parser = argparse.ArgumentParser(
        description="TARX Voice Recursive Optimizer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python voice_optimizer.py --cycles 50
  python voice_optimizer.py --cycles 100 --threshold 0.9
  python voice_optimizer.py --cycles 25 --output my-config.json --verbose
        """
    )
    parser.add_argument(
        "--cycles", type=int, default=50,
        help="Number of optimization cycles (default: 50)"
    )
    parser.add_argument(
        "--threshold", type=float, default=0.85,
        help="Target score threshold to stop early (default: 0.85)"
    )
    parser.add_argument(
        "--output", type=str, default="config-best.json",
        help="Output file for best config (default: config-best.json)"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Show detailed output for each test"
    )
    parser.add_argument(
        "--reset", action="store_true",
        help="Reset config to defaults before starting"
    )
    args = parser.parse_args()

    # Check inference server
    print("Checking inference server...")
    if not check_inference_health():
        print("ERROR: Inference server not responding on port", INFERENCE_PORT)
        print("Start it with: ./launch-tarx.sh or check services")
        sys.exit(1)
    print("Inference server OK\n")

    # Load or reset config
    if args.reset:
        config = DEFAULT_CONFIG.copy()
        print("Config reset to defaults")
    else:
        config = load_config()

    best_config = config.copy()
    best_score = 0.0
    scores_history = []

    print(f"Starting optimization: {args.cycles} cycles, threshold={args.threshold}")
    print(f"Initial config: {json.dumps(config, indent=2)}\n")
    print("-" * 60)

    try:
        for cycle in range(args.cycles):
            print(f"\nCycle {cycle + 1}/{args.cycles}", end="")

            score, details = run_optimization_cycle(config, verbose=args.verbose)
            scores_history.append(score)

            # Progress indicator
            if score > best_score:
                best_score = score
                best_config = config.copy()
                print(f": score={score:.3f} ⬆️ NEW BEST")
            elif score >= args.threshold:
                print(f": score={score:.3f} ✅ THRESHOLD REACHED")
            else:
                print(f": score={score:.3f}")

            # Check if we've hit threshold
            if score >= args.threshold:
                print(f"\n✅ Threshold {args.threshold} reached! Score: {score:.3f}")
                break

            # Mutate config for next cycle
            config = mutate_config(config)

            # Occasionally reset to best if we're getting worse
            if cycle > 10 and score < best_score - 0.2:
                config = mutate_config(best_config)
                if args.verbose:
                    print("   ↩️ Reset to best config + mutation")

            # Small delay to avoid hammering the server
            time.sleep(0.3)

    except KeyboardInterrupt:
        print("\n\nOptimization interrupted by user")

    # Save best config
    output_path = Path(args.output)
    output_path.write_text(json.dumps(best_config, indent=2))

    # Also save to the active config file
    save_config(best_config)

    # Summary
    print("\n" + "=" * 60)
    print("OPTIMIZATION COMPLETE")
    print("=" * 60)
    print(f"Cycles completed: {len(scores_history)}")
    print(f"Best score: {best_score:.3f}")
    if scores_history:
        print(f"Score range: {min(scores_history):.3f} - {max(scores_history):.3f}")
        print(f"Average score: {sum(scores_history)/len(scores_history):.3f}")
    print(f"\nBest config saved to: {output_path}")
    print(f"Active config updated: {CONFIG_FILE}")
    print("\nBest configuration:")
    print(json.dumps(best_config, indent=2))

    # Return success if we hit threshold
    return 0 if best_score >= args.threshold else 1


if __name__ == "__main__":
    sys.exit(main())
