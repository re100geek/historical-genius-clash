'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/modes/tag-team-rules.js');
const mock=(id, hp=100)=>({id,hp,maxHp:100,attack:0,hitStun:0,ult:0,ground:true,energy:0});
test('tag roster requires exactly two unique characters on each side',()=>{
  assert.equal(rules.validateTeams([[0,1],[2,3]],17),true);
  assert.equal(rules.validateTeams([[0,0],[1,2]],17),false);
  assert.equal(rules.validateTeams([[0,1],[2,17]],17),false);
  assert.equal(rules.validateTeams([[0,1],[2,-1]],17),false);
  assert.equal(rules.validateTeams([[0,1],[2]],17),false);
  assert.equal(rules.validateTeams([[0,1],[0,1]],17),true);
});
test('manual tag preserves both actors unique HP and special meter, enforces cooldown',()=>{
  const first=mock('newton',47);first.energy=73;
  const reserve=mock('leibniz',80);reserve.energy=12;
  const team=rules.createTeam(first,reserve);
  assert.equal(rules.canTag(team,0,false),true);
  const tag=rules.swap(team,0,false);
  assert.equal(tag.incoming,reserve);
  assert.equal(first.hp,47);assert.equal(first.energy,73);
  assert.equal(reserve.hp,80);assert.equal(reserve.energy,12);
  assert.equal(rules.canTag(team,100,false),false);
  assert.equal(rules.canTag(team,180,false),true);
  const back=rules.swap(team,180,false);
  assert.equal(back.incoming,first);
});
test('tag blocked while being hit or attacking; KO forces surviving reserve',()=>{
  const a=mock('a',100),b=mock('b',99);
  const team=rules.createTeam(a,b);
  a.hitStun=10;assert.equal(rules.canTag(team,0,false),false);
  a.hitStun=0;a.attack=8;assert.equal(rules.canTag(team,0,false),false);
  a.attack=0;a.ground=false;assert.equal(rules.canTag(team,0,false),false);
  a.ground=true;a.hp=0;
  assert.equal(rules.canTag(team,0,false),false);
  assert.equal(rules.canTag(team,0,true),true);
  assert.equal(rules.swap(team,0,true).incoming,b);
  assert.equal(rules.hasFighters(team),true);
  b.hp=0;assert.equal(rules.nextAvailable(team),-1);
  assert.equal(rules.hasFighters(team),false);
});

test('timer victory compares both living and knocked-out team members without overflow',()=>{
  const left=rules.createTeam(mock('a',0),mock('b',50));
  const right=rules.createTeam(mock('c',60),mock('d',0));
  assert.equal(rules.teamHealthRatio(left),0.5);
  assert.equal(rules.teamHealthRatio(right),0.6);
  right.members[0].hp=300;
  assert.equal(rules.teamHealthRatio(right),1);
});
