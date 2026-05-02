/* ============================================
   SVM Task Tracker — Application Logic
   ============================================ */

// =============================================
// CONFIGURATION
// =============================================
const CONFIG = {
  // 🔴 REPLACE THIS with your deployed Apps Script Web App URL
  API_URL: 'https://script.google.com/macros/s/AKfycbzr-0S9V508V2Sdr9b2rMYImmGdTZF_vhDVSg6SN8JWJQ9msbDHc2wWpvW9tJ66nb6A/exec',

  // Retry settings
  MAX_RETRIES: 2,
  RETRY_DELAY: 1000,

  // Anti-spam settings
  TASK_COOLDOWN_MS: 60000, // 1 minute between task completions

  // Demo mode — set to true to use mock data without a backend
  DEMO_MODE: false,
};

// (Supabase removed - Using GSheet Auth)

// =============================================
// STATE
// =============================================
const state = {
  currentUser: null,
  userRole: 'member', // 'admin' or 'member'
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
  // Logic replaced by auth-overlay
}

// =============================================
// AUTHENTICATION LOGIC
// =============================================
let isSignUp = false;

function toggleAuthMode() {
  isSignUp = !isSignUp;
  $('auth-title').textContent = isSignUp ? 'Create an Account' : 'Welcome to SVM';
  $('auth-subtitle').textContent = isSignUp ? 'Sign up to manage your tasks' : 'Sign in to manage your tasks';
  $('auth-submit').textContent = isSignUp ? 'Sign Up' : 'Sign In';
  $('auth-toggle-text').innerHTML = isSignUp
    ? `Already have an account? <button type="button" class="btn-link" id="auth-toggle-btn-inner">Sign In</button>`
    : `Don't have an account? <button type="button" class="btn-link" id="auth-toggle-btn-inner">Sign Up</button>`;
  const nameGroup = $('auth-name-group');
  if (nameGroup) nameGroup.style.display = isSignUp ? 'block' : 'none';
  const roleGroup = $('auth-role-group');
  if (roleGroup) roleGroup.style.display = isSignUp ? 'block' : 'none';
  const forgotGroup = $('auth-forgot-password-group');
  if (forgotGroup) forgotGroup.style.display = isSignUp ? 'none' : 'block';
  $('auth-error').style.display = 'none';

  $('auth-toggle-btn-inner')?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthMode();
  });
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = $('auth-email').value;
  const password = $('auth-password').value;
  const name = $('auth-name')?.value.trim();
  const btn = $('auth-submit');

  btn.disabled = true;
  btn.textContent = isSignUp ? 'Signing up...' : 'Signing in...';
  $('auth-error').style.display = 'none';

  try {
    if (isSignUp) {
      const role = $('auth-role').value;
      if (!name) throw new Error('Please enter your Full Name.');

      const res = await apiFetch('signup', { name, email, role, password }, 'POST');
      if (!res.success) throw new Error(res.error || 'Signup failed');

      showToast('Signed up successfully! Please wait for Admin approval.');
      toggleAuthMode(); // Switch back to sign in
    } else {
      const res = await apiFetch('login', { email, password }, 'POST');
      if (!res.success) throw new Error(res.error || 'Login failed');

      handleUserSignedIn(res.data);
      showToast('Signed in successfully.');
    }
  } catch (err) {
    $('auth-error').textContent = err.message || 'Authentication failed.';
    $('auth-error').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  }
}

function openResetPasswordModal() {
  $('reset-step-1').style.display = 'block';
  $('reset-step-2').style.display = 'none';
  $('reset-email').value = $('auth-email').value || '';
  $('reset-otp').value = '';
  $('reset-new-password').value = '';
  $('reset-error-1').style.display = 'none';
  $('reset-error-2').style.display = 'none';
  $('reset-password-modal').style.display = 'flex';
}

function closeResetPasswordModal() {
  $('reset-password-modal').style.display = 'none';
}

async function handleSendOTP() {
  const email = $('reset-email').value.trim();
  const btn = $('btn-send-otp');
  const errorEl = $('reset-error-1');

  if (!email) {
    errorEl.textContent = 'Please enter your email.';
    errorEl.style.display = 'block';
    return;
  }

  const originalText = btn.textContent;
  btn.textContent = 'Sending...';
  btn.disabled = true;
  errorEl.style.display = 'none';

  try {
    const res = await apiFetch('sendResetOTP', { email }, 'POST');
    if (!res.success) throw new Error(res.error);

    showToast(res.message, 'success');
    $('reset-step-1').style.display = 'none';
    $('reset-step-2').style.display = 'block';
  } catch (err) {
    errorEl.textContent = err.message || 'Failed to send code.';
    errorEl.style.display = 'block';
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function handleVerifyAndReset() {
  const email = $('reset-email').value.trim();
  const otp = $('reset-otp').value.trim();
  const newPassword = $('reset-new-password').value.trim();
  const btn = $('btn-verify-reset');
  const errorEl = $('reset-error-2');

  if (!otp || !newPassword) {
    errorEl.textContent = 'OTP and New Password are required.';
    errorEl.style.display = 'block';
    return;
  }

  const originalText = btn.textContent;
  btn.textContent = 'Updating...';
  btn.disabled = true;
  errorEl.style.display = 'none';

  try {
    const res = await apiFetch('verifyAndResetPassword', { email, otp, newPassword }, 'POST');
    if (!res.success) throw new Error(res.error);

    showToast(res.message, 'success');
    closeResetPasswordModal();
  } catch (err) {
    errorEl.textContent = err.message || 'Verification failed.';
    errorEl.style.display = 'block';
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function handleUserSignedOut() {
  state.currentUser = null;
  state.userRole = 'member';
  localStorage.removeItem('svm_session');

  $('auth-overlay').style.display = 'flex';
  $('app-header').style.display = 'none';
  $('app-footer').style.display = 'none';
  $('task-view-container').style.display = 'none';
  $('admin-dashboard-container').style.display = 'none';
}

function handleUserSignedIn(userData) {
  state.currentUser = userData.name;
  state.userRole = userData.role.toLowerCase();

  // Save session
  localStorage.setItem('svm_session', JSON.stringify(userData));

  $('auth-overlay').style.display = 'none';
  $('app-header').style.display = 'flex';
  $('header-add-task').style.display = 'flex';

  // Admin and Coordinator have access to the navigation tabs
  if (state.userRole === 'admin' || state.userRole === 'coordinator') {
    $('header-nav').style.display = 'flex';
    state.currentView = 'tasks';
    $('admin-dashboard-container').style.display = 'none';
    $('task-view-container').style.display = 'block';
    renderHeader(state.currentUser);
    initForUser(state.currentUser);
  } else {
    $('header-nav').style.display = 'none';
    $('admin-dashboard-container').style.display = 'none';
    $('task-view-container').style.display = 'block';
    renderHeader(state.currentUser);
    initForUser(state.currentUser);
  }

  checkBroadcast();
  $('loading-screen').classList.add('hidden');
}

function renderHeader(user, showFab = true) {
  $('greeting-text').textContent = `Good ${getTimeOfDay()}, ${user}`;
  $('app-header').style.display = 'flex';
  $('app-footer').style.display = 'block';
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

  // Bind shift button handlers
  section.querySelectorAll('.task-shift-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openShiftTaskModal(btn.dataset.shiftId);
    });
  });

  // Bind comment button handlers
  section.querySelectorAll('.task-comment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCommentsModal(btn.dataset.commentId);
    });
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  if (isToday) return 'Today';
  if (isTomorrow) return 'Tomorrow';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderTaskCard(task) {
  const isDone = task.status === 'done';
  const isOverdue = task.status === 'overdue' && task.taskType !== 'daily';
  const badgeClass = task.taskType === 'daily' ? 'badge-daily' : task.taskType === 'weekly' ? 'badge-weekly' : 'badge-one-time';
  const prioClass = `priority-${(task.priority || 'Medium').toLowerCase()}`;

  // Clean priority if it looks like a date (bug fix)
  let displayPriority = task.priority || 'Medium';
  if (displayPriority.includes('-') || displayPriority.includes(':')) displayPriority = 'Medium';

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
          <span class="priority-badge ${prioClass}">${displayPriority}</span>
          ${task.plannedDate ? `<span class="task-date-text" style="color:var(--text-dim); font-size:0.75rem;">• ${formatDate(task.plannedDate)}</span>` : ''}
          ${isOverdue ? '<span class="task-badge badge-overdue">overdue</span>' : ''}
          ${isDone && task.completedDate ? `<span>Done at ${formatTime(task.completedDate)}</span>` : ''}
          ${task.comments && task.comments.length > 0 ? `
            <span class="comment-indicator" title="${task.comments.length} comments">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-13.5 8.38 8.38 0 0 1 3.8.9L21 3z"></path></svg>
              ${task.comments.length}
            </span>
          ` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-comment-btn" data-comment-id="${task.taskId}" title="Comments" aria-label="Task comments">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-13.5 8.38 8.38 0 0 1 3.8.9L21 3z"></path></svg>
        </button>
        ${!isDone ? `<button class="task-shift-btn" data-shift-id="${task.taskId}" title="Shift task" aria-label="Shift task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>` : ''}
        ${(state.userRole === 'admin' || state.userRole === 'coordinator') ? `
        <button class="task-edit-btn" data-edit-id="${task.taskId}" title="Edit task" aria-label="Edit task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="task-delete-btn" data-delete-id="${task.taskId}" title="Delete task" aria-label="Delete task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
        ` : ''}
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
      <div style="margin-top: 15px; display: flex; justify-content: center;">
        <button class="btn-secondary btn-sm" id="open-leave-modal-btn" style="width: auto; padding: 4px 12px; font-size: 0.75rem;">Request Leave</button>
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
  state.currentView = 'dashboard';
  const container = $('admin-dashboard-container');
  const content = $('dashboard-content');

  if (container) container.style.display = 'block';
  if (content) content.innerHTML = '<div class="loading-spinner" style="margin: 3rem auto;"></div>';

  try {
    const [scoresRes, teamRes, leavesRes, perfRes] = await Promise.all([
      apiFetch('getScores').catch(() => ({ success: true, data: [] })),
      apiFetch('getTeam').catch(() => ({ success: true, data: [] })),
      apiFetch('getLeaves').catch(() => ({ success: true, data: [] })),
      apiFetch('getTeamPerformance').catch(() => ({ success: true, data: [] }))
    ]);

    const scoresMap = new Map();
    if (scoresRes && scoresRes.data) {
      scoresRes.data.forEach(s => scoresMap.set(s.name, s));
    }

    const mergedScores = [];
    const pendingMembers = [];
    if (teamRes && teamRes.data) {
      teamRes.data.forEach(member => {
        const isActive = member.active === true || String(member.active).toUpperCase().trim() === 'TRUE';
        if (!isActive) {
          pendingMembers.push(member);
        } else {
          const stats = scoresMap.get(member.name) || {
            score: 0,
            tasksAssigned: 0,
            tasksCompleted: 0,
            tasksLate: 0,
            tasksMissed: 0
          };
          mergedScores.push({ ...member, ...stats });
        }
      });
    }

    renderDashboard(mergedScores, pendingMembers, leavesRes.data || [], perfRes.data || []);
  } catch (err) {
    console.error('Dashboard error:', err);
    if (content) content.innerHTML = '<div class="empty-state">Failed to load dashboard data. Please try again.</div>';
  }
}

function renderDashboard(scores, pendingMembers = [], leaves = [], perfData = []) {
  const container = $('dashboard-content');
  if (!container) return;
  container.innerHTML = '';

  // 0. Admin Actions Bar
  if (state.userRole === 'admin') {
    const adminActions = document.createElement('div');
    adminActions.className = 'admin-actions-bar';
    adminActions.style = 'display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;';
    adminActions.innerHTML = `
      <button class="btn-primary" id="btn-generate-recurring">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
        Generate Recurring Tasks
      </button>
      <button class="btn-secondary" id="btn-reset-passwords">Reset All Passwords</button>
    `;
    container.appendChild(adminActions);
    $('btn-generate-recurring')?.addEventListener('click', handleManualGenerateTasks);
    $('btn-reset-passwords')?.addEventListener('click', handleResetAllPasswords);
  }

  // 1. Pending Approvals & Leaves (Admin only)
  if (state.userRole === 'admin') {
    const pendingSec = document.createElement('div');
    pendingSec.className = 'dashboard-section';

    let html = '';
    if (pendingMembers.length > 0) {
      html += `<h3 style="margin-bottom:15px; font-size:1rem; color:var(--accent-amber);">Pending Approvals (${pendingMembers.length})</h3>
               <div class="pending-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:15px; margin-bottom:20px;">
                 ${pendingMembers.map(m => `<div class="kpi-card" style="display:flex; justify-content:space-between; align-items:center; padding:15px;">
                   <div><div style="font-weight:600;">${m.name}</div><div style="font-size:0.75rem; color:var(--text-muted);">${m.email}</div></div>
                   <div style="display:flex; gap:8px;"><button class="btn-success btn-sm approve-member-btn" data-email="${m.email}">Approve</button></div>
                 </div>`).join('')}
               </div>`;
    }

    const pendingLeaves = leaves.filter(l => l.status === 'pending');
    if (pendingLeaves.length > 0) {
      html += `<h3 style="margin-bottom:15px; font-size:1rem; color:var(--accent-indigo);">Leave Requests (${pendingLeaves.length})</h3>
               <div class="pending-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:15px;">
                 ${pendingLeaves.map(l => `<div class="kpi-card" style="padding:15px;">
                   <div style="display:flex; justify-content:space-between;"><strong>${l.user}</strong><span style="font-size:0.75rem;">${l.startDate}</span></div>
                   <div style="font-size:0.85rem; color:var(--text-muted); margin:8px 0;">${l.reason}</div>
                   <div style="display:flex; gap:8px;"><button class="btn-success btn-sm approve-leave-btn" data-user="${l.user}" data-created="${l.createdAt}">Approve</button></div>
                 </div>`).join('')}
               </div>`;
    }

    if (html) {
      pendingSec.innerHTML = html;
      container.appendChild(pendingSec);
    }
  }

  // 2. KPIs & Performance
  if (!scores || scores.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No performance data available yet.';
    container.appendChild(empty);
  } else {
    // KPI Row
    const totalAssigned = scores.reduce((sum, s) => sum + (s.tasksAssigned || 0), 0);
    const totalComp = scores.reduce((sum, s) => sum + (s.tasksCompleted || 0), 0);
    const rate = totalAssigned > 0 ? Math.round((totalComp / totalAssigned) * 100) : 0;

    const kpiRow = document.createElement('div');
    kpiRow.className = 'kpi-grid';
    kpiRow.innerHTML = `
      <div class="kpi-card"><div class="kpi-value purple">${scores.length}</div><div class="kpi-label">Team Members</div></div>
      <div class="kpi-card"><div class="kpi-value emerald">${rate}%</div><div class="kpi-label">Overall Completion</div></div>
      <div class="kpi-card"><div class="kpi-value amber">${totalAssigned - totalComp}</div><div class="kpi-label">Outstanding Tasks</div></div>
    `;
    container.appendChild(kpiRow);

    // Leaderboard
    const grid = document.createElement('div');
    grid.className = 'dashboard-grid';
    grid.style.marginTop = '20px';
    const sorted = [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));
    grid.innerHTML = sorted.map((s, idx) => createDashboardCardHTML(s, idx + 1)).join('');
    container.appendChild(grid);
  }

  // 3. Trends (Admin only)
  if (state.userRole === 'admin' && perfData.length > 0) {
    const trendSec = document.createElement('div');
    trendSec.className = 'dashboard-section';
    trendSec.style.marginTop = '30px';
    trendSec.innerHTML = '<h3>Team Progress Trends</h3><div id="perf-chart" class="trend-chart"></div>';
    container.appendChild(trendSec);
    setTimeout(() => initChart(perfData), 100);
  }

  bindApprovalEvents();
  bindLeaveApprovalEvents();

  // Animation trigger
  setTimeout(() => {
    document.querySelectorAll('.circular-fill').forEach(ring => {
      const target = ring.getAttribute('data-percentage');
      if (target) ring.style.strokeDasharray = `${target}, 100`;
    });
  }, 50);
}

function createDashboardCardHTML(s, rank) {
  const total = s.tasksAssigned || 0;
  const comp = s.tasksCompleted || 0;
  const late = s.tasksLate || 0;
  const miss = s.tasksMissed || 0;
  const compPct = total > 0 ? (comp / total * 100) : 0;
  const rankClass = rank <= 3 ? `rank-${rank}-card` : '';

  return `
    <div class="dashboard-card ${rankClass}" style="animation-delay: ${0.1 * Math.min(rank, 10)}s">
      <div class="dashboard-card-header">
        <div class="dashboard-rank rank-${rank}">${rank}</div>
        <div class="avatar avatar-sm">${getInitials(s.name)}</div>
        <div class="dashboard-card-name" onclick="openAddTaskForMember('${s.name}')" style="cursor:pointer; text-decoration:underline; text-decoration-style:dotted; flex:1;">${s.name}</div>
        <div class="dashboard-card-score">
          ${s.score || 0}
          <span class="trend-up" style="font-size: 0.7rem; color: var(--accent-emerald); margin-left: 4px;">↑</span>
        </div>
      </div>
      
      <div class="circular-chart-container">
        <svg viewBox="0 0 36 36" class="circular-chart">
          <path class="circular-bg"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path class="circular-fill"
            data-percentage="${compPct}"
            stroke-dasharray="0, 100"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <text x="18" y="20.35" class="circular-text">${Math.round(compPct)}%</text>
        </svg>
        <div class="chart-stats-info">
          <div class="dashboard-stats-row">
            <span>Completed</span>
            <span class="dashboard-stat-val completed">${comp}</span>
          </div>
          <div class="dashboard-stats-row">
            <span>Late</span>
            <span class="dashboard-stat-val late">${late}</span>
          </div>
          <div class="dashboard-stats-row">
            <span>Missed</span>
            <span class="dashboard-stat-val missed">${miss}</span>
          </div>
        </div>
      </div>
      <div class="dashboard-stats-row" style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
        <span>Total Assigned</span>
        <span class="dashboard-stat-val">${total}</span>
      </div>
    </div>
  `;
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
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const mStr = String(minutes).padStart(2, '0');
    const timePart = `${h12}:${mStr} ${ampm}`;

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return timePart;
    } else {
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      return `${day} ${month}, ${timePart}`;
    }
  } catch (err) {
    return dateStr;
  }
}

// =============================================
// TASK COMPLETION
// =============================================
let lastTaskCompleteTime = 0;

async function handleTaskComplete(taskId) {
  const now = Date.now();
  if (now - lastTaskCompleteTime < CONFIG.TASK_COOLDOWN_MS) {
    showToast('Please wait a moment before marking another task as done.', 'error');
    return;
  }

  const card = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!card || card.classList.contains('done') || card.classList.contains('completing')) return;

  lastTaskCompleteTime = now;

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

  try {
    const teamRes = await apiFetch('getTeam');
    state.teamMembers = teamRes.data;
  } catch (err) {
    console.error('Could not load team data:', err);
  }

  $('loading-screen').classList.add('hidden');

  // Check for local session
  const savedSession = localStorage.getItem('svm_session');
  if (savedSession) {
    try {
      const userData = JSON.parse(savedSession);
      handleUserSignedIn(userData);
    } catch (e) {
      handleUserSignedOut();
    }
  } else {
    handleUserSignedOut();
  }
}

async function initForUser(user) {
  state.currentUser = user;
  hideError();
  // renderHeader is already called in handleUserSignedIn

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
function openAddTaskModal(defaultAssignee = null) {
  const modal = $('add-task-modal');
  if (!modal) return;
  $('add-task-form').reset();
  $('task-modal-title').textContent = defaultAssignee ? `Assign to ${defaultAssignee}` : 'New Task';

  // Set default date to today
  $('new-task-date').value = getTodayStr();
  $('planned-date-group').style.display = 'none'; // Default is Daily

  // Handle type change
  $('new-task-type').onchange = (e) => {
    const type = e.target.value;
    // Show date only for one-time tasks
    $('planned-date-group').style.display = (type === 'one-time') ? 'block' : 'none';
  };

  if (state.userRole === 'admin' || state.userRole === 'coordinator') {
    $('admin-assign-group').style.display = 'block';
    loadAssigneeList(defaultAssignee);
  } else {
    $('admin-assign-group').style.display = 'none';
  }

  modal.style.display = 'flex';
}

function openAddTaskForMember(name) {
  openAddTaskModal(name);
}

async function handleAddTaskSubmit(e) {
  e.preventDefault();
  const name = $('new-task-name').value.trim();
  const assignedTo = (state.userRole === 'admin' || state.userRole === 'coordinator')
    ? $('new-task-assigned-to').value
    : state.currentUser;
  const type = $('new-task-type').value;
  const date = (type === 'one-time') ? $('new-task-date').value : getTodayStr();

  if (!name || !assignedTo) {
    showToast('Please fill all required fields', 'error');
    return;
  }

  const btn = $('add-task-submit-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const res = await apiFetch('addTask', {
      taskName: name,
      assignedTo,
      taskType: type,
      plannedDate: date
    }, 'POST');

    if (!res.success) throw new Error(res.error);

    showToast('Task added successfully!');
    closeAddTaskModal();
    initForUser(state.currentUser);
  } catch (err) {
    showToast(err.message || 'Failed to add task', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function loadAssigneeList(defaultAssignee = null) {
  const select = $('new-task-assigned-to');
  if (!select) return;
  
  const populate = (members) => {
    select.innerHTML = members.map(m => `<option value="${m.name}" ${m.name === defaultAssignee ? 'selected' : ''}>${m.name}</option>`).join('');
    if (defaultAssignee) select.value = defaultAssignee;
  };

  if (state.teamMembers && state.teamMembers.length > 0) {
    populate(state.teamMembers);
  } else {
    apiFetch('getTeam').then(res => {
      if (res.success && res.data) {
        state.teamMembers = res.data;
        populate(res.data);
      }
    });
  }
}

// Voice Recognition
function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Voice recognition not supported in this browser', 'error');
    return;
  }

  const recognition = new SpeechRecognition();
  const btn = $('voice-btn');
  const input = $('new-task-name');

  recognition.lang = 'en-US';
  recognition.interimResults = false;

  recognition.onstart = () => {
    btn.classList.add('listening');
    showToast('Listening...', 'info');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    btn.classList.remove('listening');
  };

  recognition.onerror = (event) => {
    btn.classList.remove('listening');
    showToast('Voice recognition error: ' + event.error, 'error');
  };

  recognition.onend = () => {
    btn.classList.remove('listening');
  };

  recognition.start();
};

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
    const assignedToUser = ((state.userRole === 'admin' || state.userRole === 'coordinator') && !isEdit)
      ? $('new-task-assigned-to').value
      : state.currentUser;

    const payload = {
      taskName: name,
      taskType: type,
      plannedDate: date,
      notes: notes,
      priority: priority,
      assignedTo: assignedToUser
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

async function handleManualGenerateTasks() {
  const btn = $('btn-generate-recurring');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Generating...';

  try {
    const res = await apiFetch('generateRecurringTasks', {}, 'POST');
    if (!res.success) throw new Error(res.error);
    showToast(res.message || 'Recurring tasks generated for today!');
    openDashboard(); // Refresh
  } catch (err) {
    showToast(err.message || 'Failed to generate tasks.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function handleResetAllPasswords() {
  if (!confirm('Are you sure you want to reset ALL user passwords to Admin@12345 / Member@12345? This cannot be undone.')) return;

  const btn = $('btn-reset-passwords');
  const originalText = btn.textContent;
  btn.textContent = 'Resetting...';
  btn.disabled = true;

  try {
    const res = await apiFetch('resetAllPasswords', {}, 'POST');
    if (!res.success) throw new Error(res.error);
    showToast('All passwords have been reset to defaults.');
  } catch (err) {
    showToast(err.message || 'Failed to reset passwords.', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
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
// SHIFT TASK
// =============================================
let pendingShiftTaskId = null;

async function openShiftTaskModal(taskId) {
  pendingShiftTaskId = taskId;

  const assigneeSelect = $('shift-task-assignee');
  assigneeSelect.innerHTML = '';

  // Find current task to exclude current owner
  const task = state.tasks.find(t => t.taskId === taskId);
  const currentOwner = task ? task.assignedTo : '';

  state.teamMembers.forEach(m => {
    if (m.name !== currentOwner && (m.active === true || m.active === 'TRUE')) {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      assigneeSelect.appendChild(opt);
    }
  });

  if (assigneeSelect.options.length === 0) {
    showToast('No other active members available for transfer', 'error');
    return;
  }

  $('shift-task-modal').style.display = 'flex';
}

function closeShiftTaskModal() {
  pendingShiftTaskId = null;
  $('shift-task-modal').style.display = 'none';
}



// =============================================
// TASK COMMENTS
// =============================================
let activeCommentTaskId = null;

function openCommentsModal(taskId) {
  const task = state.tasks.find(t => t.taskId === taskId);
  if (!task) return;

  activeCommentTaskId = taskId;
  $('comments-task-name').textContent = `Comments: ${task.taskName}`;
  $('comments-modal').style.display = 'flex';
  renderComments(task.comments || []);
  $('new-comment-text').value = '';
  setTimeout(() => $('new-comment-text').focus(), 100);
}

function closeCommentsModal() {
  $('comments-modal').style.display = 'none';
  activeCommentTaskId = null;
}

function renderComments(comments) {
  const list = $('comments-list');
  if (comments.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">No comments yet. Start the conversation!</div>';
    return;
  }

  list.innerHTML = comments.map(c => `
    <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-weight: 700; font-size: 0.75rem; color: var(--accent-purple);">${c.user}</span>
        <span style="font-size: 0.65rem; color: var(--text-muted);">${formatTime(c.timestamp)}</span>
      </div>
      <div style="font-size: 0.85rem; line-height: 1.4;">${c.text}</div>
    </div>
  `).join('');

  // Scroll to bottom
  list.scrollTop = list.scrollHeight;
}

async function handleCommentSubmit() {
  const text = $('new-comment-text').value.trim();
  if (!text || !activeCommentTaskId) return;

  const btn = $('comment-submit-btn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    await apiFetch('addTaskComment', {
      taskId: activeCommentTaskId,
      user: state.currentUser,
      text: text
    }, 'POST');

    // Update local state
    const task = state.tasks.find(t => t.taskId === activeCommentTaskId);
    if (task) {
      if (!task.comments) task.comments = [];
      task.comments.push({
        user: state.currentUser,
        text: text,
        timestamp: new Date().toISOString()
      });
      renderComments(task.comments);

      // Update the card visually (the bubble count)
      const card = document.querySelector(`[data-task-id="${activeCommentTaskId}"]`);
      if (card) {
        // Just re-render the whole list for simplicity or find the indicator
        renderTasks(state.tasks);
      }
    }

    $('new-comment-text').value = '';
    $('new-comment-text').focus();
  } catch (err) {
    showToast('Failed to post comment', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
}

// Event Listeners for Comments
$('comments-close-btn')?.addEventListener('click', closeCommentsModal);
$('comment-submit-btn')?.addEventListener('click', handleCommentSubmit);
$('new-comment-text')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleCommentSubmit();
});

async function handleShiftTaskSubmit() {
  if (!pendingShiftTaskId) return;
  const assigneeSelect = $('shift-task-assignee');
  const newAssignee = assigneeSelect.value;
  if (!newAssignee) return;

  const taskId = pendingShiftTaskId;
  const btn = $('shift-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Transferring...';

  try {
    await apiFetch('shiftTask', {
      taskId: taskId,
      fromUser: state.currentUser,
      newAssignee: newAssignee
    }, 'POST');

    // Update local task state (remove from current view as it's no longer yours)
    const taskIdx = state.tasks.findIndex(t => t.taskId === taskId);
    if (taskIdx !== -1) {
      state.tasks.splice(taskIdx, 1);
      const card = document.querySelector(`[data-task-id="${taskId}"]`);
      if (card) {
        card.style.transition = 'all 0.3s ease';
        card.style.transform = 'translateX(100%)';
        card.style.opacity = '0';
        setTimeout(() => card.remove(), 300);
      }
    }

    setTimeout(() => {
      updateSectionCounts();
      if (state.tasks.length === 0) renderEmptyState();
    }, 350);

    showToast(`Task transferred to ${newAssignee}. 5 point penalty applied.`, 'warning');
    closeShiftTaskModal();
  } catch (err) {
    showToast('Failed to transfer task.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Transfer';
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

$('logout-btn')?.addEventListener('click', () => {
  const confirmed = confirm('Are you sure you want to sign out?');
  if (!confirmed) return;

  localStorage.removeItem('svm_session');
  showToast('Signed out successfully');
  setTimeout(() => location.reload(), 500); // Small delay for toast
});

$('retry-btn')?.addEventListener('click', () => {
  hideError();
  init();
});

// Header navigation tabs
$('tab-my-tasks')?.addEventListener('click', () => switchView('tasks'));
$('tab-team')?.addEventListener('click', () => switchView('team'));
$('header-add-task')?.addEventListener('click', () => openAddTaskModal());

async function switchView(view) {
  if (state.currentView === view && view === 'team') return; // Already there
  state.currentView = view;

  // 1. Update Tab Highlighting immediately
  const myTasksTab = $('tab-my-tasks');
  const teamTab = $('tab-team');

  if (view === 'tasks') {
    myTasksTab?.classList.add('active');
    teamTab?.classList.remove('active');
    $('task-view-container').style.display = 'block';
    $('admin-dashboard-container').style.display = 'none';
    await initForUser(state.currentUser);
  } else {
    myTasksTab?.classList.remove('active');
    teamTab?.classList.add('active');
    $('task-view-container').style.display = 'none';
    $('admin-dashboard-container').style.display = 'block';
    await openDashboard();
  }
}

// Add Task modal
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

// Shift Task confirmation
$('shift-cancel-btn')?.addEventListener('click', closeShiftTaskModal);
$('shift-cancel-btn-top')?.addEventListener('click', closeShiftTaskModal);
$('shift-confirm-btn')?.addEventListener('click', handleShiftTaskSubmit);
$('shift-task-modal')?.addEventListener('click', (e) => {
  if (e.target === $('shift-task-modal')) closeShiftTaskModal();
});

// Authentication
$('auth-toggle-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  toggleAuthMode();
});
$('auth-form')?.addEventListener('submit', handleAuthSubmit);
$('auth-reset-btn')?.addEventListener('click', openResetPasswordModal);
$('reset-close-btn')?.addEventListener('click', closeResetPasswordModal);

// OTP Reset Listeners
$('btn-send-otp')?.addEventListener('click', handleSendOTP);
$('btn-verify-reset')?.addEventListener('click', handleVerifyAndReset);
$('btn-back-to-step1')?.addEventListener('click', () => {
  $('reset-step-1').style.display = 'block';
  $('reset-step-2').style.display = 'none';
});

$('reset-password-modal')?.addEventListener('click', (e) => {
  if (e.target === $('reset-password-modal')) closeResetPasswordModal();
});

// Dashboard
$('btn-export-dashboard')?.addEventListener('click', () => {
  const tableData = state.teamMembers.map(m => {
    const stats = currentDashboardScores.find(s => s.name === m.name) || {};
    return { ...m, ...stats };
  });
  handleExportCSV(tableData);
});

$('btn-reset-passwords')?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to reset ALL member passwords to Member@12345? (Admin will be Admin@12345)')) return;

  try {
    const res = await apiFetch('resetAllPasswords', { fromUser: state.currentUser }, 'POST');
    if (res.success) {
      showToast('All passwords have been reset successfully!', 'success');
    } else {
      throw new Error(res.error);
    }
  } catch (err) {
    showToast('Failed to reset passwords: ' + err.message, 'error');
  }
});

// Bulk Import
$('btn-import-tasks')?.addEventListener('click', () => $('bulk-upload-file').click());
$('bulk-upload-file')?.addEventListener('change', handleBulkUpload);

async function handleBulkUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (json.length === 0) {
        showToast('File is empty', 'error');
        return;
      }

      // Map headers dynamically
      const tasksToUpload = [];
      for (const row of json) {
        const getVal = (keyFragments) => {
          for (const key of Object.keys(row)) {
            const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
            for (const frag of keyFragments) {
              if (lowerKey.includes(frag)) return String(row[key]).trim();
            }
          }
          return '';
        };

        const taskName = getVal(['taskname', 'task', 'name', 'title']);
        const assignedTo = getVal(['assigned', 'to', 'member', 'person']);
        if (!taskName || !assignedTo) continue;

        const typeRaw = getVal(['type', 'frequency']);
        let taskType = 'one-time';
        if (typeRaw.toLowerCase().includes('daily')) taskType = 'daily';
        if (typeRaw.toLowerCase().includes('weekly')) taskType = 'weekly';

        const rawDate = getVal(['date', 'due', 'planned']);
        let plannedDate = getTodayStr();
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.valueOf())) {
            plannedDate = d.toISOString().split('T')[0];
          }
        }

        const priorityRaw = getVal(['priority', 'importance']);
        let priority = 'Medium';
        if (priorityRaw.toLowerCase().includes('high')) priority = 'High';
        if (priorityRaw.toLowerCase().includes('low')) priority = 'Low';

        const notes = getVal(['note', 'description', 'detail']);

        tasksToUpload.push({
          taskName,
          taskType,
          plannedDate,
          notes,
          priority,
          assignedTo
        });
      }

      if (tasksToUpload.length === 0) {
        showToast('No valid tasks found. Need "Task Name" and "Assigned To" columns.', 'error');
        return;
      }

      $('bulk-import-overlay').style.display = 'flex';
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < tasksToUpload.length; i++) {
        $('bulk-import-status').textContent = `Processing ${i + 1} / ${tasksToUpload.length} tasks...`;
        try {
          await apiFetch('addTask', tasksToUpload[i], 'POST');
          successCount++;
        } catch (err) {
          console.error('Row failed:', err);
          failCount++;
        }
      }

      $('bulk-import-overlay').style.display = 'none';
      showToast(`Import complete! ${successCount} added.`);

      openDashboard();

    } catch (err) {
      console.error(err);
      showToast('Error parsing file', 'error');
      $('bulk-import-overlay').style.display = 'none';
    } finally {
      $('bulk-upload-file').value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

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

// Approval Logic
function bindApprovalEvents() {
  document.querySelectorAll('.approve-member-btn').forEach(btn => {
    btn.onclick = async () => {
      const email = btn.dataset.email;
      btn.disabled = true;
      btn.textContent = '...';
      await handleReviewMember(email, 'approve');
    };
  });
  document.querySelectorAll('.reject-member-btn').forEach(btn => {
    btn.onclick = async () => {
      if (confirm(`Are you sure you want to reject and delete ${btn.dataset.email}?`)) {
        btn.disabled = true;
        btn.textContent = '...';
        await handleReviewMember(btn.dataset.email, 'reject');
      }
    };
  });
}

async function handleReviewMember(email, action) {
  try {
    await apiFetch('approveMember', { email, decision: action }, 'POST');
    showToast(`Member ${action === 'approve' ? 'approved' : 'rejected'}`);
    openDashboard(); // Refresh
  } catch (err) {
    showToast('Action failed', 'error');
  }
}

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

// =============================================
// PERFORMANCE CHARTS
// =============================================
let performanceChart = null;

function initChart(perfData) {
  const canvas = document.getElementById('performanceChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (performanceChart) {
    performanceChart.destroy();
  }

  const labels = perfData.map(d => `W${d.week}`);
  const completionRates = perfData.map(d => d.totalAssigned > 0 ? Math.round((d.totalCompleted / d.totalAssigned) * 100) : 0);

  performanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Team Progress %',
        data: completionRates,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#6366f1',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (ctx) => `Completion: ${ctx.parsed.y}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      }
    }
  });
}

// =============================================
// LEAVE MANAGEMENT
// =============================================
function openLeaveModal() {
  const today = new Date().toISOString().split('T')[0];
  $('leave-start-date').value = today;
  $('leave-end-date').value = today;
  $('leave-reason').value = '';
  $('leave-modal').style.display = 'flex';
}

function closeLeaveModal() {
  $('leave-modal').style.display = 'none';
}

async function handleLeaveSubmit() {
  const startDate = $('leave-start-date').value;
  const endDate = $('leave-end-date').value;
  const reason = $('leave-reason').value.trim();

  if (!startDate || !endDate) {
    showToast('Please select dates', 'error');
    return;
  }

  const btn = $('leave-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    await apiFetch('requestLeave', {
      user: state.currentUser,
      startDate,
      endDate,
      reason
    }, 'POST');

    showToast('Leave Submitted Successfully! Admin will review it.');
    closeLeaveModal();
  } catch (err) {
    console.error('Leave submission error:', err);
    showToast('Submission failed: ' + (err.message || 'Server error'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
}

function bindLeaveApprovalEvents() {
  document.querySelectorAll('.approve-leave-btn').forEach(btn => {
    btn.onclick = () => handleLeaveApproval(btn.dataset.user, btn.dataset.created, 'approved');
  });
  document.querySelectorAll('.reject-leave-btn').forEach(btn => {
    btn.onclick = () => handleLeaveApproval(btn.dataset.user, btn.dataset.created, 'rejected');
  });
}

async function handleLeaveApproval(user, createdAt, status) {
  try {
    await apiFetch('approveLeave', { user, createdAt, status }, 'POST');
    showToast(`Leave request ${status}`);
    openDashboard(); // Refresh
  } catch (err) {
    showToast('Action failed', 'error');
  }
}

// Global listeners for Leave Modal
document.addEventListener('click', e => {
  if (e.target.id === 'open-leave-modal-btn') openLeaveModal();
});
$('leave-close-btn')?.addEventListener('click', closeLeaveModal);
$('leave-cancel-btn')?.addEventListener('click', closeLeaveModal);
$('leave-submit-btn')?.addEventListener('click', handleLeaveSubmit);

// =============================================
// BROADCAST SYSTEM
// =============================================
async function checkBroadcast() {
  try {
    const res = await apiFetch('getLatestBroadcast');
    if (res.data) {
      const { message, createdAt } = res.data;
      const lastDismissed = localStorage.getItem('last_broadcast_dismissed');

      if (lastDismissed !== createdAt) {
        $('broadcast-text').textContent = message;
        $('broadcast-banner').style.display = 'flex';
        $('broadcast-close-btn').onclick = () => {
          $('broadcast-banner').style.display = 'none';
          localStorage.setItem('last_broadcast_dismissed', createdAt);
        };
      }
    }
  } catch (e) {
    console.warn('Broadcast check failed');
  }
}

async function handleSendBroadcast() {
  const msgInput = $('broadcast-input');
  const msg = msgInput.value.trim();
  if (!msg) return;

  const btn = $('btn-send-broadcast');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await apiFetch('sendBroadcast', { message: msg }, 'POST');
    showToast('Broadcast sent to all users!');
    msgInput.value = '';

    // Also show it locally immediately
    $('broadcast-text').textContent = msg;
    $('broadcast-banner').style.display = 'flex';
    $('broadcast-close-btn').onclick = () => {
      $('broadcast-banner').style.display = 'none';
    };
  } catch (e) {
    showToast('Failed to send broadcast', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send 📢';
  }
}

// Bind global events
document.addEventListener('click', e => {
  if (e.target.id === 'btn-send-broadcast') handleSendBroadcast();
  if (e.target.id === 'voice-close-btn') {
    $('voice-modal').style.display = 'none';
    if (recognition) recognition.stop();
  }
  if (e.target.id === 'btn-confirm-voice-task') confirmVoiceTask();
  if (e.target.id === 'member-actions-close-btn') $('member-actions-modal').style.display = 'none';
  if (e.target.id === 'btn-manual-task-member') {
    $('member-actions-modal').style.display = 'none';
    openAddTaskModal(selectedMember);
  }
  if (e.target.id === 'btn-voice-task-member') {
    $('member-actions-modal').style.display = 'none';
    startVoiceAssistant(selectedMember);
  }
  if (e.target.id === 'btn-view-member-tasks') openMemberTasksModal(selectedMember);
  if (e.target.id === 'member-tasks-close-btn') $('member-tasks-modal').style.display = 'none';
});

// =============================================
// MEMBER ACTIONS
// =============================================
let selectedMember = null;

function openMemberActions(name) {
  selectedMember = name;
  $('member-actions-title').textContent = `${name} Actions`;
  $('member-actions-modal').style.display = 'flex';
}

// =============================================
// AI VOICE ASSISTANT
// =============================================
let recognition = null;

function startVoiceAssistant(preSelectedUser = null) {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Speech recognition not supported in this browser', 'error');
    return;
  }

  selectedMember = preSelectedUser;

  $('voice-modal').style.display = 'flex';
  $('voice-status').style.display = 'block';
  $('voice-result').style.display = 'none';
  $('voice-transcript').textContent = 'Speak now...';
  $('voice-instruction').textContent = preSelectedUser ? `Assigning task to ${preSelectedUser}...` : 'Listening...';

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRec();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        handleVoiceFinalText(event.results[i][0].transcript);
      } else {
        interimTranscript += event.results[i][0].transcript;
        $('voice-transcript').textContent = interimTranscript;
      }
    }
  };

  recognition.onerror = (event) => {
    $('voice-instruction').textContent = 'Error: ' + event.error;
  };

  recognition.start();
}

async function handleVoiceFinalText(text) {
  $('voice-transcript').textContent = `"${text}"`;
  $('voice-instruction').textContent = 'AI is processing...';

  if (recognition) recognition.stop();

  try {
    const res = await apiFetch('processVoiceTask', { text }, 'POST');
    if (res.success && res.data) {
      const task = res.data;
      $('voice-res-name').value = task.taskName || '';
      $('voice-res-user').value = selectedMember || task.assignee || '';
      $('voice-res-date').value = task.date || '';
      $('voice-res-type').value = task.type || 'one-time';

      $('voice-status').style.display = 'none';
      $('voice-result').style.display = 'block';
    } else {
      showToast('AI could not parse that task', 'error');
      $('voice-instruction').textContent = 'Could not parse. Try again?';
    }
  } catch (err) {
    showToast('AI Service Busy', 'error');
    $('voice-instruction').textContent = 'Error processing text.';
  }
}

async function confirmVoiceTask() {
  const name = $('voice-res-name').value;
  const user = $('voice-res-user').value;
  const date = $('voice-res-date').value;
  const type = $('voice-res-type').value;

  if (!name || !user || !date) {
    showToast('All fields required', 'error');
    return;
  }

  const btn = $('btn-confirm-voice-task');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    await apiFetch('addTask', {
      taskName: name,
      assignedTo: user,
      taskType: type,
      plannedDate: date
    }, 'POST');

    showToast('Task created successfully!');
    $('voice-modal').style.display = 'none';
    openDashboard(); // Refresh
  } catch (err) {
    showToast('Failed to create task', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Task';
  }
}

async function openMemberTasksModal(name) {
  $('member-actions-modal').style.display = 'none';
  $('member-tasks-title').textContent = `${name}'s Tasks`;
  $('member-tasks-list').innerHTML = '<div class="empty-state">Loading tasks...</div>';
  $('member-tasks-modal').style.display = 'flex';

  try {
    const res = await apiFetch('getTasks', { user: name });
    const tasks = res.data || [];

    // Filter to show pending/overdue
    const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'missed');

    if (activeTasks.length === 0) {
      $('member-tasks-list').innerHTML = '<div class="empty-state">No active tasks for this member.</div>';
      return;
    }

    $('member-tasks-list').innerHTML = activeTasks.map(t => `
      <div class="member-task-item">
        <div style="display:flex; justify-content:space-between; align-items:start;">
          <div class="member-task-name">${t.taskName}</div>
          <div style="display:flex; gap:8px;">
             <button onclick="handleEditTask('${t.taskId}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; padding:2px;" title="Edit">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
             </button>
             <button onclick="handleDeleteTask('${t.taskId}')" style="background:none; border:none; color:var(--accent-red); cursor:pointer; padding:2px;" title="Delete">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
             </button>
          </div>
        </div>
        <div class="member-task-meta">
          <span>📅 ${t.plannedDate}</span>
          <span class="task-badge badge-${t.taskType}">${t.taskType}</span>
          <span style="color:${t.status === 'overdue' ? 'var(--accent-red)' : 'inherit'}">${t.status}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    $('member-tasks-list').innerHTML = '<div class="empty-state">Error loading tasks.</div>';
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', init);
