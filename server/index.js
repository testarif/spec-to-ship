require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { startRun } = require('./pipeline');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const WORKSPACES = path.join(__dirname, '..', 'workspaces');

// Serve generated applications at /preview/<runId>.
app.use('/preview/:runId', (req, res, next) => {
  const runId = req.params.runId;
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) return res.status(400).end();
  const dir = path.join(WORKSPACES, runId);
  if (!fs.existsSync(dir)) return res.status(404).send('Workspace not found for this run.');
  req.url = req.url.replace(/^\/preview\/[^/]+/, '') || '/';
  express.static(dir)(req, res, next);
});

const runs = new Map();

function emit(run, ev) {
  ev.ts = Date.now();
  run.events.push(ev);
  for (const res of run.listeners) {
    try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* client gitti */ }
  }
}

app.post('/api/runs', (req, res) => {
  const idea = (req.body.idea || '').trim();
  if (!idea) return res.status(400).json({ error: 'Idea is required.' });
  if (!process.env.NVIDIA_API_KEY) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY is not configured. Add it to .env and restart the server.' });
  }
  const runId = crypto.randomBytes(4).toString('hex');
  const run = {
    id: runId,
    idea,
    status: 'running',
    events: [],
    listeners: new Set(),
    resumeWaiters: new Set(),
    abortController: new AbortController(),
    createdAt: Date.now(),
  };
  runs.set(runId, run);
  res.json({ runId });
  startRun(run, idea, (ev) => emit(run, ev));
});

app.get('/api/runs/:id', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found.' });
  res.json({ id: run.id, idea: run.idea, status: run.status, events: run.events });
});

app.post('/api/runs/:id/:action(pause|resume|abort)', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found.' });
  const { action } = req.params;

  if (action === 'pause') {
    if (run.status !== 'running') return res.status(409).json({ error: 'Only a running pipeline can be paused.' });
    run.status = 'paused';
    emit(run, { type: 'run:paused' });
  } else if (action === 'resume') {
    if (run.status !== 'paused') return res.status(409).json({ error: 'Only a paused pipeline can be resumed.' });
    run.status = 'running';
    for (const resolve of run.resumeWaiters) resolve();
    run.resumeWaiters.clear();
    emit(run, { type: 'run:resumed' });
  } else {
    if (!['running', 'paused'].includes(run.status)) return res.status(409).json({ error: 'This pipeline is no longer active.' });
    run.status = 'aborted';
    run.abortController.abort();
    for (const resolve of run.resumeWaiters) resolve();
    run.resumeWaiters.clear();
    emit(run, { type: 'run:aborted' });
    for (const listener of run.listeners) listener.end();
    run.listeners.clear();
  }

  res.json({ id: run.id, status: run.status });
});

// Stream pipeline events to connected clients.
app.get('/api/runs/:id/events', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  for (const ev of run.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  if (!['running', 'paused'].includes(run.status)) return res.end();
  run.listeners.add(res);
  req.on('close', () => run.listeners.delete(res));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`spec-to-ship listening at http://localhost:${PORT}`);
  if (!process.env.NVIDIA_API_KEY) console.warn('⚠️  NVIDIA_API_KEY is missing. Add it to .env before starting a pipeline.');
});
