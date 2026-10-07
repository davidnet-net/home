'use strict';
// ═══════════════════════════════════════════════════════════
//  GAME MODES: matchmaking queues, The Pit, Battle Royale lobby, match start/end
// ═══════════════════════════════════════════════════════════
const QUEUE_MODES=[['1v1',2],['2v2',4],['1v1v1',3],['ffa4',4]];
const MODE_LABEL={'1v1':'1 V 1','2v2':'2 V 2','1v1v1':'1v1v1',ffa4:'1v1v1v1',pit:'🔥 THE PIT',br:'👑 BATTLE ROYALE'};
const qName=m=>'fortday-v3-'+m;
let matchedHooked=false, qStart=0, qTick=null, menuPoll=null;

// ── Queue panel on the main menu ──
function setQueueUI(on){
  document.querySelector('.qgrid').classList.toggle('busy',on);
  document.querySelectorAll('.qbtn').forEach(b=>b.classList.toggle('sel',on&&b.dataset.mode===gameMode));
  $('qpanel').style.display=on?'block':'none';
  clearInterval(qTick);
  if(!on) return;
  qStart=performance.now();
  $('qp-mode').textContent=MODE_LABEL[gameMode]||gameMode;
  $('qp-msg').textContent=gameMode==='pit'?'De Pit binnengaan':gameMode==='br'?'Lobby binnengaan':'Zoeken naar spelers';
  $('qp-msg').className='dots'; $('qp-time').textContent='0:00';
  $('qcancel').style.display=gameMode==='pit'?'none':'inline-block';
  if(gameMode==='pit'){ $('qp-fill').style.width='100%'; $('qp-count').textContent=''; }
  else if(gameMode==='br'){ $('qp-fill').style.width='0%'; $('qp-count').textContent=''; }
  else updateQueuePanel(1);
  qTick=setInterval(()=>{ const s=Math.floor((performance.now()-qStart)/1000); $('qp-time').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); },500);
}
function updateQueuePanel(waiting){
  if(!inQueue||gameMode==='pit'||gameMode==='br') return;
  const w=Math.max(1,Math.min(groupSize,waiting|0));
  $('qp-fill').style.width=(w/groupSize*100)+'%';
  const need=groupSize-w;
  $('qp-count').textContent=`${w} / ${groupSize} spelers`+(need>0?` — nog ${need} nodig`:'');
}
async function pollMenuCounts(){
  if(gameStarted){ clearInterval(menuPoll); return; }
  const rt=RT(); if(!rt) return;
  if(typeof rt.getQueueInfo==='function'){
    await Promise.all(QUEUE_MODES.map(async([m])=>{
      try{ const r=await rt.getQueueInfo(qName(m)), n=(r&&r.waiting)|0;
        const el=$('qc-'+m); if(el) el.textContent=n?`👤 ${n} in wachtrij`:'niemand in wachtrij';
        if(inQueue&&m===gameMode) updateQueuePanel(n); }catch(e){}
    }));
  }
  if(typeof rt.getRoomInfo==='function'){
    try{ const r=await rt.getRoomInfo(PIT_ROOM), n=(r&&r.memberCount)|0;
      $('qc-pit').textContent=n?`🟢 ${n} speler${n===1?'':'s'} nu in De Pit`:'nog niemand in De Pit'; }catch(e){}
    if(!inLobby){ try{ const r=await rt.getRoomInfo(BR_LOBBY), n=(r&&r.memberCount)|0;
      $('qc-br').textContent=n?`🟢 ${n} in de lobby (start vanaf ${BR_MIN})`:`lobby is leeg — start vanaf ${BR_MIN} spelers`; }catch(e){} }
  }
}

// ── Fixed-size matchmaking (1v1, 2v2, ...) ──
async function joinQueue(mode,size){
  if(inQueue||gameStarted) return;
  SFX.unlock(); SFX.click();
  gameMode=mode; groupSize=size; inQueue=true;
  $('qstatus').textContent=''; setQueueUI(true);
  if(!matchedHooked){ matchedHooked=true; RT().onMatched(onMatched); }
  try{ const r=await RT().joinQueue(qName(mode),size); if(r&&r.position) updateQueuePanel(r.position); pollMenuCounts(); }
  catch(e){ inQueue=false; setQueueUI(false); gameMode=null; $('qstatus').textContent='Kon de wachtrij niet joinen: '+(e&&e.message||e); }
}
async function cancelQueue(){
  SFX.click();
  if(gameMode==='br'){ await leaveLobby(); }
  else { try{ await RT().leaveQueue(qName(gameMode)); }catch(e){} }
  inQueue=false; setQueueUI(false); gameMode=null; $('qstatus').textContent='';
  pollMenuCounts();
}
function onMatched({room,members:mems}){
  if(gameStarted) return;
  $('qp-msg').textContent='Wedstrijd gevonden! Laden'; $('qp-fill').style.width='100%';
  $('qp-count').textContent=`${groupSize} / ${groupSize} spelers`; $('qcancel').style.display='none';
  SFX.beep(true);
  currentRoom=room; members=mems; inQueue=false; myUserId=null; myIndex=-1;
  const myR=Math.random()+performance.now()/1e9, heard=new Map();
  const sub=RT().onMessage(({data,from})=>{
    if(!data||data.type!=='_idx'||!from) return;
    heard.set(from.userId,{uid:from.userId,r:data.r});
    if(heard.size>=groupSize&&myIndex<0){
      try{ sub&&sub(); }catch(e){}
      const sorted=[...heard.values()].sort((a,b)=>a.r-b.r);
      const me=sorted.find(s=>Math.abs(s.r-myR)<1e-9);
      myUserId=me?me.uid:sorted[0].uid;
      myIndex=Math.max(0,sorted.findIndex(s=>s.uid===myUserId));
      myTeam=getTeam(myIndex); isHost=myIndex===0;
      launch(sorted.map(s=>s.uid));
    }
  });
  RT().send(room,{type:'_idx',r:myR},{echo:true});
  setTimeout(()=>{ if(myIndex>=0) return; myUserId=myUserId||'solo-'+Date.now(); myIndex=0; myTeam=0; isHost=true; launch([myUserId]); },2500);
}
function getTeam(idx){
  switch(gameMode){ case '1v1': return idx%2; case '2v2': return Math.floor(idx/2); case '1v1v1': return idx; case 'ffa4': return idx;
    case 'br': return idx; default: return 0; }
}
// Ask the server who I am: send a message to myself and read the sender
async function learnMyId(room){
  return await new Promise(resolve=>{
    const nonce=Math.random().toString(36).slice(2);
    let done=false, un=null;
    un=RT().onMessage(({data,from})=>{
      if(done||!data||data.type!=='_me'||data.n!==nonce) return;
      done=true; try{un&&un();}catch(e){} rememberName(from); resolve(from&&from.userId||'solo');
    });
    RT().send(room,{type:'_me',n:nonce},{echo:true}).catch(()=>{});
    setTimeout(()=>{ if(!done){ done=true; resolve('solo-'+Date.now()); } },4000);
  });
}

// ═══════════════════════════════════════════════════════════
//  BATTLE ROYALE LOBBY: min 6 players, then 10 more seconds for extra players, no max
//  The player with the lowest userId runs the countdown and picks the match room + seed.
// ═══════════════════════════════════════════════════════════
let inLobby=false, lobbyMembers=new Map(), lobbyUnsub=null, lobbyCdTimer=null, lobbyCdLeft=-1;
async function joinBR(){
  if(inQueue||gameStarted) return;
  SFX.unlock(); SFX.click();
  inQueue=true; inLobby=true; gameMode='br'; groupSize=BR_MIN;
  $('qstatus').textContent=''; setQueueUI(true);
  try{
    const res=await RT().joinRoom(BR_LOBBY);
    lobbyMembers=new Map();
    ((res&&res.members)||[]).forEach(m=>{ const n=m.displayName||m.username||'Speler'; lobbyMembers.set(m.userId,n); names.set(m.userId,n); });
    lobbyUnsub=RT().onMessage(onLobbyMsg);
    myUserId=await learnMyId(BR_LOBBY);
    if(!inLobby) return;
    lobbyMembers.set(myUserId,names.get(myUserId)||'Jij');
    evaluateLobby();
  }catch(e){
    inLobby=false; inQueue=false; setQueueUI(false); gameMode=null;
    $('qstatus').textContent='Kon de Battle Royale lobby niet joinen: '+(e&&e.message||e);
  }
}
async function leaveLobby(){
  inLobby=false; clearInterval(lobbyCdTimer); lobbyCdTimer=null; lobbyCdLeft=-1;
  try{ lobbyUnsub&&lobbyUnsub(); }catch(e){} lobbyUnsub=null;
  try{ await RT().leaveRoom(BR_LOBBY); }catch(e){}
}
function onLobbyPresence({event,member}){
  if(!inLobby||!member) return;
  if(event==='join'){ const n=member.displayName||member.username||'Speler'; lobbyMembers.set(member.userId,n); names.set(member.userId,n); }
  else if(event==='leave') lobbyMembers.delete(member.userId);
  evaluateLobby();
}
function sendLobby(d){ try{ RT().send(BR_LOBBY,d,{echo:true}).catch(()=>{}); }catch(e){} }
function evaluateLobby(){
  if(!inLobby||!myUserId) return;
  const n=lobbyMembers.size, leader=[...lobbyMembers.keys()].sort()[0]===myUserId;
  if(leader){
    if(n>=BR_MIN&&!lobbyCdTimer){ lobbyCdLeft=BR_COUNTDOWN; sendLobby({type:'brcd',left:lobbyCdLeft}); lobbyCdTimer=setInterval(lobbyTick,1000); }
    else if(n<BR_MIN&&lobbyCdTimer){ clearInterval(lobbyCdTimer); lobbyCdTimer=null; sendLobby({type:'brcd',left:-1}); }
  } else if(lobbyCdTimer){ clearInterval(lobbyCdTimer); lobbyCdTimer=null; }
  if(n<BR_MIN) lobbyCdLeft=-1;
  updateLobbyUI();
}
function lobbyTick(){
  if(lobbyMembers.size<BR_MIN){ clearInterval(lobbyCdTimer); lobbyCdTimer=null; sendLobby({type:'brcd',left:-1}); return; }
  lobbyCdLeft--;
  if(lobbyCdLeft>0){ sendLobby({type:'brcd',left:lobbyCdLeft}); return; }
  clearInterval(lobbyCdTimer); lobbyCdTimer=null;
  const players=[...lobbyMembers.keys()].sort(), nm={};
  players.forEach(u=>nm[u]=lobbyMembers.get(u)||names.get(u)||'Speler');
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  sendLobby({type:'brgo',room:'fortday-br-'+id,players,seed:(Math.random()*2147483647)|0,names:nm});
}
function onLobbyMsg({room,data,from}){
  if(room!==BR_LOBBY||!data||!inLobby) return;
  if(from) rememberName(from);
  if(data.type==='brcd'){ lobbyCdLeft=data.left; if(data.left>0&&data.left<=3) SFX.beep(false); updateLobbyUI(); }
  else if(data.type==='brgo'&&Array.isArray(data.players)&&data.players.includes(myUserId)) startBRMatch(data);
}
function updateLobbyUI(){
  if(!inLobby) return;
  const n=lobbyMembers.size;
  if(lobbyCdLeft>0&&n>=BR_MIN){
    $('qp-msg').className=''; $('qp-msg').textContent=`Start over ${lobbyCdLeft}s — extra spelers kunnen nog instappen`;
    $('qp-fill').style.width='100%'; $('qp-count').textContent=`${n} spelers in de lobby`;
  } else {
    $('qp-msg').className='dots'; $('qp-msg').textContent='Wachten op spelers';
    $('qp-fill').style.width=Math.min(100,n/BR_MIN*100)+'%';
    $('qp-count').textContent=`${n} / ${BR_MIN} spelers — nog ${Math.max(0,BR_MIN-n)} nodig om te starten`;
  }
}
async function startBRMatch(data){
  if(gameStarted) return;
  inLobby=false; clearInterval(lobbyCdTimer); lobbyCdTimer=null;
  $('qp-msg').className=''; $('qp-msg').textContent='Battle Bus wordt volgetankt… laden'; $('qcancel').style.display='none';
  SFX.beep(true);
  try{ lobbyUnsub&&lobbyUnsub(); }catch(e){} lobbyUnsub=null;
  try{ await RT().leaveRoom(BR_LOBBY); }catch(e){}
  Object.entries(data.names||{}).forEach(([u,n])=>names.set(u,String(n).slice(0,24)));
  try{ await RT().joinRoom(data.room); }catch(e){ console.warn('BR join',e); }
  currentRoom=data.room; inQueue=false;
  members=data.players.map(u=>({userId:u,displayName:names.get(u)||'Speler'}));
  groupSize=members.length;
  myIndex=data.players.indexOf(myUserId); myTeam=myIndex; isHost=myIndex===0;
  brSeed=data.seed|0;
  launch(data.players);
}

// ═══════════════════════════════════════════════════════════
//  MATCH START
// ═══════════════════════════════════════════════════════════
function giveDefaultLoadout(){
  inventory=[makeItem('shotgun',1),makeItem('ar',1),makeItem('pistol',0),null,null];
  currentSlot=0;
}
function spawnFor(idx){
  if(isBR()) return [0,BUS_H,0];
  return SPAWN_POS[idx]||[0,0,0];
}
function launch(orderedUids){
  if(gameStarted) return;
  const br=isBR();
  clearInterval(qTick); clearInterval(menuPoll);
  setWorldMode(br);
  const map=applyMapTheme(pickMap(gameMode));
  orderedUids.forEach((uid,idx)=>{
    if(uid===myUserId) return;
    const t=br?idx:getTeam(idx); uidTeam.set(uid,t);
    const p=makeOtherPlayer(t,nameOf(uid)), sp=spawnFor(idx);
    p.group.position.set(sp[0],sp[1],sp[2]); if(br) p.group.visible=false;
    scene.add(p.group); others.set(uid,p); aliveMap.set(uid,true);
  });
  aliveMap.set(myUserId,true); uidTeam.set(myUserId,myTeam);
  hp=MAX_HP; shield=0; wood=0; matchStats.kills=0; matchStats.stormTime=0;

  const now=performance.now();
  if(br){
    genBRWorld(brSeed,map);
    bus=makeBus(brSeed,now+3000);
    storm=makeStorm(brSeed,bus.t0+bus.dur); stormWall.visible=true;
    inventory=[null,null,null,null,null]; currentSlot=-1;
    inBus=true; $('bus-prompt').style.display='block';
    const p=busPos(now); camera.position.set(p.x,p.y+3.4,p.z);
    camYaw.set(-.15,Math.atan2(-bus.dir.x,-bus.dir.z),0);   // look the way the bus drives
    SFX.busLoop(true);
    if(bus.driver==='Tung tung sahur') ach('tung');
    toast(`🚌 Je chauffeur vandaag: ${bus.driver}`);
    setTimeout(markNoShows,12000);
  } else {
    genArenaMap(map); spawnArenaLoot(); giveDefaultLoadout();
    const sp=spawnFor(myIndex);
    camera.position.set(sp[0],sp[1]+PEYE,sp[2]);
    camYaw.set(0,Math.atan2(sp[0],sp[2]),0);
  }
  camera.quaternion.setFromEuler(camYaw);

  const menu=$('menu'); menu.style.opacity='0'; setTimeout(()=>menu.style.display='none',500);
  $('hud').style.display='block'; $('lockp').style.display='flex';
  const mp=$('mode-pill'); mp.textContent=MODE_LABEL[gameMode]||gameMode;
  if(isPit()){ $('team-pill').textContent='Iedereen tegen iedereen'; $('team-pill').style.background='#f97316cc'; $('pitboard').style.display='block'; mp.style.background='#f97316cc'; }
  else if(br){ $('team-pill').textContent='Solo'; $('team-pill').style.background='#7c3aedcc'; mp.style.background='#2563ebcc'; }
  else { $('team-pill').textContent='Team '+TEAM_NAMES[myTeam]; $('team-pill').style.background=TEAM_HEX[myTeam]+'cc'; mp.style.background=TEAM_HEX[myTeam]+'aa'; }

  updateHpUI(); updateAliveUI(); updateMatsUI(); setMode('gun'); updateAmmoUI();
  setInterval(sendPos,50);
  RT().onMessage(onMsg);
  sendSkin(); setInterval(sendSkin,5000);      // late joiners get your outfit too
  setTimeout(()=>toast(`🗺️ Map: ${map.name}`),br?4000:600);
  gameStarted=true; matchStart=now;
  renderer.domElement.requestPointerLock();
}
function markNoShows(){
  if(!isBR()||gameOver) return;
  others.forEach((p,uid)=>{ if(!seenUids.has(uid)&&aliveMap.get(uid)!==false){ aliveMap.set(uid,false); p.group.visible=false; } });
  checkWin(); updateAliveUI();
}

// ── Win / lose ──
function checkWin(){
  if(gameOver) return;
  if(isPit()){ updateAliveUI(); return; }
  const ta=new Map();
  const uids=[myUserId,...others.keys()];
  uids.forEach(uid=>{ const t=uid===myUserId?myTeam:uidTeam.get(uid); if(t==null) return;
    if(!ta.has(t)) ta.set(t,false); if(aliveMap.get(uid)!==false) ta.set(t,true); });
  const alive=[...ta.entries()].filter(([,a])=>a).map(([t])=>t);
  updateAliveUI();
  if(alive.length<=1&&uids.length>1){ gameOver=true; setTimeout(()=>showEnd(alive.length?alive[0]:-1),isDead?600:300); }
}
function showEnd(wt){
  const e=$('end'); e.style.display='flex';
  $('elim').style.display='none';
  document.exitPointerLock(); SFX.stormLoop(false); SFX.busLoop(false);
  const t=$('end-title');
  if(wt===myTeam){
    t.textContent=isBR()?'👑 VICTORY ROYALE!':'🏆 GEWONNEN!';
    t.style.color=isBR()?'#fde68a':(TEAM_HEX[myTeam]||'#fde68a');
    registerWin(isBR()); SFX.victory();
  } else { t.textContent='💀 VERLOREN'; t.style.color='#94a3b8'; }
  const winner=[...uidTeam.entries()].find(([u,tm])=>tm===wt);
  $('end-sub').textContent=isBR()
    ?(wt===myTeam?`Je bent de laatste overlevende van ${members.length} spelers · ${matchStats.kills} kills`:(winner?`${nameOf(winner[0])} heeft gewonnen.`:'Ronde voorbij.'))
    :(wt>=0?`Team ${TEAM_NAMES[wt]||''} heeft gewonnen · jij had ${matchStats.kills} kills`:'Ronde voorbij.');
}

// ── Back to the main menu (M, buttons). "again" re-queues the same mode after reload. ──
let leaving=false;
async function leaveToMenu(again){
  if(leaving) return; leaving=true;
  const mode=gameMode, r=currentRoom; currentRoom=null;
  const jobs=[];
  try{
    if(r) jobs.push(RT().leaveRoom(r));
    if(inLobby) jobs.push(RT().leaveRoom(BR_LOBBY));
    if(inQueue&&mode&&mode!=='br'&&mode!=='pit') jobs.push(RT().leaveQueue(qName(mode)));
    await Promise.race([Promise.all(jobs.map(p=>p&&p.catch?p.catch(()=>{}):p)),new Promise(res=>setTimeout(res,900))]);
  }catch(e){}
  try{ location.hash=again&&mode?'requeue='+mode:''; }catch(e){}
  location.reload();
}
function autoRequeue(){
  let m=null;
  try{ const h=location.hash||''; const k=h.indexOf('requeue='); if(k>=0) m=decodeURIComponent(h.slice(k+8)); history.replaceState(null,'',location.pathname+location.search); }catch(e){}
  if(!m) return;
  if(m==='pit') joinPit();
  else if(m==='br') joinBR();
  else { const q=QUEUE_MODES.find(x=>x[0]===m); if(q) joinQueue(q[0],q[1]); }
}

// ═══════════════════════════════════════════════════════════
//  THE PIT (open lobby · infinite players · infinite respawns)
// ═══════════════════════════════════════════════════════════
async function joinPit(){
  if(inQueue||gameStarted) return;
  SFX.unlock(); SFX.click();
  inQueue=true; gameMode='pit';
  $('qstatus').textContent=''; setQueueUI(true);
  try{
    const res=await RT().joinRoom(PIT_ROOM);
    currentRoom=PIT_ROOM;
    await choosePitMap(res&&res.state);
    ((res&&res.members)||[]).forEach(m=>names.set(m.userId,m.displayName||m.username||'Speler'));
    myUserId=await learnMyId(PIT_ROOM);
  }catch(e){
    inQueue=false; setQueueUI(false); gameMode=null;
    $('qstatus').textContent='Kon De Pit niet joinen: '+(e&&e.message||e); return;
  }
  inQueue=false; myIndex=0; myTeam=0; isHost=false;
  try{ RT().onReconnect(()=>{ if(isPit()){ netSend({type:'hello'}); sendBuildSync(); } }); }catch(e){}
  launch([myUserId]);
  respawnPit(true);
  netSend({type:'hello'});
  updatePitBoard(); updateAliveUI();
  setInterval(()=>{ updatePitBoard(); updateAliveUI(); },1000);
}
function onPitPresence({event,member}){
  if(!member||member.userId===myUserId) return;
  const uid=member.userId;
  if(event==='join'){
    names.set(uid,member.displayName||member.username||'Speler');
    if(pendingLeave.has(uid)){ clearTimeout(pendingLeave.get(uid)); pendingLeave.delete(uid); }
    else addKF(`${nameOf(uid)} is De Pit binnengekomen`,'');
  } else if(event==='leave'){
    const p=others.get(uid); if(p) p.group.visible=false;
    if(!pendingLeave.has(uid)) pendingLeave.set(uid,setTimeout(()=>{ pendingLeave.delete(uid); removeOther(uid); updateAliveUI(); updatePitBoard(); },8000));
  }
  updateAliveUI(); updatePitBoard();
}
function refreshTag(uid){
  const p=others.get(uid); if(!p) return;
  const n=nameOf(uid); if(p.tagName===n) return;
  if(p.tag){ p.group.remove(p.tag); p.tag.material.map.dispose(); p.tag.material.dispose(); }
  p.tag=makeNameTag(n,TEAM_HEX[teamTint(p.team)]||'#fff'); p.group.add(p.tag); p.tagName=n;
}
function ensureOther(uid){
  if(others.has(uid)) return others.get(uid);
  const p=makeOtherPlayer(1,nameOf(uid)); p.group.visible=false; p.seen=false;
  scene.add(p.group); others.set(uid,p); aliveMap.set(uid,true);
  if(!pitScores.has(uid)) pitScores.set(uid,{k:0,d:0});
  updateAliveUI(); updatePitBoard();
  return p;
}
function removeOther(uid){
  goneAt.set(uid,Date.now());
  const p=others.get(uid); if(p){ scene.remove(p.group); others.delete(uid); }
  aliveMap.delete(uid); pitScores.delete(uid);
  [...buildMap.keys()].filter(id=>id.startsWith(uid+'_')).forEach(id=>removeBuild(id));
  addKF(`${nameOf(uid)} heeft De Pit verlaten`,'');
}
function sendBuildSync(){
  const list=[];
  buildMap.forEach((b,id)=>{ if(id.startsWith(myUserId+'_')&&b.g&&!b.doomed) list.push({id,t:b.type,...b.g,m:b.mask}); });
  if(list.length) netSend({type:'buildsync',list});
}
function respawnPit(first){
  let best=[0,0], bd=-1;
  for(let i=0;i<30;i++){
    const a=Math.random()*Math.PI*2, r=14+Math.random()*38, x=Math.cos(a)*r, z=Math.sin(a)*r;
    let md=1e9;
    others.forEach((p,uid)=>{ if(aliveMap.get(uid)===false||!p.seen) return; const d=Math.hypot(p.group.position.x-x,p.group.position.z-z); if(d<md) md=d; });
    if(md>bd){ bd=md; best=[x,z]; }
  }
  camera.position.set(best[0],PEYE,best[1]); vel.set(0,0,0);
  camYaw.set(0,Math.atan2(best[0],best[1]),0); camera.quaternion.setFromEuler(camYaw);
  hp=MAX_HP; shield=0; isDead=false; aliveMap.set(myUserId,true);
  cancelReload(); cancelUse();
  giveDefaultLoadout(); setMode('gun'); showGun(curType());
  updateHpUI(); updateAmmoUI(); updateHotbarUI();
  $('elim').style.display='none'; stopSpectate();
  spawnProtUntil=performance.now()+2000;
  if(!first) netSend({type:'respawn',x:+best[0].toFixed(2),y:0,z:+best[1].toFixed(2)});
  sendPos();
  if(!first&&!isLocked) renderer.domElement.requestPointerLock();
}
function onPitKill(victimId){
  pitKills++; pitStreak++; bestStreak=Math.max(bestStreak,pitStreak);
  addHealth(50);   // siphon: HP first, the rest becomes shield
  addKF(`Jij ✕ ${nameOf(victimId)}`,'mine');
  showKillPop(`${nameOf(victimId)} · +50 ❤️/🛡️`+(pitStreak>1?` · ${pitStreak} op rij 🔥`:''));
  updatePitBoard();
  if(pitStreak>=5) ach('pit_streak_5');
  if(pitKills>=25) ach('pit_25_kills');
}
function updatePitBoard(){
  if(!isPit()) return;
  const rows=[{uid:myUserId,k:pitKills,d:pitDeaths,me:true}];
  others.forEach((p,uid)=>{ const sc=pitScores.get(uid)||{k:0,d:0}; rows.push({uid,k:sc.k,d:sc.d}); });
  rows.sort((a,b)=>b.k-a.k||a.d-b.d);
  let show=rows.slice(0,6); if(!show.some(r=>r.me)) show=show.slice(0,5).concat(rows.filter(r=>r.me));
  const bx=$('pb-rows'); bx.innerHTML='';
  show.forEach(r=>{
    const row=document.createElement('div'); row.className='pbr'+(r.me?' me':'');
    const n=document.createElement('span'); n.textContent=(rows.indexOf(r)+1)+'. '+(r.me?'Jij':nameOf(r.uid));
    const k=document.createElement('span'); k.textContent=r.k+' K · '+r.d+' D';
    row.append(n,k); bx.appendChild(row);
  });
  $('pb-count').textContent=rows.length+' 👥';
}
