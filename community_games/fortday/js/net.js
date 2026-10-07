'use strict';
// ═══════════════════════════════════════════════════════════
//  NETWORKING (DavidnetSDK.realtime is a dumb relay; every client applies the same events)
// ═══════════════════════════════════════════════════════════
function netSend(data){
  if(!currentRoom) return;
  try{ const p=RT().send(currentRoom,data); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
}
function sendPos(){
  if(!gameStarted) return;
  const m={type:'pos',x:+camera.position.x.toFixed(2),y:+getFeetY().toFixed(2),z:+camera.position.z.toFixed(2),
    ry:+camYaw.y.toFixed(3),a:isDead?0:1};
  if(inBus) m.b=1;
  if(!onGround) m.j=1;
  const ht=buildMode==='gun'?curType():null, it=curItem();
  if(ht){ m.h=ht; if(it&&hasRarity(ht)) m.r=it.rarity|0; }
  if(isPit()){ m.k=pitKills; m.d=pitDeaths; }
  netSend(m);
}

function onMsg({room,data,from}){
  if(!data||!from||from.userId===myUserId) return;
  if(!currentRoom||room!==currentRoom) return;
  rememberName(from);
  const uid=from.userId;
  if(pendingLeave.has(uid)){ clearTimeout(pendingLeave.get(uid)); pendingLeave.delete(uid); }
  if(goneAt.has(uid)){ if(Date.now()-goneAt.get(uid)<1500) return; goneAt.delete(uid); }
  if(isPit()&&gameStarted&&data.type!=='_me'&&data.type!=='_idx') ensureOther(uid);
  seenUids.add(uid);
  refreshTag(uid);
  switch(data.type){
    case 'pos':{
      const p=others.get(uid); if(!p) break;
      const tgt=new THREE.Vector3(data.x,data.y,data.z);
      // smoothed every frame in updateOthers(); snap when they (re)appear
      if(!p.seen||!p.group.visible||p.group.position.distanceTo(tgt)>12){ p.group.position.copy(tgt); p.group.rotation.y=data.ry; }
      p.target=tgt; p.targetYaw=data.ry; p.air=!!data.j;
      setHeld(p,typeof data.h==='string'&&ITEMS[data.h]?data.h:null,data.r|0);
      p.seen=true;
      if(data.a!==undefined){ const al=!!data.a; if(aliveMap.get(uid)!==false||al) aliveMap.set(uid,al); p.group.visible=al&&!data.b; }
      if(data.k!==undefined) pitScores.set(uid,{k:data.k,d:data.d||0});
      break;
    }
    case 'build':
      if(data.action==='place'&&!buildMap.has(data.id)) placeBuild(data.btype,data.gx,data.gy,data.gz,data.rot,teamOf(uid),data.id);
      else if(data.action==='remove') removeBuild(data.id);
      break;
    case 'bdmg': damageBuild(data.id,data.dmg); break;
    case 'edit': applyMask(data.id,data.mask|0); break;
    case 'skin': { const p=others.get(uid); if(p) applySkin(p,data.s); break; }
    case 'sw': { const p=others.get(uid); if(p) p.swingT=1; break; }
    case 'emote': { const p=others.get(uid); if(p) setEmote(p,typeof data.e==='string'?data.e:null); break; }
    case 'buildsync':
      (data.list||[]).forEach(b=>{ if(!buildMap.has(b.id)) placeBuild(b.t,b.gx,b.gy,b.gz,b.rot,teamOf(uid),b.id,{mask:b.m}); });
      break;
    case 'hello': if(isPit()){ sendBuildSync(); sendPos(); } break;
    case 'hit':
      if(data.targetId!==myUserId||isDead) break;
      takeDmg(data.dmg,uid,data.hp,data.w); break;
    case 'shot':{
      if(!Array.isArray(data.o)||!Array.isArray(data.d)) break;
      const o=new THREE.Vector3(...data.o), d=new THREE.Vector3(...data.d);
      spawnTracer(o,d); SFX.shot(data.w,o); flashHeld(others.get(uid)); break;
    }
    case 'proj':
      if(Array.isArray(data.p)&&Array.isArray(data.v)) spawnProjectile(data.k==='rocket'?'rocket':'grenade',new THREE.Vector3(...data.p),new THREE.Vector3(...data.v),false,0);
      break;
    case 'boom': showBoom(new THREE.Vector3(data.x,data.y,data.z),data.r||4); break;
    case 'pick': takePickup(pickupItems.find(p=>p.id===data.id)); break;
    case 'drop': if(data.item&&ITEMS[data.item.type]) addPickup(data.id,data.item,data.x,data.y,data.z,false,true); break;
    case 'prop': removeProp(data.id); break;
    case 'chat': addChat(uid,String(data.text||'').slice(0,120)); break;
    case 'dead':{
      aliveMap.set(uid,false);
      const p=others.get(uid); if(p) p.group.visible=false;
      (data.drops||[]).forEach(d=>{ if(d&&d.item&&ITEMS[d.item.type]) addPickup(d.id,d.item,d.x,d.y,d.z,false,true); });
      const byName=data.by==='storm'?'🌀 De storm':data.by?nameOf(data.by):'?';
      if(data.by===myUserId) onMyKill(uid,data.w);
      if(isPit()){
        const vs=pitScores.get(uid)||{k:0,d:0}; vs.d++; pitScores.set(uid,vs);
        if(data.by!==myUserId){
          if(data.by&&data.by!=='storm'){ const ks=pitScores.get(data.by)||{k:0,d:0}; ks.k++; pitScores.set(data.by,ks); }
          addKF(`${byName} ✕ ${nameOf(uid)}`,'');
        }
        updatePitBoard();
      } else {
        if(data.by!==myUserId) addKF(`${byName} ✕ ${nameOf(uid)}`,'');
        checkWin();
      }
      break;
    }
    case 'respawn':{
      aliveMap.set(uid,true);
      const p=others.get(uid); if(p){ p.group.position.set(data.x,data.y||0,data.z); p.group.visible=true; p.seen=true; }
      break;
    }
  }
}

// Someone left a match: wait a bit (could be a reconnect), then count them as eliminated
function onMatchPresence({room,event,member}){
  if(!gameStarted||isPit()||room!==currentRoom||!member||member.userId===myUserId) return;
  const uid=member.userId;
  if(event==='join'){ if(pendingLeave.has(uid)){ clearTimeout(pendingLeave.get(uid)); pendingLeave.delete(uid); } return; }
  if(event!=='leave'||aliveMap.get(uid)===false) return;
  const p=others.get(uid); if(p) p.group.visible=false;
  if(!pendingLeave.has(uid)) pendingLeave.set(uid,setTimeout(()=>{
    pendingLeave.delete(uid);
    if(aliveMap.get(uid)===false) return;
    aliveMap.set(uid,false); addKF(`${nameOf(uid)} heeft het spel verlaten`,''); checkWin();
  },6000));
}

function sendSkin(){ netSend({type:'skin',s:settings.skin}); }
function sendChat(text){
  text=String(text||'').trim().slice(0,120); if(!text) return;
  addChat(myUserId,text);
  netSend({type:'chat',text});
  ach('chatty');
}
