/* ==============================================
   SVM Task Tracker — Main API (Code.gs)
   Google Apps Script — Deploy as Web App
   ==============================================

   SETUP:
   1. Create a Google Sheet with 3 tabs: "Tasks", "Team", "WeeklyScores"
   2. Open Extensions → Apps Script
   3. Paste this file as Code.gs
   4. Paste Scoring.gs and AI.gs as separate files
   5. Set your SHEET_ID below
   6. Deploy → New Deployment → Web App
      - Execute as: Me
      - Who has access: Anyone
   7. Copy the deployment URL into your frontend CONFIG.API_URL
*/

// ============ CONFIGURATION ============
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';  // 🔴 Replace with your Sheet ID

function getSheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

// ============ HTTP HANDLERS ============

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;

    switch (action) {
      case 'getTeam':
        result = handleGetTeam();
        break;
      case 'getTasks':
        result = handleGetTasks(e.parameter.user);
        break;
      case 'getScores':
        result = handleGetScores(e.parameter.user);
        break;
      case 'getBriefing':
        result = handleGetBriefing(e.parameter.user);
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    switch (action) {
      case 'completeTask':
        result = handleCompleteTask(body);
        break;
      case 'addTask':
        result = handleAddTask(body);
        break;
      case 'recalculateScores':
        result = handleRecalculateScores();
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============ GET HANDLERS ============

function handleGetTeam() {
  const sheet = getSheet('Team');
  const data = sheet.getDataRange().getValues();
  const headers = data.shift(); // Remove header row

  const team = data.map(row => ({
    name: row[0],
    role: row[1],
    active: row[2] === true || row[2] === 'TRUE',
  }));

  return { success: true, data: team };
}

function handleGetTasks(user) {
  if (!user) return { success: false, error: 'User parameter required' };

  const sheet = getSheet('Tasks');
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const today = getTodayISO();

  // Filter: tasks assigned to this user AND (plannedDate is today OR status is overdue/pending for past dates)
  const tasks = data
    .map((row, idx) => ({
      rowIndex: idx + 2,  // 1-indexed, +1 for header
      taskId: row[0],
      taskName: row[1],
      assignedTo: row[2],
      taskType: String(row[3]).toLowerCase(),
      plannedDate: formatDateISO(row[4]),
      completedDate: row[5] ? new Date(row[5]).toISOString() : '',
      status: String(row[6]).toLowerCase(),
      weekNumber: row[7],
      points: row[8],
      notes: row[9] || '',
    }))
    .filter(t => {
      if (t.assignedTo !== user) return false;
      // Show today's tasks + any overdue/pending from the past
      if (t.plannedDate === today) return true;
      if (t.plannedDate < today && (t.status === 'pending' || t.status === 'overdue')) return true;
      return false;
    })
    .map(t => {
      // Auto-mark past pending tasks as overdue
      if (t.plannedDate < today && t.status === 'pending') {
        t.status = 'overdue';
      }
      return t;
    });

  return { success: true, data: tasks };
}

function handleGetScores(user) {
  const sheet = getSheet('WeeklyScores');
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const currentWeek = getISOWeekNumber(new Date());
  const currentYear = new Date().getFullYear();

  if (user) {
    // Get this user's current week score
    const row = data.find(r => r[0] === user && r[1] === currentWeek && r[2] === currentYear);
    if (row) {
      return {
        success: true,
        data: {
          weekScore: row[7] || 0,
          streak: calculateStreak(user, data),
          tasksAssigned: row[3] || 0,
          tasksCompleted: row[4] || 0,
          tasksLate: row[5] || 0,
          tasksMissed: row[6] || 0,
        }
      };
    } else {
      return {
        success: true,
        data: { weekScore: 0, streak: 0, tasksAssigned: 0, tasksCompleted: 0, tasksLate: 0, tasksMissed: 0 }
      };
    }
  } else {
    // Return all scores for current week
    const weekScores = data
      .filter(r => r[1] === currentWeek && r[2] === currentYear)
      .map(r => ({
        name: r[0], weekNumber: r[1], year: r[2],
        tasksAssigned: r[3], tasksCompleted: r[4], tasksLate: r[5], tasksMissed: r[6],
        score: r[7], aiSummary: r[8] || '',
      }));
    return { success: true, data: weekScores };
  }
}

function handleGetBriefing(user) {
  if (!user) return { success: false, error: 'User parameter required' };

  // Get today's tasks for context
  const tasksResult = handleGetTasks(user);
  const tasks = tasksResult.data;

  // Get scores for context
  const scoresResult = handleGetScores(user);
  const scores = scoresResult.data;

  // Generate AI briefing
  const briefing = generateAIBriefing(user, tasks, scores);

  return { success: true, data: { briefing } };
}

// ============ POST HANDLERS ============

function handleCompleteTask(body) {
  const { taskId, user, completedDate } = body;
  if (!taskId) return { success: false, error: 'taskId required' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet('Tasks');
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(taskId)) {
        const row = i + 1;  // 1-indexed
        const plannedDate = formatDateISO(data[i][4]);
        const today = getTodayISO();
        const now = completedDate || new Date().toISOString();

        // Update CompletedDate (col F = 6)
        sheet.getRange(row, 6).setValue(now);

        // Update Status (col G = 7)
        sheet.getRange(row, 7).setValue('done');

        // Calculate points (col I = 9)
        let points = 0;
        if (plannedDate === today) {
          points = 10; // On time
        } else if (plannedDate < today) {
          // Late — check how many days
          const diffDays = daysBetween(new Date(plannedDate), new Date(today));
          if (diffDays === 1) points = 5;
          else if (diffDays === 2) points = 2;
          else points = 1;
        } else {
          points = 10; // Early completion
        }
        sheet.getRange(row, 9).setValue(points);

        lock.releaseLock();
        return { success: true, data: { taskId, status: 'done', completedDate: now, points } };
      }
    }

    lock.releaseLock();
    return { success: false, error: 'Task not found: ' + taskId };
  } catch (err) {
    lock.releaseLock();
    throw err;
  }
}

function handleAddTask(body) {
  const { taskName, assignedTo, taskType, plannedDate, notes } = body;
  if (!taskName || !assignedTo) return { success: false, error: 'taskName and assignedTo required' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet('Tasks');
    const lastRow = sheet.getLastRow();
    const taskId = 'T' + String(lastRow).padStart(3, '0');
    const weekNum = getISOWeekNumber(new Date(plannedDate || new Date()));

    sheet.appendRow([
      taskId,
      taskName,
      assignedTo,
      taskType || 'one-time',
      plannedDate || getTodayISO(),
      '',       // CompletedDate
      'pending', // Status
      weekNum,
      0,        // Points
      notes || '',
      new Date().toISOString(),  // CreatedAt
    ]);

    lock.releaseLock();
    return { success: true, data: { taskId } };
  } catch (err) {
    lock.releaseLock();
    throw err;
  }
}

function handleRecalculateScores() {
  recalculateWeeklyScores();
  return { success: true, data: { message: 'Scores recalculated' } };
}

// ============ UTILITY FUNCTIONS ============

function getTodayISO() {
  const d = new Date();
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatDateISO(dateVal) {
  if (!dateVal) return '';
  try {
    if (dateVal instanceof Date) {
      return Utilities.formatDate(dateVal, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return String(dateVal).substring(0, 10);
  } catch {
    return String(dateVal);
  }
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function daysBetween(d1, d2) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((d2 - d1) / oneDay));
}

function calculateStreak(user, scoresData) {
  // Count consecutive weeks with positive scores
  const userScores = scoresData
    .filter(r => r[0] === user && r[7] > 0)
    .sort((a, b) => {
      if (a[2] !== b[2]) return b[2] - a[2]; // year desc
      return b[1] - a[1]; // week desc
    });
  
  let streak = 0;
  const currentWeek = getISOWeekNumber(new Date());
  let expectedWeek = currentWeek;
  
  for (const row of userScores) {
    if (row[1] === expectedWeek || row[1] === expectedWeek - 1) {
      streak++;
      expectedWeek = row[1] - 1;
    } else {
      break;
    }
  }
  
  return streak;
}

// ============ DAILY TASK GENERATOR ============
// Run this on a daily time-driven trigger to create recurring tasks

function generateDailyTasks() {
  const tasksSheet = getSheet('Tasks');
  const teamSheet = getSheet('Team');
  const today = getTodayISO();
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...

  // Get existing tasks for today to avoid duplicates
  const existingData = tasksSheet.getDataRange().getValues();
  const existingToday = existingData.filter(r => formatDateISO(r[4]) === today);

  // Get team members
  const teamData = teamSheet.getDataRange().getValues();
  teamData.shift(); // remove header

  const activeMembers = teamData.filter(r => r[2] === true || r[2] === 'TRUE').map(r => r[0]);

  // Define recurring task templates (customize these)
  const dailyTasks = [
    'Check student attendance register',
    'Review lesson plans for the day',
    'Update classroom activity log',
  ];

  // Weekly tasks (only on Monday)
  const weeklyTasks = dayOfWeek === 1 ? [
    'Submit weekly progress report',
    'Review student homework submissions',
    'Attend staff coordination meeting',
  ] : [];

  const allRecurring = [
    ...dailyTasks.map(t => ({ name: t, type: 'daily' })),
    ...weeklyTasks.map(t => ({ name: t, type: 'weekly' })),
  ];

  const lastRow = tasksSheet.getLastRow();
  let newId = lastRow;

  const newRows = [];
  for (const member of activeMembers) {
    for (const task of allRecurring) {
      // Check if already exists
      const exists = existingToday.some(r => r[2] === member && r[1] === task.name);
      if (!exists) {
        newId++;
        const taskId = 'T' + String(newId).padStart(3, '0');
        newRows.push([
          taskId, task.name, member, task.type, today,
          '', 'pending', getISOWeekNumber(new Date()), 0, '', new Date().toISOString()
        ]);
      }
    }
  }

  if (newRows.length > 0) {
    tasksSheet.getRange(lastRow + 1, 1, newRows.length, 11).setValues(newRows);
  }

  Logger.log(`Generated ${newRows.length} recurring tasks for ${today}`);
}

// ============ OVERDUE MARKER ============
// Run daily to mark missed tasks

function markOverdueTasks() {
  const sheet = getSheet('Tasks');
  const data = sheet.getDataRange().getValues();
  const today = getTodayISO();

  for (let i = 1; i < data.length; i++) {
    const plannedDate = formatDateISO(data[i][4]);
    const status = String(data[i][6]).toLowerCase();

    if (plannedDate < today && status === 'pending') {
      const row = i + 1;
      sheet.getRange(row, 7).setValue('overdue');
      sheet.getRange(row, 9).setValue(-10); // Penalty
    }
  }

  Logger.log('Overdue tasks marked for ' + today);
}
