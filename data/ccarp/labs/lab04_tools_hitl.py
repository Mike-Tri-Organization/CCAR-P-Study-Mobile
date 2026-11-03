"""Lab L4 — Tool use loop with a human approval gate (Integration + Governance).

- get_shipment_status: read tool, runs freely.
- reschedule_delivery: write tool; input validated in code, then a HUMAN must approve.
- Failures return tool_result with is_error=True so the model reports honestly.
"""
import json
import os
from datetime import datetime

import anthropic

MODEL = os.getenv("CLAUDE_BALANCED_MODEL", "claude-sonnet-5-5")

TMS = {  # fake Transport Management System
    "MF-1001": {"status": "in_transit", "location": "Da Nang hub", "eta": "2026-11-12", "window": "08:00-12:00"},
    "MF-1002": {"status": "delivered", "location": "Customer warehouse, Thu Duc", "delivered_at": "2026-11-08 10:42"},
    "MF-1003": {"status": "customs_hold", "location": "Cat Lai port", "note": "Missing certificate of origin"},
}

TOOLS = [
    {
        "name": "get_shipment_status",
        "description": "Look up the current status, location and ETA of a MekongFreight shipment. Read-only.",
        "input_schema": {
            "type": "object",
            "properties": {"shipment_id": {"type": "string", "description": "Format MF-1234, e.g. MF-1001"}},
            "required": ["shipment_id"],
        },
    },
    {
        "name": "reschedule_delivery",
        "description": "Request a new delivery date. Requires human approval before it takes effect.",
        "input_schema": {
            "type": "object",
            "properties": {
                "shipment_id": {"type": "string", "description": "Format MF-1234"},
                "new_date": {"type": "string", "description": "ISO date YYYY-MM-DD, e.g. 2026-11-14"},
                "reason": {"type": "string"},
            },
            "required": ["shipment_id", "new_date", "reason"],
        },
    },
]


def run_tool(name: str, args: dict) -> tuple[str, bool]:
    """Returns (content, is_error). All enforcement lives HERE, not in the prompt."""
    sid = args.get("shipment_id", "")
    if sid not in TMS:
        return f"Shipment {sid} not found.", True
    if name == "get_shipment_status":
        return json.dumps(TMS[sid]), False
    if name == "reschedule_delivery":
        try:
            datetime.strptime(args.get("new_date", ""), "%Y-%m-%d")
        except ValueError:
            return "new_date must be an ISO date YYYY-MM-DD.", True
        if TMS[sid]["status"] == "delivered":
            return "Shipment already delivered; cannot reschedule.", True
        ok = input(f"\n>>> APPROVE reschedule of {sid} to {args['new_date']} ({args.get('reason')})? [y/N] ")
        if ok.strip().lower() != "y":
            return "Denied by human reviewer. Tell the customer a dispatcher will follow up today.", True
        TMS[sid]["eta"] = args["new_date"]
        return json.dumps({"ok": True, "shipment_id": sid, "new_eta": args["new_date"]}), False
    return f"Unknown tool {name}", True


client = anthropic.Anthropic()
messages = [{"role": "user", "content": "Where is MF-1001? If it can't arrive by tomorrow, move delivery to 2026-11-14."}]
SYSTEM = ("You are MekongFreight's support assistant. Use the tools; never invent shipment data; "
          "if a tool returns an error, explain it plainly. Today is 2026-11-10.")

for turn in range(6):                                    # budget: max 6 model turns
    resp = client.messages.create(model=MODEL, max_tokens=800, system=SYSTEM, tools=TOOLS, messages=messages)
    messages.append({"role": "assistant", "content": resp.content})
    if resp.stop_reason != "tool_use":
        print("\nASSISTANT:", "".join(b.text for b in resp.content if b.type == "text"))
        break
    results = []
    for block in resp.content:
        if block.type == "tool_use":
            content, is_error = run_tool(block.name, block.input)
            print(f"[tool] {block.name}({block.input}) -> {'ERROR ' if is_error else ''}{content}")
            results.append({"type": "tool_result", "tool_use_id": block.id, "content": content, "is_error": is_error})
    messages.append({"role": "user", "content": results})
