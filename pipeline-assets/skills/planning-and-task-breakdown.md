# Planning and task breakdown

Translate the approved specification into an executable, dependency-ordered plan. Read relevant source and project configuration first; do not plan against imagined architecture.

## Task quality bar
- Slice vertically so each task delivers a coherent, testable behavior.
- Keep each task small enough to implement and verify independently.
- State dependencies explicitly; make ordering unambiguous.
- Give each task observable acceptance criteria and concrete verification commands or steps.
- Include integration, error states, accessibility, and documentation where relevant.
- Separate high-risk decisions and make assumptions visible.

Write the detailed plan to `tasks/plan.md` and a synchronized `- [ ]` checklist to `tasks/todo.md`. Acceptance criteria are task-specific; every task also clears the Definition of Done reference. Avoid silently replacing existing unfinished work.
