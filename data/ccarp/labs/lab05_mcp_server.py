"""Lab L5 — MekongFreight TMS as an MCP server (Integration).

Install:   pip install "mcp[cli]"
Run test:  mcp dev lab05_mcp_server.py          (opens the MCP Inspector)
Add to Claude Code (local, stdio):
    claude mcp add mekong-tms -- python D:\\path\\to\\lab05_mcp_server.py
Then in Claude Code ask: "What's the status of MF-1003?"

Design points (these are exam points):
- One server wraps the system once; every assistant reuses it.
- Secrets come from the server's environment (TMS_API_TOKEN), never from prompts or tool schemas.
- Read tools are always on; the write tool is OFF unless TMS_ALLOW_WRITES=1 (least privilege),
  and it validates inputs before doing anything.
- For a shared, multi-user deployment you would run this as a remote server over Streamable HTTP
  with per-user authentication instead of stdio.
"""
import os
from datetime import datetime

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mekong-tms")

TMS_API_TOKEN = os.getenv("TMS_API_TOKEN", "")          # would be used to call the real TMS API
ALLOW_WRITES = os.getenv("TMS_ALLOW_WRITES") == "1"

_FAKE_TMS = {
    "MF-1001": {"status": "in_transit", "location": "Da Nang hub", "eta": "2026-11-12"},
    "MF-1002": {"status": "delivered", "location": "Thu Duc", "delivered_at": "2026-11-08 10:42"},
    "MF-1003": {"status": "customs_hold", "location": "Cat Lai port", "note": "Missing certificate of origin"},
}


def _check_id(shipment_id: str) -> None:
    if not (shipment_id.startswith("MF-") and shipment_id[3:].isdigit()):
        raise ValueError("shipment_id must look like MF-1234")
    if shipment_id not in _FAKE_TMS:
        raise ValueError(f"Shipment {shipment_id} not found")


@mcp.tool()
def get_shipment_status(shipment_id: str) -> dict:
    """Read-only. Current status, location and ETA of a shipment (format MF-1234)."""
    _check_id(shipment_id)
    return _FAKE_TMS[shipment_id]


@mcp.tool()
def list_customs_holds() -> list[dict]:
    """Read-only. All shipments currently held by customs."""
    return [{"shipment_id": k, **v} for k, v in _FAKE_TMS.items() if v["status"] == "customs_hold"]


@mcp.tool()
def reschedule_delivery(shipment_id: str, new_date: str, reason: str) -> dict:
    """Write. Request a new delivery date (YYYY-MM-DD). Disabled unless the server is started with TMS_ALLOW_WRITES=1."""
    if not ALLOW_WRITES:
        raise PermissionError("Writes are disabled on this server. Ask a dispatcher to reschedule.")
    _check_id(shipment_id)
    datetime.strptime(new_date, "%Y-%m-%d")             # raises on bad format -> returned to the model as an error
    _FAKE_TMS[shipment_id]["eta"] = new_date
    return {"ok": True, "shipment_id": shipment_id, "new_eta": new_date, "reason": reason}


@mcp.resource("policy://refunds")
def refund_policy() -> str:
    """Current refund policy as a readable resource."""
    return "Refunds/claims within 14 days of delivery with photos, signed delivery note and invoice. >10M VND needs manager review."


if __name__ == "__main__":
    mcp.run()          # stdio transport by default
