# Testing patterns

- Test behavior through public functions and user-visible outcomes; avoid asserting incidental implementation details.
- Keep test cases isolated, deterministic, and explicit about setup, action, and expected result.
- Cover the normal path, boundaries, empty/invalid input, failure handling, and important state transitions.
- For a regression, first prove the test fails without the fix; then prove the fix and run surrounding tests.
- Use representative data and verify both positive and negative outcomes.
- Prefer focused tests for diagnosis plus the complete relevant suite for regression confidence.
- Report the actual command and result; distinguish skipped, flaky, and unexecuted checks from passes.
