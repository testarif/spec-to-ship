# Incremental implementation

Implement one planned slice at a time in dependency order. Keep the diff focused and preserve working behavior between increments.

For each task:
1. Read its acceptance criteria and load only relevant source/configuration.
2. Add a test that expresses the behavior; confirm it fails for the intended reason.
3. Make the minimum implementation that passes the test.
4. Run focused tests, then the broader available regression checks.
5. Inspect the resulting behavior and diff; update the task checklist only after verification.
6. Report what changed, what was tested, and any remaining risk.

Do not skip a failing check or claim completion without evidence. On a failure, stop feature work, reproduce and localize the cause, fix the root problem, and rerun verification. Use the project Definition of Done as the final gate.
