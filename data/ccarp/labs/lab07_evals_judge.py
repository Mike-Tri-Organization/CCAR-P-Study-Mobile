"""Lab L7 — Code grader + LLM-as-judge (Evaluation, Testing & Optimization).

For each golden case: fast model answers -> code grader checks required facts ->
balanced model judges tone/helpfulness with a rubric (JSON score 1-5).
In a real project, calibrate the judge against human labels before trusting it.
"""
import json
import os

import anthropic

FAST = os.getenv("CLAUDE_FAST_MODEL", "claude-haiku-5-5")
JUDGE = os.getenv("CLAUDE_BALANCED_MODEL", "claude-sonnet-5-5")

SYSTEM = ("You are MekongFreight support. Policy facts: refunds or claims within 14 days of delivery; reschedules free up to "
          "24 hours before the delivery window, otherwise 150,000 VND; support hours 7:00-21:00 daily. "
          "Answer in 2-3 friendly sentences in the customer's language.")

CASES = [
    {"input": "How long do I have to file a claim for a damaged parcel?", "must_include": ["14"]},
    {"input": "Tôi muốn đổi lịch giao hàng vào ngày mai, có mất phí không?", "must_include": ["24", "150"]},
    {"input": "What time does your support team open?", "must_include": ["7"]},
    {"input": "I want to change delivery, the truck arrives in 3 hours. Is that free?", "must_include": ["150"]},
]

RUBRIC = """Score the support reply from 1 to 5:
5 = correct per policy, directly answers, friendly, right language, concise
3 = mostly correct but vague, wordy, or slightly off-tone
1 = wrong policy facts, wrong language, or does not answer
Return JSON only: {"score": <1-5>, "reason": "<one sentence>"}"""

client = anthropic.Anthropic()
rows = []
for case in CASES:
    out = client.messages.create(model=FAST, max_tokens=300, system=SYSTEM,
                                 messages=[{"role": "user", "content": case["input"]}]).content[0].text
    missing = [m for m in case["must_include"] if m.lower() not in out.lower()]          # code grader
    j = client.messages.create(model=JUDGE, max_tokens=200, system="You are a strict, fair grader.",
                               messages=[{"role": "user", "content":
                                          f"{RUBRIC}\n\nPolicy: {SYSTEM}\n\nCustomer: {case['input']}\n\nReply: {out}"}]
                               ).content[0].text
    try:
        verdict = json.loads(j[j.find("{"): j.rfind("}") + 1])
    except ValueError:
        verdict = {"score": -1, "reason": "unparseable judge output"}
    rows.append((case["input"], not missing, verdict["score"]))
    print(f"\nQ: {case['input']}\nA: {out}\ncode_grader={'PASS' if not missing else 'FAIL missing ' + str(missing)} "
          f"judge={verdict['score']} ({verdict['reason']})")

print(f"\nCode pass rate: {sum(r[1] for r in rows)}/{len(rows)} | "
      f"avg judge: {sum(r[2] for r in rows if r[2] > 0) / max(1, sum(1 for r in rows if r[2] > 0)):.2f}")
