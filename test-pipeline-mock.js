/* Run the full pipeline with a mock LLM (no real API key required). */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// llm.js'i require cache'te stub'la
const llmPath = require.resolve('./server/llm.js');
const canned = {
  spec: `# SPEC\n\n## Purpose\nA simple task manager.\n\n## Features\n- Add tasks\n- Complete tasks\n\n## Test Strategy\nnode:test`,
  plan: `===FILE: tasks/plan.md===\n# Plan\n1. Create the application skeleton\n2. Add task creation\n===END===\n===FILE: tasks/todo.md===\n- [ ] Create the application skeleton\n- [ ] Add task creation\n===END===`,
  build: [
    '===FILE: index.html===',
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Task Manager</title><link rel="stylesheet" href="style.css"></head><body><h1>Task Manager</h1><input id="inp"><button id="add">Add task</button><ul id="list"></ul><script src="logic.js"></script><script src="app.js"></script></body></html>',
    '===END===',
    '===FILE: style.css===',
    'body{font-family:sans-serif;background:#111;color:#eee}',
    '===END===',
    '===FILE: logic.js===',
    'function addTask(tasks, title){ if(!title||!title.trim()) throw new Error("empty"); return tasks.concat({id:Date.now(),title:title.trim(),done:false}); }\nfunction toggleTask(tasks,id){ return tasks.map(t=>t.id===id?{...t,done:!t.done}:t); }\nfunction removeTask(tasks,id){ return tasks.filter(t=>t.id!==id); }\nif(typeof module!=="undefined"&&module.exports){module.exports={addTask,toggleTask,removeTask};}',
    '===END===',
    '===FILE: app.js===',
    'document.getElementById("add").onclick=()=>{window.tasks=addTask(window.tasks||[],document.getElementById("inp").value);render();};function render(){document.getElementById("list").innerHTML=(window.tasks||[]).map(t=>"<li>"+t.title+"</li>").join("");}',
    '===END===',
  ].join('\n'),
  test: `===FILE: test/logic.test.js===\nconst { addTask, toggleTask, removeTask } = require("../logic.js");\nconst test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("addTask adds", () => { const t = addTask([], "a"); assert.equal(t.length, 1); });\ntest("addTask rejects empty", () => { assert.throws(() => addTask([], "  ")); });\ntest("toggleTask toggles", () => { const t = toggleTask([{id:1,title:"a",done:false}],1); assert.equal(t[0].done, true); });\ntest("removeTask removes", () => { const t = removeTask([{id:1,title:"a",done:false}],1); assert.equal(t.length, 0); });\n===END===`,
  review: `# Code Review\n\n## Correctness\n- Suggestion: escape content rendered by render() to prevent XSS.\n\n## Summary\n1 finding.`,
  ship: `## Ship Decision: GO\n\n### Rollback plan\nRemove the workspace to roll back the static files.`,
};
let call = 0;
const systemPrompts = [];
require.cache[llmPath] = {
  id: llmPath, filename: llmPath, loaded: true,
  exports: {
    MODEL: 'mock',
    async chat(messages) {
      systemPrompts.push(messages[0] && messages[0].content || '');
      call++;
      const keys = ['spec', 'plan', 'build', 'test', 'review', 'ship'];
      // The ship stage makes three agent calls and one merge call.
      // Return canned content; all ship agents may use the same fixture.
      if (call <= 1) return canned.spec;
      if (call === 2) return canned.plan;
      if (call === 3) return canned.build;
      if (call === 4) return canned.test;
      if (call === 5) return canned.review;
      return canned.ship;
    },
  },
};

const { startRun } = require('./server/pipeline.js');

(async () => {
  const events = [];
  const run = { id: 'mocktest', status: 'running', resumeWaiters: new Set(), abortController: new AbortController() };
  await startRun(run, 'A simple task manager', (ev) => events.push(ev));

  assert.equal(run.status, 'done', `status=${run.status}`);
  const ws = path.join(__dirname, 'workspaces', 'mocktest');
  for (const f of ['SPEC.md', 'tasks/plan.md', 'tasks/todo.md', 'index.html', 'style.css', 'logic.js', 'app.js', 'test/logic.test.js', 'REVIEW.md', 'SHIP_REPORT.md']) {
    assert.ok(fs.existsSync(path.join(ws, f)), `Missing file: ${f}`);
  }
  const steps = events.filter((e) => e.type === 'step:done').map((e) => e.step);
  assert.deepEqual(steps, ['spec', 'plan', 'build', 'test', 'review', 'ship'], `Unexpected stages: ${steps}`);
  const done = events.find((e) => e.type === 'run:done');
  assert.ok(done && done.preview === '/preview/mocktest');
  const shipPrompt = systemPrompts.find((prompt) => prompt.includes('# Ship readiness fan-out'));
  assert.ok(shipPrompt, 'Ship stage should load its project-owned command prompt');
  assert.ok(shipPrompt.includes('# Shipping and launch'), 'Ship stage should load its workflow guidance');
  assert.ok(shipPrompt.includes('# Orchestration patterns'), 'Ship stage should load its orchestration reference');
  console.log('✅ MOCK PIPELINE OK — all 6 stages completed, 10 files generated, tests passed.');
  fs.rmSync(ws, { recursive: true, force: true });
})().catch((e) => { console.error('❌ MOCK PIPELINE ERROR:', e.message); process.exit(1); });
