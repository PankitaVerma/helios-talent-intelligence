(() => {
  'use strict';

  const BASE = window.HELIOS_DATA;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let state = {
    data: clone(BASE),
    view: 'overview',
    selectedEmployeeId: 'E001',
    selectedTargetRole: 'Cyber Risk Analyst',
    marketType: 'All',
    workforceDemandId: 'D001',
    lastPlan: null,
    pulseRan: false
  };

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const clamp = (n,min=0,max=100) => Math.max(min, Math.min(max,n));
  const gradeNum = g => Number(String(g || '').replace(/\D/g,'')) || 0;
  const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const initials = name => name.split(' ').slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const fmt = n => new Intl.NumberFormat('en-IN').format(Math.round(n));

  const getEmployee = id => state.data.employees.find(e => e.id === id);
  const getRole = name => state.data.roles.find(r => r.name === name);
  const getDemand = id => state.data.workforceDemands.find(d => d.id === id);

  function skillFit(employee, requirements) {
    const entries = Object.entries(requirements || {});
    if (!entries.length) return 0;
    const ratios = entries.map(([skill, req]) => Math.min((employee.skills[skill] || 0) / req, 1));
    return Math.round((ratios.reduce((a,b)=>a+b,0) / ratios.length) * 100);
  }

  function readinessScore(employee, role) {
    if (!employee || !role) return 0;
    const s = skillFit(employee, role.skills);
    const perf = clamp(((employee.performance || 3) / 5) * 100);
    const pot = employee.potential === 'High' ? 92 : employee.potential === 'Medium' ? 72 : 58;
    const aspiration = employee.aspiration === role.name ? 100 : 62;
    const mobility = employee.mobility ? 100 : 55;
    return Math.round(s*.60 + perf*.12 + pot*.10 + aspiration*.10 + mobility*.08);
  }

  function gapsFor(employee, requirements) {
    return Object.entries(requirements || {}).map(([skill, required]) => {
      const current = employee.skills[skill] || 0;
      return {skill, current, required, gap: Math.max(0, required-current)};
    }).sort((a,b)=>b.gap-a.gap);
  }

  function recommendedCourse(gap) {
    return state.data.courses
      .filter(c => c.skill === gap.skill)
      .sort((a,b)=>b.gain-a.gain)[0] || null;
  }

  function projectedWeeks(employee, requirements) {
    const gaps = gapsFor(employee, requirements).filter(g=>g.gap>5);
    if (!gaps.length) return 0;
    const weeks = gaps.map(g => {
      const c = recommendedCourse(g);
      if (!c) return Math.ceil(g.gap / 4);
      return Math.ceil((g.gap / c.gain) * c.durationWeeks);
    });
    // Prototype assumes some learning can run in parallel; use max + small integration buffer.
    return Math.max(...weeks) + (gaps.length > 1 ? 2 : 0);
  }

  function actionFor(employee, role, startMonths=12) {
    const score = readinessScore(employee, role);
    const weeks = projectedWeeks(employee, role.skills);
    const available = employee.availability <= startMonths;
    if (score >= 80 && employee.mobility && available) return 'MOVE';
    if (score >= 58 && employee.mobility && available && weeks <= startMonths*4.35) return 'BUILD';
    return 'HOLD';
  }

  function workforcePlan(demand) {
    const role = getRole(demand.targetRole);
    const candidates = state.data.employees
      .map(e => ({employee:e, score:readinessScore(e,role), weeks:projectedWeeks(e,role.skills), action:actionFor(e,role,demand.startMonths)}))
      .sort((a,b)=>b.score-a.score);

    const moveCandidates = candidates.filter(c=>c.action==='MOVE');
    const buildCandidates = candidates.filter(c=>c.action==='BUILD');
    const borrow = Math.min(Math.max(0, Math.round(demand.headcount * ((demand.borrowPct || 8)/100))), demand.headcount);
    const remainingAfterBorrow = demand.headcount - borrow;
    const move = Math.min(moveCandidates.length, remainingAfterBorrow);
    const build = Math.min(buildCandidates.length, remainingAfterBorrow - move);
    const buy = Math.max(0, demand.headcount - move - build - borrow);

    return {
      role, candidates, moveCandidates:moveCandidates.slice(0,move), buildCandidates:buildCandidates.slice(0,build),
      counts:{move,build,buy,borrow},
      internalPct: demand.headcount ? Math.round(((move+build)/demand.headcount)*100) : 0,
      hiringAvoided: demand.headcount ? Math.round(((move+build+borrow)/demand.headcount)*100) : 0
    };
  }

  function bestFutureSkills() {
    const keySkills = ['Cybersecurity','AI Governance','GenAI Risk','Financial Crime Analytics','Regulatory Compliance'];
    return keySkills.map(skill => {
      const vals = state.data.employees.map(e=>e.skills[skill]||0);
      const coverage = Math.round(vals.filter(v=>v>=60).length / vals.length * 100);
      return {skill, coverage};
    }).sort((a,b)=>a.coverage-b.coverage);
  }

  function pill(text, type='neutral') { return `<span class="pill ${type}">${esc(text)}</span>`; }
  function matchType(score) { return score>=80?'success':score>=60?'warn':'danger'; }

  const titles = {
    overview:['Enterprise Talent View','Talent Overview'],
    workforce:['Strategic Workforce Planning','Workforce Planning'],
    marketplace:['Skills-Based Mobility','Internal Talent Marketplace'],
    copilot:['Employee Development','AI Career Copilot'],
    intelligence:['Enterprise Skills Graph','Talent Intelligence']
  };

  function setView(view) {
    state.view = view;
    $$('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
    $$('.view').forEach(v=>v.classList.toggle('active-view', v.id===view));
    $('#viewEyebrow').textContent = titles[view][0];
    $('#viewTitle').textContent = titles[view][1];
    $('#sidebar').classList.remove('open');
    renderView(view);
  }

  function renderView(view) {
    ({overview:renderOverview,workforce:renderWorkforce,marketplace:renderMarketplace,copilot:renderCopilot,intelligence:renderIntelligence}[view])();
  }

  function renderOverview() {
    const el = $('#overview');
    const skillHealth = bestFutureSkills();
    const cyber = skillHealth.find(x=>x.skill==='Cybersecurity')?.coverage || 0;
    const currentPlan = workforcePlan(getDemand('D001'));
    const mobilityReady = state.data.employees.filter(e=>e.mobility).length;
    const highPot = state.data.employees.filter(e=>e.potential==='High').length;
    const scale = 10240 / state.data.employees.length;

    el.innerHTML = `
      <div class="hero-strip">
        <div>
          <div class="hero-kicker">Future-ready HR • Skills-first workforce</div>
          <h2>See the capability Helios has, build what is missing, and move talent before buying externally.</h2>
          <p>One talent intelligence core connects workforce demand, employee skills, internal mobility and learning — turning fragmented HR data into explainable workforce decisions.</p>
        </div>
        <div class="hero-callout">
          <span>Current cyber growth scenario</span>
          <strong>${currentPlan.internalPct}%</strong>
          <span>of demand can be addressed through internal MOVE + BUILD in this prototype scenario.</span>
        </div>
      </div>

      <div class="grid grid-4 mt-20">
        ${metricCard('Enterprise workforce','10,240','Mapped across India','◎')}
        ${metricCard('Mobility-ready talent',fmt(mobilityReady*scale),'Skills + preference aligned','↗')}
        ${metricCard('High-potential pool',fmt(highPot*scale),'Visible beyond job title','✦')}
        ${metricCard('Cyber skill coverage',`${cyber}%`,'Critical future capability','◈', cyber<30?'risk':'')}
      </div>

      <div class="grid grid-2 mt-16">
        <div class="card card-pad">
          <div class="section-head"><div><h3>Future capability health</h3><p>Employees meeting at least intermediate proficiency in critical skills</p></div>${pill('Live skills graph','info')}</div>
          <div class="skill-list">
            ${skillHealth.map(s=>skillBar(s.skill,s.coverage)).join('')}
          </div>
        </div>
        <div class="card card-pad insight-card">
          <div class="section-head"><div><h3>AI workforce insight</h3><p>Explainable signal from the current prototype data</p></div>${pill('Human review','neutral')}</div>
          <div class="insight-line">
            <div class="insight-orb">✦</div>
            <div>
              <h4>${skillHealth[0].skill} is the thinnest internal capability pool.</h4>
              <p>Prioritise adjacent-talent identification and targeted learning before opening broad external hiring. Employees from Risk, Analytics and Technology show useful skill adjacency for future-skill roles.</p>
            </div>
          </div>
          <div class="loader-line" style="display:${state.pulseRan?'block':'none'}"><span></span></div>
          <div class="scenario-note mt-16"><strong>Decision principle:</strong> AI recommends and explains. HR owns consequential decisions such as promotions, moves and hiring.</div>
        </div>
      </div>

      <div class="card card-pad mt-16">
        <div class="section-head"><div><h3>Priority workforce scenarios</h3><p>Where HR can simulate BUILD • MOVE • BUY • BORROW before committing spend</p></div><button class="secondary-btn" data-go="workforce">Open planner →</button></div>
        <div class="table-wrap"><table><thead><tr><th>Scenario</th><th>Target role</th><th>Demand</th><th>Start</th><th>Internal response</th><th>External gap</th></tr></thead><tbody>
          ${state.data.workforceDemands.map(d=>{ const p=workforcePlan(d); return `<tr><td><strong>${esc(d.name)}</strong><br><span class="subtle">${esc(d.department)}</span></td><td>${esc(d.targetRole)}</td><td>${d.headcount}</td><td>${d.startMonths} months</td><td>${pill(`${p.counts.move+p.counts.build} people`, 'success')}</td><td>${pill(`${p.counts.buy} hires`, p.counts.buy>5?'warn':'info')}</td></tr>`;}).join('')}
        </tbody></table></div>
      </div>`;

    $$('[data-go]',el).forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));
  }

  function metricCard(label,value,delta,icon,risk='') {
    return `<div class="card metric-card"><div class="metric-top"><div><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-delta" style="color:${risk?'var(--warn)':'var(--success)'}">${esc(delta)}</div></div><div class="metric-icon">${icon}</div></div></div>`;
  }

  function skillBar(name,value) {
    const cls = value<20?'danger':value<35?'warning':'';
    return `<div class="skill-row"><div class="skill-name">${esc(name)}</div><div class="bar-track"><div class="bar-fill ${cls}" style="width:${clamp(value)}%"></div></div><div class="bar-value">${value}%</div></div>`;
  }

  function renderWorkforce() {
    const el = $('#workforce');
    const d = getDemand(state.workforceDemandId) || state.data.workforceDemands[0];
    const plan = state.lastPlan && state.lastPlan.demandId===d.id ? state.lastPlan.plan : workforcePlan(d);

    el.innerHTML = `
      <div class="card card-pad">
        <div class="section-head"><div><h3>Model a future workforce requirement</h3><p>Change demand, timing or target capability and see the talent strategy recalculate.</p></div>${pill('Scenario engine','info')}</div>
        <div class="form-grid">
          <div class="field"><label>Business scenario</label><select id="demandSelect">${state.data.workforceDemands.map(x=>`<option value="${x.id}" ${x.id===d.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Required headcount</label><input id="headcountInput" type="number" min="1" max="250" value="${d.headcount}" /></div>
          <div class="field"><label>Time to deploy (months)</label><input id="startInput" type="number" min="1" max="36" value="${d.startMonths}" /></div>
          <div class="field"><label>Target role</label><select id="roleSelect">${state.data.roles.map(r=>`<option ${r.name===d.targetRole?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:13px"><button id="generatePlan" class="primary-btn">✦ Generate workforce plan</button></div>
      </div>

      <div class="grid grid-2 mt-16">
        <div class="card card-pad">
          <div class="section-head"><div><h3>Recommended talent mix</h3><p>For ${esc(d.targetRole)} demand</p></div>${pill(`${plan.internalPct}% internal`, plan.internalPct>=50?'success':'warn')}</div>
          <div class="strategy-grid">
            ${strategyCard('MOVE',plan.counts.move,'Ready internal talent','move')}
            ${strategyCard('BUILD',plan.counts.build,'Reskill adjacent talent','build')}
            ${strategyCard('BUY',plan.counts.buy,'External capability gap','buy')}
            ${strategyCard('BORROW',plan.counts.borrow,'Short-term specialists','borrow')}
          </div>
          <div class="scenario-note mt-16"><strong>${plan.hiringAvoided}% of demand</strong> can potentially be covered without permanent external hiring in this scenario. This is a prototype recommendation, not a production forecast.</div>
        </div>
        <div class="card card-pad">
          <div class="section-head"><div><h3>Critical skill requirement</h3><p>Target proficiency vs current internal availability</p></div></div>
          <div class="skill-list">
            ${Object.entries(plan.role.skills).map(([skill,req])=>{
              const qualified=state.data.employees.filter(e=>(e.skills[skill]||0)>=req).length;
              const coverage=Math.round(qualified/state.data.employees.length*100);
              return skillBar(`${skill} · ${req}+`,coverage);
            }).join('')}
          </div>
        </div>
      </div>

      <div class="card card-pad mt-16">
        <div class="section-head"><div><h3>Internal talent identified</h3><p>Ranked on skills, performance, potential, aspiration and mobility — with explainable gaps</p></div>${pill('No black-box decisions','neutral')}</div>
        <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Current role</th><th>Readiness</th><th>Availability</th><th>Reskill time</th><th>Recommended action</th><th></th></tr></thead><tbody>
          ${plan.candidates.slice(0,12).map(c=>`<tr><td><strong>${esc(c.employee.name)}</strong><br><span class="subtle">${esc(c.employee.department)}</span></td><td>${esc(c.employee.role)}</td><td>${pill(`${c.score}%`,matchType(c.score))}</td><td>${c.employee.availability===0?'Now':`${c.employee.availability} mo`}</td><td>${c.weeks?`${c.weeks} weeks`:'Ready'}</td><td>${pill(c.action,c.action==='MOVE'?'success':c.action==='BUILD'?'warn':'neutral')}</td><td><button class="link-btn" data-employee="${c.employee.id}">Why? →</button></td></tr>`).join('')}
        </tbody></table></div>
      </div>`;

    $('#demandSelect').addEventListener('change',e=>{
      state.workforceDemandId=e.target.value; state.lastPlan=null; renderWorkforce();
    });
    $('#generatePlan').addEventListener('click',()=>{
      const current = getDemand(state.workforceDemandId);
      current.headcount=clamp(Number($('#headcountInput').value)||1,1,250);
      current.startMonths=clamp(Number($('#startInput').value)||1,1,36);
      current.targetRole=$('#roleSelect').value;
      state.lastPlan={demandId:current.id, plan:workforcePlan(current)};
      showToast('Workforce scenario recalculated using the latest talent profile data.');
      renderWorkforce();
    });
    $$('[data-employee]',el).forEach(b=>b.addEventListener('click',()=>openEmployeeModal(b.dataset.employee, plan.role.name)));
  }

  function strategyCard(label,count,text,cls) {
    return `<div class="strategy-card ${cls}"><span>${label}</span><strong>${count}</strong><small>${esc(text)}</small></div>`;
  }

  function opportunityMatches(employee) {
    const roleItems = state.data.roles.filter(r=>r.name!==employee.role).map(r=>({
      kind:'Job', title:r.name, meta:r.department, score:readinessScore(employee,r), requirements:r.skills,
      detail:`Permanent internal role • ${r.level}`
    }));
    const projItems = state.data.projects.map(p=>({
      kind:p.type, title:p.name, meta:p.department, score:skillFit(employee,p.skills), requirements:p.skills,
      detail:`${p.duration} • ${p.openings} opening${p.openings===1?'':'s'}`
    }));
    return [...roleItems,...projItems].sort((a,b)=>b.score-a.score);
  }

  function renderMarketplace() {
    const el = $('#marketplace');
    const emp = getEmployee(state.selectedEmployeeId) || state.data.employees[0];
    const opportunities = opportunityMatches(emp).filter(o=>state.marketType==='All' || o.kind===state.marketType);
    const bestMentor = state.data.mentors.map(m=>({m,score:m.expertise.reduce((s,sk)=>s+(emp.skills[sk]||0),0)/Math.max(1,m.expertise.length)})).sort((a,b)=>b.score-a.score)[0]?.m;
    const aspRole = getRole(emp.aspiration);
    const gaps = aspRole ? gapsFor(emp,aspRole.skills).filter(g=>g.gap>5) : [];
    const courses = gaps.map(recommendedCourse).filter(Boolean).slice(0,3);

    el.innerHTML = `
      <div class="market-grid">
        <div class="card employee-focus">
          <div class="field"><label>Explore as employee</label><select id="marketEmployee">${state.data.employees.map(e=>`<option value="${e.id}" ${e.id===emp.id?'selected':''}>${esc(e.name)} — ${esc(e.role)}</option>`).join('')}</select></div>
          <div class="profile-head mt-16"><div class="avatar">${initials(emp.name)}</div><div><h3>${esc(emp.name)}</h3><p>${esc(emp.role)} · ${esc(emp.department)}</p></div></div>
          <div class="mt-16">
            <div class="stat-line"><span>Career aspiration</span><strong>${esc(emp.aspiration)}</strong></div>
            <div class="stat-line"><span>Mobility preference</span><strong>${emp.mobility?'Open':'Not open'}</strong></div>
            <div class="stat-line"><span>Available</span><strong>${emp.availability===0?'Now':`In ${emp.availability} months`}</strong></div>
            <div class="stat-line"><span>Potential</span><strong>${esc(emp.potential)}</strong></div>
          </div>
          <div class="mt-16"><div class="subtle" style="font-weight:800;margin-bottom:8px">RECOMMENDED DEVELOPMENT</div>
            ${courses.length?courses.map(c=>`<div class="tag" style="display:block;margin-bottom:6px">${esc(c.name)} · ${c.durationWeeks}w</div>`).join(''):'<div class="subtle">No major learning gap detected.</div>'}
          </div>
          ${bestMentor?`<div class="mt-16"><div class="subtle" style="font-weight:800;margin-bottom:8px">MENTOR MATCH</div><div class="insight-line"><div class="avatar small" style="background:var(--brand-soft);color:var(--brand)">${initials(bestMentor.name)}</div><div><h4>${esc(bestMentor.name)}</h4><p>${esc(bestMentor.role)} · ${bestMentor.slots} slot(s)</p></div></div></div>`:''}
        </div>

        <div>
          <div class="card card-pad">
            <div class="section-head"><div><h3>Opportunities matched beyond job title</h3><p>Skills + potential + aspiration + adjacent experience</p></div></div>
            <div style="display:flex;gap:7px;flex-wrap:wrap">
              ${['All','Job','Project','Short-term Gig'].map(t=>`<button class="${state.marketType===t?'primary-btn':'ghost-btn'} market-filter" data-type="${t}">${t}</button>`).join('')}
            </div>
          </div>
          <div class="opportunity-list mt-16">
            ${opportunities.slice(0,10).map(o=>opportunityCard(emp,o)).join('') || '<div class="empty-state">No opportunities match this filter.</div>'}
          </div>
        </div>
      </div>`;

    $('#marketEmployee').addEventListener('change',e=>{state.selectedEmployeeId=e.target.value;renderMarketplace();});
    $$('.market-filter',el).forEach(b=>b.addEventListener('click',()=>{state.marketType=b.dataset.type;renderMarketplace();}));
    $$('[data-open-opportunity]',el).forEach(b=>b.addEventListener('click',()=>openOpportunityModal(emp.id, decodeURIComponent(b.dataset.openOpportunity), b.dataset.kind)));
  }

  function opportunityCard(emp,o) {
    const gaps = gapsFor(emp,o.requirements).filter(g=>g.gap>5).slice(0,3);
    return `<div class="opportunity-card">
      <div class="opportunity-head"><div><div style="display:flex;gap:7px;align-items:center;margin-bottom:6px">${pill(o.kind,'info')} ${o.score>=80?pill('Mobility ready','success'):o.score>=60?pill('Build + move','warn'):pill('Development path','neutral')}</div><h4>${esc(o.title)}</h4><p>${esc(o.meta)} · ${esc(o.detail)}</p></div><div class="match-ring" style="--pct:${clamp(o.score)}%"><span>${o.score}%</span></div></div>
      <div class="tag-row">${gaps.length?gaps.map(g=>`<span class="tag">Gap: ${esc(g.skill)} +${g.gap}</span>`).join(''):'<span class="tag">Core capability matched</span>'}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:11px"><button class="link-btn" data-open-opportunity="${encodeURIComponent(o.title)}" data-kind="${esc(o.kind)}">See match explanation →</button></div>
    </div>`;
  }

  function renderCopilot() {
    const el = $('#copilot');
    const emp = getEmployee(state.selectedEmployeeId) || state.data.employees[0];
    let target = getRole(state.selectedTargetRole);
    if (!target) target = getRole(emp.aspiration) || state.data.roles[0];
    state.selectedTargetRole = target.name;
    const score = readinessScore(emp,target);
    const gaps = gapsFor(emp,target.skills).filter(g=>g.gap>5);
    const plan = buildCareerPlan(emp,target,gaps);

    el.innerHTML = `
      <div class="card card-pad">
        <div class="form-grid" style="grid-template-columns:1fr 1fr auto">
          <div class="field"><label>Employee</label><select id="copilotEmployee">${state.data.employees.map(e=>`<option value="${e.id}" ${e.id===emp.id?'selected':''}>${esc(e.name)} — ${esc(e.role)}</option>`).join('')}</select></div>
          <div class="field"><label>Target role</label><select id="copilotRole">${state.data.roles.map(r=>`<option ${r.name===target.name?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
          <div style="align-self:end"><button id="generateCareer" class="primary-btn">✦ Build pathway</button></div>
        </div>
      </div>

      <div class="copilot-layout mt-16">
        <div class="card chat-shell">
          <div class="chat-messages" id="chatMessages">
            <div class="msg ai"><strong>Helios Career Copilot</strong><br>I use your current skills, projects and aspirations to build an explainable development path. I will not make promotion decisions.</div>
            <div class="msg user">What should I learn to become a ${esc(target.name)}?</div>
            <div class="msg ai">You're currently <strong>${score}% ready</strong>. ${gaps.length?`Your biggest gaps are ${gaps.slice(0,3).map(g=>esc(g.skill)).join(', ')}.`:'You already match the key capability requirements.'} I’ve built a pathway using learning, experience and internal mobility.</div>
          </div>
          <div class="chat-input"><input id="careerQuestion" placeholder="Ask about skills, readiness, projects or mentors…" /><button id="askCareer" class="primary-btn">Ask</button></div>
        </div>

        <div class="card card-pad">
          <div class="section-head"><div><h3>${esc(emp.name)} → ${esc(target.name)}</h3><p>Dynamic pathway from current profile to target readiness</p></div>${pill(`${score}% ready`,matchType(score))}</div>
          <div class="grid grid-2">
            <div class="card card-pad" style="box-shadow:none;background:var(--panel-2)"><div class="metric-label">Current role</div><div style="font-weight:800;margin-top:5px">${esc(emp.role)}</div><div class="subtle">${esc(emp.department)} · ${esc(emp.grade)}</div></div>
            <div class="card card-pad" style="box-shadow:none;background:var(--panel-2)"><div class="metric-label">Estimated time-to-readiness</div><div style="font-weight:800;margin-top:5px">${plan.totalWeeks?`${plan.totalWeeks} weeks`:'Ready now'}</div><div class="subtle">Learning + experience pathway</div></div>
          </div>
          <div class="timeline mt-20">${plan.steps.map(s=>`<div class="timeline-item"><h4>${esc(s.title)}</h4><p>${esc(s.text)}</p></div>`).join('')}</div>
          ${plan.firstCourse?`<div class="scenario-note mt-20"><strong>Interactive demo:</strong> simulate completing <em>${esc(plan.firstCourse.name)}</em> and watch readiness update. <button id="completeLearning" class="link-btn" style="margin-left:4px">Complete learning →</button></div>`:''}
        </div>
      </div>`;

    $('#copilotEmployee').addEventListener('change',e=>{state.selectedEmployeeId=e.target.value; const n=getEmployee(e.target.value); state.selectedTargetRole=getRole(n.aspiration)?n.aspiration:state.selectedTargetRole; renderCopilot();});
    $('#copilotRole').addEventListener('change',e=>{state.selectedTargetRole=e.target.value;renderCopilot();});
    $('#generateCareer').addEventListener('click',()=>{showToast('Career pathway refreshed from the latest skills profile.');renderCopilot();});
    $('#askCareer').addEventListener('click',()=>answerCareerQuestion(emp,target));
    $('#careerQuestion').addEventListener('keydown',e=>{if(e.key==='Enter')answerCareerQuestion(emp,target);});
    if ($('#completeLearning')) $('#completeLearning').addEventListener('click',()=>completeFirstLearning(emp,target,plan));
  }

  function buildCareerPlan(emp,target,gaps) {
    const firstGap = gaps[0];
    const firstCourse = firstGap ? recommendedCourse(firstGap) : null;
    const courses = gaps.map(recommendedCourse).filter(Boolean).slice(0,2);
    const projMatches = state.data.projects.map(p=>({p,score:skillFit(emp,p.skills)})).filter(x=>x.score>=45).sort((a,b)=>b.score-a.score);
    const project = projMatches.find(x=>x.p.department===target.department)?.p || projMatches[0]?.p;
    const mentor = state.data.mentors.map(m=>({m,score:m.expertise.reduce((s,sk)=>s+(target.skills[sk]||0),0)})).sort((a,b)=>b.score-a.score)[0]?.m;
    const totalWeeks = Math.max(projectedWeeks(emp,target.skills), courses.reduce((s,c)=>s+c.durationWeeks,0));
    const steps = [
      {title:'1 · Understand your gap',text:`Current readiness ${readinessScore(emp,target)}%. ${gaps.length?`${gaps.length} capability gap(s) need attention.`:'Core requirements already met.'}`},
      ...(courses.length?[{title:'2 · Build targeted skills',text:courses.map(c=>`${c.name} (${c.durationWeeks}w)`).join(' + ')}]:[]),
      ...(project?[{title:'3 · Apply through experience',text:`Join ${project.name} — ${project.type.toLowerCase()}, ${project.duration}.`}]:[]),
      ...(mentor?[{title:'4 · Learn with a mentor',text:`Match with ${mentor.name}, ${mentor.role}, for role-context and feedback.`}]:[]),
      {title:'5 · Reassess readiness',text:'Skills and project evidence update the profile; the marketplace automatically recalculates role match.'},
      {title:'6 · Human-governed mobility',text:`Apply for ${target.name}. AI explains readiness; the employee and HR/manager retain decision authority.`}
    ];
    return {steps,totalWeeks,firstCourse};
  }

  function answerCareerQuestion(emp,target) {
    const input=$('#careerQuestion'); const q=(input.value||'').trim(); if(!q) return;
    const chat=$('#chatMessages');
    chat.insertAdjacentHTML('beforeend',`<div class="msg user">${esc(q)}</div>`);
    const lower=q.toLowerCase(); const gaps=gapsFor(emp,target.skills).filter(g=>g.gap>5);
    let answer;
    if(lower.includes('project')||lower.includes('gig')) {
      const best=state.data.projects.map(p=>({p,s:skillFit(emp,p.skills)})).sort((a,b)=>b.s-a.s)[0];
      answer=`Your strongest experience match is <strong>${esc(best.p.name)}</strong> at ${best.s}% skill fit. It can add evidence beyond classroom learning.`;
    } else if(lower.includes('mentor')) {
      const m=state.data.mentors[0]; answer=`A mentor is recommended after the first learning step. The marketplace currently has mentors across Cyber, Risk, Compliance, Financial Crime and L&D.`;
    } else if(lower.includes('promot')) {
      answer=`I can show <strong>promotion readiness evidence</strong>, but I do not approve promotions. Final decisions require human talent review, performance context and governance.`;
    } else if(lower.includes('skill')||lower.includes('learn')) {
      answer=gaps.length?`Prioritise <strong>${esc(gaps[0].skill)}</strong> first (gap ${gaps[0].gap} points), followed by ${gaps.slice(1,3).map(g=>esc(g.skill)).join(' and ') || 'role experience'}.`:`You already meet the main skill thresholds; focus next on project evidence and role exposure.`;
    } else {
      answer=`For ${esc(target.name)}, your current readiness is <strong>${readinessScore(emp,target)}%</strong>. I recommend combining targeted learning with an internal project/gig, then reassessing before mobility.`;
    }
    setTimeout(()=>{chat.insertAdjacentHTML('beforeend',`<div class="msg ai">${answer}</div>`); chat.scrollTop=chat.scrollHeight;},260);
    input.value='';
  }

  function completeFirstLearning(emp,target,plan) {
    const c=plan.firstCourse; if(!c) return;
    const before=readinessScore(emp,target);
    emp.skills[c.skill]=clamp((emp.skills[c.skill]||0)+c.gain);
    const after=readinessScore(emp,target);
    showToast(`${c.name} completed in demo: readiness ${before}% → ${after}%.`);
    renderCopilot();
  }

  function renderIntelligence() {
    const el=$('#intelligence');
    const departments=[...new Set(state.data.employees.map(e=>e.department))].sort();
    el.innerHTML=`
      <div class="card card-pad">
        <div class="section-head"><div><h3>Enterprise talent profiles</h3><p>Search people by role, skill, project, aspiration or business unit</p></div>${pill(`${state.data.employees.length} prototype profiles`,'info')}</div>
        <div class="search-row"><input id="talentSearch" placeholder="Search e.g. cyber, AML, Python, risk…" /><select id="deptFilter"><option>All departments</option>${departments.map(d=>`<option>${esc(d)}</option>`).join('')}</select><select id="potentialFilter"><option>All potential</option><option>High</option><option>Medium</option></select></div>
      </div>
      <div id="employeeGrid" class="employee-grid mt-16"></div>`;

    const draw=()=>{
      const q=$('#talentSearch').value.trim().toLowerCase(); const dept=$('#deptFilter').value; const pot=$('#potentialFilter').value;
      const filtered=state.data.employees.filter(e=>{
        const hay=[e.name,e.role,e.department,e.aspiration,...e.projects,...Object.keys(e.skills)].join(' ').toLowerCase();
        return (!q||hay.includes(q)) && (dept==='All departments'||e.department===dept) && (pot==='All potential'||e.potential===pot);
      });
      $('#employeeGrid').innerHTML=filtered.length?filtered.map(employeeCard).join(''):'<div class="empty-state" style="grid-column:1/-1">No talent profiles match the filters.</div>';
      $$('[data-profile]',$('#employeeGrid')).forEach(b=>b.addEventListener('click',()=>openEmployeeModal(b.dataset.profile)));
    };
    ['talentSearch','deptFilter','potentialFilter'].forEach(id=>$('#'+id).addEventListener(id==='talentSearch'?'input':'change',draw));
    draw();
  }

  function employeeCard(e) {
    const topSkills=Object.entries(e.skills).sort((a,b)=>b[1]-a[1]).slice(0,4);
    return `<div class="employee-card"><div class="profile-head"><div class="avatar">${initials(e.name)}</div><div><h4>${esc(e.name)}</h4><p>${esc(e.role)} · ${esc(e.department)}</p></div></div><div class="skill-chips">${topSkills.map(([s,v])=>`<span class="skill-chip">${esc(s)} ${v}</span>`).join('')}</div><div class="employee-meta"><div>${pill(e.potential+' potential',e.potential==='High'?'success':'neutral')}</div><button class="link-btn" data-profile="${e.id}">Open profile →</button></div></div>`;
  }

  function openEmployeeModal(id,targetRoleName=null) {
    const e=getEmployee(id); if(!e) return;
    const target=getRole(targetRoleName || e.aspiration) || state.data.roles[0];
    const readiness=readinessScore(e,target); const gaps=gapsFor(e,target.skills);
    const promotionCandidate=state.data.roles.filter(r=>r.department===e.department && gradeNum(r.level)>gradeNum(e.grade)).map(r=>({r,s:readinessScore(e,r)})).sort((a,b)=>b.s-a.s)[0];
    $('#modalContent').innerHTML=`
      <div class="profile-head"><div class="avatar">${initials(e.name)}</div><div><h2 id="modalTitle">${esc(e.name)}</h2><div class="modal-sub">${esc(e.role)} · ${esc(e.department)} · ${esc(e.location)} · ${esc(e.grade)}</div></div></div>
      <div class="grid grid-4 mt-16">
        ${metricCard('Performance',`${e.performance}/5`,'Recent signal','◉')}
        ${metricCard('Potential',e.potential,'Talent review input','✦')}
        ${metricCard('Target readiness',`${readiness}%`,target.name,'↗')}
        ${metricCard('Availability',e.availability===0?'Now':`${e.availability} mo`,'Mobility timing','◷')}
      </div>
      <div class="grid grid-2 mt-16">
        <div class="card card-pad" style="box-shadow:none"><div class="section-head"><div><h3>Explainable match → ${esc(target.name)}</h3><p>Required vs current proficiency</p></div></div><div class="skill-list">${gaps.map(g=>skillBar(`${g.skill} · ${g.current}/${g.required}`,Math.round(Math.min(g.current/g.required,1)*100))).join('')}</div></div>
        <div class="card card-pad insight-card" style="box-shadow:none"><div class="section-head"><div><h3>Recommended HR action</h3><p>AI recommendation with human decision authority</p></div></div><div class="insight-line"><div class="insight-orb">✦</div><div><h4>${actionFor(e,target,12)==='MOVE'?'Mobility ready':actionFor(e,target,12)==='BUILD'?'Build capability, then move':'Development required'}</h4><p>${actionFor(e,target,12)==='MOVE'?'Employee meets strong readiness thresholds and is open to mobility.':actionFor(e,target,12)==='BUILD'?`Estimated targeted reskilling: ${projectedWeeks(e,target.skills)} weeks.`:'Current gaps are too large for near-term deployment in this prototype scenario.'}</p></div></div>
          ${promotionCandidate?`<div class="scenario-note mt-16"><strong>Promotion readiness:</strong> ${promotionCandidate.s}% toward ${esc(promotionCandidate.r.name)}. AI flags readiness only; final promotion remains a human talent-review decision.</div>`:''}
        </div>
      </div>`;
    openModal();
  }

  function openOpportunityModal(empId,title,kind) {
    const emp=getEmployee(empId); const op=opportunityMatches(emp).find(o=>o.title===title && o.kind===kind); if(!op) return;
    const gaps=gapsFor(emp,op.requirements); const courses=gaps.filter(g=>g.gap>5).map(recommendedCourse).filter(Boolean);
    $('#modalContent').innerHTML=`<h2 id="modalTitle">${esc(op.title)}</h2><div class="modal-sub">${esc(op.kind)} · ${esc(op.meta)} · ${op.score}% match for ${esc(emp.name)}</div>
      <div class="grid grid-2"><div class="card card-pad" style="box-shadow:none"><div class="section-head"><div><h3>Why this match?</h3><p>Skill evidence against opportunity requirements</p></div></div><div class="skill-list">${gaps.map(g=>skillBar(`${g.skill} · ${g.current}/${g.required}`,Math.round(Math.min(g.current/g.required,1)*100))).join('')}</div></div>
      <div class="card card-pad insight-card" style="box-shadow:none"><div class="section-head"><div><h3>Bridge the gap</h3><p>Recommended next action</p></div></div>${courses.length?courses.slice(0,3).map(c=>`<div class="stat-line"><span>${esc(c.name)}</span><strong>${c.durationWeeks}w</strong></div>`).join(''):'<div class="scenario-note"><strong>Ready to explore.</strong> Core capability requirements are already strongly matched.</div>'}<div class="scenario-note mt-16">Completing learning updates the employee skills profile, which automatically recalculates marketplace and workforce-planning readiness.</div></div></div>`;
    openModal();
  }

  function openModal(){ $('#modalBackdrop').classList.remove('hidden'); $('#modalBackdrop').setAttribute('aria-hidden','false'); }
  function closeModal(){ $('#modalBackdrop').classList.add('hidden'); $('#modalBackdrop').setAttribute('aria-hidden','true'); }

  function runInsightPulse() {
    state.pulseRan=true; showToast('Insight pulse complete: workforce, mobility and learning signals refreshed.');
    renderView(state.view);
  }

  function resetDemo() {
    state.data=clone(BASE); state.selectedEmployeeId='E001'; state.selectedTargetRole='Cyber Risk Analyst'; state.marketType='All'; state.workforceDemandId='D001'; state.lastPlan=null; state.pulseRan=false;
    showToast('Demo reset to baseline prototype data.'); renderView(state.view);
  }

  function showToast(text) {
    const t=$('#toast'); t.textContent=text; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),2800);
  }

  function init() {
    $$('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
    $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
    $('#modalClose').addEventListener('click',closeModal);
    $('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
    $('#scenarioPulse').addEventListener('click',runInsightPulse);
    $('#demoReset').addEventListener('click',resetDemo);
    renderOverview();
  }

  init();
})();
