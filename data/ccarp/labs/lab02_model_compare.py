"""Lab L2 — Same task on three model tiers (Models, Prompting & Context).

Prints latency, tokens and estimated cost per tier.
Prices are USD per million tokens — CHECK CURRENT PRICING and edit them.
"""
import os
import time

import anthropic

TIERS = {
    "fast":     (os.getenv("CLAUDE_FAST_MODEL", "claude-haiku-5-5"),     1.0,  5.0),
    "balanced": (os.getenv("CLAUDE_BALANCED_MODEL", "claude-sonnet-5-5"), 3.0, 15.0),
    "top":      (os.getenv("CLAUDE_TOP_MODEL", "claude-opus-5-5"),        5.0, 25.0),
}

PROMPT = (
    "A pallet costs 1,850,000 VND per trip from Ho Chi Minh City to Da Nang. Fuel is 38% of that cost. "
    "If fuel prices rise 12% and we add a 4% handling surcharge on the new total, what is the new price per pallet? "
    "Give the final number rounded to the nearest 1,000 VND."
)
EXPECTED = "2,012,000"

client = anthropic.Anthropic()

for tier, (model, price_in, price_out) in TIERS.items():
    t0 = time.perf_counter()
    resp = client.messages.create(
        model=model,
        max_tokens=600,
        system="You are a logistics pricing analyst. Be concise and show your calculation.",
        messages=[{"role": "user", "content": PROMPT}],
    )
    ms = (time.perf_counter() - t0) * 1000
    u = resp.usage
    cost = u.input_tokens / 1e6 * price_in + u.output_tokens / 1e6 * price_out
    text = resp.content[0].text
    ok = EXPECTED in text or EXPECTED.replace(",", ".") in text or EXPECTED.replace(",", "") in text
    print(f"\n=== {tier} ({model}) — {ms:.0f} ms, in={u.input_tokens} out={u.output_tokens}, ~${cost:.5f}, correct={ok}")
    print(text)
