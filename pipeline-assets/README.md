# Pipeline prompt assets

This directory contains the small, project-owned prompt pack used by `server/pipeline.js`. It replaces the ignored `agent-skills/` vendor checkout so a clean clone has everything needed to run the pipeline.

## Layout

- `commands/` — stage-specific orchestration prompts (`spec`, `planning`, `build`, `test`, `review`, `ship`).
- `skills/` — focused workflow guidance injected at the corresponding stage.
- `agents/` — the three specialist prompts used concurrently by `/ship`.
- `references/` — checklists and orchestration guidance injected into planning, testing, review, and shipping.
- `LICENSE` — upstream MIT notice retained for the adapted prompt material.

These files are an intentionally curated/adapted subset for this application, not a mirror of the upstream repository. When changing stage behavior, update the relevant asset and the loader in `server/pipeline.js` together; the mock pipeline test verifies the ship prompt is loaded.

## Stage-to-asset map

| Stage | Command | Skills | References/personas |
|---|---|---|---|
| Define | `commands/spec.md` | `skills/spec-driven-development.md` | — |
| Plan | `commands/planning.md` | `skills/planning-and-task-breakdown.md` | `references/definition-of-done.md` |
| Build | `commands/build.md` | `skills/incremental-implementation.md`, `skills/test-driven-development.md` | — |
| Verify | `commands/test.md` | `skills/test-driven-development.md` | `references/testing-patterns.md` |
| Review | `commands/review.md` | `skills/code-review-and-quality.md` | `references/security-checklist.md`, `references/performance-checklist.md` |
| Ship | `commands/ship.md` | `skills/shipping-and-launch.md` | `agents/code-reviewer.md`, `agents/security-auditor.md`, `agents/test-engineer.md`, all release checklists and `references/orchestration-patterns.md` |

The source material was adapted from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). See `LICENSE` for the retained MIT notice.
