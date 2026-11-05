"""Lab L6 — RAG with citations and a retrieval trap (Integration + Evaluation).

A naive keyword retriever returns the top-2 documents. The 2023 refund policy is SUPERSEDED,
but naive retrieval can still pick it. Claude must cite [D#] or say "Not in the provided documents."
Citations are then verified in code.

Exercise: add an `effective`/`superseded` metadata field and filter superseded docs out
before ranking — then re-run the same query.
"""
import os
import re
import sys

import anthropic

MODEL = os.getenv("CLAUDE_BALANCED_MODEL", "claude-sonnet-5-5")

DOCS = {
    "D1": "Refund policy effective 2023-01-01. Customers may request a refund for a damaged shipment within 7 days of delivery. "
          "Refund requests require photos and the delivery note. This policy is superseded.",
    "D2": "Refund policy effective 2026-03-01, replaces the 2023 policy. Customers may request a refund or claim for a damaged or "
          "lost shipment within 14 days of the delivery date. Attach photos, the signed delivery note and the commercial invoice. "
          "Claims above 10 million VND are reviewed by a manager.",
    "D3": "Deliveries can be rescheduled up to 24 hours before the planned delivery window at no charge. "
          "Later changes cost 150,000 VND per shipment.",
    "D4": "Shipments held by customs at Cat Lai or Hai Phong are usually released within 2 to 5 working days after all documents are complete.",
    "D5": "Support is available 7:00 to 21:00 every day in Vietnamese and English.",
}


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", text.lower()) if len(w) > 2}


def retrieve(query: str, k: int = 2) -> list[tuple[str, int]]:
    q = words(query)
    scored = [(doc_id, len(q & words(text))) for doc_id, text in DOCS.items()]
    return sorted(scored, key=lambda x: -x[1])[:k]


def ask(query: str) -> None:
    hits = retrieve(query)
    print("RETRIEVED:", hits)
    context = "\n".join(f'<document id="{d}">{DOCS[d]}</document>' for d, _ in hits)
    prompt = (f"<documents>\n{context}\n</documents>\n\nQuestion: {query}\n\n"
              "Answer only from the documents. Cite document ids like [D2]. "
              "If the documents conflict, prefer the most recent effective policy and say so. "
              "If the answer is not in the documents, reply exactly: Not in the provided documents.")
    resp = anthropic.Anthropic().messages.create(
        model=MODEL, max_tokens=400,
        system="You answer questions for MekongFreight customers using only the provided documents.",
        messages=[{"role": "user", "content": prompt}])
    answer = resp.content[0].text
    print("ANSWER:", answer)
    cited = set(re.findall(r"\[(D\d+)\]", answer))
    retrieved = {d for d, _ in hits}
    bad = cited - retrieved
    print("CITATION CHECK:", "ok" if not bad else f"cited but not retrieved: {sorted(bad)}",
          "| no citations" if not cited else "")


if __name__ == "__main__":
    ask(" ".join(sys.argv[1:]) or "How many days do I have to request a refund for a damaged shipment?")
