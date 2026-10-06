const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname, '../src/grip-sync.js'),'utf8').replace('  // Run on DOM ready','  window.testSync={flushPending,pullAll,trackRecordChanges,mergeRecordChanges,hasPending,releaseInitialData};\n  // Run on DOM ready');
let clock=0, fail=false, beforeUpdate=null, afterRead=null; const db=new Map();
const client={auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}})},from:()=>{
 let key,version,mode='read',value;
 const q={select:()=>mode==='read'?q:execute(),eq:(field,v)=>{if(field==='data_key')key=v;if(field==='updated_at')version=v;return q;},maybeSingle:()=>execute(),update:row=>{mode='update';value=row.data_value;return q;},insert:row=>{mode='insert';key=row.data_key;value=row.data_value;return q;},then:(yes,no)=>execute().then(yes,no)};
 async function execute(){if(fail)return {error:{message:'network unavailable'}};if(mode==='read'){const data=key?structuredClone(db.get(key)||null):[...db].map(([data_key,row])=>({data_key,...structuredClone(row)}));if(!key&&afterRead){const f=afterRead;afterRead=null;await f();}return {data};}if(beforeUpdate){const f=beforeUpdate;beforeUpdate=null;await f();}const existing=db.get(key);if(mode==='insert'&&existing)return {error:{message:'duplicate'}};const updated_at=String(++clock);db.set(key,{data_value:structuredClone(value),updated_at});return {data:[{updated_at}]};}
 return q;
}};
function boot(seed={}, ready=true){
 // Browser Storage uses named setters: assigning storage.setItem stores text,
 // rather than replacing the prototype method. A plain object misses this bug.
 const values=new Map(Object.entries(seed));
 class Storage { getItem(k){return values.get(k)??null} setItem(k,v){values.set(k,String(v))} removeItem(k){values.delete(k)} }
 const storage=new Proxy(new Storage(),{set(target,k,v){values.set(k,String(v));return true},ownKeys(){return [...values.keys()]},getOwnPropertyDescriptor(target,k){if(values.has(k))return {configurable:true,enumerable:true,value:values.get(k)}},get(target,k){return k in target?Reflect.get(target,k):values.get(k)}});
const indicator={};const w={GRIP_SUPABASE_URL:'https://example.supabase.co',GRIP_SUPABASE_ANON:'x'.repeat(30),_gripSupabaseClient:client,addEventListener(){}};const c={window:w,localStorage:storage,document:{readyState:'loading',addEventListener(){},getElementById:()=>indicator},console:{warn(){}},crypto:{randomUUID},Date,URLSearchParams,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}};vm.runInNewContext(source,c);if(ready)w.testSync.releaseInitialData();return {s:storage,t:w.testSync,api:w.gripSync,indicator};}
const calls=completed=>({rules:[],completed});const K='garlandCallLists';
(async()=>{
 let a=boot({gripCurrentUserId:'u',[K]:JSON.stringify(calls({}))});
 a.s.setItem(K,JSON.stringify(calls({a:'done'})));assert(a.t.hasPending(K));fail=true;assert.equal(await a.t.flushPending(),false);assert(a.t.hasPending(K));assert.match(a.indicator.innerHTML,/failed/);
 // Reload with a durable retry marker; failed cloud pulls must not erase local work.
 let b=boot(Object.fromEntries(Object.entries(a.s).filter(([k,v])=>typeof v==='string')));fail=false;await b.t.flushPending();assert.equal(db.get(K).data_value.completed.a,'done');assert(!b.t.hasPending(K));
 // Remote completion and local completion on separate accounts survive together.
 const c=boot({gripCurrentUserId:'u'});await c.t.pullAll();
 b.s.setItem(K,JSON.stringify(calls({a:'done',b:'done'})));await b.t.flushPending();
 c.s.setItem(K,JSON.stringify(calls({a:'done',c:'done'})));await c.t.flushPending();assert.deepEqual(db.get(K).data_value.completed,{a:'done',b:'done',c:'done'});
 // An explicit uncheck survives instead of being resurrected by a union merge.
 c.s.setItem(K,JSON.stringify(calls({b:'done',c:'done'})));await c.t.flushPending();assert.equal(db.get(K).data_value.completed.a,undefined);
 // Pending work cannot be replaced by a pull.
 c.s.setItem(K,JSON.stringify(calls({b:'done',c:'done',d:'done'})));await c.t.pullAll();assert.equal(JSON.parse(c.s.getItem(K)).completed.d,'done');
 // A newer edit during upload remains pending and is rebased onto the first ack.
 beforeUpdate=()=>c.s.setItem(K,JSON.stringify(calls({b:'done',c:'done',d:'later'})));
 await c.t.flushPending();assert(c.t.hasPending(K));await c.t.flushPending();assert.equal(db.get(K).data_value.completed.d,'later');assert(!c.t.hasPending(K));
 // Reverting during an upload must not discard another device's completion.
 db.set(K,{data_value:calls({...db.get(K).data_value.completed,remote:'done'}),updated_at:String(++clock)});
 const original=JSON.parse(c.s.getItem(K));
 c.s.setItem(K,JSON.stringify(calls({...original.completed,temporary:'done'})));
 beforeUpdate=()=>c.s.setItem(K,JSON.stringify(original));
 await c.t.flushPending();await c.t.flushPending();
 assert.equal(db.get(K).data_value.completed.temporary,undefined);
 assert.equal(db.get(K).data_value.completed.remote,'done');
 const O='garlandOutreach'; c.s.setItem(O,JSON.stringify({settings:{gmailToken:'device-only',gmailTokenExpiry:123}})); await c.t.flushPending(); assert.equal(JSON.parse(c.s.getItem(O)).settings.gmailToken,'device-only'); assert.equal(db.get(O).data_value.settings.gmailToken,undefined);
 // Conflicting generic records are protected, not force-overwritten.
 const N='garlandCrmNotes';db.set(N,{data_value:{a:'cloud'},updated_at:'initial'});await c.t.pullAll();c.s.setItem(N,JSON.stringify({a:'phone'}));db.set(N,{data_value:{a:'other device'},updated_at:'changed'});await c.t.flushPending();assert(c.t.hasPending(N));assert.equal(db.get(N).data_value.a,'other device');assert.equal(JSON.parse(c.s.getItem(N)).a,'phone');assert.match(c.indicator.innerHTML,/conflicting/);
 // Activity records on separate clients merge; conflicting edits to one note stop.
 const A='garlandAccountActivities',old={a:[{id:'1',note:'old'}]},next={a:[{id:'1',note:'old'},{id:'2',note:'new'}]},remote={...old,b:[{id:'3',note:'remote'}]};
 const edits=c.t.trackRecordChanges(A,JSON.stringify(old),JSON.stringify(next));const merged=c.t.mergeRecordChanges(A,remote,edits);assert.equal(merged.a.length,2);assert.equal(merged.b.length,1);
 const conflict=c.t.trackRecordChanges(A,JSON.stringify(old),JSON.stringify({a:[{id:'1',note:'phone'}]}));const conflictMerged=c.t.mergeRecordChanges(A,{a:[{id:'1',note:'cloud'}]},conflict);assert.equal(conflictMerged.a[0].note,'phone'); // local wins, no stuck conflict
 // Postgres JSONB may reorder object keys. That is not a content conflict.
 const reordered={a:[{note:'old',id:'1'}]};
 const editOrder=c.t.trackRecordChanges(A,JSON.stringify(old),JSON.stringify({a:[{id:'1',note:'edited'}]}));
 assert.equal(c.t.mergeRecordChanges(A,reordered,editOrder).a[0].note,'edited');
 const reorderOnly=c.t.trackRecordChanges(A,JSON.stringify(old),JSON.stringify(reordered));
 assert.equal(Object.keys(reorderOnly).length,0);
 // Both parts of a voicemail survive upload, a later heartbeat, and reload.
 const phone=boot({gripCurrentUserId:'u'});await phone.t.pullAll();
 const phoneCalls=JSON.parse(phone.s.getItem(K));phoneCalls.completed.voicemail='2026-09-28T12:00:00Z';
 phone.s.setItem(K,JSON.stringify(phoneCalls));
 phone.s.setItem(A,JSON.stringify({voicemail:[{id:'vm-call',note:'Left voicemail',createdAt:'2026-09-28T12:00:00Z'}]}));
 assert(phone.t.hasPending(K));assert(phone.t.hasPending(A));
 await phone.t.flushPending();
 phone.s.removeItem('grip_last_push_ts'); // Heartbeat after the recent-push guard expires.
 await phone.t.pullAll();
 assert.equal(JSON.parse(phone.s.getItem(K)).completed.voicemail,'2026-09-28T12:00:00Z');
 assert.equal(JSON.parse(phone.s.getItem(A)).voicemail[0].note,'Left voicemail');
 const reopened=boot(Object.fromEntries(Object.entries(phone.s).filter(([k,v])=>typeof v==='string')));
 await reopened.t.pullAll();assert.equal(JSON.parse(reopened.s.getItem(A)).voicemail[0].id,'vm-call');
 // An older, slow cloud read must not replace a newer completed read.
 const race=boot({gripCurrentUserId:'u'});await race.t.pullAll();
 afterRead=async()=>{
   db.set(K,{data_value:calls({fresh:'done'}),updated_at:String(++clock)});
   await race.t.pullAll();
 };
 await race.t.pullAll();
 assert.equal(JSON.parse(race.s.getItem(K)).completed.fresh,'done','delayed response erased newer cloud completion');
 // Repeated save during upload must retain another device's independent call.
 const repeat=boot({gripCurrentUserId:'u'});await repeat.t.pullAll();
 const initial=JSON.parse(repeat.s.getItem(K));
 db.set(K,{data_value:calls({...initial.completed,otherPhone:'done'}),updated_at:String(++clock)});
 const submitted=JSON.stringify(calls({...initial.completed,myCall:'done'}));
 repeat.s.setItem(K,submitted);
 beforeUpdate=()=>repeat.s.setItem(K,submitted);
 await repeat.t.flushPending();await repeat.t.flushPending();
 assert.equal(db.get(K).data_value.completed.otherPhone,'done','repeat save erased other device call');
 // Per-call labels require server confirmation of both the note and completion.
 const statusPhone=boot({gripCurrentUserId:'u'});
 const statusActivity={id:'status-note',note:'Left voicemail'};
 statusPhone.s.setItem(A,JSON.stringify({statusAccount:[statusActivity]}));
 statusPhone.s.setItem(K,JSON.stringify(calls({statusCall:'done'})));
 assert.match(statusPhone.api.callSaveStatus('statusAccount','status-note','statusCall'),/pending/);
 await statusPhone.t.flushPending();
 assert.equal(statusPhone.api.callSaveStatus('statusAccount','status-note','statusCall'),'Saved to cloud');
 statusPhone.s.setItem(A,JSON.stringify({statusAccount:[{...statusActivity,note:'Edited'}]}));
 assert.match(statusPhone.api.callSaveStatus('statusAccount','status-note','statusCall'),/pending/);
 fail=true;await statusPhone.t.flushPending();fail=false;
 assert.match(statusPhone.api.callSaveStatus('statusAccount','status-note','statusCall'),/retry/);
 await statusPhone.t.flushPending();
 assert.equal(statusPhone.api.callSaveStatus('statusAccount','status-note','statusCall'),'Saved to cloud');
 // Real startup seeding on a clean device must never queue or replace cloud CRM.
 const cold=boot({},false), crm='garlandCrmData';
 const desktop={accounts:[{id:'desktop',client:'Desktop account'}]};
 db.set(crm,{data_value:desktop,updated_at:String(++clock)});
 const app=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
 const begin=app.indexOf('(function seedAccounts()');
 const seed=app.slice(begin,app.indexOf('})();',begin)+5);
 vm.runInNewContext(seed,{localStorage:cold.s,savedCrm:{accounts:[]},Date,Set});
 assert.equal(cold.s.getItem(crm),null);assert(!cold.t.hasPending(crm));
 cold.s.setItem('gripCurrentUserId','u');await cold.t.flushPending();await cold.t.pullAll();
 assert.equal(JSON.parse(cold.s.getItem(crm)).accounts[0].id,'desktop');
 cold.t.releaseInitialData();cold.s.setItem(crm,JSON.stringify({accounts:[{id:'desktop',client:'Edited'}]}));
 assert(cold.t.hasPending(crm));await cold.t.flushPending();assert.equal(db.get(crm).data_value.accounts[0].client,'Edited');
 // Legacy pending work is never discarded or replaced by initialization writes.
 const legacy=boot({gripCurrentUserId:'u'});legacy.s.setItem(crm,JSON.stringify({accounts:[{id:'unsent'}]}));
 const reload=boot(Object.fromEntries(Object.entries(legacy.s).filter(([k,v])=>typeof v==='string')),false);
 const savedQueue=reload.s.getItem('grip_pending_saves_v1');
 reload.s.setItem(crm,JSON.stringify({accounts:[{id:'automatic-default'}]}));
 assert.equal(reload.s.getItem('grip_pending_saves_v1'),savedQueue);
 await reload.t.pullAll();assert.equal(JSON.parse(reload.s.getItem(crm)).accounts[0].id,'unsent');
 assert.equal(db.get(crm).data_value.accounts[0].client,'Edited');
 console.log('PASS: clean-device hydration before seeds; stored offline edits and pending queues preserved.');
 console.log('PASS: durable offline retry, reload recovery, checked/unchecked calls, concurrent clients, in-flight edits, stale pulls, cloud conflicts, and activity merges.');
})().catch(e=>{console.error(e);process.exitCode=1});
