/* HGC v14.3.5 · deterministic 3-act / 12-node roguelike route rules.
 * Browser UMD + Node tests. Never mutates the canonical HGC fighter definitions.
 */
(function (root, factory) {
  'use strict';
  const moduleRules = factory();
  if (typeof module === 'object' && module.exports) module.exports = moduleRules;
  if (root) root.HGCEraExpeditionRules = moduleRules;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const KEY = 'historicalGeniusClash.eraExpedition.v1';
  const ERAS = Object.freeze([
    {id:'ancient', label:'고대', stage:'agora', rivals:['alexander','socrates','plato','hannibal']},
    {id:'renaissance', label:'르네상스', stage:'workshop', rivals:['davinci','galileo','leibniz','handel','bach']},
    {id:'modern', label:'근현대', stage:'laboratory', rivals:['newton','curie','tesla','ada','jackson','jordan','pele','yisunshin']}
  ]);
  const MAX_STEPS = 12;
  const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
  function hash(...args) {
    let h = 2166136261;
    for(const c of args.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h >>> 0;
  }
  function validHero(id, rosterIds) {
    return typeof id === 'string' && Array.isArray(rosterIds) && rosterIds.includes(id);
  }
  function start({seed, heroId, startEra='ancient', baseHp, rosterIds}) {
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > 4294967295) throw Error('시드는 1~4294967295의 정수여야 합니다.');
    if (!validHero(heroId,rosterIds)) throw Error('등록되지 않은 캐릭터입니다.');
    if (!ERAS.some(era=>era.id===startEra)) throw Error('지원하지 않는 탐험 출발 시대입니다.');
    if (!Number.isFinite(baseHp) || baseHp < 1 || baseHp > 20000) throw Error('캐릭터 최대 체력 정보가 잘못되었습니다.');
    return {v:1,seed,heroId,startEra,baseHp:Math.round(baseHp),step:0,
      hp:Math.round(baseHp),energy:0,maxHpBonus:0,history:[],pending:null,
      status:'active',pathHash:hash(seed,heroId,startEra),relics:[]};
  }
  function eraAt(run) {
    const origin=ERAS.findIndex(x=>x.id===run.startEra);
    return ERAS[(origin+Math.floor(run.step/4))%3];
  }
  function opponents(era,heroId,rosterIds) {
    const eligible=era.rivals.filter(id=>id!==heroId && rosterIds.includes(id));
    return eligible.length ? eligible : rosterIds.filter(id=>id!==heroId);
  }
  const ROUTES=[['battle','event'],['rest','research'],['battle','event']];
  function options(run,rosterIds) {
    if (!run || run.status!=='active' || run.step>=MAX_STEPS || !validHero(run.heroId,rosterIds)) return [];
    const era=eraAt(run), slot=run.step%4, act=Math.floor(run.step/4);
    const types=slot===3?['boss','boss']:((act+slot+run.pathHash)%2 ? ROUTES[slot].slice().reverse() : ROUTES[slot]);
    const opponentIds=opponents(era,run.heroId,rosterIds);
    return types.map((kind,index)=>{
      const h=hash(run.seed,run.pathHash,run.step,index,kind);
      const rivalId=opponentIds[h%opponentIds.length];
      const approach=index===0?'탐구':'도전';
      const reward=kind==='rest'?'체력 회복':kind==='research'?'최대 체력·에너지 강화':kind==='event'?(h%2?'회복 기록':'비전 기록'):'전투 승리 후 다음 경로';
      const title=kind==='boss'?`${era.label} 기록 수호자 · ${approach}`:
        kind==='battle'?`${era.label}의 결투 · ${approach}`:kind==='rest'?'회복의 쉼터':kind==='research'?'기록 연구소':'갈림길의 고문서';
      const detail=kind==='boss'?`제${act+1}막 최종 결투 · ${rivalId}`:
        kind==='battle'?`CPU 대결 · 상대 ${rivalId}`:
        kind==='rest'?'현재 체력을 160 회복합니다.':
        kind==='research'?'이번 탐험에서 최대 체력 +80, 에너지 +20':
        h%2?'체력 100 회복':'에너지 25 획득';
      return {id:`${run.step}:${index}:${h}`,index,kind,title,detail,era:era.id,stage:era.stage,
        rivalId:kind==='boss'||kind==='battle'?rivalId:null,reward, variant:h%2,
        difficulty:kind==='boss'?(act===2?'hard':'normal'):(act===0?'easy':'normal')};
    });
  }
  function isValid(run,rosterIds) {
    if (!run || run.v!==1 || !validHero(run.heroId,rosterIds) || !ERAS.some(e=>e.id===run.startEra)) return false;
    if (!Number.isSafeInteger(run.seed) || run.seed<1 || run.seed>4294967295) return false;
    if (!Number.isInteger(run.step) || run.step<0 || run.step>MAX_STEPS) return false;
    if (!Number.isFinite(run.baseHp) || run.baseHp<1 || run.baseHp>20000) return false;
    if (!Number.isFinite(run.maxHpBonus) || run.maxHpBonus<0 || run.maxHpBonus>1500) return false;
    if (!Number.isFinite(run.hp) || run.hp<0 || run.hp>run.baseHp+run.maxHpBonus) return false;
    if (!Number.isFinite(run.energy) || run.energy<0 || run.energy>100) return false;
    if (!['active','won','failed'].includes(run.status) || !Number.isSafeInteger(run.pathHash)) return false;
    if (!Array.isArray(run.history) || run.history.length!==run.step || run.history.length>MAX_STEPS) return false;
    if (run.history.some((item,i)=>!item || item.step!==i || ![0,1].includes(item.choice))) return false;
    if (run.status==='active' && run.step===MAX_STEPS) return false;
    if (run.status==='won' && run.step!==MAX_STEPS) return false;
    if (run.pending) {
      if (run.pending.step!==run.step || !['boss','battle'].includes(run.pending.kind)) return false;
      // Reject altered pending rivals or fabricated rewards from damaged saves.
      const expected=options(run,rosterIds).find(x=>x.id===run.pending.id);
      if (!expected || expected.kind!==run.pending.kind || expected.rivalId!==run.pending.rivalId ||
          expected.stage!==run.pending.stage || expected.difficulty!==run.pending.difficulty) return false;
    }
    return true;
  }
  function advance(run,option,combatResult) {
    const maxHp=run.baseHp+run.maxHpBonus;
    const updated={...run,history:run.history.concat([{step:run.step,era:option.era,
      choice:option.index,kind:option.kind,title:option.title,result:combatResult?'victory':'event',rivalId:option.rivalId}]),
      pending:null,step:run.step+1,pathHash:hash(run.pathHash,option.id)};
    if (option.kind==='rest') updated.hp=clamp(run.hp+160,1,maxHp);
    else if (option.kind==='research') {updated.maxHpBonus=clamp(run.maxHpBonus+80,0,1500);updated.hp=clamp(run.hp+80,1,run.baseHp+updated.maxHpBonus);updated.energy=clamp(run.energy+20,0,100);}
    else if (option.kind==='event') {
      if(option.variant)updated.hp=clamp(run.hp+100,1,maxHp);
      else updated.energy=clamp(run.energy+25,0,100);
    } else if (combatResult) {
      updated.hp=clamp(combatResult.hp,1,maxHp);updated.energy=clamp(combatResult.energy,0,100);
    }
    if (updated.step>=MAX_STEPS) updated.status='won';
    return updated;
  }
  function choose(run,index,rosterIds) {
    if (!isValid(run,rosterIds) || run.status!=='active' || run.pending) throw Error('현재 탐험에서 경로를 선택할 수 없습니다.');
    const selection=options(run,rosterIds)[index];
    if (!selection || ![0,1].includes(index)) throw Error('선택지가 유효하지 않습니다.');
    if (selection.kind==='battle' || selection.kind==='boss') return {...run,pending:{...selection,step:run.step}};
    return advance(run,selection,null);
  }
  function settle(run,win,hp,energy,rosterIds) {
    if (!isValid(run,rosterIds) || !run.pending || run.status!=='active') throw Error('전투 결과를 처리할 수 없습니다.');
    if (!Number.isFinite(hp) || !Number.isFinite(energy)) throw Error('체력·에너지 수치가 잘못되었습니다.');
    if (!win) return {...run,hp:0,energy:0,status:'failed',pending:null};
    return advance(run,run.pending,{hp,energy});
  }
  function normalizeStore(value,rosterIds) {
    if (!value || typeof value!=='object' || Array.isArray(value)) return {v:1,active:null,archive:[]};
    const archive=Array.isArray(value.archive)?value.archive.filter(x=>x && ['won','failed','abandoned'].includes(x.result)
      && Number.isInteger(x.steps) && x.steps>=0 && x.steps<=MAX_STEPS).slice(-20):[];
    return {v:1,active:isValid(value.active,rosterIds) && value.active.status==='active'?value.active:null,archive};
  }
  function read(storage,rosterIds) {
    try {return normalizeStore(JSON.parse(storage.getItem(KEY)||'null'),rosterIds);}
    catch {return normalizeStore(null,rosterIds);}
  }
  function persist(storage,store,rosterIds) {
    const safe=normalizeStore(store,rosterIds);
    storage.setItem(KEY,JSON.stringify(safe));
    return safe;
  }
  function archive(run,result) {
    return {heroId:run.heroId,startEra:run.startEra,seed:run.seed,steps:run.step,
      result,branches:run.history.map(x=>x.choice).join(''),finishedAt:new Date().toISOString()};
  }
  return Object.freeze({KEY,ERAS,MAX_STEPS,hash,start,options,choose,settle,isValid,read,persist,archive,normalizeStore,eraAt});
});
