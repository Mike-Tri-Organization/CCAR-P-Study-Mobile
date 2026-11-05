# Lab L10 — Team setup for Claude Code (Developer Productivity & Operational Enablement)

Copy these into a scratch repository and try them. Ask yourself for each file:
**is this enforced by the tool, or is it only guidance?**

---

## `CLAUDE.md` (committed) — shared context, *guidance only*

```markdown
# MekongFreight platform

## Commands
- Build: `dotnet build`
- Test: `dotnet test`
- Evals: `python evals/run.py --suite support`   # run before any prompt change

## Conventions
- Prompts live in /prompts and are versioned; never edit production prompts directly.
- Every tool that writes to the TMS validates inputs and requires approval.
- Never log raw customer text; use redaction helpers in /src/Privacy.

## Architecture
- /mcp/tms-server: MCP server wrapping the TMS (read tools only by default)
- /src/Routing: classify-then-route workflow
```

---

## `.claude/settings.json` (committed) — shared rules, *enforced*

```json
{
  "permissions": {
    "allow": [
      "Bash(dotnet build:*)",
      "Bash(dotnet test:*)",
      "Bash(python evals/run.py:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Read(./.env)",
      "Read(./secrets/**)"
    ]
  }
}
```

## `.claude/settings.local.json` (NOT committed — add to .gitignore) — personal overrides

```json
{
  "permissions": {
    "allow": ["Bash(code:*)"]
  }
}
```

---

## Blocking with a hook — *enforced*, deterministic

A `PreToolUse` hook runs before a tool call and can block it. Configure it in `.claude/settings.json`
under `"hooks"`; the hook script inspects the pending command and exits with a blocking status
when it matches a forbidden pattern (for example anything touching the production database).
See the Claude Code hooks documentation for the exact schema and exit codes.

---

## `.mcp.json` (committed) — vetted MCP servers for the project

```json
{
  "mcpServers": {
    "mekong-tms": {
      "command": "python",
      "args": ["mcp/tms-server/lab05_mcp_server.py"],
      "env": { "TMS_API_TOKEN": "${TMS_API_TOKEN}" }
    }
  }
}
```
The token is read from each developer's environment — it is never committed.

---

## CI job (GitHub Actions) — least privilege

```yaml
name: claude-lint-fix
on: [pull_request]
permissions:
  contents: write        # only what is needed to push fixes to the PR branch
  pull-requests: write
jobs:
  lint-fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @anthropic-ai/claude-code
      - run: |
          claude -p "Fix lint errors reported by 'dotnet format --verify-no-changes'. Do not change behavior." \
            --allowedTools "Bash(dotnet format:*),Read,Edit"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}   # CI key with its own spend limit; no production secrets
      # changes land on the PR and go through normal human review
```

---

## Custom command — repeatable workflow

`.claude/commands/release-notes.md` (committed):

```markdown
Read the merged PRs since the last tag with `git log --merges`, group them by area
(routing, MCP server, evals, privacy), and write release notes in /docs/releases/NEXT.md.
Flag any change to /prompts — those need an eval run reference.
```
Use it in Claude Code with `/release-notes`.

---

## Rollout checklist for the 8-person IT team
- [ ] Pilot with the 2 experienced engineers for 2 weeks
- [ ] 1-hour training: CLAUDE.md, permissions, MCP, reviewing AI changes
- [ ] Managed/organization policy for deny rules and approved MCP servers
- [ ] Baseline metrics: PR cycle time, review findings, incidents
- [ ] Review after 30 days against the baseline
