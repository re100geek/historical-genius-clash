'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../src/modes/era-expedition-rules');
const ids=['newton','leibniz','handel','bach','davinci','galileo','curie','tesla','ada','alexander','socrates','plato','hannibal','jackson','jordan','pele','yisunshin'];
const make=(seed=42,era='ancient')=>rules.start({seed,heroId:'newton',startEra:era,baseHp:1060,rosterIds:ids});
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),values}};
test('three acts, four nodes per act, two deterministic branches; two routes change history',()=>{
 const a=make(410),b=make(410);assert.deepEqual(rules.options(a,ids),rules.options(b,ids));
 assert.equal(rules.options(a,ids).length,2);assert.notEqual(rules.options(a,ids)[0].id,rules.options(a,ids)[1].id);
 const left=rules.choose(a,0,ids),right=rules.choose(b,1,ids);
 assert.notDeepEqual(left.pending||left.history,right.pending||right.history);
});
test('all 12 nodes finish with exactly 3 bosses and no rival self-matches',()=>{
 let run=make(555,'renaissance'),bosses=0;
 while(run.status==='active'){
  const candidates=rules.options(run,ids);assert.equal(candidates.length,2);
  const c=candidates[0];assert.ok(c.era);
  if(run.step%4===3){assert.equal(c.kind,'boss');bosses++;}
  run=rules.choose(run,0,ids);
  if(run.pending){assert.notEqual(run.pending.rivalId,run.heroId);run=rules.settle(run,true,Math.min(500,run.baseHp+run.maxHpBonus),20,ids);}
  assert.ok(run.step<=12);
 }
 assert.equal(run.step,12);assert.equal(run.history.length,12);assert.equal(bosses,3);assert.equal(run.status,'won');
 assert.equal(rules.options(run,ids).length,0);
});
test('battle is pending until a real result; duplicates cannot advance',()=>{
 let run=make(333);
 // Find the first battle through any branch on step zero.
 const idx=rules.options(run,ids).findIndex(n=>n.kind==='battle');assert.ok(idx>=0);
 run=rules.choose(run,idx,ids);assert.equal(run.step,0);assert.ok(run.pending);
 assert.throws(()=>rules.choose(run,0,ids));
 const completed=rules.settle(run,true,300,68,ids);
 assert.equal(completed.step,1);assert.equal(completed.hp,300);assert.equal(completed.energy,68);
 assert.equal(completed.pending,null);
 assert.throws(()=>rules.settle(completed,true,300,68,ids));
});
test('loss ends run and preserves no pending replay',()=>{
 const run=make(335);const index=rules.options(run,ids).findIndex(x=>x.kind==='battle');
 const pending=rules.choose(run,index,ids);const result=rules.settle(pending,false,0,12,ids);
 assert.equal(result.status,'failed');assert.equal(result.pending,null);
 assert.equal(result.step,0);
 assert.equal(rules.archive(result,'failed').result,'failed');
});
test('rest and research provide only within-run bonuses; originals remain unchanged',()=>{
 let run=make(563);
 const initial=rules.options(run,ids).findIndex(n=>n.kind==='event');
 if(initial>=0)run=rules.choose(run,initial,ids);
 else {run=rules.choose(run,0,ids);run=rules.settle(run,true,400,15,ids);}
 assert.equal(run.step,1);
 const index=rules.options(run,ids).findIndex(n=>n.kind==='research');assert.ok(index>=0);
 const originalHp=run.baseHp;
 run=rules.choose(run,index,ids);
 assert.equal(run.step,2);assert.equal(run.maxHpBonus,80);assert.equal(run.baseHp,originalHp);
 assert.ok(run.energy>=20);
});
test('save, reload, pending resume and malformed-save fallback',()=>{
 const db=storage();let store={v:1,active:make(17),archive:[]};store.active=rules.choose(store.active,0,ids);
 rules.persist(db,store,ids);
 assert.deepEqual(rules.read(db,ids).active,store.active);
 const x=rules.read(db,ids).active;if(x.pending){assert.equal(rules.options(x,ids).length,2);}
 db.setItem(rules.KEY,'{malformed');assert.equal(rules.read(db,ids).active,null);
 const corrupted={v:1,active:{...make(17),step:99},archive:[]};db.setItem(rules.KEY,JSON.stringify(corrupted));
 assert.equal(rules.read(db,ids).active,null);
});
test('invalid IDs and seeds are rejected; unrelated mode keys stay untouched',()=>{
 assert.throws(()=>rules.start({seed:0,heroId:'newton',rosterIds:ids,baseHp:1000}));
 assert.throws(()=>rules.start({seed:77,heroId:'bogus',rosterIds:ids,baseHp:1000}));
 const db=storage();db.setItem('historicalGeniusClash.tower.v1','{"newton":37}');
 rules.persist(db,{v:1,active:make(),archive:[]},ids);
 assert.equal(db.getItem('historicalGeniusClash.tower.v1'),'{"newton":37}');
});

test('tampered pending encounter cannot swap rival or stage',()=>{
 const run=make(771);const index=rules.options(run,ids).findIndex(x=>x.kind==='battle');
 const chosen=rules.choose(run,index,ids);
 assert.equal(rules.isValid(chosen,ids),true);
 assert.equal(rules.isValid({...chosen,pending:{...chosen.pending,rivalId:'made-up'}},ids),false);
 assert.equal(rules.isValid({...chosen,pending:{...chosen.pending,stage:'fake'}},ids),false);
});
