const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname, '../src/grip-sync.js'),'utf8').replace('  // Run on DOM ready','  window.testSync={flushPending,pullAll,trackRecordChanges,mergeRecordChanges,hasPending};\n  // Run on DOM ready');
let clock=0, fail=false, beforeUpdate=null; const db=new Map();
const client={auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}})},from:()=>{
 let key,version,mode='read',value;
 const q={select:()=>mode==='read'?q:execute(),eq:(field,v)=>{if(field==='data_key')key=v;if(field==='updated_at')version=v;return q;},maybeSingle:()=>execute(),update:row=>{mode='update';value=row.data_value;return q;},insert:row=>{mode='insert';key=row.data_key;value=row.data_value;return q;},then:(yes,no)=>execute().then(yes,no)};
 async function execute(){if(fail)return {error:{message:'network unavailable'}};if(mode==='read')return {data:key?structuredClone(db.get(key)||null):[...db].map(([data_key,row])=>({data_key,...structuredClone(row)}))};if(beforeUpdate){const f=beforeUpdate;beforeUpdate=null;await f();}const existing=db.get(key);if(mode==='update'&&existing?.updated_at!==version)return {data:[]};if(mode==='insert'&&existing)return {error:{message:'duplicate'}};const updated_at=String(++clock);db.set(key,{data_value:structuredClone(value),updated_at});return {data:[{updated_at}]};}
 return q;
}};
function boot(seed={}){const storage={...seed,getItem(k){return this[k]??null},setItem(k,v){this[k]=String(v)},removeItem(k){delete this[k]}};const indicator={};const w={GRIP_SUPABASE_URL:'https://example.supabase.co',GRIP_SUPABASE_ANON:'x'.repeat(30),_gripSupabaseClient:client,addEventListener(){}};const c={window:w,localStorage:storage,document:{readyState:'loading',addEventListener(){},getElementById:()=>indicator},console:{warn(){}},crypto:{randomUUID},Date,URLSearchParams,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}};vm.runInNewContext(source,c);return {s:storage,t:w.testSync,indicator};}
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
 const N='garlandCrmNotes';db.set(N,{data_value:{a:'cloud'},updated_at:'initial'});await c.t.pullAll();c.s.setItem(N,JSON.stringify({a:'phone'}));db.set(N,{data_value:{a:'other device'},updated_at:'changed'});await c.t.flushPending();assert(c.t.hasPending(N));assert.equal(db.get(N).data_value.a,'other device');assert.equal(JSON.parse(c.s.getItem(N)).a,'phone');assert.match(c.indicator.innerHTML,/Conflicting/);
 // Activity records on separate clients merge; conflicting edits to one note stop.
 const A='garlandAccountActivities',old={a:[{id:'1',note:'old'}]},next={a:[{id:'1',note:'old'},{id:'2',note:'new'}]},remote={...old,b:[{id:'3',note:'remote'}]};
 const edits=c.t.trackRecordChanges(A,JSON.stringify(old),JSON.stringify(next));const merged=c.t.mergeRecordChanges(A,remote,edits);assert.equal(merged.a.length,2);assert.equal(merged.b.length,1);
 const conflict=c.t.trackRecordChanges(A,JSON.stringify(old),JSON.stringify({a:[{id:'1',note:'phone'}]}));assert.throws(()=>c.t.mergeRecordChanges(A,{a:[{id:'1',note:'cloud'}]},conflict),/CONFLICT/);
 console.log('PASS: durable offline retry, reload recovery, checked/unchecked calls, concurrent clients, in-flight edits, stale pulls, cloud conflicts, and activity merges.');
})().catch(e=>{console.error(e);process.exitCode=1});
