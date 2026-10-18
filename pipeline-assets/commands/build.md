# Implement the plan

Use `incremental-implementation` together with `test-driven-development`. Read the spec, plan, and relevant source before changing code. Implement the smallest coherent slice, add or update tests, run focused tests and the full available test suite, and check the result before moving on. Keep changes scoped; do not leave placeholders or claim verification that was not performed.

This pipeline runs autonomously. Execute the plan in dependency order without pausing for approval. If a requirement is ambiguous, choose the least surprising option consistent with the spec and document the assumption. If verification reveals a failure, diagnose and fix it rather than hiding or bypassing it.
