/* Simulate malformed, unmarked model output and verify fallback behavior. */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const llmPath = require.resolve('./server/llm.js');
require.cache[llmPath] = {
  id: llmPath, filename: llmPath, loaded: true,
  exports: {
    MODEL: 'mock',
    async chat(messages) {
      const all = messages.map((m) => m.content || '').join('\n');
      if (all.includes('Generate ONLY the missing')) {
        // Return the requested file without markers to exercise the fallback path.
        if (all.includes('missing app.js')) return 'document.getElementById("list").textContent = "ok";';
        if (all.includes('missing logic.js')) return 'function addTask(t, x){ return t.concat([x]); }\nif(typeof module!=="undefined"&&module.exports){module.exports={addTask};}';
        return 'body{color:#111}';
      }
      if (all.includes('Create the SPEC.md content')) return '# SPEC\n\n## Purpose\nA simulated model response without file markers.';
      if (all.includes('Create the plan based on SPEC.md')) return '# Plan (without markers)\n\n## Task 1\n- [x] Skeleton\n- [ ] Add task creation';
      if (all.includes('Create a WORKING web application')) return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Task Manager</title></head><body><h1>Task Manager</h1><ul id="list"></ul></body></html>';
      if (all.includes('Write a comprehensive test file')) return 'const { addTask } = require("../logic.js");\nconst test = require("node:test");\nconst assert = require("node:assert/strict");\ntest("addTask", () => assert.equal(addTask([], "a").length, 1));';
      if (all.includes('Phase B')) return '## Ship Decision: GO\n\n### Rollback plan\nRemove the workspace.';
      if (all.includes('TASK: Review these changes')) return '## Agent Report\n\nNo findings.';
      if (all.includes('Review the files below across five dimensions')) return '# Code Review\n\n## Summary\n0 findings.';
      return '## Ship Decision: GO\n\n### Rollback plan\nRemove the workspace.';
    },
  },
};

const { startRun } = require('./server/pipeline.js');

(async () => {
  const events = [];
  const run = { id: 'mockfallback', status: 'running', resumeWaiters: new Set(), abortController: new AbortController() };
  await startRun(run, 'task manager', (ev) => events.push(ev));
  assert.equal(run.status, 'done', 'status=' + run.status);
  const ws = path.join(__dirname, 'workspaces', 'mockfallback');
  assert.ok(fs.existsSync(path.join(ws, 'tasks/plan.md')), 'plan.md should be written using the fallback');
  assert.ok(fs.existsSync(path.join(ws, 'index.html')), 'index.html should be written using the fallback');
  assert.ok(fs.existsSync(path.join(ws, 'test/logic.test.js')), 'test file should be written using the fallback');
  const warns = events.filter((e) => e.kind === 'info' && e.text.includes('did not use'));
  console.log('✅ FALLBACK OK — unmarked output recovered; warning count:', warns.length);
  fs.rmSync(ws, { recursive: true, force: true });
})().catch((e) => { console.error('❌ FALLBACK ERROR:', e.message); process.exit(1); });
