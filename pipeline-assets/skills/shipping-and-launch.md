# Shipping and launch

Shipping is a decision gate, not a summary of activity. Gather independent review evidence, then make one explicit GO/NO-GO decision.

## Readiness workflow
1. Run specialist reviews for code quality, security, and test coverage independently and concurrently.
2. Merge duplicate findings while preserving the strongest severity and evidence.
3. Check test/build results, accessibility, configuration, documentation, and operational visibility.
4. Treat unresolved Critical security/correctness findings or failed required checks as blockers.
5. For GO, document a rollback trigger and a concrete, reversible rollback procedure.
6. List accepted residual risks with mitigation and owner/context.

The ship report must begin with exactly `## Ship Decision: GO` or `## Ship Decision: NO-GO`, then include blockers, recommended fixes, acknowledged risks, rollback plan, and specialist report summaries. Follow the orchestration-patterns reference: parallelize independent specialists, keep shared state in the orchestrator, and do not allow recursive delegation.
