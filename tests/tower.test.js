'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const begin=source.indexOf('const TowerRules = (() => {');
const end=source.indexOf('  const TowerViewModule = (() => {',begin);
assert.ok(begin>0 && end>begin,'Original TowerRules must remain available');
const moduleMock={exports:{}};
vm.runInNewContext(source.slice(begin,end),{module:moduleMock});
const TowerRules=moduleMock.exports;
function storage(){const state=new Map();return {
  getItem:key=>state.has(key)?state.get(key):null,
  setItem:(key,value)=>state.set(key,String(value)),
  removeItem:key=>state.delete(key)
};}
test('99 distinct wins; progression exactly one floor per win',()=>{
 const s=storage();
 assert.equal(TowerRules.read(s,'newton'),1);
 for(let f=1;f<=99;f++){
  assert.equal(TowerRules.read(s,'newton'),f);
  assert.equal(TowerRules.win(s,'newton',f),true);
  assert.equal(TowerRules.win(s,'newton',f),false,'cannot repeat one floor');
 }
 assert.equal(TowerRules.read(s,'newton'),100);
 assert.equal(TowerRules.win(s,'newton',100),false);
 assert.equal(TowerRules.read(s,'pele'),1,'separate character progress');
});
test('corrupt, invalid and old records do not skip floors',()=>{
 const s=storage();
 s.setItem(TowerRules.key,'broken');
 assert.equal(TowerRules.read(s,'jackson'),1);
 s.setItem(TowerRules.key,JSON.stringify({jackson:-1,jordan:101,pele:37}));
 assert.equal(TowerRules.read(s,'jackson'),1);
 assert.equal(TowerRules.read(s,'jordan'),1);
 assert.equal(TowerRules.read(s,'pele'),37);
 assert.equal(TowerRules.win(s,'pele',33),false);
 assert.equal(TowerRules.read(s,'pele'),37);
});
test('every floor chooses a different valid opponent',()=>{
 for(let hero=0;hero<17;hero++)for(let floor=1;floor<=99;floor++){
  const foe=TowerRules.rival(hero,floor,17);
  assert.ok(Number.isInteger(foe)&&foe>=0&&foe<17);
  assert.notEqual(foe,hero);
 }
});
