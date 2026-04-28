/* ============================================
   SVM Task Tracker — Application Logic
   ============================================ */

// =============================================
// CONFIGURATION
// =============================================
const CONFIG = {
  // 🔴 REPLACE THIS with your deployed Apps Script Web App URL
  API_URL: 'https://script.google.com/macros/s/AKfycbyTJE6VdLVLUz_SeCONZ68HrzWS9Y6ise0aL7Fp3j1Sb90_P_HDn31_wj9fGWxTwHif/exec',

  // Retry settings
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000,

  // Demo mode — set to true to use mock data without a backend
  DEMO_MODE: false,
};

// =============================================
// STATE
// =============================================
const state = {
  currentUser: null,
  teamMembers: [],
  tasks: [],
  briefing: null,
  stats: null,
  isLoading: true,
  error: null,
  filters: {
    search: '',
    status: 'all'
  },
  theme: localStorage.getItem('theme') === 'light' ? 'light' : 'dark',
  editingTaskId: null
};

// =============================================
// MOCK DATA (for demo / offline mode)
// =============================================
const MOCK_TEAM = [
  { name: 'Ankit', role: 'Coordinator', active: true },
  { name: 'Priya', role: 'Teacher', active: true },
  { name: 'Rahul', role: 'Admin', active: true },
  { name: 'Sneha', role: 'Teacher', active: true },
  { name: 'Vikram', role: 'Supervisor', active: true },
  { name: 'Meera', role: 'Teacher', active: true },
];

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getMockTasks(user) {
  const today = getTodayStr();
  const allTasks = [
    // Daily tasks
    { taskId: 'T001', taskName: 'Check student attendance register', assignedTo: user, taskType: 'daily', plannedDate: today, completedDate: '', status: 'pending', notes: '' },
    { taskId: 'T002', taskName: 'Review lesson plans for the day', assignedTo: user, taskType: 'daily', plannedDate: today, completedDate: '', status: 'pending', notes: '' },
    { taskId: 'T003', taskName: 'Update classroom activity log', assignedTo: user, taskType: 'daily', plannedDate: today, completedDate: '', status: 'pending', notes: '' },
    // Weekly tasks
    { taskId: 'T004', taskName: 'Submit weekly progress report', assignedTo: user, taskType: 'weekly', plannedDate: today, completedDate: '', status: 'pending', notes: '' },
    { taskId: 'T005', taskName: 'Review student homework submissions', assignedTo: user, taskType: 'weekly', plannedDate: today, completedDate: '', status: 'pending', notes: '' },
    // One-time tasks
    { taskId: 'T006', taskName: 'Prepare materials for parent-teacher meeting', assignedTo: user, taskType: 'one-time', plannedDate: today, completedDate: '', status: 'pending', notes: '' },
    { taskId: 'T007', taskName: 'Update notice board for exam schedule', assignedTo: user, taskType: 'one-time', plannedDate: today, completedDate: '', status: 'pending', notes: '' },
    // Overdue task
    { taskId: 'T008', taskName: 'Submit lab equipment inventory list', assignedTo: user, taskType: 'one-time', plannedDate: '2026-04-27', completedDate: '', status: 'overdue', notes: 'Due yesterday' },
  ];
  return allTasks;
}

function getMockStats(user) {
  return {
    weekScore: 72,
    streak: 3,
    completedToday: 0,
    totalToday: 8,
    tasksAssigned: 28,
    tasksCompleted: 22,
    tasksLate: 4,
    tasksMissed: 2,
  };
}

function getMockBriefing(user, tasks) {
  const total = tasks.length;
  const overdue = tasks.filter(t => t.status === 'overdue').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const done = tasks.filter(t => t.status === 'done').length;

  let msg = `Good ${getTimeOfDay()}, <strong>${user}</strong>! `;
  if (total === 0) {
    msg += `You have no tasks scheduled for today. Enjoy your free time.`;
  } else {
    msg += `You have <strong>${total} task${total > 1 ? 's' : ''}</strong> today`;
    if (overdue > 0) {
      msg += ` — <strong>${overdue} overdue</strong> from yesterday. Prioritize ${overdue === 1 ? 'it' : 'those'} first.`;
    } else if (done === total) {
      msg += `. And you've completed them all — amazing work!`;
    } else {
      msg += `. Stay focused.`;
    }
  }
  return msg;
}

// =============================================
// API LAYER
// =============================================
async function apiFetch(action, params = {}, method = 'GET') {
  if (CONFIG.DEMO_MODE) {
    return demoHandler(action, params, method);
  }

  const url = new URL(CONFIG.API_URL);
  let options = {};

  if (method === 'GET') {
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    options = { method: 'GET', redirect: 'follow' };
  } else {
    options = {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...params }),
    };
  }

  let lastError;
  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url.toString(), options);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      lastError = err;
      if (attempt < CONFIG.MAX_RETRIES) {
        await sleep(CONFIG.RETRY_DELAY * (attempt + 1));
      }
    }
  }
  throw lastError;
}

async function demoHandler(action, params) {
  // Simulate network delay
  await sleep(400 + Math.random() * 400);

  switch (action) {
    case 'getTeam':
      return { success: true, data: MOCK_TEAM };
    case 'getTasks':
      return { success: true, data: getMockTasks(params.user) };
    case 'getScores':
      if (!params.user) {
        return { success: true, data: MOCK_TEAM.map(m => ({ name: m.name, ...getMockStats(m.name) })) };
      }
      return { success: true, data: getMockStats(params.user) };
    case 'getBriefing':
      const tasks = getMockTasks(params.user);
      return { success: true, data: { briefing: getMockBriefing(params.user, tasks) } };
    case 'completeTask':
      return { success: true, data: { taskId: params.taskId, status: 'done', completedDate: new Date().toISOString() } };
    case 'addTask':
      return { success: true, data: { taskId: 'T' + Date.now() } };
    case 'deleteTask':
      return { success: true, data: { taskId: params.taskId } };
    case 'addMember':
      return { success: true, data: { name: params.name } };
    case 'removeMember':
      return { success: true, data: { name: params.name } };
    default:
      return { success: false, error: 'Unknown action' };
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function $(id) { return document.getElementById(id); }

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function showToast(message, type = 'success') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function showError(message) {
  state.error = message;
  $('error-text').textContent = message;
  $('error-banner').style.display = 'flex';
}

function hideError() {
  state.error = null;
  $('error-banner').style.display = 'none';
}

// =============================================
// RENDERING
// =============================================
function renderUserPicker(members) {
  const grid = $('user-picker-grid');
  grid.innerHTML = members
    .filter(m => m.active)
    .map(m => `
      <button class="user-picker-btn" data-user="${m.name}" id="picker-${m.name}">
        <span class="member-remove-btn" data-remove="${m.name}" title="Remove ${m.name}">✕</span>
        <div class="avatar">${getInitials(m.name)}</div>
        ${m.name}
      </button>
    `).join('');

  // Bind name clicks (select user)
  grid.querySelectorAll('.user-picker-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.member-remove-btn')) return;
      const user = btn.dataset.user;
      localStorage.setItem('svm_user', user);
      $('user-picker').style.display = 'none';
      initForUser(user);
    });
  });

  // Bind remove clicks
  grid.querySelectorAll('.member-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showDeleteMemberModal(btn.dataset.remove);
    });
  });

  if (isRemoveMode) {
    grid.classList.add('remove-mode-active');
  } else {
    grid.classList.remove('remove-mode-active');
  }

  $('user-picker').style.display = 'flex';
}

// =============================================
// MEMBER MANAGEMENT
// =============================================
let isRemoveMode = false;

function toggleRemoveMode() {
  isRemoveMode = !isRemoveMode;
  const grid = $('user-picker-grid');
  const btn = $('btn-toggle-remove-mode');

  if (isRemoveMode) {
    grid.classList.add('remove-mode-active');
    btn.textContent = 'Done Removing';
    btn.style.borderColor = 'var(--accent-red)';
    btn.style.background = 'rgba(239, 68, 68, 0.1)';
  } else {
    grid.classList.remove('remove-mode-active');
    btn.textContent = '− Remove Member';
    btn.style.borderColor = '';
    btn.style.background = '';
  }
}
function showAddMemberForm() {
  $('member-actions').style.display = 'none';
  $('add-member-form').style.display = 'flex';
  $('new-member-name').value = '';
  setTimeout(() => $('new-member-name').focus(), 100);
}

function hideAddMemberForm() {
  $('add-member-form').style.display = 'none';
  $('member-actions').style.display = 'block';
}

async function handleAddMember() {
  const name = $('new-member-name').value.trim();
  if (!name) return;

  // Check if name already exists
  if (state.teamMembers.some(m => m.name.toLowerCase() === name.toLowerCase())) {
    showToast('Name already exists', 'error');
    return;
  }

  const newMember = { name, role: 'Member', active: true };
  state.teamMembers.push(newMember);
  renderUserPicker(state.teamMembers);
  hideAddMemberForm();
  showToast(name + ' added.');

  // Sync to backend
  try {
    await apiFetch('addMember', { name, role: 'Member' }, 'POST');
  } catch (err) {
    console.error('Failed to sync member:', err);
  }
}

let pendingDeleteMemberName = null;

function showDeleteMemberModal(name) {
  pendingDeleteMemberName = name;
  $('delete-member-target-name').textContent = name;
  $('delete-member-confirm-input').value = '';
  $('delete-member-confirm-btn').disabled = true;
  $('delete-member-modal').style.display = 'flex';
  setTimeout(() => $('delete-member-confirm-input').focus(), 100);
}

function hideDeleteMemberModal() {
  pendingDeleteMemberName = null;
  $('delete-member-modal').style.display = 'none';
}

function handleMemberConfirmInput(e) {
  const input = e.target.value.trim();
  $('delete-member-confirm-btn').disabled = (input.toLowerCase() !== pendingDeleteMemberName?.toLowerCase());
}

async function confirmDeleteMember() {
  const name = pendingDeleteMemberName;
  if (!name) return;
  hideDeleteMemberModal();

  state.teamMembers = state.teamMembers.filter(m => m.name !== name);
  renderUserPicker(state.teamMembers);
  showToast(name + ' removed.');

  // Sync to backend
  try {
    await apiFetch('removeMember', { name }, 'POST');
  } catch (err) {
    console.error('Failed to sync removal:', err);
  }
}

function renderHeader(user) {
  $('greeting-text').textContent = `Good ${getTimeOfDay()}, ${user}`;
  $('user-avatar-btn').textContent = getInitials(user);
  $('app-header').style.display = 'flex';
  $('app-footer').style.display = 'block';
  $('fab-add').style.display = 'flex';
}

function renderBriefing(html) {
  const section = $('briefing-section');
  section.innerHTML = `
    <div class="briefing-card">
      <div class="briefing-header">
        <span class="briefing-label">AI Briefing</span>
      </div>
      <div class="briefing-text">${html}</div>
    </div>
  `;
  section.style.display = 'block';
}

function renderBriefingSkeleton() {
  const section = $('briefing-section');
  section.innerHTML = `
    <div class="briefing-card">
      <div class="briefing-header">
        <span class="briefing-label">AI Briefing</span>
      </div>
      <div class="briefing-skeleton">
        <div class="skeleton-line" style="width:95%"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    </div>
  `;
  section.style.display = 'block';
}

function renderTasks(tasks) {
  // Apply Search and Status Filters
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.taskName.toLowerCase().includes(state.filters.search.toLowerCase());
    const matchesStatus = state.filters.status === 'all' || t.status === state.filters.status;
    return matchesSearch && matchesStatus;
  });

  const recurring = filteredTasks.filter(t => t.taskType === 'daily' || t.taskType === 'weekly');
  const oneTime = filteredTasks.filter(t => t.taskType === 'one-time');

  $('controls-section').style.display = 'flex';
  renderTaskSection('recurring-section', '', 'Daily & Weekly', recurring);
  renderTaskSection('onetime-section', '', 'One-Time Tasks', oneTime);

  // Check if all done
  const allDone = tasks.length > 0 && tasks.every(t => t.status === 'done');
  if (allDone) {
    showAllDoneCelebration();
  }
}

function renderTaskSection(sectionId, icon, title, tasks) {
  const section = $(sectionId);
  if (tasks.length === 0) {
    section.style.display = 'none';
    return;
  }

  const pendingCount = tasks.filter(t => t.status !== 'done').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  section.innerHTML = `
    <div class="task-section">
      <div class="section-header">
        <div class="section-title">
          <span class="icon">${icon}</span>
          ${title}
        </div>
        <div class="section-count">${doneCount}/${tasks.length} done</div>
      </div>
      <div class="task-list">
        ${tasks.map(t => renderTaskCard(t)).join('')}
      </div>
    </div>
  `;
  section.style.display = 'block';

  // Bind click handlers for completing tasks
  section.querySelectorAll('.task-card:not(.done)').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't complete if clicking buttons
      if (e.target.closest('.task-delete-btn') || e.target.closest('.task-edit-btn')) return;
      handleTaskComplete(card.dataset.taskId);
    });
  });

  // Bind edit button handlers
  section.querySelectorAll('.task-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditTaskModal(btn.dataset.editId);
    });
  });

  // Bind delete button handlers
  section.querySelectorAll('.task-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.deleteId;
      const task = state.tasks.find(t => t.taskId === taskId);
      showDeleteConfirm(taskId, task ? task.taskName : 'this task');
    });
  });
}

function renderTaskCard(task) {
  const isDone = task.status === 'done';
  const isOverdue = task.status === 'overdue';
  const badgeClass = task.taskType === 'daily' ? 'badge-daily' : task.taskType === 'weekly' ? 'badge-weekly' : 'badge-one-time';
  const prioClass = `priority-${(task.priority || 'Medium').toLowerCase()}`;

  return `
    <div class="task-card ${isDone ? 'done' : ''} ${isOverdue ? 'overdue' : ''}" 
         data-task-id="${task.taskId}" 
         id="task-${task.taskId}">
      <div class="task-checkbox">
        <span class="check-icon">✓</span>
      </div>
      <div class="task-info">
        <div class="task-name">${task.taskName}</div>
        <div class="task-meta">
          <span class="task-badge ${badgeClass}">${task.taskType}</span>
          <span class="priority-badge ${prioClass}">${task.priority || 'Medium'}</span>
          ${isOverdue ? '<span class="task-badge badge-overdue">overdue</span>' : ''}
          ${isDone && task.completedDate ? `<span>Done at ${formatTime(task.completedDate)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-edit-btn" data-edit-id="${task.taskId}" title="Edit task" aria-label="Edit task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="task-delete-btn" data-delete-id="${task.taskId}" title="Delete task" aria-label="Delete task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </div>
  `;
}

function applyTheme() {
  if (state.theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', state.theme);
  applyTheme();
}

function renderStats(stats) {
  const section = $('stats-section');
  const completedToday = state.tasks.filter(t => t.status === 'done').length;
  const totalToday = state.tasks.length;
  const pct = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  section.innerHTML = `
    <div class="stats-card">
      <div class="stats-header">This Week</div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value purple">${stats.weekScore}</div>
          <div class="stat-label">Score</div>
        </div>
        <div class="stat-item">
          <div class="stat-value emerald">${stats.streak}</div>
          <div class="stat-label">Streak</div>
        </div>
        <div class="stat-item">
          <div class="stat-value amber">${completedToday}/${totalToday}</div>
          <div class="stat-label">Today</div>
        </div>
      </div>
      <div class="progress-section">
        <div class="progress-label">
          <span>Today's progress</span>
          <span>${pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
      </div>
    </div>
  `;
  section.style.display = 'block';

  // Animate progress bar after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fill = section.querySelector('.progress-fill');
      if (fill) fill.style.width = pct + '%';
    });
  });
}

async function openDashboard() {
  const modal = $('dashboard-modal');
  const grid = $('dashboard-grid');
  modal.style.display = 'flex';
  grid.innerHTML = '<div class="loading-spinner" style="margin: 2rem auto;"></div>';

  try {
    const res = await apiFetch('getScores');
    renderDashboard(res.data);
  } catch (err) {
    grid.innerHTML = `<div class="error-text">Failed to load analytics: ${err.message}</div>`;
  }
}

function renderDashboard(scores) {
  const grid = $('dashboard-grid');
  if (!scores || scores.length === 0) {
    grid.innerHTML = '<div class="empty-state">No analytics data available for this week.</div>';
    return;
  }

  // Sort by score descending
  const sorted = [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));

  grid.innerHTML = sorted.map((s, index) => {
    const rank = index + 1;
    const total = s.tasksAssigned || 0;
    const compPct = total > 0 ? (s.tasksCompleted || 0) / total * 100 : 0;
    const latePct = total > 0 ? (s.tasksLate || 0) / total * 100 : 0;
    const missPct = total > 0 ? (s.tasksMissed || 0) / total * 100 : 0;

    return `
      <div class="dashboard-card">
        <div class="dashboard-card-header">
          <div class="dashboard-rank rank-${rank}">${rank}</div>
          <div class="avatar avatar-sm">${getInitials(s.name)}</div>
          <div class="dashboard-card-name">${s.name}</div>
          <div class="dashboard-card-score">
            ${s.score || 0}
            <span class="trend-up" style="font-size: 0.7rem; color: var(--accent-emerald); margin-left: 4px;">↑</span>
          </div>
        </div>
        
        <div class="dashboard-chart-container">
          <div class="dashboard-chart-label">
            <span>Performance</span>
            <span>${Math.round(compPct)}%</span>
          </div>
          <div class="dashboard-bar-bg">
            <div class="dashboard-bar-fill completed" style="width: ${compPct}%"></div>
            <div class="dashboard-bar-fill late" style="width: ${latePct}%"></div>
            <div class="dashboard-bar-fill missed" style="width: ${missPct}%"></div>
          </div>
        </div>

        <div class="dashboard-stats-row">
          <span>Assigned Tasks</span>
          <span class="dashboard-stat-val">${s.tasksAssigned || 0}</span>
        </div>
        <div class="dashboard-stats-row">
          <span>Completed</span>
          <span class="dashboard-stat-val completed">${s.tasksCompleted || 0}</span>
        </div>
        <div class="dashboard-stats-row">
          <span>Late</span>
          <span class="dashboard-stat-val late">${s.tasksLate || 0}</span>
        </div>
        <div class="dashboard-stats-row">
          <span>Missed</span>
          <span class="dashboard-stat-val missed">${s.tasksMissed || 0}</span>
        </div>
      </div>
    `;
  }).join('');

  // Add Export Button to Modal Header if not already there
  const header = $('dashboard-modal').querySelector('.modal-header');
  if (!header.querySelector('.btn-export')) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-export';
    exportBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      Export CSV
    `;
    exportBtn.onclick = () => handleExportCSV(scores);
    header.insertBefore(exportBtn, $('dashboard-close-btn'));
  }
}

function handleExportCSV(scores) {
  if (!scores || scores.length === 0) return;
  
  const headers = ['Name', 'Score', 'Assigned', 'Completed', 'Late', 'Missed'];
  const rows = scores.map(s => [
    s.name,
    s.score || 0,
    s.tasksAssigned || 0,
    s.tasksCompleted || 0,
    s.tasksLate || 0,
    s.tasksMissed || 0
  ]);

  const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `svm_team_analytics_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Exported successfully!');
}

function closeDashboard() {
  $('dashboard-modal').style.display = 'none';
}

function formatTime(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// =============================================
// TASK COMPLETION
// =============================================
async function handleTaskComplete(taskId) {
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!card || card.classList.contains('done') || card.classList.contains('completing')) return;

  // Optimistic UI update
  card.classList.add('completing');
  const statusIcon = card.querySelector('.task-status-icon');
  if (statusIcon) statusIcon.textContent = '✓';
  const checkbox = card.querySelector('.task-checkbox');
  if (checkbox) checkbox.innerHTML = '<span class="check-icon" style="opacity:1;transform:scale(1)">✓</span>';

  // Update local state
  const task = state.tasks.find(t => t.taskId === taskId);
  if (task) {
    task.status = 'done';
    task.completedDate = new Date().toISOString();
  }

  // After animation, mark as done
  setTimeout(() => {
    card.classList.remove('completing');
    card.classList.add('done');
    card.querySelector('.task-name').style.textDecoration = 'line-through';
    card.querySelector('.task-name').style.color = 'var(--text-muted)';

    // Remove click listener by cloning
    const parent = card.parentNode;
    const clone = card.cloneNode(true);
    parent.replaceChild(clone, card);

    // Update section counts
    updateSectionCounts();
    // Update stats
    if (state.stats) renderStats(state.stats);
    // Update briefing
    renderBriefing(getMockBriefing(state.currentUser, state.tasks));
  }, 600);

  showToast('Task completed.');

  // Check if all done
  const allDone = state.tasks.every(t => t.status === 'done');
  if (allDone) {
    setTimeout(() => showAllDoneCelebration(), 800);
  }

  // Background API call
  try {
    await apiFetch('completeTask', { taskId, user: state.currentUser, completedDate: new Date().toISOString() }, 'POST');
  } catch (err) {
    console.error('Failed to sync completion:', err);
    showToast('Synced locally, will retry', 'error');
  }
}

function updateSectionCounts() {
  document.querySelectorAll('.task-section').forEach(section => {
    const cards = section.querySelectorAll('.task-card');
    const done = section.querySelectorAll('.task-card.done');
    const countEl = section.querySelector('.section-count');
    if (countEl) countEl.textContent = `${done.length}/${cards.length} done`;
  });
}

// =============================================
// CELEBRATIONS
// =============================================
function showAllDoneCelebration() {
  // Add celebration UI after the task sections
  const existing = document.querySelector('.all-done');
  if (existing) return;

  const div = document.createElement('div');
  div.className = 'all-done';
  div.innerHTML = `
    <h3>All tasks complete!</h3>
    <p>You're on fire today. Great work!</p>
  `;
  $('onetime-section').after(div);

  // Fire confetti
  launchConfetti();
}

function launchConfetti() {
  const canvas = $('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = [];
  const colors = ['#7c3aed', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#ec4899', '#f97316'];

  for (let i = 0; i < 100; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: Math.random() * 3 + 2,
      angle: Math.random() * 360,
      spin: (Math.random() - 0.5) * 8,
      opacity: 1,
    });
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    pieces.forEach(p => {
      p.y += p.speed;
      p.angle += p.spin;
      p.x += Math.sin(p.angle * Math.PI / 180) * 0.5;
      p.opacity -= 0.003;

      if (p.opacity > 0 && p.y < canvas.height + 50) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle * Math.PI / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    });

    frame++;
    if (alive && frame < 300) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  draw();
}

// =============================================
// INITIALIZATION
// =============================================
async function init() {
  applyTheme();
  // Check for saved user
  const savedUser = localStorage.getItem('svm_user');

  try {
    // Load team members
    const teamRes = await apiFetch('getTeam');
    state.teamMembers = teamRes.data;

    // Hide loading
    $('loading-screen').classList.add('hidden');

    if (savedUser && state.teamMembers.some(m => m.name === savedUser && m.active)) {
      initForUser(savedUser);
    } else {
      localStorage.removeItem('svm_user');
      renderUserPicker(state.teamMembers);
    }
  } catch (err) {
    $('loading-screen').classList.add('hidden');
    showError('Could not load team data. ' + (err.message || 'Check your connection.'));
  }
}

async function initForUser(user) {
  state.currentUser = user;
  hideError();
  renderHeader(user);

  // Show briefing skeleton
  renderBriefingSkeleton();

  try {
    // Fetch tasks and stats in parallel
    const [tasksRes, statsRes] = await Promise.all([
      apiFetch('getTasks', { user }),
      apiFetch('getScores', { user }),
    ]);

    state.tasks = tasksRes.data;
    state.stats = statsRes.data;

    // Render tasks
    if (state.tasks.length === 0) {
      renderEmptyState();
    } else {
      renderTasks(state.tasks);
    }

    // Render stats
    renderStats(state.stats);

    // Fetch briefing (can be slower)
    try {
      const briefRes = await apiFetch('getBriefing', { user });
      state.briefing = briefRes.data.briefing;
      renderBriefing(state.briefing);
    } catch {
      // Fall back to local briefing
      renderBriefing(getMockBriefing(user, state.tasks));
    }

  } catch (err) {
    showError('Could not load tasks. ' + (err.message || ''));
  }
}

function renderEmptyState() {
  const section = $('recurring-section');
  section.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">✓</div>
      <h3>No tasks for today!</h3>
      <p>Enjoy your free time or check back later.</p>
    </div>
  `;
  section.style.display = 'block';
}

// =============================================
// ADD TASK
// =============================================
function openAddTaskModal() {
  state.editingTaskId = null;
  $('task-modal-title').textContent = 'New Task';
  $('add-task-submit').textContent = 'Add Task';
  $('add-task-modal').style.display = 'flex';
  $('new-task-date').value = getTodayStr();
  $('new-task-name').value = '';
  $('new-task-notes').value = '';
  $('new-task-type').value = 'one-time';
  $('new-task-priority').value = 'Medium';
  setTimeout(() => $('new-task-name').focus(), 100);
}

function openEditTaskModal(taskId) {
  const task = state.tasks.find(t => t.taskId === taskId);
  if (!task) return;

  state.editingTaskId = taskId;
  $('task-modal-title').textContent = 'Edit Task';
  $('add-task-submit').textContent = 'Save Changes';
  $('add-task-modal').style.display = 'flex';

  $('new-task-name').value = task.taskName;
  $('new-task-type').value = task.taskType;
  $('new-task-date').value = task.plannedDate;
  $('new-task-notes').value = task.notes || '';
  $('new-task-priority').value = task.priority || 'Medium';
}

function closeAddTaskModal() {
  $('add-task-modal').style.display = 'none';
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  const name = $('new-task-name').value.trim();
  const type = $('new-task-type').value;
  const date = $('new-task-date').value || getTodayStr();
  const notes = $('new-task-notes').value.trim();
  const priority = $('new-task-priority').value;

  if (!name) return;

  const submitBtn = $('add-task-submit');
  const isEdit = !!state.editingTaskId;
  submitBtn.disabled = true;
  submitBtn.textContent = isEdit ? 'Saving...' : 'Adding...';

  try {
    const action = isEdit ? 'editTask' : 'addTask';
    const payload = {
      taskName: name,
      taskType: type,
      plannedDate: date,
      notes: notes,
      priority: priority,
      assignedTo: state.currentUser
    };
    if (isEdit) payload.taskId = state.editingTaskId;

    const res = await apiFetch(action, payload, 'POST');

    if (isEdit) {
      const idx = state.tasks.findIndex(t => t.taskId === state.editingTaskId);
      if (idx !== -1) {
        state.tasks[idx] = { ...state.tasks[idx], ...payload };
      }
      showToast('Task updated.');
    } else {
      const newTask = {
        taskId: res.data.taskId,
        ...payload,
        completedDate: '',
        status: 'pending'
      };
      state.tasks.push(newTask);
      showToast('Task added.');
    }

    renderTasks(state.tasks);
    if (state.stats) renderStats(state.stats);
    closeAddTaskModal();
  } catch (err) {
    console.error('Failed to submit task:', err);
    showToast('Failed to save task', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? 'Save Changes' : 'Add Task';
  }
}

// =============================================
// DELETE TASK
// =============================================
let pendingDeleteTaskId = null;

function showDeleteConfirm(taskId, taskName) {
  pendingDeleteTaskId = taskId;
  $('delete-task-name').textContent = `"${taskName}" will be permanently removed.`;
  $('delete-confirm-modal').style.display = 'flex';
}

function closeDeleteConfirm() {
  pendingDeleteTaskId = null;
  $('delete-confirm-modal').style.display = 'none';
}

async function handleDeleteTask() {
  if (!pendingDeleteTaskId) return;
  const taskId = pendingDeleteTaskId;
  closeDeleteConfirm();

  // Optimistic removal from UI
  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (card) {
    card.style.transition = 'all 0.3s ease';
    card.style.transform = 'translateX(100%)';
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 300);
  }

  // Remove from local state
  state.tasks = state.tasks.filter(t => t.taskId !== taskId);

  // Update counts and stats
  setTimeout(() => {
    updateSectionCounts();
    if (state.stats) renderStats(state.stats);
    renderBriefing(getMockBriefing(state.currentUser, state.tasks));

    // Re-render if sections are now empty
    const recurring = state.tasks.filter(t => t.taskType === 'daily' || t.taskType === 'weekly');
    const oneTime = state.tasks.filter(t => t.taskType === 'one-time');
    if (recurring.length === 0) $('recurring-section').style.display = 'none';
    if (oneTime.length === 0) $('onetime-section').style.display = 'none';
    if (state.tasks.length === 0) renderEmptyState();
  }, 350);

  showToast('Task deleted.');

  // Background API call
  try {
    await apiFetch('deleteTask', { taskId, user: state.currentUser }, 'POST');
  } catch (err) {
    console.error('Failed to sync deletion:', err);
    showToast('Deleted locally, sync failed', 'error');
  }
}

// =============================================
// EVENT LISTENERS
// =============================================
document.addEventListener('DOMContentLoaded', init);

$('refresh-btn')?.addEventListener('click', () => {
  if (state.currentUser) {
    showToast('Refreshing...');
    initForUser(state.currentUser);
  }
});

$('user-avatar-btn')?.addEventListener('click', () => {
  localStorage.removeItem('svm_user');
  location.reload();
});

$('retry-btn')?.addEventListener('click', () => {
  hideError();
  init();
});

// Add Task modal
$('fab-add')?.addEventListener('click', openAddTaskModal);
$('modal-close-btn')?.addEventListener('click', closeAddTaskModal);
$('add-task-form')?.addEventListener('submit', handleTaskSubmit);
$('add-task-modal')?.addEventListener('click', (e) => {
  if (e.target === $('add-task-modal')) closeAddTaskModal();
});

// Delete confirmation
$('delete-cancel-btn')?.addEventListener('click', closeDeleteConfirm);
$('delete-confirm-btn')?.addEventListener('click', handleDeleteTask);
$('delete-confirm-modal')?.addEventListener('click', (e) => {
  if (e.target === $('delete-confirm-modal')) closeDeleteConfirm();
});

// Member management
$('btn-show-add-member')?.addEventListener('click', showAddMemberForm);
$('btn-add-member')?.addEventListener('click', handleAddMember);
$('btn-cancel-add-member')?.addEventListener('click', hideAddMemberForm);
$('new-member-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); handleAddMember(); }
  if (e.key === 'Escape') hideAddMemberForm();
});

$('btn-toggle-remove-mode')?.addEventListener('click', toggleRemoveMode);
$('delete-member-confirm-input')?.addEventListener('input', handleMemberConfirmInput);
$('delete-member-cancel-btn')?.addEventListener('click', hideDeleteMemberModal);
$('delete-member-confirm-btn')?.addEventListener('click', confirmDeleteMember);
$('delete-member-modal')?.addEventListener('click', (e) => {
  if (e.target === $('delete-member-modal')) hideDeleteMemberModal();
});

// Dashboard
$('btn-show-dashboard')?.addEventListener('click', openDashboard);
$('dashboard-close-btn')?.addEventListener('click', closeDashboard);
$('dashboard-modal')?.addEventListener('click', (e) => {
  if (e.target === $('dashboard-modal')) closeDashboard();
});

// Theme Toggle
$('theme-toggle')?.addEventListener('click', toggleTheme);

// Search & Filter
$('task-search')?.addEventListener('input', (e) => {
  state.filters.search = e.target.value;
  renderTasks(state.tasks);
});

$('status-filter')?.addEventListener('change', (e) => {
  state.filters.status = e.target.value;
  renderTasks(state.tasks);
});

// Pull-to-refresh (simple)
let touchStartY = 0;
document.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', e => {
  const diff = e.changedTouches[0].clientY - touchStartY;
  if (diff > 150 && window.scrollY === 0 && state.currentUser) {
    showToast('Refreshing...');
    initForUser(state.currentUser);
  }
}, { passive: true });
