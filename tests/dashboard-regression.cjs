process.env.TZ='America/Chicago';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const src=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
function use(c,s,name,indent='  '){let a=s.indexOf(`${indent}function ${name}(`),b=s.indexOf(`\n${indent}function `,a+1);vm.runInContext(s.slice(a,b),c)}
class Clock extends Date{constructor(...a){super(...(a.length?a:['2026-09-18T02:00:00Z']))}static now(){return new Date('2026-09-18T02:00:00Z').valueOf()}}
let logs={a:[{createdAt:'2026-09-16T12:00:00Z'},{createdAt:'2026-01-01T12:00:00Z'}],b:[{at:'2026-09-17T12:00:00Z'}],c:[]};
const tasks=[{title:'due',due_date:'2026-09-17',status:'Open'},{due_date:'2026-09-17',status:'Completed'},{due_date:'2026-09-17',status:'Cancelled'},{dueDate:'2026-09-16'},{due_date:'2026-09-18'}];
const deals=[{stage:'Project Completed',amount:100,closeDate:'2020-01-01'},{stage:'Graveyard',amount:200,closeDate:'2020-01-01'},{stage:'Bidding',amount:300,closeDate:'2026-09-16'}];
const c={Date:Clock,activities:()=>logs,accounts:()=>[{id:'a'},{id:'b'},{id:'c'}],tasks:()=>tasks,pipeline:()=>deals};vm.createContext(c);
for(const n of ['todayIso','daysSince','tasksDue','coldAccounts','pipelineStats','overdueDeals','esc','renderColdAccounts'])use(c,src('today.js'),n);
assert.equal(c.todayIso(),'2026-09-17');assert.equal(c.tasksDue().length,2);assert.equal(c.coldAccounts().length,1);assert.equal(c.coldAccounts()[0].id,'c');assert.match(c.renderColdAccounts(c.coldAccounts()),/No contact logged/);assert.equal(c.pipelineStats().openCount,1);assert.equal(c.pipelineStats().openValue,300);assert.equal(c.overdueDeals().length,1);
c.localStorage={getItem:()=>JSON.stringify(logs)};use(c,src('territory.js'),'buildPopup');assert.match(c.buildPopup({id:'a'}),/9\/16\/2026/);assert(!c.buildPopup({id:'a'}).includes('Never'));
const p={localStorage:{getItem:()=>JSON.stringify([{stage:'Lost'},{stage:'Won'}]),setItem(){}},STAGE_MIGRATE:{}};vm.createContext(p);const pipeline=src('pipeline.js');const start=pipeline.indexOf('  const STAGE_MIGRATE');vm.runInContext(pipeline.slice(start,pipeline.indexOf('\n\n',start)),p);use(p,pipeline,'load');assert.equal(p.load()[0].stage,'Graveyard');assert.equal(p.load()[1].stage,'Project Completed');
const a={Date:Clock,taskDefaultAssignedUser:()=>'',normalizedPunchItem:x=>x};vm.createContext(a);for(const n of ['normalizedTask','normalizedPunchList'])use(a,src('app.js'),n,'');assert.equal(a.normalizedTask({}).due_date,'');assert.equal(a.normalizedTask({dueDate:'2026-10-01'}).due_date,'2026-10-01');assert.equal(a.normalizedPunchList({}).due_date,'');
console.log('PASS: local-calendar dates, canonical task fields/statuses, newest contact across activity formats, honest no-contact labels, closed pipeline exclusion, lost-deal migration, and preserved blank due dates.');
