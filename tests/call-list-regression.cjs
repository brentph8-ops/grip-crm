const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const src=fs.readFileSync(require('node:path').join(__dirname, '../src/app.js'),'utf8');
const storage=new Map(), fields={accountId:{value:'a'},activity:{value:'draft'}};
const form={elements:fields,reset(){fields.accountId.value='';fields.activity.value=''}};
const elements={callActivityForm:form,callActivityAccountId:fields.accountId,callActivityDay:{},callActivityComplete:{},callActivityTitle:{},callActivityDetails:{},callActivityDialog:{close(){}}};
const c={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID},state:{activities:{},callLists:{completed:{}}},Date,byId:id=>elements[id],cleanAccounts:()=>[{id:'a',client:'A'},{id:'b',client:'B'}],latestAccountActivity:()=>null,field:()=>'',buildFullAddress:()=>'',openDialog(){},renderCallList(){},saveCallLists(){storage.set('calls',JSON.stringify(c.state.callLists))},callCompletionKey:(day,id)=>day+'|'+id,addAccountActivity:(id,note)=>{c.state.activities[id]=note},alert:()=>{throw Error('unexpected alert')}};
vm.createContext(c);
for(const name of ['completeCallListItem','openCallActivityDialog','callActivityDraftKey','saveCallActivityDraft','saveCallActivity']){const a=src.indexOf('function '+name+'('),b=src.indexOf('\nfunction ',a+1);vm.runInContext(src.slice(a,b),c)}
c.saveCallActivityDraft();c.openCallActivityDialog('b','Monday',true);assert.equal(fields.activity.value,'');c.openCallActivityDialog('a','Monday',true);assert.equal(fields.activity.value,'draft');
c.saveCallActivity(new Map([['accountId','a'],['activity','first note'],['completeCall','yes'],['day','Monday']]));c.saveCallActivity(new Map([['accountId','b'],['activity','second note'],['completeCall','yes'],['day','Monday']]));
assert(c.state.callLists.completed['Monday|a']);assert(c.state.callLists.completed['Monday|b']);assert.equal(c.state.activities.a,'first note');assert.equal(c.state.activities.b,'second note');assert.equal(storage.get(c.callActivityDraftKey('a')),undefined);
console.log('PASS: consecutive client checkmarks and notes, separate drafts, draft restoration, and draft cleanup.');
