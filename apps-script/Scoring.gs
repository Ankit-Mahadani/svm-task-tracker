/* ==============================================
   SVM Task Tracker — Scoring Engine (Scoring.gs)
   ==============================================
   SCORING RULES:
   On-time: +10 | Late same day: +5 | Late 1 day: +2 | Missed: -10
   Streak bonus: +3/day | Perfect day: +5
   TRIGGER: Weekly (Sunday 11:55 PM)
*/

function recalculateWeeklyScores() {
  var tasksSheet = getSheet('Tasks');
  var teamSheet = getSheet('Team');
  var scoresSheet = getSheet('WeeklyScores');
  var curWeek = getISOWeekNumber(new Date());
  var curYear = new Date().getFullYear();
  var tData = tasksSheet.getDataRange().getValues();
  tData.shift();
  var tmData = teamSheet.getDataRange().getValues();
  tmData.shift();
  var members = tmData.filter(function(r){return r[2]===true||r[2]==='TRUE';}).map(function(r){return r[0];});
  var weekTasks = tData.filter(function(r){return r[7]===curWeek;});
  var scoreRows = [];
  for (var m = 0; m < members.length; m++) {
    var member = members[m];
    var mt = weekTasks.filter(function(r){return r[2]===member;});
    var assigned=mt.length, completed=0, late=0, missed=0, pts=0;
    var daily = {};
    for (var i = 0; i < mt.length; i++) {
      var st = String(mt[i][6]).toLowerCase();
      var pd = formatDateISO(mt[i][4]);
      var p = mt[i][8]||0;
      if(!daily[pd]) daily[pd]={total:0,onTime:0};
      daily[pd].total++;
      if(st==='done'){if(p>=10){completed++;daily[pd].onTime++;}else{late++;}pts+=p;}
      else if(st==='overdue'||st==='missed'){missed++;pts+=(p||-10);}
    }
    var perfDays=0;
    for(var d in daily){if(daily[d].total>0&&daily[d].onTime===daily[d].total){perfDays++;pts+=5;}}
    var streak = calcStreakDays(member, tData);
    pts += streak * 3;
    var summary = '';
    try { summary = generateWeeklySummary(member,{tasksAssigned:assigned,tasksCompleted:completed,tasksLate:late,tasksMissed:missed,totalPoints:pts,perfectDays:perfDays,streak:streak}); }
    catch(e) { summary = 'Week '+curWeek+': '+completed+'/'+assigned+' done. Score: '+pts; }
    scoreRows.push([member,curWeek,curYear,assigned,completed,late,missed,pts,summary]);
  }
  var existing = scoresSheet.getDataRange().getValues();
  for(var s=0;s<scoreRows.length;s++){
    var nr=scoreRows[s]; var found=false;
    for(var e=1;e<existing.length;e++){
      if(existing[e][0]===nr[0]&&existing[e][1]===nr[1]&&existing[e][2]===nr[2]){
        scoresSheet.getRange(e+1,1,1,9).setValues([nr]); found=true; break;
      }
    }
    if(!found) scoresSheet.appendRow(nr);
  }
}

function calcStreakDays(member, data) {
  var byDate = {};
  data.filter(function(r){return r[2]===member;}).forEach(function(r){
    var d=formatDateISO(r[4]);
    if(!byDate[d])byDate[d]={total:0,onTime:0};
    byDate[d].total++;
    if(String(r[6]).toLowerCase()==='done'&&r[8]>=10)byDate[d].onTime++;
  });
  var dates=Object.keys(byDate).sort().reverse();
  var streak=0;
  for(var i=0;i<dates.length;i++){
    var s=byDate[dates[i]];
    if(s.total>0&&s.onTime===s.total)streak++;else break;
  }
  return streak;
}

function setupSheetHeaders() {
  var tasks=getSheet('Tasks');
  if(tasks.getLastRow()===0){
    tasks.appendRow(['TaskID','TaskName','AssignedTo','TaskType','PlannedDate','CompletedDate','Status','WeekNumber','Points','Notes','CreatedAt']);
    tasks.getRange(1,1,1,11).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#fff');
  }
  var team=getSheet('Team');
  if(team.getLastRow()===0){
    team.appendRow(['Name','Role','Active']);
    team.getRange(1,1,1,3).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#fff');
    team.appendRow(['Ankit','Coordinator',true]);
    team.appendRow(['Priya','Teacher',true]);
    team.appendRow(['Rahul','Admin',true]);
    team.appendRow(['Sneha','Teacher',true]);
    team.appendRow(['Vikram','Supervisor',true]);
    team.appendRow(['Meera','Teacher',true]);
  }
  var scores=getSheet('WeeklyScores');
  if(scores.getLastRow()===0){
    scores.appendRow(['Name','WeekNumber','Year','TasksAssigned','TasksCompleted','TasksLate','TasksMissed','Score','AISummary']);
    scores.getRange(1,1,1,9).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#fff');
  }
}

function seedSampleTasks() {
  var sheet=getSheet('Tasks');
  var today=getTodayISO();
  var week=getISOWeekNumber(new Date());
  var now=new Date().toISOString();
  var members=['Ankit','Priya','Rahul','Sneha','Vikram','Meera'];
  var daily=['Check student attendance register','Review lesson plans for the day','Update classroom activity log'];
  var weekly=['Submit weekly progress report','Review student homework submissions'];
  var oneTime={
    'Ankit':['Prepare materials for parent-teacher meeting','Update notice board for exam schedule'],
    'Priya':['Grade mid-term exam papers','Organize science lab equipment'],
    'Rahul':['Submit budget proposal for sports day','Coordinate with transport vendor'],
    'Sneha':['Design creative arts display board','Plan field trip logistics'],
    'Vikram':['Conduct fire safety drill','Update CCTV monitoring report'],
    'Meera':['Prepare holiday homework worksheet','Mentor new substitute teacher']
  };
  var id=sheet.getLastRow();var rows=[];
  for(var m=0;m<members.length;m++){var mb=members[m];
    for(var d=0;d<daily.length;d++){id++;rows.push(['T'+String(id).padStart(3,'0'),daily[d],mb,'daily',today,'','pending',week,0,'',now]);}
    for(var w=0;w<weekly.length;w++){id++;rows.push(['T'+String(id).padStart(3,'0'),weekly[w],mb,'weekly',today,'','pending',week,0,'',now]);}
    var ot=oneTime[mb]||[];for(var o=0;o<ot.length;o++){id++;rows.push(['T'+String(id).padStart(3,'0'),ot[o],mb,'one-time',today,'','pending',week,0,'',now]);}
  }
  if(rows.length>0)sheet.getRange(sheet.getLastRow()+1,1,rows.length,11).setValues(rows);
}
