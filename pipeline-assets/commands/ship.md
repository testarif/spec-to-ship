# Ship readiness fan-out

Use `shipping-and-launch`. Run the `code-reviewer`, `security-auditor`, and `test-engineer` specialist prompts concurrently against the same generated files and test report. Keep the fan-out flat: specialists report to the orchestrator and do not delegate to one another.

Merge their findings, deduplicate overlapping issues, and directly check accessibility, configuration, documentation, and rollback readiness. Any unresolved Critical finding means NO-GO. A GO decision requires a practical rollback plan. Record blockers, recommended fixes, acknowledged risks, the rollback plan, and concise summaries of all specialist reports in `SHIP_REPORT.md`.
