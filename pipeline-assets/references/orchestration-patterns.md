# Orchestration patterns

## Independent parallel review
Use parallel fan-out only when specialists can analyze the same immutable input independently. Start all calls together, give each a bounded area of responsibility, and collect their reports before synthesis.

## Orchestrator responsibilities
- Own the shared context and final decision; specialists return evidence, not control flow.
- Keep delegation flat. A specialist must not spawn another specialist.
- Deduplicate findings while preserving severity and evidence.
- Treat missing, empty, or failed specialist results as unavailable evidence—not as a clean bill of health.
- Require a rollback plan for a GO decision and a NO-GO for unresolved critical blockers.
