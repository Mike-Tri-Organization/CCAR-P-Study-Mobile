# Lab L9 — Discovery worksheet (Stakeholder Communication & Lifecycle)

Fill this in for MekongFreight using the Case Study tab. Then compare with decision D5.
Exam questions in this domain reward the *order* of work: discover → agree success criteria → design → pilot → staged rollout → handoff.

## 1. Business problem
- What is the problem in the client's words? What is it in measurable terms?
- Who feels the pain today (customers, support agents, brokers, dispatchers)?
- What happens if nothing changes?

## 2. Users and current process
- Who will use the system? Internal staff, customers, or both?
- Walk through today's process step by step. Where are the delays and errors?
- Which steps are high-risk or irreversible (payouts, customs filings)?

## 3. Success criteria (agree BEFORE building)
| Metric | Baseline today | Pilot target | How it is measured |
|---|---|---|---|
| First-response time | | | |
| Routing accuracy | | | eval set, code grader |
| Policy-answer correctness | | | eval set + judge |
| Escalation of claims to humans | | 100% above limit | audit log |
| Cost per conversation | | | token usage x price |
| CSAT | | | survey |

## 4. Constraints
- Data: which personal data, where it lives, retention, deletion.
- Compliance: data protection law, customer contracts, customs regulations.
- Systems: TMS API, SAP, SharePoint; who owns access?
- Languages, channels, volumes, peak times.
- Budget and timeline.

## 5. Risk tiers and human review
| Action | Risk | Review |
|---|---|---|
| Status answer | Low | Sampled |
| Policy answer | Medium | Sampled + eval |
| Reschedule | Medium | Approval in tool |
| Claim payout > 10M VND | High | Manager approval |
| Customs filing | High | Licensed broker approval |

## 6. Expectation reset — your script
> "We won't promise zero mistakes. We'll promise measured accuracy per category, a safety net that
> catches errors where they matter, and a fast path to a person."

## 7. Rollout and change control
- Pilot group and duration; go/no-go criteria from section 3.
- Stages: internal → 10% web chat → all web → Zalo.
- Prompt/config versioning; regression evals before every change; rollback plan.
- Model upgrades: eval suite → compare cost/quality/latency → canary.

## 8. Handoff checklist
- [ ] Architecture diagram and data-flow map
- [ ] Prompt and config versions
- [ ] Eval suite and how to run it
- [ ] Monitoring dashboards and alerts
- [ ] Incident runbook and escalation contacts
- [ ] Cost controls and budget alerts
- [ ] Named owners for each component
