# Code review and quality

Review the change as a reviewer, not as its author. Compare the actual diff and behavior with the specification. Prioritize concrete defects over style preferences; cite exact files/lines and explain impact and remedy.

## Five review axes
1. **Correctness:** requirements, edge cases, state transitions, error handling, and regression coverage.
2. **Readability:** intent-revealing names, simple control flow, useful boundaries, and no needless duplication.
3. **Architecture:** project conventions, appropriate responsibilities, stable interfaces, and no avoidable coupling.
4. **Security:** untrusted input, output encoding, secrets, authorization, unsafe file/network operations, and dependency exposure.
5. **Performance:** unbounded work, repeated expensive operations, unnecessary rendering/allocations, and resource cleanup.

Classify findings as Critical, Important, or Suggestion. Separate confirmed findings from optional improvements. Consult the focused security and performance references where relevant. If no actionable issues are found, state that explicitly.
