"""Lab L1 — Routing workflow (Solution Design).

Step 1: a fast model classifies the message (JSON).
Step 2: the message goes to a short, specialized playbook on a bigger model.

Run:  pip install anthropic
      set ANTHROPIC_API_KEY=...          (Windows cmd)   or  $env:ANTHROPIC_API_KEY="..." (PowerShell)
      python lab01_routing_workflow.py "Lô hàng MF-1003 bị giữ ở hải quan..."
"""
import json
import os
import sys

import anthropic

FAST = os.getenv("CLAUDE_FAST_MODEL", "claude-haiku-5-5")
BALANCED = os.getenv("CLAUDE_BALANCED_MODEL", "claude-sonnet-5-5")

CATEGORIES = ["tracking", "customs", "delivery_change", "billing", "claim", "complaint", "other"]

PLAYBOOKS = {
    "tracking": "You answer shipment-tracking questions. Ask for the shipment ID if missing. Never guess a location or ETA.",
    "customs": "You handle customs-hold questions. Explain that releases usually take 2-5 working days after documents are complete, "
               "offer to have a broker check missing documents, and never promise a release date.",
    "delivery_change": "You handle delivery changes. Free up to 24 hours before the window, otherwise 150,000 VND. "
                       "Confirm the shipment ID and new date; say a dispatcher will confirm.",
    "billing": "You handle billing questions. Never quote amounts you don't have; offer to connect billing.",
    "claim": "You handle damage/loss claims. Claims within 14 days of delivery with photos, signed delivery note and invoice. "
             "Claims above 10 million VND need manager review.",
    "complaint": "Acknowledge the problem sincerely, summarize it, and say a human supervisor will contact them today.",
    "other": "Answer briefly and offer to connect the customer with a person.",
}

client = anthropic.Anthropic()


def classify(message: str) -> dict:
    resp = client.messages.create(
        model=FAST,
        max_tokens=200,
        system=(
            "Classify the customer message. Reply with JSON only, no prose: "
            '{"category": one of ' + json.dumps(CATEGORIES) + ', "urgency": "low|medium|high", "language": "vi|en"}'
        ),
        messages=[{"role": "user", "content": message}],
    )
    text = resp.content[0].text
    start, end = text.find("{"), text.rfind("}")
    data = json.loads(text[start:end + 1])           # code-validate the structure
    if data.get("category") not in CATEGORIES:
        data["category"] = "other"
    return data


def answer(message: str, route: dict) -> str:
    resp = client.messages.create(
        model=BALANCED,
        max_tokens=500,
        system=PLAYBOOKS[route["category"]] + f" Reply in the customer's language ({route['language']}). 3-4 sentences.",
        messages=[{"role": "user", "content": message}],
    )
    return resp.content[0].text


if __name__ == "__main__":
    msg = " ".join(sys.argv[1:]) or "Where is shipment MF-1001?"
    route = classify(msg)
    print("ROUTE:", route)
    print("ANSWER:", answer(msg, route))
