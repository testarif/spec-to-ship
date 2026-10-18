/* Spec to Ship workspace client. */
(() => {
  const STEPS = ['spec', 'plan', 'build', 'test', 'review', 'ship'];
  const META = {
    spec: { cmd: '/spec', title: 'Idea — Refine', color: 'var(--c-define)' },
    plan: { cmd: '/plan', title: 'Spec — PRD', color: 'var(--c-plan)' },
    build: { cmd: '/build', title: 'Code — Implement', color: 'var(--c-build)' },
    test: { cmd: '/test', title: 'Test — Debug', color: 'var(--c-verify)' },
    review: { cmd: '/review', title: 'Quality — Review', color: 'var(--c-review)' },
    ship: { cmd: '/ship', title: 'Launch — Preview', color: 'var(--c-ship)' },
  };
  const STORAGE_KEY = 'spec-to-ship.projects.v1';
  const $ = (selector) => document.querySelector(selector);
  const projectList = $('#projectList');
  const sidebarEmpty = $('#sidebarEmpty');
  const projectCount = $('#projectCount');
  const composerView = $('#composerView');
  const projectView = $('#projectView');
  const ideaForm = $('#ideaForm');
  const ideaInput = $('#ideaInput');
  const formError = $('#formError');
  const projectHeading = $('#projectHeading');
  const projectTitle = $('#projectTitle');
  const runControls = $('#runControls');
  const pauseBtn = $('#pauseBtn');
  const resumeBtn = $('#resumeBtn');
  const abortBtn = $('#abortBtn');
  const runStatusBanner = $('#runStatusBanner');
  const detailCmd = $('#detailCmd');
  const detailTitle = $('#detailTitle');
  const detailStatus = $('#detailStatus');
  const detailBody = $('#detailBody');
  const runFooter = $('#runFooter');
  const runFooterText = $('#runFooterText');
  const previewLink = $('#previewLink');

  let projects = loadProjects();
  let activeProjectId = null;
  let eventSource = null;
  let activeStep = null;

  function loadProjects() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveProjects() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }

  function makeId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getActiveProject() {
    return projects.find((project) => project.id === activeProjectId) || null;
  }

  function statusLabel(status) {
    return ({ draft: 'New', starting: 'Starting', running: 'Running', paused: 'Paused', done: 'Complete', failed: 'Failed', aborted: 'Aborted' })[status] || 'Project';
  }

  function renderProjectList() {
    projectList.replaceChildren();
    projectCount.textContent = String(projects.length);
    sidebarEmpty.hidden = projects.length > 0;
    projects.slice().sort((a, b) => b.createdAt - a.createdAt).forEach((project) => {
      const row = document.createElement('div');
      row.className = 'project-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `project-item${project.id === activeProjectId ? ' selected' : ''}`;
      button.setAttribute('aria-current', project.id === activeProjectId ? 'page' : 'false');
      const icon = document.createElement('span');
      icon.className = 'project-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '◈';
      const text = document.createElement('span');
      text.className = 'project-item-copy';
      const name = document.createElement('span');
      name.className = 'project-item-name';
      name.textContent = project.title || 'Untitled project';
      const status = document.createElement('span');
      status.className = `project-item-status status-${project.status}`;
      status.textContent = statusLabel(project.status);
      text.append(name, status);
      const indicator = document.createElement('span');
      indicator.className = `project-indicator indicator-${project.status}`;
      indicator.setAttribute('aria-hidden', 'true');
      button.append(icon, text, indicator);
      button.addEventListener('click', () => selectProject(project.id));

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'project-remove';
      removeButton.setAttribute('aria-label', `Remove ${project.title || 'project'}`);
      removeButton.title = 'Remove project';
      removeButton.textContent = '×';
      removeButton.addEventListener('click', () => removeProject(project));

      row.append(button, removeButton);
      projectList.appendChild(row);
    });
  }

  function removeProject(project) {
    if (project.runId && ['starting', 'running', 'paused'].includes(project.status)) {
      fetch(`/api/runs/${encodeURIComponent(project.runId)}/abort`, { method: 'POST' }).catch(() => {});
    }
    projects = projects.filter((item) => item.id !== project.id);
    if (project.id === activeProjectId) {
      if (eventSource) { eventSource.close(); eventSource = null; }
      activeProjectId = null;
      clearPipeline();
      showComposer();
    }
    saveProjects();
    renderProjectList();
  }

  function setStageState(step, state) {
    const element = document.querySelector(`.stage[data-step="${step}"]`);
    if (!element) return;
    element.classList.remove('active', 'done', 'error');
    if (state) element.classList.add(state);
  }

  function setConnectorState(step, state) {
    const index = STEPS.indexOf(step);
    if (index < 0 || index >= STEPS.length - 1) return;
    const connector = document.querySelector(`.connector[data-after="${step}"]`);
    if (!connector) return;
    connector.style.setProperty('--from', META[step].color);
    connector.style.setProperty('--to', META[STEPS[index + 1]].color);
    connector.classList.remove('active', 'done');
    if (state) connector.classList.add(state);
  }

  function setActiveStep(step) {
    activeStep = step;
    const activeIndex = STEPS.indexOf(step);
    STEPS.forEach((item, index) => {
      setStageState(item, index < activeIndex ? 'done' : index === activeIndex ? 'active' : null);
      setConnectorState(item, index < activeIndex ? 'done' : index === activeIndex ? 'active' : null);
    });
    detailCmd.textContent = META[step].cmd;
    detailCmd.style.color = META[step].color;
    detailTitle.textContent = META[step].title;
    detailStatus.textContent = 'In progress';
    detailStatus.className = 'detail-status running';
    detailBody.replaceChildren();
  }

  function appendLog(step, kind, text) {
    if (step !== activeStep) return;
    const line = document.createElement('div');
    line.className = `log-line ${kind}`;
    const badge = document.createElement('span');
    badge.className = `log-kind ${kind}`;
    badge.textContent = kind;
    const content = document.createElement('span');
    content.className = 'log-text';
    content.textContent = text;
    line.append(badge, content);
    detailBody.appendChild(line);
    detailBody.scrollTop = detailBody.scrollHeight;
  }

  function clearPipeline() {
    activeStep = null;
    STEPS.forEach((step) => { setStageState(step, null); setConnectorState(step, null); });
    detailCmd.textContent = '/spec';
    detailCmd.style.color = 'var(--c-define)';
    detailTitle.textContent = 'Idea — Refine';
    detailStatus.textContent = 'Waiting to start';
    detailStatus.className = 'detail-status';
    detailBody.innerHTML = '<p class="detail-empty">Pipeline activity and generated files will appear here.</p>';
    runFooter.hidden = true;
    previewLink.hidden = true;
    runStatusBanner.hidden = true;
  }

  function syncRunControls(project) {
    const active = project && ['starting', 'running', 'paused'].includes(project.status);
    runControls.hidden = !active;
    pauseBtn.hidden = !project || project.status !== 'running';
    resumeBtn.hidden = !project || project.status !== 'paused';
    abortBtn.hidden = !project || !['starting', 'running', 'paused'].includes(project.status);
    if (!project) return;
    runStatusBanner.hidden = !['paused', 'aborted', 'failed'].includes(project.status);
    if (!runStatusBanner.hidden) {
      runStatusBanner.className = `run-status-banner banner-${project.status}`;
      runStatusBanner.textContent = project.status === 'paused'
        ? 'This pipeline is paused. Resume it whenever you are ready.'
        : project.status === 'aborted' ? 'This pipeline was aborted.' : 'This pipeline stopped after an error.';
    }
  }

  function showComposer() {
    composerView.hidden = false;
    projectView.hidden = true;
    projectHeading.textContent = 'New project';
    requestAnimationFrame(() => ideaInput.focus());
  }

  function showProject(project) {
    composerView.hidden = true;
    projectView.hidden = false;
    projectHeading.textContent = project.title || 'Untitled project';
    projectTitle.textContent = project.title || 'Untitled project';
    syncRunControls(project);
  }

  function selectProject(projectId) {
    if (eventSource) { eventSource.close(); eventSource = null; }
    activeProjectId = projectId;
    const project = getActiveProject();
    renderProjectList();
    if (!project || project.status === 'draft') {
      if (project) ideaInput.value = project.idea || '';
      showComposer();
      return;
    }
    showProject(project);
    clearPipeline();
    if (project.runId) connectToProject(project);
    else renderFinalStatus(project);
  }

  function createProject() {
    const project = { id: makeId(), title: 'Untitled project', idea: '', status: 'draft', runId: null, createdAt: Date.now() };
    projects.unshift(project);
    activeProjectId = project.id;
    saveProjects();
    renderProjectList();
    ideaInput.value = '';
    formError.hidden = true;
    showComposer();
  }

  function renderFinalStatus(project) {
    runFooter.hidden = false;
    previewLink.hidden = !project.preview;
    if (project.preview) previewLink.href = project.preview;
    runFooterText.textContent = project.error || (project.status === 'done' ? 'Build complete. Your preview is ready.' : statusLabel(project.status));
    detailStatus.textContent = statusLabel(project.status);
    detailStatus.className = `detail-status ${project.status === 'done' ? 'done' : project.status === 'failed' ? 'failed' : ''}`;
    syncRunControls(project);
  }

  function handleEvent(project, event) {
    switch (event.type) {
      case 'step:start':
        project.status = 'running';
        if (project.id === activeProjectId) setActiveStep(event.step);
        break;
      case 'log':
        if (project.id === activeProjectId) appendLog(event.step, event.kind, event.text);
        break;
      case 'step:done':
        setStageState(event.step, 'done');
        setConnectorState(event.step, 'done');
        if (project.id === activeProjectId && activeStep === event.step) {
          detailStatus.textContent = 'Complete';
          detailStatus.className = 'detail-status done';
        }
        break;
      case 'run:paused':
        project.status = 'paused';
        break;
      case 'run:resumed':
        project.status = 'running';
        break;
      case 'run:done':
        project.status = 'done';
        project.preview = event.preview || `/preview/${project.runId}`;
        if (project.id === activeProjectId) {
          setStageState('ship', 'done');
          detailStatus.textContent = 'Complete';
          detailStatus.className = 'detail-status done';
          runFooter.hidden = false;
          runFooterText.textContent = 'Build complete. Your preview is ready.';
          previewLink.href = project.preview;
          previewLink.hidden = false;
        }
        closeProjectStream(project);
        break;
      case 'run:failed':
        project.status = 'failed';
        if (project.id === activeProjectId) {
          const failedStep = activeStep || 'ship';
          setStageState(failedStep, 'error');
          detailStatus.textContent = 'Failed';
          detailStatus.className = 'detail-status failed';
          appendLog(failedStep, 'info', `Pipeline error: ${event.error}`);
          runFooter.hidden = false;
          runFooterText.textContent = 'The pipeline stopped with an error. See the details above.';
        }
        closeProjectStream(project);
        break;
      case 'run:aborted':
        project.status = 'aborted';
        if (project.id === activeProjectId) {
          runFooter.hidden = false;
          runFooterText.textContent = 'Pipeline aborted.';
          detailStatus.textContent = 'Aborted';
        }
        closeProjectStream(project);
        break;
    }
    saveProjects();
    renderProjectList();
    if (project.id === activeProjectId) {
      projectHeading.textContent = project.title;
      syncRunControls(project);
    }
  }

  function closeProjectStream(project) {
    if (project.id === activeProjectId && eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function connectToProject(project) {
    const source = new EventSource(`/api/runs/${encodeURIComponent(project.runId)}/events`);
    eventSource = source;
    source.onmessage = (message) => {
      try { handleEvent(project, JSON.parse(message.data)); } catch (error) { console.error('Invalid pipeline event', error); }
    };
    source.onerror = () => {
      fetch(`/api/runs/${encodeURIComponent(project.runId)}`)
        .then((response) => response.status === 404 ? { unavailable: true } : response.ok ? response.json() : null)
        .then((run) => {
          if (!run) return;
          if (eventSource !== source || project.id !== activeProjectId) return;
          if (run.unavailable) {
            project.status = 'failed';
            project.error = 'This run is no longer available on the server. Start a new project to run it again.';
            source.close();
            eventSource = null;
            saveProjects();
            renderProjectList();
            renderFinalStatus(project);
            runStatusBanner.hidden = false;
            runStatusBanner.className = 'run-status-banner banner-failed';
            runStatusBanner.textContent = project.error;
            return;
          }
          project.status = run.status;
          if (run.status !== 'running' && run.status !== 'paused') {
            source.close();
            eventSource = null;
            renderFinalStatus(project);
          }
          saveProjects();
          renderProjectList();
          syncRunControls(project);
        }).catch(() => {});
    };
  }

  async function submitIdea(event) {
    event.preventDefault();
    const idea = ideaInput.value.trim();
    if (!idea) return;
    let project = getActiveProject();
    if (!project || project.status !== 'draft') {
      createProject();
      project = getActiveProject();
    }
    project.idea = idea;
    project.title = idea.split(/\s+/).slice(0, 7).join(' ').replace(/[.!?]+$/, '') || 'Untitled project';
    project.status = 'starting';
    saveProjects();
    renderProjectList();
    showProject(project);
    clearPipeline();
    formError.hidden = true;

    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start the pipeline.');
      project.runId = data.runId;
      project.status = 'running';
      saveProjects();
      renderProjectList();
      showProject(project);
      connectToProject(project);
    } catch (error) {
      project.status = 'failed';
      saveProjects();
      renderProjectList();
      formError.textContent = error.message;
      formError.hidden = false;
      runFooter.hidden = false;
      runFooterText.textContent = 'Could not start this pipeline.';
      syncRunControls(project);
      runStatusBanner.hidden = false;
      runStatusBanner.className = 'run-status-banner banner-failed';
      runStatusBanner.textContent = error.message;
    }
  }

  async function controlRun(action) {
    const project = getActiveProject();
    if (!project?.runId) return;
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(project.runId)}/${action}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not ${action} this pipeline.`);
      project.status = data.status;
      saveProjects();
      syncRunControls(project);
      renderProjectList();
      if (action === 'abort') {
        if (eventSource) { eventSource.close(); eventSource = null; }
        renderFinalStatus(project);
      }
    } catch (error) {
      runStatusBanner.hidden = false;
      runStatusBanner.className = 'run-status-banner banner-failed';
      runStatusBanner.textContent = error.message;
    }
  }

  $('#newProjectBtn').addEventListener('click', createProject);
  ideaForm.addEventListener('submit', submitIdea);
  ideaInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      ideaForm.requestSubmit();
    }
  });
  pauseBtn.addEventListener('click', () => controlRun('pause'));
  resumeBtn.addEventListener('click', () => controlRun('resume'));
  abortBtn.addEventListener('click', () => controlRun('abort'));
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      createProject();
    }
  });

  renderProjectList();
  const mostRecent = projects.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
  if (mostRecent) selectProject(mostRecent.id);
  else showComposer();
})();
