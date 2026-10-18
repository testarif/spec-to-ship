# Spec-driven development

A specification is the contract between the idea and implementation. Make it specific enough to test, but do not prescribe details the user did not request.

## Workflow
1. State the problem, intended users, and desired outcome.
2. List user-visible capabilities and acceptance criteria in observable terms.
3. Record constraints, assumptions, non-goals, and always/never rules.
4. Name the technology choices and describe the project structure at the level needed to guide implementation.
5. Define how each important behavior will be verified, including error and boundary cases.
6. If capabilities can be built independently, identify modules and their dependency/build order.
7. Check that every feature has a verification path and that no constraint conflicts with another.

For autonomous execution, do not block on clarification: state conservative assumptions in the spec and continue. Avoid implementation code in the spec. Save it as `SPEC.md`.
