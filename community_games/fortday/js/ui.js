'use strict';
// ═══════════════════════════════════════════════════════════
//  UI: hotbar, health/shield, ammo, minimap, chat, toasts, stats & achievements
// ═══════════════════════════════════════════════════════════

// ── Hotbar ──
const BUILD_SLOTS=[['wall','🧱','Muur'],['floor','⬜','Vloer'],['ramp','📐','Helling'],['edit','✏️','Edit']];
function buildHotbar(){
  const hb=$('hotbar'); hb.innerHTML='';
  const mk=(id,click,key)=>{ const d=document.createElement('div'); d.className='ws'; d.id=id;
    d.innerHTML='<span class="key"></span><div class="ico"></div><div class="wname"></div><div class="wammo"></div>';
    d.querySelector('.key').textContent=key; d.onclick=click; hb.appendChild(d); return d; };
  mk('ws-pick',()=>switchSlot(-1),keyLabel(BINDS.pickaxe));
  for(let i=0;i<5;i++) mk('ws'+i,()=>{ if(inventory[i]) switchSlot(i); },keyLabel(BINDS['slot'+(i+1)]));
  const sep=document.createElement('div'); sep.className='hsep'; hb.appendChild(sep);
  BUILD_SLOTS.forEach(([m,ico,name])=>{ const d=mk('ws-'+m,()=>m==='edit'?startEdit():setMode(m),keyLabel(BINDS[m])); d.querySelector('.ico').textContent=ico; d.querySelector('.wname').textContent=name; });
}
function updateHotbarUI(){
  const pk=$('ws-pick'); if(!pk) return;
  pk.querySelector('.ico').textContent='⛏️'; pk.querySelector('.wname').textContent='Pikhouweel'; pk.querySelector('.wammo').textContent='';
  pk.className='ws'+(currentSlot<0&&buildMode==='gun'?' on':'');
  for(let i=0;i<5;i++){
    const el=$('ws'+i), w=inventory[i];
    el.querySelector('.ico').textContent=w?ITEMS[w.type].icon:'';
    el.querySelector('.wname').textContent=w?ITEMS[w.type].name:'Leeg';
    el.querySelector('.wammo').textContent=w?(isGunLike(w.type)?`${w.ammo}/${w.res}`:`×${w.count}`):'';
    el.className='ws'+(i===currentSlot&&buildMode==='gun'?' on':'')+(w?'':' empty');
    const rc=w&&hasRarity(w.type)?RARITY[w.rarity|0].c:null;
    el.style.boxShadow=rc?`inset 0 -5px 0 ${rc}`:'none';
    el.style.background=rc?`linear-gradient(180deg,rgba(0,0,0,.55) 40%,${rc}55)`:'';
  }
  BUILD_SLOTS.forEach(([m])=>{ $('ws-'+m).className='ws'+(buildMode===m?' on':''); });
}
function updateHpUI(){
  $('hp-fill').style.width=hp+'%'; $('hp-text').textContent='❤️ '+Math.round(hp);
  $('hp-fill').style.background=hp>60?'linear-gradient(90deg,#22c55e,#86efac)':hp>30?'linear-gradient(90deg,#f59e0b,#fbbf24)':'linear-gradient(90deg,#ef4444,#f87171)';
  $('sh-fill').style.width=shield+'%'; $('sh-text').textContent='🛡️ '+Math.round(shield);
}
function updateAmmoUI(){
  const t=curType(), it=curItem();
  const nameEl=$('weap-name');
  if(t==='pickaxe'||!it){ $('ammo-cur').textContent='—'; $('ammo-res').textContent='—'; nameEl.textContent=t==='pickaxe'?'PIKHOUWEEL':'—'; nameEl.style.color=''; return; }
  if(isGunLike(it.type)){ $('ammo-cur').textContent=isReloading?'…':it.ammo; $('ammo-res').textContent=it.res; }
  else { $('ammo-cur').textContent='×'+it.count; $('ammo-res').textContent=ITEMS[it.type].max||''; }
  nameEl.textContent=itemLabel({...it,count:0});
  nameEl.style.color=hasRarity(it.type)?RARITY[it.rarity|0].c:'';
}
function updateMatsUI(){ $('mats').textContent='🪵 '+(infMats()?'∞':wood); }
function updateAliveUI(){
  if(isPit()){ $('alive-pill').textContent='👥 '+(others.size+1)+' in De Pit'; return; }
  let n=isDead?0:1; others.forEach((p,uid)=>{ if(aliveMap.get(uid)!==false) n++; });
  $('alive-pill').textContent='👥 '+n+' over';
}
function addKF(text,cls){
  const kf=$('kf'), el=document.createElement('div'); el.className='kfe '+(cls||''); el.textContent=text;
  kf.insertBefore(el,kf.firstChild);
  while(kf.children.length>6) kf.lastChild.remove();
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),400); },5000);
}
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),3000);
}
function showKillPop(text){
  const kp=$('killpop'); $('killpop-s').textContent=text;
  kp.style.opacity=1; clearTimeout(kp._t); kp._t=setTimeout(()=>kp.style.opacity=0,1600);
}

// ── Mode / slot switching ──
function setMode(m){
  if(m==='edit'){ startEdit(); return; }
  if(editing) finishEdit(true);           // switching away from an edit confirms it
  if(m!=='gun'){ cancelUse(); aiming=false; }
  buildMode=m;
  $('bmode').textContent=m==='gun'?'WAPEN':({wall:'🧱 MUUR',ramp:'📐 HELLING',floor:'⬜ VLOER'}[m]||m.toUpperCase())+' ['+keyLabel(BINDS[m])+']';
  if(ghostMesh) ghostMesh.visible=false;
  updateHotbarUI();
  if(m==='gun') showGun(curType()); else showGun(null);
}
function switchSlot(i){
  if(i>=0&&!inventory[i]) return;
  if(usingItem) cancelUse();
  cancelReload();
  currentSlot=i; aiming=false;
  if(buildMode!=='gun') setMode('gun'); else { showGun(curType()); updateHotbarUI(); }
  updateAmmoUI(); SFX.click();
}
function autoSelect(){
  const s=inventory.findIndex(x=>x);
  currentSlot=s; showGun(curType()); updateHotbarUI(); updateAmmoUI();
}
function backToGun(){
  if(currentSlot>=0&&!inventory[currentSlot]) currentSlot=-1;
  setMode('gun'); updateAmmoUI();
}
function cycleWeapon(dir){
  const order=[-1,0,1,2,3,4].filter(i=>i<0||inventory[i]);
  if(buildMode!=='gun'){ switchSlot(order.includes(currentSlot)?currentSlot:-1); return; }
  const idx=Math.max(0,order.indexOf(currentSlot));
  switchSlot(order[(idx+dir+order.length)%order.length]);
}

// ── Minimap ──
const mmCanvas=$('minimap'), mmCtx=mmCanvas.getContext('2d'), MM_SIZE=170;
function renderMinimap(){
  const c=mmCtx, S=MM_SIZE, br=isBR();
  const W=br?BR_B*2+20:128, sc=S/W, off=W/2;
  const X=x=>(x+off)*sc, Z=z=>(z+off)*sc;
  c.clearRect(0,0,S,S);
  c.save(); c.beginPath(); c.arc(S/2,S/2,S/2-1,0,Math.PI*2); c.clip();
  c.fillStyle=br?'rgba(40,70,35,.88)':'rgba(10,15,25,.78)'; c.fillRect(0,0,S,S);
  c.fillStyle=br?'rgba(225,215,195,.75)':'rgba(200,160,100,.6)';
  buildMap.forEach(b=>{ const a=b.col; c.fillRect(X(a.x1),Z(a.z1),Math.max((a.x2-a.x1)*sc,1),Math.max((a.z2-a.z1)*sc,1)); });
  if(br){
    c.fillStyle='rgba(20,90,30,.9)'; propMap.forEach(p=>{ if(p.kind==='tree') c.fillRect(X(p.x)-.8,Z(p.z)-.8,1.6,1.6); });
    if(storm){
      const s=stormState(performance.now());
      c.fillStyle='rgba(139,43,217,.42)'; c.beginPath(); c.rect(0,0,S,S); c.arc(X(s.x),Z(s.z),Math.max(0,s.r*sc),0,Math.PI*2,true); c.fill();
      if(s.next){ c.strokeStyle='rgba(255,255,255,.9)'; c.lineWidth=1.2; c.beginPath(); c.arc(X(s.next.x),Z(s.next.z),Math.max(.5,s.next.r*sc),0,Math.PI*2); c.stroke(); }
    }
    if(bus&&busProgress(performance.now())<1){
      c.strokeStyle='rgba(96,165,250,.8)'; c.setLineDash([3,3]); c.beginPath(); c.moveTo(X(bus.start.x),Z(bus.start.z)); c.lineTo(X(bus.end.x),Z(bus.end.z)); c.stroke(); c.setLineDash([]);
      const p=busPos(performance.now()); c.fillStyle='#60a5fa'; c.fillRect(X(p.x)-3,Z(p.z)-3,6,6);
    }
  } else {
    pickupItems.forEach(it=>{ if(!it.active) return; c.fillStyle='#ffd700'; c.beginPath(); c.arc(X(it.pos.x),Z(it.pos.z),2.3,0,Math.PI*2); c.fill(); });
    others.forEach((p,uid)=>{
      if(aliveMap.get(uid)===false||!p.group.visible) return;
      c.fillStyle=TEAM_HEX[teamTint(p.team)]||'#ef4444';
      c.beginPath(); c.arc(X(p.group.position.x),Z(p.group.position.z),3.5,0,Math.PI*2); c.fill();
    });
  }
  const sx=X(camera.position.x), sz=Z(camera.position.z);
  c.fillStyle='#22c55e'; c.beginPath(); c.arc(sx,sz,4.5,0,Math.PI*2); c.fill(); c.strokeStyle='#fff'; c.lineWidth=1; c.stroke();
  c.strokeStyle='#22c55e'; c.lineWidth=2; c.beginPath(); c.moveTo(sx,sz); c.lineTo(sx-Math.sin(camYaw.y)*10,sz-Math.cos(camYaw.y)*10); c.stroke();
  c.restore();
  c.strokeStyle='rgba(255,255,255,.2)'; c.lineWidth=1.5; c.beginPath(); c.arc(S/2,S/2,S/2-1,0,Math.PI*2); c.stroke();
}

// ── Chat (T) ──
let chatOpen=false;
function openChat(){
  if(chatOpen||!gameStarted) return;
  chatOpen=true; Object.keys(keys).forEach(k=>keys[k]=false); mouseHeld=false;
  $('chat').classList.add('open');
  const inp=$('chat-input'); inp.value=''; setTimeout(()=>inp.focus(),0);
}
function closeChat(){ chatOpen=false; $('chat').classList.remove('open'); const i=$('chat-input'); if(document.activeElement===i) i.blur(); clearKeys(); }
$('chat-input').addEventListener('blur',()=>{ if(chatOpen) closeChat(); });
$('chat-input').addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Enter'){ sendChat($('chat-input').value); closeChat(); }
  else if(e.key==='Escape'){ closeChat(); }
});
function addChat(uid,text){
  const log=$('chat-log'), el=document.createElement('div'); el.className='cm';
  const b=document.createElement('b'); b.textContent=nameOf(uid)+':';
  b.style.color=uid===myUserId?'#4ade80':(TEAM_HEX[teamTint(teamOf(uid))]||'#fca5a5');
  el.append(b,document.createTextNode(text)); log.appendChild(el);
  while(log.children.length>8) log.firstChild.remove();
  if(uid!==myUserId) SFX.chat();
  setTimeout(()=>{ el.style.opacity='0'; },12000);
}

// ═══════════════════════════════════════════════════════════
//  STATS · LEADERBOARDS · ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════
const ACH={
  first_kill:    {name:'Eerste kill',        desc:'Schakel je eerste tegenstander uit',            icon:'🎯'},
  first_win:     {name:'Eerste overwinning', desc:'Win je eerste potje Fortday',                    icon:'🏆'},
  victory_royale:{name:'Victory Royale',     desc:'Win een Battle Royale',                          icon:'👑'},
  br_top3:       {name:'Podium',             desc:'Eindig in de top 3 van een Battle Royale',       icon:'🥉'},
  five_kills:    {name:'Vijfklapper',        desc:'5 kills in één potje (niet in The Pit)',         icon:'🖐️'},
  pit_streak_5:  {name:'Onstopbaar',         desc:'5 kills op rij in The Pit',                      icon:'💀'},
  pit_25_kills:  {name:'Pit Legende',        desc:'25 kills in één Pit-sessie',                     icon:'🔥'},
  killer_100:    {name:'Huurling',           desc:'Schakel in totaal 100 tegenstanders uit',        icon:'☠️', stat:'kills',     target:100},
  headhunter:    {name:'Koppensneller',      desc:'Raak 100 headshots',                             icon:'🤯', stat:'headshots', target:100},
  builder:       {name:'Bouwvakker',         desc:'Plaats 500 builds',                              icon:'🧱', stat:'builds',    target:500},
  lumberjack:    {name:'Houthakker',         desc:'Hak 2000 hout bij elkaar',                       icon:'🪓', stat:'wood',      target:2000},
  demolition:    {name:'Sloopkogel',         desc:'Vernietig 100 builds van anderen',               icon:'🏚️', stat:'demolished',target:100},
  medic:         {name:'Dokter',             desc:'Gebruik 50 heal- of schilditems',                icon:'🩺', stat:'heals',     target:50},
  sniper_elite:  {name:'Sniper Elite',       desc:'Schakel iemand uit met een sniper van 100m+',    icon:'🔭'},
  boom:          {name:'Kaboem',             desc:'Schakel iemand uit met een raket of granaat',    icon:'💥'},
  pickaxe_kill:  {name:'Hak ze neer',        desc:'Schakel iemand uit met je pikhouweel',           icon:'⛏️'},
  full_shield:   {name:'Onkwetsbaar',        desc:'Heb tegelijk 100 HP én 100 schild',              icon:'🛡️'},
  storm_rider:   {name:'Stormrijder',        desc:'Overleef 30 seconden in de storm in één potje',  icon:'🌀'},
  impatient:     {name:'Ongeduldig',         desc:'Spring binnen 1 seconde uit de Battle Bus',      icon:'🪂'},
  tung:          {name:'Tung Tung Tung',     desc:'Rij mee met buschauffeur Tung tung sahur',       icon:'🥁'},
  legendary:     {name:'Goudkoorts',         desc:'Pak een legendarisch wapen op',                  icon:'✨'},
  hoarder:       {name:'Hamsteraar',         desc:'Heb alle 5 inventarisslots vol',                 icon:'🎒'},
  high_ground:   {name:'High Ground',        desc:'Sta hoger dan 24 meter',                         icon:'🏔️'},
  ramp_rush:     {name:'Ramp Rusher',        desc:'Plaats 8 hellingen binnen 4 seconden',           icon:'📐'},
  collapse:      {name:'Instortingsgevaar',  desc:'Laat 10 builds tegelijk instorten',              icon:'🏗️'},
  dancer:        {name:'Dansmachine',        desc:'Gebruik alle 8 emotes',                          icon:'🕺'},
  chatty:        {name:'Kletskous',          desc:'Stuur je eerste chatbericht',                    icon:'💬'},
};
const stats={kills:0,wins:0,headshots:0,builds:0,wood:0,demolished:0,heals:0,brWins:0};
let statsLoaded=false, saveTid=null, lbTab='kills';
const achDone=new Set(), progSent={};

async function loadStats(){
  try{
    const r=await window.DavidnetSDK.getJsonBlob(); const d=r&&r.data;
    if(d&&typeof d==='object') Object.keys(stats).forEach(k=>{ stats[k]=Math.max(stats[k],d[k]|0); });
    statsLoaded=true;
  }catch(e){ console.warn('Fortday: kon stats niet laden',e); }
}
function saveStats(){
  clearTimeout(saveTid);
  saveTid=setTimeout(async()=>{
    if(!statsLoaded) await loadStats();
    if(!statsLoaded) return;
    try{ await window.DavidnetSDK.saveJsonBlob({...stats}); }catch(e){}
    // progress achievements (server keeps the highest progress)
    Object.entries(ACH).forEach(([id,a])=>{
      if(!a.stat) return;
      const v=Math.min(a.target,stats[a.stat]|0);
      if(v<=0||progSent[id]===v||achDone.has(id)) return;
      progSent[id]=v;
      (async()=>{ try{ const r=await window.DavidnetSDK.unlockAchievement({id,name:a.name,description:a.desc,icon:a.icon,progress:v,target:a.target});
        if(r&&r.isNew){ achDone.add(id); toast(`${a.icon} Achievement: ${a.name}`); SFX.victory(); } }catch(e){} })();
    });
  },1500);
}
function ach(id){
  if(achDone.has(id)) return; achDone.add(id);
  const a=ACH[id]; if(!a) return;
  (async()=>{ try{ const r=await window.DavidnetSDK.unlockAchievement({id,name:a.name,description:a.desc,icon:a.icon});
    if(r&&r.isNew){ toast(`${a.icon} Achievement: ${a.name}`); SFX.pickup(); } }catch(e){ achDone.delete(id); } })();
}
function submitScore(cat,val){ try{ const p=window.DavidnetSDK.applyHighscore(val,{category:cat}); p&&p.catch&&p.catch(()=>{}); }catch(e){} }
function registerKill(){ stats.kills++; submitScore('kills',stats.kills); saveStats(); ach('first_kill'); }
function registerWin(br){
  stats.wins++; if(br) stats.brWins++;
  submitScore('wins',stats.wins); saveStats(); ach('first_win');
  if(br){ ach('victory_royale'); ach('br_top3'); }
}
function onMyKill(uid,w){
  matchStats.kills++; SFX.elim();
  if(isPit()) onPitKill(uid);
  else { addKF(`Jij ✕ ${nameOf(uid)}`,'mine'); showKillPop(nameOf(uid)); }
  registerKill();
  if(w==='sniper'){ const p=others.get(uid); if(p&&p.group.position.distanceTo(camera.position)>=100) ach('sniper_elite'); }
  if(w==='rocket'||w==='grenade') ach('boom');
  if(w==='pickaxe') ach('pickaxe_kill');
  if(!isPit()&&matchStats.kills>=5) ach('five_kills');
}

async function showLB(cat){
  lbTab=cat;
  $('lbt-kills').classList.toggle('on',cat==='kills'); $('lbt-wins').classList.toggle('on',cat==='wins');
  const rows=$('lb-rows'), me=$('lb-me');
  rows.innerHTML='<div id="lb-empty">Leaderboard laden…</div>'; me.textContent='';
  let res;
  try{ res=await window.DavidnetSDK.getHighscores({category:cat}); }
  catch(e){ if(lbTab===cat) rows.innerHTML='<div id="lb-empty">Leaderboard niet beschikbaar</div>'; return; }
  if(lbTab!==cat) return;
  const list=(res&&res.leaderboard)||[];
  rows.innerHTML='';
  if(!list.length) rows.innerHTML='<div id="lb-empty">Nog geen scores — wees de eerste!</div>';
  list.forEach(e=>{
    const r=document.createElement('div'); r.className='lbr'+(e.rank===1?' gold':e.rank===2?' silver':e.rank===3?' bronze':'');
    const rk=document.createElement('span'); rk.className='rk'; rk.textContent='#'+e.rank;
    const nm=document.createElement('span'); nm.className='nm'; nm.textContent=e.displayName||e.username||'Speler';
    const sc=document.createElement('span'); sc.className='sc'; sc.textContent=e.score+(cat==='kills'?' kills':' wins');
    r.append(rk,nm,sc); rows.appendChild(r);
  });
  const mine=res&&res.playerHighscore, my=typeof mine==='number'?mine:(mine&&mine.score);
  me.textContent='Jij: '+(my!=null?my:stats[cat])+(cat==='kills'?' kills':' wins');
}

async function toggleAchPanel(){
  const p=$('achpanel');
  if(p.style.display==='block'){ p.style.display='none'; return; }
  p.style.display='block'; p.textContent='Laden…';
  let got=[];
  try{ const r=await window.DavidnetSDK.getAchievements(); got=(r&&r.achievements)||[]; }catch(e){}
  const byId=new Map(got.map(a=>[a.id,a]));
  p.innerHTML='';
  const ids=Object.keys(ACH);
  const done=ids.filter(id=>byId.get(id)&&byId.get(id).unlockedAt).length;
  const head=document.createElement('div'); head.style.cssText='color:#fde68a;font-weight:800;font-size:12px;padding:4px 6px 8px';
  head.textContent=`${done} / ${ids.length} vrijgespeeld`; p.appendChild(head);
  ids.forEach(id=>{
    const a=ACH[id], g=byId.get(id), unlocked=!!(g&&g.unlockedAt);
    const row=document.createElement('div'); row.className='achr'+(unlocked?' got':'');
    row.innerHTML='<div class="ai"></div><div><div class="an"></div><div class="ad"></div></div><div class="ap"></div>';
    row.querySelector('.ai').textContent=a.icon; row.querySelector('.an').textContent=a.name; row.querySelector('.ad').textContent=a.desc;
    const ap=row.querySelector('.ap');
    if(unlocked){ ap.textContent='✔'+(g.unlockedPercentage!=null?` · ${Math.round(g.unlockedPercentage)}% heeft dit`:''); }
    else if(a.stat){
      const v=Math.min(a.target,Math.max(stats[a.stat]|0,(g&&g.progress)|0));
      ap.innerHTML=`<div></div><div class="apb"><div></div></div>`;
      ap.firstChild.textContent=`${v} / ${a.target}`; ap.querySelector('.apb div').style.width=(v/a.target*100)+'%';
    }
    p.appendChild(row);
  });
}

