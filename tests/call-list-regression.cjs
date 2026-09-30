const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const src=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const storage=new Map();let failKey='',pending;
const fields={accountId:{value:''},activity:{value:''},day:{value:''},completeCall:{value:''}};
const form={elements:fields,dataset:{},reset(){Object.values(fields).forEach(x=>x.value='')}};
const dialog={open:false,close(){this.open=false}};
const elements={callActivityForm:form,callActivityAccountId:fields.accountId,callActivityDay:fields.day,callActivityComplete:fields.completeCall,callActivityTitle:{},callActivityDetails:{insertAdjacentHTML(){}},callActivitySaveStatus:{dataset:{}},callActivityDialog:dialog,saveNextCallActivityButton:{}};
const accounts=[{id:'a',client:'A'},{id:'b',client:'B'},{id:'c',client:'C'}];
const c={window:{},document:{querySelectorAll:()=>[]},taskDefaultAssignedUser:()=>'',localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){if(k===failKey)throw Error('quota');storage.set(k,v)},removeItem:k=>storage.delete(k)},crypto:{randomUUID},state:{activities:{},callLists:{rules:[],completed:{}}},Date,clearTimeout:()=>{pending=null},setTimeout:fn=>{pending=fn;return 1},byId:id=>elements[id],cleanAccounts:()=>accounts,accountsForCallDay:()=>accounts,graveyardAccountIds:()=>new Set(),latestAccountActivity:()=>null,field:()=>'',buildFullAddress:()=>'',openDialog(){dialog.open=true},renderCallList(){},callCompletionKey:(day,id)=>day+'|'+id,readStorageJson:(k,f)=>storage.has(k)?JSON.parse(storage.get(k)):f};
vm.createContext(c);vm.runInContext('let callActivitySaveTimer;',c);
for(const name of ['callFollowupDate','normalizedTask','addCallFollowup','callSaveLabel','refreshCallSaveLabels','escapeHtml','completeCallListItem','openCallActivityDialog','callActivityDraftKey','setCallSaveStatus','saveCallActivityDraft','persistCallActivity','queueCallActivitySave','finishCallActivity','saveCallActivity','addCallOutcomeToActivity']){const a=src.indexOf('function '+name+'(');let b=src.indexOf('\nfunction ',a+1);const declaration=src.indexOf('\nlet callActivitySaveTimer',a+1);if(declaration>=0&&declaration<b)b=declaration;vm.runInContext(src.slice(a,b),c)}
// User's exact sequence: A outcome, switch to B, B outcome, Save.
c.openCallActivityDialog('a','Monday',true);c.addCallOutcomeToActivity('Left voicemail.');const firstId=form.dataset.activityId;
assert.equal(JSON.parse(storage.get('garlandAccountActivities')).a[0].note,'Left voicemail.');
c.openCallActivityDialog('b','Monday',true);c.addCallOutcomeToActivity('Left voicemail.');c.saveCallActivity();
let saved=JSON.parse(storage.get('garlandAccountActivities'));assert.equal(saved.a.length,1);assert.equal(saved.a[0].id,firstId);assert.equal(saved.b.length,1);
assert(c.state.callLists.completed['Monday|a']);assert(c.state.callLists.completed['Monday|b']);
// Stale UI state cannot clobber durable calls when saving the next account.
c.state.activities={};c.state.callLists={rules:[],completed:{}};c.openCallActivityDialog('c','Monday',true);c.addCallOutcomeToActivity('No answer.');fields.activity.value+='\nCall tomorrow';c.queueCallActivitySave();pending();
saved=JSON.parse(storage.get('garlandAccountActivities'));assert.equal(saved.a.length,1);assert.equal(saved.b.length,1);assert.equal(saved.c.length,1);assert.match(saved.c[0].note,/Call tomorrow/);assert(c.state.callLists.completed['Monday|a']);
// Failed persistence keeps the dialog and draft; retry uses the same ID.
fields.activity.value+='\nNew note';failKey='garlandAccountActivities';assert.equal(c.finishCallActivity(true),false);assert(dialog.open);assert.equal(fields.accountId.value,'c');assert.equal(elements.callActivitySaveStatus.dataset.failed,'yes');failKey='';assert(c.saveCallActivity());assert.equal(JSON.parse(storage.get('garlandAccountActivities')).c.length,1);
// Reload recovery reuses the durable session ID, not a second activity.
c.openCallActivityDialog('a','Tuesday',true);c.addCallOutcomeToActivity('Spoke with contact.');const retryId=form.dataset.activityId;dialog.open=false;c.state.activities={};c.openCallActivityDialog('a','Tuesday',true);assert.equal(form.dataset.activityId,retryId);c.addCallOutcomeToActivity('Spoke with contact.');assert.equal(JSON.parse(storage.get('garlandAccountActivities')).a.length,2);
// Save & next commits first and selects the next unfinished client.
assert(c.finishCallActivity(true));assert.equal(fields.accountId.value,'b');assert(dialog.open);assert.equal(fields.activity.value,'');
// Completing an activity followed by clearing its editor doesn't delete history.
c.addCallOutcomeToActivity('Left voicemail.');fields.activity.value='';assert(c.finishCallActivity(false));assert.match(JSON.parse(storage.get('garlandAccountActivities')).b[0].note,/Left voicemail/);
console.log('PASS: two-account voicemail sequence, immediate outcome save, note autosave, stale-state preservation, idempotent retry/reload, failed-save blocking, save-and-next, and preserved history.');

// A completion-write failure after a successful activity write retries without duplicates.
c.openCallActivityDialog('c','Tuesday',true);failKey='garlandCallLists';c.addCallOutcomeToActivity('Left voicemail.');const partialId=form.dataset.activityId;
assert(dialog.open);assert.equal(c.state.callLists.completed['Tuesday|c'],undefined);assert.equal(c.finishCallActivity(true),false);
failKey='';assert(c.finishCallActivity(false));assert.equal(JSON.parse(storage.get('garlandAccountActivities')).c.filter(x=>x.id===partialId).length,1);assert(c.state.callLists.completed['Tuesday|c']);
c.openCallActivityDialog('a','Wednesday',true);assert(c.finishCallActivity(false));assert.equal(c.state.callLists.completed['Wednesday|a'],undefined);
console.log('PASS: partial-save retry and blank-dialog cancellation.');

// Follow-ups use weekdays, editable dates, and one stable task per call.
assert.equal(c.callFollowupDate(new Date(2026,8,25,12)), '2026-09-30');
elements.callFollowupPanel={hidden:true};elements.callFollowupDate={value:''};elements.callFollowupStatus={};
c.openCallActivityDialog('a','Friday',true);c.addCallOutcomeToActivity('Left voicemail.');
assert.equal(elements.callFollowupPanel.hidden,false);
elements.callFollowupDate.value='2026-10-02';assert(c.addCallFollowup());
assert.equal(JSON.parse(storage.get('garlandTasks'))[0].due_date,'2026-10-02');
assert.equal(JSON.parse(storage.get('garlandTasks'))[0].account_id,'a');
elements.callFollowupDate.value='2026-10-05';assert(c.addCallFollowup());
assert.equal(JSON.parse(storage.get('garlandTasks')).length,1);
assert.equal(JSON.parse(storage.get('garlandTasks'))[0].due_date,'2026-10-05');
failKey='garlandTasks';assert.equal(c.addCallFollowup(),false);failKey='';
assert.match(elements.callFollowupStatus.textContent,/Could not save/);
console.log('PASS: weekend follow-up dates, edited dates, duplicate prevention, and failed-task retry.');
