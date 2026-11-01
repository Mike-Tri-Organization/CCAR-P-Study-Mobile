"""Lab L3 — Prompt caching (Models, Prompting & Context).

The ~5k-token handbook is a stable prefix marked with cache_control.
Call 1 should report cache_creation_input_tokens > 0,
call 2 (different question, same prefix, within the cache lifetime) cache_read_input_tokens > 0.
"""
import os
import time

import anthropic

MODEL = os.getenv("CLAUDE_BALANCED_MODEL", "claude-sonnet-5-5")

CATEGORIES = ["general cargo", "cold chain", "hazardous goods", "high-value electronics", "textiles", "furniture"]
ROUTES = ["HCMC-Da Nang", "HCMC-Hai Phong", "Da Nang-Hai Phong", "HCMC-Can Tho", "Hai Phong-Lao Cai"]


def handbook(clauses: int = 90) -> str:
    lines = ["MEKONGFREIGHT CARRIER LIABILITY HANDBOOK (v2026.1)"]
    for i in range(1, clauses + 1):
        lines.append(
            f"Clause {i}. Carrier liability for {CATEGORIES[i % len(CATEGORIES)]} shipments on route "
            f"{ROUTES[i % len(ROUTES)]} is limited to {(i * 37) % 900 + 100} USD per consignment unless declared "
            f"value cover is purchased; claims must be filed within {(i % 5 + 1) * 7} days with photographic evidence, "
            f"a signed proof of delivery and the original commercial invoice. Exceptions apply to force majeure events, "
            f"including typhoon warnings issued by the national hydro-meteorological agency."
        )
    return "\n".join(lines)


client = anthropic.Anthropic()
system = [
    {"type": "text", "text": "You are MekongFreight's claims assistant. Answer only from the handbook and cite clause numbers."},
    {"type": "text", "text": handbook(), "cache_control": {"type": "ephemeral"}},   # breakpoint after the stable part
]

for question in ["What is the liability limit and filing deadline in clause 12?",
                 "Summarize clause 7 in one sentence."]:
    t0 = time.perf_counter()
    resp = client.messages.create(model=MODEL, max_tokens=300, system=system,
                                  messages=[{"role": "user", "content": question}])
    u = resp.usage
    print(f"\nQ: {question}\n{(time.perf_counter() - t0) * 1000:.0f} ms | input={u.input_tokens} "
          f"cache_write={u.cache_creation_input_tokens} cache_read={u.cache_read_input_tokens} out={u.output_tokens}")
    print(resp.content[0].text)
