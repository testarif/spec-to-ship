# Verify with tests

Use `test-driven-development`. Inspect the actual business logic before writing tests. For new behavior, cover success, boundaries, and failure cases. For a bug, first add a regression test that demonstrates the failure, then fix it and confirm it passes. Run tests using the project's existing test runner and report the exact outcome; never fabricate passing results.

For this generated application, create `test/logic.test.js` using Node's built-in `node:test` and `node:assert/strict`. Tests must require the real `logic.js`, match its exports, and cover at least eight meaningful cases where the logic permits.
