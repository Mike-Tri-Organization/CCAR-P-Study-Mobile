"""Lab L8 — Redact before the model, audit every call (Governance, Safety & Risk).

Personal data is replaced with placeholders IN CODE before the request leaves your machine.
The audit record stores a hash of the original text, never the text itself.
Regex is a teaching baseline; production needs tested, locale-aware PII detection.
"""
import hashlib
import json
import os
import re
from datetime import datetime, timezone

import anthropic

MODEL = os.getenv("CLAUDE_FAST_MODEL", "claude-haiku-5-5")

PATTERNS = [  # order matters: longest/most specific first
    ("NATIONAL_ID", re.compile(r"\b\d{12}\b")),                                   # CCCD: 12 digits
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    ("PHONE", re.compile(r"(?:\+84|\b0)(?:[\s.-]?\d){9}\b")),                     # +84 / 0 + 9 digits
]


def redact(text: str) -> tuple[str, dict]:
    counts = {}
    for label, pattern in PATTERNS:
        n = 0

        def repl(_m, label=label):
            nonlocal n
            n += 1
            return f"[{label}_{n}]"

        text = pattern.sub(repl, text)
        counts[label] = n
    return text, counts


ticket = ("Khách hàng Nguyễn Văn An (CCCD 079203001234, sđt 0903 123 456, email an.nguyen@example.vn) báo lô hàng MF-1002 "
          "bị móp méo khi nhận, yêu cầu bồi thường. Gọi lại số +84 912 345 678 sau 17h.")

safe, counts = redact(ticket)
print("SENT TO MODEL:", safe)

resp = anthropic.Anthropic().messages.create(
    model=MODEL, max_tokens=200,
    system="Summarize the ticket in one sentence and assign a category: delivery_change, tracking, billing, claim, complaint, other. "
           "Keep placeholders like [EMAIL_1] unchanged.",
    messages=[{"role": "user", "content": safe}])
print("MODEL:", resp.content[0].text)

audit = {
    "ts": datetime.now(timezone.utc).isoformat(),
    "model": MODEL,
    "original_sha256": hashlib.sha256(ticket.encode()).hexdigest()[:16],
    "redactions": counts,
    "input_tokens": resp.usage.input_tokens,
    "output_tokens": resp.usage.output_tokens,
}
with open("audit.log", "a", encoding="utf-8") as f:
    f.write(json.dumps(audit, ensure_ascii=False) + "\n")
print("AUDIT:", audit)
