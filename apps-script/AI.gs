/* ==============================================
   SVM Task Tracker — AI Integration (AI.gs)
   OpenRouter GPT-3.5 Turbo
   ==============================================

   SETUP:
   1. Get an OpenRouter API key from https://openrouter.ai/
   2. In Apps Script, go to Project Settings → Script Properties
   3. Add property: OPENROUTER_API_KEY = your_key_here
*/

var OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
var OPENROUTER_MODEL = 'openai/gpt-3.5-turbo';

function getOpenRouterKey() {
  return PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
}

function callOpenRouter(systemPrompt, userPrompt) {
  var apiKey = getOpenRouterKey();
  if (!apiKey) {
    Logger.log('OpenRouter API key not set. Using fallback.');
    return null;
  }

  var payload = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 200,
    temperature: 0.7
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'HTTP-Referer': 'https://svm-task-tracker.github.io',
      'X-Title': 'SVM Task Tracker'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(OPENROUTER_URL, options);
    var json = JSON.parse(response.getContentText());
    if (json.choices && json.choices.length > 0) {
      return json.choices[0].message.content.trim();
    }
    Logger.log('OpenRouter response issue: ' + response.getContentText());
    return null;
  } catch (err) {
    Logger.log('OpenRouter API error: ' + err.message);
    return null;
  }
}

// ============ DAILY BRIEFING ============

function generateAIBriefing(user, tasks, scores) {
  var total = tasks.length;
  var overdue = tasks.filter(function(t){return t.status==='overdue';}).length;
  var pending = tasks.filter(function(t){return t.status==='pending';}).length;
  var done = tasks.filter(function(t){return t.status==='done';}).length;
  var daily = tasks.filter(function(t){return t.taskType==='daily';}).length;
  var weekly = tasks.filter(function(t){return t.taskType==='weekly';}).length;
  var oneTime = tasks.filter(function(t){return t.taskType==='one-time';}).length;

  var sysPrompt = 'You are a friendly, motivating AI assistant for a school task management system called SVM Task Tracker. '
    + 'Generate a brief, warm daily briefing (2-3 sentences max) for a team member. '
    + 'Use their name, mention task counts, highlight overdue items if any, and be encouraging. '
    + 'Use 1-2 relevant emojis. Keep it concise and actionable. Output HTML with <strong> for emphasis.';

  var userPrompt = 'User: ' + user
    + '\nDate: ' + getTodayISO()
    + '\nTotal tasks today: ' + total
    + ' (Daily: ' + daily + ', Weekly: ' + weekly + ', One-time: ' + oneTime + ')'
    + '\nOverdue: ' + overdue
    + '\nCompleted: ' + done
    + '\nPending: ' + pending
    + '\nWeek score: ' + (scores.weekScore || 0)
    + '\nStreak: ' + (scores.streak || 0) + ' days';

  if (overdue > 0) {
    var overdueNames = tasks.filter(function(t){return t.status==='overdue';}).map(function(t){return t.taskName;});
    userPrompt += '\nOverdue tasks: ' + overdueNames.join(', ');
  }

  var aiResponse = callOpenRouter(sysPrompt, userPrompt);

  if (aiResponse) {
    return aiResponse;
  }

  // Fallback: generate locally
  return generateLocalBriefing(user, total, overdue, done, pending, scores);
}

function generateLocalBriefing(user, total, overdue, done, pending, scores) {
  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  var msg = 'Good ' + greeting + ', <strong>' + user + '</strong>! ';

  if (total === 0) {
    msg += 'No tasks on your plate today — enjoy the breather! 🎉';
  } else if (done === total) {
    msg += 'You\'ve completed all <strong>' + total + ' tasks</strong> today — amazing work! 🏆';
  } else if (overdue > 0) {
    msg += 'You have <strong>' + total + ' tasks</strong> today, and <strong>' + overdue
      + ' overdue</strong> from earlier. Tackle those first! ⚠️';
  } else {
    msg += 'You have <strong>' + pending + ' tasks</strong> waiting for you today. Let\'s knock them out! 💪';
  }

  if (scores && scores.streak && scores.streak >= 3) {
    msg += ' You\'re on a <strong>' + scores.streak + '-day streak</strong> — keep it going! 🔥';
  }

  return msg;
}

// ============ WEEKLY SUMMARY ============

function generateWeeklySummary(member, stats) {
  var sysPrompt = 'You are an AI that writes brief weekly performance summaries for a school task tracker. '
    + 'Write 1-2 sentences summarizing the person\'s week. Be specific with numbers. '
    + 'If performance is good, praise them. If poor, be constructive. No emojis. Plain text only.';

  var userPrompt = 'Member: ' + member
    + '\nTasks assigned: ' + stats.tasksAssigned
    + '\nCompleted on time: ' + stats.tasksCompleted
    + '\nLate: ' + stats.tasksLate
    + '\nMissed: ' + stats.tasksMissed
    + '\nScore: ' + stats.totalPoints
    + '\nPerfect days: ' + stats.perfectDays
    + '\nStreak: ' + stats.streak + ' days';

  var aiResponse = callOpenRouter(sysPrompt, userPrompt);

  if (aiResponse) {
    return aiResponse;
  }

  // Fallback
  var pct = stats.tasksAssigned > 0
    ? Math.round((stats.tasksCompleted / stats.tasksAssigned) * 100) : 0;
  return member + ' completed ' + stats.tasksCompleted + '/' + stats.tasksAssigned
    + ' tasks (' + pct + '%) with a score of ' + stats.totalPoints + '. '
    + (stats.tasksMissed > 0 ? stats.tasksMissed + ' tasks were missed.' : 'No tasks missed.');
}

// ============ RISK FLAGGING ============

function flagAtRiskTasks() {
  var sheet = getSheet('Tasks');
  var data = sheet.getDataRange().getValues();
  data.shift();
  var today = getTodayISO();

  // Find patterns: tasks that a user frequently completes late or misses
  var userStats = {};
  for (var i = 0; i < data.length; i++) {
    var user = data[i][2];
    var taskName = data[i][1];
    var status = String(data[i][6]).toLowerCase();
    var key = user + '::' + taskName;

    if (!userStats[key]) userStats[key] = { late: 0, missed: 0, total: 0 };
    userStats[key].total++;
    if (status === 'overdue' || status === 'missed') userStats[key].missed++;
    else if (data[i][8] > 0 && data[i][8] < 10) userStats[key].late++;
  }

  var atRisk = [];
  for (var key in userStats) {
    var s = userStats[key];
    if (s.total >= 3 && (s.late + s.missed) / s.total >= 0.5) {
      atRisk.push({
        user: key.split('::')[0],
        task: key.split('::')[1],
        lateRate: Math.round(((s.late + s.missed) / s.total) * 100) + '%'
      });
    }
  }

  return atRisk;
}
