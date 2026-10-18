const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { chat } = require('./llm');

const PIPELINE_ASSETS_DIR = path.join(__dirname, '..', 'pipeline-assets');
const WORKSPACES = path.join(__dirname, '..', 'workspaces');

// ---------- Read the project's pipeline prompt pack ----------

function readAsset(category, name, maxLines) {
  const full = fs.readFileSync(path.join(PIPELINE_ASSETS_DIR, category, `${name}.md`), 'utf8');
  if (!maxLines) return full;
  return full.split('\n').slice(0, maxLines).join('\n');
}

const readCommand = (name) => readAsset('commands', name);
const readSkill = (name, maxLines) => readAsset('skills', name, maxLines);
const readAgent = (name) => readAsset('agents', name);
const readReference = (name) => readAsset('references', name);

// ---------- Helpers ----------

// The model may vary file markers slightly, so use a tolerant regular expression.
// The closing `===` may be missing: `===FILE: path===` or `===FILE: path\n`.
const FILE_RE = /===\s*FILE:\s*(.+?)(?:\s*===|\r?\n)([\s\S]*?)\r?\n?===\s*END\s*===/g;

// Remove echoed format instructions if the model wraps its response in file markers.
function sanitizeContent(content) {
  let t = (content || '').replace(/^\s*===\s*FILE:[^\n]*\r?\n?/, '');
  t = t.replace(/\r?\n?\s*===\s*END\s*===\s*$/, '');
  return t;
}

function parseFiles(text) {
  const files = {};
  let m;
  FILE_RE.lastIndex = 0;
  while ((m = FILE_RE.exec(text))) files[m[1].trim()] = sanitizeContent(m[2]);
  return files;
}

// Extract an HTML document from unmarked output, if present.
function extractHtml(text) {
  const t = text || '';
  const start = t.search(/<!DOCTYPE|<html/i);
  if (start === -1) return null;
  const end = t.search(/<\/html>/i);
  return (end === -1 ? t.slice(start) : t.slice(start, end + 7)).trim();
}

// Treat unmarked model output as the content of a single file.
function parseFilesFallback(text, rel) {
  const t = sanitizeContent(text).trim();
  return t ? { [rel]: t + '\n' } : {};
}

// Fail explicitly on empty or malformed LLM output rather than writing an empty file.
function requireNonEmpty(out, what) {
  if (!out || !out.trim()) throw new Error(`${what} returned an empty response.`);
  return out;
}

async function checkpoint(run) {
  if (run.status === 'aborted') {
    const error = new Error('Pipeline aborted.');
    error.code = 'RUN_ABORTED';
    throw error;
  }
  while (run.status === 'paused') {
    await new Promise((resolve) => run.resumeWaiters.add(resolve));
  }
  if (run.status === 'aborted') {
    const error = new Error('Pipeline aborted.');
    error.code = 'RUN_ABORTED';
    throw error;
  }
}

async function runChat(run, messages, opts) {
  await checkpoint(run);
  const result = await chat(messages, { ...opts, signal: run.abortController.signal });
  await checkpoint(run);
  return result;
}

// Retry once with a corrective prompt if the output does not match the required format.
async function chatWithFormatRetry(run, system, userMsg, opts) {
  const first = stripFence(await runChat(run, [
    { role: 'system', content: system },
    { role: 'user', content: userMsg },
  ], opts));
  if (Object.keys(parseFiles(first)).length > 0) return first;
  const retry = stripFence(await runChat(run, [
    { role: 'system', content: system },
    { role: 'user', content: userMsg },
    { role: 'assistant', content: first },
    { role: 'user', content: 'The response above did not follow the required format. Rewrite it completely using ONLY ===FILE: path/to/file=== ... ===END=== blocks. Do not include anything outside the file blocks.' },
  ], opts));
  return retry;
}

function stripFence(text) {
  const t = text.trim();
  if (t.startsWith('```')) {
    const firstNl = t.indexOf('\n');
    const lastFence = t.lastIndexOf('```');
    if (lastFence > firstNl) return t.slice(firstNl + 1, lastFence);
  }
  return t;
}

function safeWrite(ws, rel, content) {
  const root = path.resolve(ws);
  const p = path.resolve(root, rel);
  const relative = path.relative(root, p);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Invalid file path: ${rel}`);
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function runNodeTests(ws, run) {
  return new Promise((resolve) => {
    execFile('node', ['--test', 'test/'], { cwd: ws, timeout: 90000, signal: run.abortController.signal }, (err, stdout, stderr) => {
      resolve({ code: err && err.code != null ? Number(err.code) : (err ? 1 : 0), output: `${stdout || ''}${stderr || ''}`.trim() });
    });
  });
}

const AUTONOMOUS = `
AUTONOMOUS MODE RULES (this pipeline runs automatically):
- Never ask the user questions. Make reasonable assumptions as a senior engineer and state them explicitly.
- Ignore instructions to wait for approval or ask the user; approval has already been granted.
- Write all generated specifications, plans, reports, code comments, and user-facing product content in English, regardless of the language of the original idea.
- Follow output format instructions exactly. Do not add explanations, introductions, or Markdown code fences outside the requested format.
`;

const FILE_FORMAT = `
REQUIRED OUTPUT FORMAT:
Write every file using this format, with a blank line between files:
===FILE: path/to/file===
<complete file contents>
===END===
Do not write anything outside the file blocks. No explanations or code fences.
`;

// ---------- Pipeline stages ----------

async function stepSpec(run, ctx, emit, ws) {
  const step = 'spec';
  emit({ type: 'step:start', step });
  const log = (kind, text) => emit({ type: 'log', step, kind, text });

  log('cmd', '$ /spec  →  spec-driven-development skill activated');
  log('info', 'Analyzing the idea and drafting a structured SPEC.md…');

  const system = [
    'You are an autonomous AI software engineer working in the "spec-to-ship" pipeline.',
    readCommand('spec'),
    '--- SKILL: spec-driven-development ---',
    readSkill('spec-driven-development'),
    AUTONOMOUS,
    'TASK: Create the SPEC.md content from the user idea.',
    'OUTPUT: Write only the Markdown content for SPEC.md. Use "# SPEC" as the heading.',
    'Sections: Purpose, Target Users, Features and Acceptance Criteria, Technology Stack, Project Structure, Test Strategy, Constraints (always/never).',
    'Do not write code; produce the specification only.',
  ].join('\n\n');

  const out = stripFence(await runChat(run, [
    { role: 'system', content: system },
    { role: 'user', content: `Idea: ${ctx.idea}` },
  ], { temperature: 0.4, maxTokens: 4096 }));

  log('llm', out);
  safeWrite(ws, 'SPEC.md', out.trim() + '\n');
  ctx.spec = out;
  log('file', '✓ SPEC.md written');
  emit({ type: 'step:done', step, summary: 'SPEC.md created' });
}

async function stepPlan(run, ctx, emit, ws) {
  const step = 'plan';
  emit({ type: 'step:start', step });
  const log = (kind, text) => emit({ type: 'log', step, kind, text });

  log('cmd', '$ /plan  →  planning-and-task-breakdown skill activated');
  log('info', 'Reading SPEC.md and breaking work into small dependency-ordered tasks…');

  const system = [
    'You are an autonomous AI software engineer working in the "spec-to-ship" pipeline.',
    readCommand('planning'),
    '--- SKILL: planning-and-task-breakdown ---',
    readSkill('planning-and-task-breakdown'),
    '--- REFERENCE: Definition of Done ---',
    readReference('definition-of-done'),
    AUTONOMOUS,
    'TASK: Create the plan based on SPEC.md.',
    'tasks/plan.md: tasks, acceptance criteria for each task, and dependency order.',
    'tasks/todo.md: a checkbox task list using the - [ ] format.',
    FILE_FORMAT,
    'Create exactly two files: tasks/plan.md and tasks/todo.md.',
  ].join('\n\n');

  const out = await chatWithFormatRetry(run, system, `Idea: ${ctx.idea}\n\nSPEC.md:\n${ctx.spec}`, { temperature: 0.3, maxTokens: 4096 });

  log('llm', out);
  let files = parseFiles(out);
  if (!files['tasks/plan.md']) {
    log('info', '⚠️ Plan output did not use ===FILE: ...=== markers; treating the full response as the plan file.');
    files = parseFilesFallback(out, 'tasks/plan.md');
  }
  if (!files['tasks/todo.md']) files['tasks/todo.md'] = files['tasks/plan.md'];
  for (const [rel, content] of Object.entries(files)) {
    safeWrite(ws, rel, content);
    log('file', `✓ ${rel} written`);
  }
  ctx.plan = files['tasks/plan.md'];
  emit({ type: 'step:done', step, summary: 'Plan created (tasks/plan.md, tasks/todo.md)' });
}

async function stepBuild(run, ctx, emit, ws) {
  const step = 'build';
  emit({ type: 'step:start', step });
  const log = (kind, text) => emit({ type: 'log', step, kind, text });

  log('cmd', '$ /build  →  incremental-implementation + test-driven-development skills activated');
  log('info', 'Validating the plan and implementing the application with TDD…');

  const system = [
    'You are an autonomous AI software engineer working in the "spec-to-ship" pipeline.',
    readCommand('build'),
    '--- SKILL: incremental-implementation ---',
    readSkill('incremental-implementation', 120),
    '--- SKILL: test-driven-development ---',
    readSkill('test-driven-development', 120),
    AUTONOMOUS,
    'TASK: Create a WORKING web application that follows SPEC.md and the plan.',
    'REQUIRED FILE STRUCTURE (exactly these four files):',
    '1. index.html — application interface (semantic HTML, WCAG-compliant, with a lang attribute).',
    '2. style.css — clean, modern design using CSS custom properties; prefer a dark theme.',
    '3. logic.js — ALL business logic as pure functions (no DOM usage). Include this UMD export at the end:',
    '   if (typeof module !== "undefined" && module.exports) { module.exports = { ...allFunctions... }; }',
    '   Also expose the functions in the browser through a named window global.',
    '4. app.js — DOM integration only (event listeners and rendering). No business logic; use logic.js.',
    'RULES: No external dependencies, build step, or CDN. The app must work when its files are opened directly.',
    'Code quality: meaningful names, error handling, and accessibility (ARIA, focus, contrast).',
    'CRITICAL: index.html must include meaningful page content (a heading, text, and at least one section). Do not create an empty section skeleton that relies on app.js to inject all content. The app must show basic content if app.js fails.',
    'CRITICAL: Keep logic.js compact. Do not include huge inline SVG data URIs or embedded images. Use CSS or emoji if visuals are needed.',
    'CRITICAL: If using an img element, its src must be an inline data URI (data:image/svg+xml,...). Do not reference external image paths such as images/. Prefer CSS or emoji.',
    'CRITICAL: Include all four complete files in the response, including app.js before reaching the token limit.',
    FILE_FORMAT,
  ].join('\n\n');

  const out = await chatWithFormatRetry(run, system, `Idea: ${ctx.idea}\n\nSPEC.md:\n${ctx.spec}\n\nPLAN:\n${ctx.plan}`, { temperature: 0.3, maxTokens: 8192 });

  let files = parseFiles(out);
  if (!files['index.html'] || !files['logic.js']) {
    const html = extractHtml(out);
    if (html) {
      log('info', '⚠️ Build output did not use ===FILE: ...=== markers. Extracted HTML for index.html; missing files will be generated next.');
      files['index.html'] = html + '\n';
    } else {
      log('info', '⚠️ Build output did not use file markers; generating the required files with targeted completion requests.');
    }
  }

  // Request missing files individually if the response was truncated.
  for (const rel of ['index.html', 'style.css', 'logic.js', 'app.js']) {
    if (files[rel]) continue;
    log('info', `⚠️ ${rel} is missing — requesting a focused completion…`);
    const have = Object.entries(files).map(([r, c]) => `### ${r}\n${c.slice(0, 6000)}`).join('\n\n');
    const extra = rel === 'app.js'
      ? 'app.js: DOM integration — use functions exported from logic.js, render the interface, and wire up event listeners. Match the script tags and element IDs in index.html exactly.'
      : `Write the complete contents of ${rel}.`;
    const out2 = await chatWithFormatRetry(run, system, `Idea: ${ctx.idea}\n\nFILES GENERATED SO FAR:\n${have}\n\nTASK: Generate ONLY the missing ${rel} file. ${extra}`, { temperature: 0.2, maxTokens: 4096 });
    const files2 = parseFiles(out2);
    if (files2[rel]) {
      files[rel] = files2[rel];
    } else {
      const fb = parseFilesFallback(out2, rel);
      if (fb[rel]) files[rel] = fb[rel];
    }
    if (!files[rel]) throw new Error(`Build: unable to generate ${rel}; the completion request also failed.`);
    log('file', `✓ ${rel} generated with a completion request`);
  }

  log('llm', out);
  for (const rel of ['index.html', 'style.css', 'logic.js', 'app.js']) {
    safeWrite(ws, rel, files[rel]);
    log('file', `✓ ${rel} written (${files[rel].split('\n').length} lines)`);
  }
  ctx.files = files;
  emit({ type: 'step:done', step, summary: 'Application code generated (4 files)' });
}

async function stepTest(run, ctx, emit, ws) {
  const step = 'test';
  emit({ type: 'step:start', step });
  const log = (kind, text) => emit({ type: 'log', step, kind, text });

  log('cmd', '$ /test  →  test-driven-development skill activated');
  log('info', 'Analyzing logic.js and writing tests with node:test…');
  if (!ctx.files['logic.js']) throw new Error('Test stage: logic.js was not found; the build stage is incomplete.');

  const system = [
    'You are an autonomous AI software engineer working in the "spec-to-ship" pipeline.',
    readCommand('test'),
    '--- SKILL: test-driven-development ---',
    readSkill('test-driven-development', 150),
    '--- REFERENCE: Testing patterns ---',
    readReference('testing-patterns'),
    AUTONOMOUS,
    'TASK: Write a comprehensive test file for the business logic in logic.js.',
    'REQUIRED: test/logic.test.js using node:test and node:assert/strict.',
    'First line: const { ... } = require("../logic.js");',
    'Cover happy paths, edge cases (empty/null/boundary values), and error paths. Write at least 8 tests.',
    'Tests must verify the ACTUAL behavior of logic.js. Read the code and calculate expected results.',
    FILE_FORMAT,
    'Create exactly one file: test/logic.test.js.',
  ].join('\n\n');

  const out = await chatWithFormatRetry(run, system, `Idea: ${ctx.idea}\n\nlogic.js:\n${ctx.files['logic.js']}\n\napp.js:\n${ctx.files['app.js'] || ''}`, { temperature: 0.2, maxTokens: 4096 });

  log('llm', out);
  let files = parseFiles(out);
  if (!files['test/logic.test.js']) {
    log('info', '⚠️ Test output did not use ===FILE: ...=== markers; treating the full response as the test file.');
    files = parseFilesFallback(out, 'test/logic.test.js');
  }
  safeWrite(ws, 'test/logic.test.js', files['test/logic.test.js']);
  log('file', '✓ test/logic.test.js written');

  log('cmd', '$ node --test test/');
  await checkpoint(run);
  const result = await runNodeTests(ws, run);
  log('test', result.output || '(no output)');
  ctx.testReport = result.output;
  if (result.code !== 0) {
    log('info', '⚠️ Some tests failed; passing the report to the review stage.');
  } else {
    log('info', '✓ All tests passed.');
  }
  emit({ type: 'step:done', step, summary: result.code === 0 ? 'Tests written and passed' : 'Tests written (some failed)' });
}

async function stepReview(run, ctx, emit, ws) {
  const step = 'review';
  emit({ type: 'step:start', step });
  const log = (kind, text) => emit({ type: 'log', step, kind, text });

  log('cmd', '$ /review  →  code-review-and-quality skill activated');
  log('info', 'Running a five-dimension code review: correctness, readability, architecture, security, and performance…');

  const system = [
    'You are an autonomous AI software engineer working in the "spec-to-ship" pipeline.',
    readCommand('review'),
    '--- SKILL: code-review-and-quality ---',
    readSkill('code-review-and-quality', 150),
    '--- REFERENCE: Security checklist ---',
    readReference('security-checklist'),
    '--- REFERENCE: Performance checklist ---',
    readReference('performance-checklist'),
    AUTONOMOUS,
    'TASK: Review the files below across five dimensions (correctness, readability, architecture, security, and performance).',
    'OUTPUT: A Markdown report headed "# Code Review". Include findings for each dimension; classify each as Critical, Important, or Suggestion, with file:line references and recommended fixes.',
    'End with a "## Summary" section containing the total finding count and overall assessment.',
  ].join('\n\n');

  // Limit each file to 4,000 characters to keep prompts within the model context window.
  const fileDump = Object.entries(ctx.files).map(([rel, c]) => `### ${rel}\n\`\`\`\n${c.slice(0, 4000)}${c.length > 4000 ? '\n... (truncated)' : ''}\n\`\`\``).join('\n\n');
  const userMsg = `Idea: ${ctx.idea}\n\nTest results:\n${(ctx.testReport || '').slice(0, 2000)}\n\nFILES:\n${fileDump}`;

  let out = stripFence(await runChat(run, [
    { role: 'system', content: system },
    { role: 'user', content: userMsg },
  ], { temperature: 0.2, maxTokens: 4096 }));

  if (!out.trim()) {
    log('info', '⚠️ Review response was empty; retrying…');
    out = stripFence(await runChat(run, [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
      { role: 'user', content: 'Complete the task above by writing the five-dimension review report in Markdown. The response must not be empty.' },
    ], { temperature: 0.3, maxTokens: 4096 }));
  }
  out = requireNonEmpty(out, 'Review');

  log('llm', out);
  safeWrite(ws, 'REVIEW.md', out.trim() + '\n');
  ctx.review = out;
  log('file', '✓ REVIEW.md written');
  emit({ type: 'step:done', step, summary: 'Five-dimension review complete' });
}

async function stepShip(run, ctx, emit, ws) {
  const step = 'ship';
  emit({ type: 'step:start', step });
  const log = (kind, text) => emit({ type: 'log', step, kind, text });

  log('cmd', '$ /ship  →  shipping-and-launch skill + 3 parallel agents (fan-out)');
  log('info', 'code-reviewer, security-auditor, and test-engineer are running in parallel…');

  // Limit each file to 4,000 characters to keep prompts within the model context window.
  const fileDump = Object.entries(ctx.files).map(([rel, c]) => `### ${rel}\n\`\`\`\n${c.slice(0, 4000)}${c.length > 4000 ? '\n... (truncated)' : ''}\n\`\`\``).join('\n\n');
  const testDump = (ctx.testReport || '').slice(0, 2000);

  const personaTask = (agentName, focus) => [
    readAgent(agentName),
    AUTONOMOUS,
    `TASK: ${focus}`,
    'OUTPUT: A Markdown report limited to your area of expertise. Classify findings as Critical, High, Medium, or Low.',
  ].join('\n\n');

  const userMsg = `Idea: ${ctx.idea}\n\nTest results:\n${testDump}\n\nFILES:\n${fileDump}`;

  // Keep the pipeline alive if an agent returns an empty or invalid response.
  const personaWithFallback = async (agentName, focus) => {
    try {
      const out = await runChat(run, [
        { role: 'system', content: personaTask(agentName, focus) },
        { role: 'user', content: userMsg },
      ], { temperature: 0.2, maxTokens: 3072 });
      if (out && out.trim()) return out;
    } catch (e) {
      if (run.status === 'aborted') throw e;
      log('info', `⚠️ Could not get a report from ${agentName}: ${String((e && e.message) || e).slice(0, 120)}`);
    }
    return `## ${agentName} Report\n\n(Report unavailable — this is missing evidence, not a clean review.)`;
  };

  const [reviewReport, securityReport, testReport] = await Promise.all([
    personaWithFallback('code-reviewer', 'Review these changes across five dimensions: correctness, readability, architecture, security, and performance.'),
    personaWithFallback('security-auditor', 'Audit these changes for security: OWASP Top 10, secret management, authentication/authorization, input validation, and dependency risks.'),
    personaWithFallback('test-engineer', 'Analyze test coverage for these changes: happy paths, edge cases, error paths, and missing scenarios. Evaluate the existing test output.'),
  ]);

  log('llm', `--- code-reviewer ---\n${reviewReport}`);
  log('llm', `--- security-auditor ---\n${securityReport}`);
  log('llm', `--- test-engineer ---\n${testReport}`);
  log('info', 'Combining reports and making the GO/NO-GO decision…');

  const mergeSystem = [
    'You are the main orchestrator of the "spec-to-ship" pipeline.',
    readCommand('ship'),
    '--- SKILL: shipping-and-launch ---',
    readSkill('shipping-and-launch', 120),
    '--- REFERENCE: Orchestration patterns ---',
    readReference('orchestration-patterns'),
    '--- REFERENCE: Definition of Done ---',
    readReference('definition-of-done'),
    '--- REFERENCE: Security checklist ---',
    readReference('security-checklist'),
    '--- REFERENCE: Performance checklist ---',
    readReference('performance-checklist'),
    '--- REFERENCE: Accessibility checklist ---',
    readReference('accessibility-checklist'),
    'If any specialist report is unavailable, make the decision NO-GO and list the missing review as a blocker.',
    AUTONOMOUS,
    'TASK: Combine the three agent reports according to Phase B and make one decision in Phase C.',
    'OUTPUT: Markdown. The FIRST line must be exactly "## Ship Decision: GO" or "## Ship Decision: NO-GO".',
    'Sections: Blockers, Recommended fixes, Acknowledged risks, Rollback plan (required for GO), and agent report summaries.',
  ].join('\n\n');

  let out = stripFence(await runChat(run, [
    { role: 'system', content: mergeSystem },
    { role: 'user', content: `Idea: ${ctx.idea}\n\n### code-reviewer report\n${reviewReport}\n\n### security-auditor report\n${securityReport}\n\n### test-engineer report\n${testReport}` },
  ], { temperature: 0.2, maxTokens: 4096 }));
  if (!out.trim()) {
    log('info', '⚠️ The merged report was empty; using a conservative NO-GO decision.');
    out = '## Ship Decision: NO-GO\n\n### Blockers\n- The merged ship report was unavailable, so readiness could not be verified.\n\n### Recommended fixes\n- Retry the ship review and inspect each specialist report.\n\n### Acknowledged risks\n- No GO decision is made without a valid review.\n\n### Rollback plan\n- No deployment was approved; keep the generated workspace in preview only.\n\n### Agent reports\n' + reviewReport + '\n\n' + securityReport + '\n\n' + testReport;
  }

  log('llm', out);
  safeWrite(ws, 'SHIP_REPORT.md', out.trim() + '\n');
  ctx.ship = out;
  log('file', '✓ SHIP_REPORT.md written');

  const decision = /NO-GO/i.test(out.split('\n')[0] || out.slice(0, 200)) ? 'NO-GO' : 'GO';
  log('cmd', '$ deploy → static application published to preview');
  log('info', decision === 'GO'
    ? '🚀 GO decision — the application is available in the preview.'
    : '⚠️ NO-GO decision — the application is in preview, but blockers are listed in SHIP_REPORT.md.');
  emit({ type: 'step:done', step, summary: `Ship decision: ${decision}` });
}

// ---------- orkestrasyon ----------

async function startRun(run, idea, emit) {
  const ws = path.join(WORKSPACES, run.id);
  fs.mkdirSync(path.join(ws, 'test'), { recursive: true });
  const ctx = { idea, spec: '', plan: '', files: {}, testReport: '', review: '', ship: '' };

  try {
    await checkpoint(run);
    await stepSpec(run, ctx, emit, ws);
    await checkpoint(run);
    await stepPlan(run, ctx, emit, ws);
    await checkpoint(run);
    await stepBuild(run, ctx, emit, ws);
    await checkpoint(run);
    await stepTest(run, ctx, emit, ws);
    await checkpoint(run);
    await stepReview(run, ctx, emit, ws);
    await checkpoint(run);
    await stepShip(run, ctx, emit, ws);
    await checkpoint(run);
    run.status = 'done';
    emit({ type: 'run:done', preview: `/preview/${run.id}` });
  } catch (err) {
    if (run.status === 'aborted') return;
    run.status = 'failed';
    emit({ type: 'run:failed', error: String((err && err.message) || err) });
  }
}

module.exports = { startRun, safeWrite };
