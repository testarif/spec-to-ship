# Test-driven development

Tests must describe externally observable behavior, not merely repeat implementation details.

## Feature loop
1. Write the smallest test for the expected behavior and edge conditions.
2. Run it and confirm it fails for the expected reason (RED).
3. Implement the simplest change that makes it pass (GREEN).
4. Run related and full regression suites.
5. Refactor only while tests remain green.

## Bug loop
Reproduce the reported bug with a focused regression test first. Confirm the test fails before changing production code, implement the root-cause fix, confirm it passes, then run the broader suite.

Cover happy paths, boundaries, invalid input, and error paths proportional to risk. Keep tests deterministic and isolated. Use the testing-patterns reference for practical test design; report failures honestly and never weaken a test just to obtain a pass.
