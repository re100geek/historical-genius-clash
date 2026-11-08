  /* HGC v14.3.5 ERA EXPEDITION — dedicated UI and existing 1v1 CPU battle bridge. */
  const EraViewModule = (() => {
    const rules = window.HGCEraExpeditionRules;
    const ids = roster.map(f => f.id);
    const storeNow = () => rules.read(localStorage,ids);
    const errorMessage = (msg) => {$('#eraStatus').textContent=msg;};
    function currentRun() {return storeNow().active;}
    function save(next) {return rules.persist(localStorage,next,ids);}
    function makeElement(tag,className,text) {
      const el=document.createElement(tag);
      if(className)el.className=className;
      if(text!==undefined)el.textContent=text;
      return el;
    }
    function start() {
      try {
        const store=storeNow();
        if(store.active)throw Error('진행 중인 탐험이 있습니다. 이어하거나 탐험 포기를 선택하세요.');
        const heroId=$('#eraHero').value;
        const fighter=roster.find(f=>f.id===heroId);
        if(!fighter)throw Error('캐릭터를 선택하세요.');
        const field=$('#eraSeed').value.trim();
        const seed=field?Number(field):crypto.getRandomValues(new Uint32Array(1))[0]||1;
        const run=rules.start({seed,heroId,startEra:$('#eraStartEra').value,baseHp:fighter.hp,rosterIds:ids});
        store.active=run;save(store);render();
        errorMessage('탐험 생성 완료 · 두 경로 중 하나를 선택하세요.');
      } catch(error) {errorMessage(error.message);}
    }
    function abandon() {
      const store=storeNow();
      if(!store.active)return;
      if(!window.confirm('현재 탐험을 종료하고 기록에 남기겠습니까?'))return;
      store.archive.push(rules.archive(store.active,'abandoned'));
      store.active=null;
      try {save(store);render();}catch(error){errorMessage('저장 실패: '+error.message);}
    }
    function choose(index) {
      try {
        const store=storeNow();
        if(!store.active)throw Error('먼저 탐험을 시작하세요.');
        const run=rules.choose(store.active,index,ids);
        store.active=run;
        if(run.status==='won'){
          store.archive.push(rules.archive(run,'won'));
          store.active=null;
        }
        save(store);
        render();
        if(run.pending)GameModule.startEraBattle(run,run.pending);
        else if(run.status==='won')errorMessage('3막 · 12개 노드 탐험 완료! 기록이 저장되었습니다.');
        else errorMessage('노드 효과가 저장됐습니다. 다음 경로를 선택하세요.');
      } catch(error){errorMessage('경로 선택 실패: '+error.message);}
    }
    function resume() {
      const run=currentRun();
      if(!run?.pending){errorMessage('이어 할 전투가 없습니다.');return;}
      if(!GameModule.startEraBattle(run,run.pending))errorMessage('전투를 시작할 수 없습니다. 저장 데이터를 확인하세요.');
    }
    function settleBattle(won,hp,energy) {
      const store=storeNow();
      if(!store.active?.pending)throw Error('진행 중인 탐험 전투 기록이 없습니다.');
      const updated=rules.settle(store.active,won,hp,energy,ids);
      if(updated.status==='won'||updated.status==='failed') {
        store.archive.push(rules.archive(updated,updated.status));
        store.active=null;
      } else store.active=updated;
      save(store);
      render();
      if (updated.status==='won') errorMessage('시대 탐험 완주! 3막 · 12노드 결과를 기록했습니다.');
      else if (updated.status==='failed') errorMessage('탐험 패배 · 이번 선택 경로를 기록했습니다. 새 탐험을 시작할 수 있습니다.');
      else errorMessage('전투 승리 · 다음 두 갈래 경로를 선택하세요.');
      return updated.status;
    }
    function render() {
      const store=storeNow(),run=store.active;
      $('#eraNewRun').disabled=Boolean(run);
      $('#eraAbandon').disabled=!run;
      $('#eraStartFields').hidden=Boolean(run);
      $('#eraContinue').hidden=!run?.pending;
      $('#eraProgress').textContent=run?`${run.step}/12 노드 · ${Math.floor(run.step/4)+1}/3 막`:'탐험 준비 · 3막 / 12개 노드';
      $('#eraStatusLine').textContent=run?`${roster.find(f=>f.id===run.heroId)?.name||run.heroId} · ${rules.eraAt(run).label} · 체력 ${run.hp}/${run.baseHp+run.maxHpBonus} · 에너지 ${run.energy}% · 시드 ${run.seed}`:'17명 중 도전자를 선택하고 탐험을 시작하세요.';
      const timeline=$('#eraTimeline');timeline.replaceChildren();
      for(let step=0;step<12;step++){
        const phase=makeElement('span','era-step'+(run?.history[step]?' cleared':run?.step===step?' current':''),
          `${Math.floor(step/4)+1}-${step%4+1}`);
        phase.title=run?.history[step]?.title||`제${Math.floor(step/4)+1}막 ${step%4+1}번째 노드`;
        timeline.appendChild(phase);
      }
      const nodes=$('#eraOptions');nodes.replaceChildren();
      if(run?.pending) {
        const desc=makeElement('div','era-pending',`전투 대기 · ${run.pending.title} · 상대 ${roster.find(f=>f.id===run.pending.rivalId)?.name||run.pending.rivalId}`);
        nodes.append(desc);
      } else if(run) {
        rules.options(run,ids).forEach((choice,i)=>{
          const button=makeElement('button','era-choice');button.type='button';
          const name=makeElement('strong','',`경로 ${i===0?'A':'B'} · ${choice.title}`);
          const details=makeElement('span','',`${choice.detail} · ${choice.reward}`);
          const danger=makeElement('small','',choice.kind==='boss'?'막 보스 · CPU 전투':choice.kind==='battle'?'CPU 전투': '전투 없이 진행');
          button.append(name,details,danger);
          button.addEventListener('click',()=>choose(i));nodes.append(button);
        });
      } else nodes.append(makeElement('p','','도전자를 선택하고 탐험을 시작하면 두 갈래 길이 열립니다.'));
      const history=$('#eraHistory');history.replaceChildren();
      const items=run?.history||[];
      if(items.length) for(const item of items.slice(-6))history.append(makeElement('li','',`${Math.floor(item.step/4)+1}막 · ${item.title} · ${item.kind==='boss'?'막 보스 승리':item.kind==='battle'?'전투 승리':'이벤트 완료'}`));
      else history.append(makeElement('li','','현재 탐험에서 지나온 경로가 여기에 표시됩니다.'));
      const archive=$('#eraArchive');archive.replaceChildren();
      const record=store.archive.slice(-5).reverse();
      for(const item of record) archive.append(makeElement('li','',`${item.result==='won'?'완주':item.result==='failed'?'패배':'포기'} · ${roster.find(f=>f.id===item.heroId)?.name||item.heroId} · ${item.steps}/12 · 시드 ${item.seed}`));
      if(!record.length)archive.append(makeElement('li','','완료된 탐험 기록이 없습니다.'));
    }
    function mount() {
      const select=$('#eraHero');
      for(const f of roster){const option=makeElement('option','',f.name);option.value=f.id;select.append(option);}
      $('#eraNewRun').addEventListener('click',start);
      $('#eraContinue').addEventListener('click',resume);
      $('#eraAbandon').addEventListener('click',abandon);
      render();
    }
    return Object.freeze({mount,render,start,choose,resume,currentRun,settleBattle,eraAt:rules.eraAt});
  })();
