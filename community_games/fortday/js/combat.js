'use strict';
// ═══════════════════════════════════════════════════════════
//  COMBAT: guns, pickaxe, rockets, grenades, healing, damage & death
// ═══════════════════════════════════════════════════════════
let lastShot=0, lastSwing=0, isReloading=false, reloadTid=null, usingItem=null, barInfo=null;
let lastHit=null;          // who hit me last (for kill credit / weapon achievements)
const visBullets=[], projectiles=[], effects=[];

function curItem(){ return currentSlot>=0?inventory[currentSlot]:null; }
function curType(){ return currentSlot<0?'pickaxe':(inventory[currentSlot]&&inventory[currentSlot].type); }

// ── Visual tracers ──
const BULLET_GEO=new THREE.CylinderGeometry(.015,.015,.22,4); BULLET_GEO.rotateX(Math.PI/2);
const BULLET_MAT=new THREE.MeshBasicMaterial({color:0xffd666});
function spawnTracer(from,dir){
  const m=new THREE.Mesh(BULLET_GEO,BULLET_MAT); m.position.copy(from);
  m.lookAt(from.clone().add(dir)); scene.add(m);
  visBullets.push({mesh:m,vel:dir.clone().multiplyScalar(280),life:.3});
}
function updateBullets(dt){
  for(let i=visBullets.length-1;i>=0;i--){
    const b=visBullets[i]; b.mesh.position.addScaledVector(b.vel,dt); b.life-=dt;
    if(b.life<=0){ scene.remove(b.mesh); visBullets.splice(i,1); }
  }
}
function muzzlePos(){ return camera.position.clone().add(new THREE.Vector3(.15,-.2,-.4).applyQuaternion(camera.quaternion)); }

// ── Floating numbers & hit marker ──
function showFloat(worldPos,text,color,size){
  const s=worldPos.clone().project(camera);
  if(s.z<0||s.z>1) return;
  const el=document.createElement('div'); el.className='dn'; el.textContent=text;
  el.style.color=color; el.style.fontSize=size+'px';
  el.style.left=((.5+s.x*.5)*innerWidth-14)+'px'; el.style.top=((.5-s.y*.5)*innerHeight-8)+'px';
  document.body.appendChild(el); setTimeout(()=>el.remove(),900);
}
function showDmgNum(pos,dmg,color,size){ showFloat(pos,'-'+dmg,color||'#ff3333',size||20); }
function hitMarker(head){
  const hm=$('hitmark'); hm.style.opacity=1; hm.style.color=head?'#ff8800':'#ff2020';
  clearTimeout(hm._t); hm._t=setTimeout(()=>hm.style.opacity=0,110);
  SFX.hit(head);
}

// ── Targets: other players that aren't my teammates ──
function collectTargets(){
  const pHits=[];
  others.forEach((p,uid)=>{
    if(aliveMap.get(uid)===false||!p.group.visible) return;
    if(!isPit()&&p.team===myTeam) return;
    playerHitMeshes(p,pHits,uid);
  });
  return pHits;
}
// Can I damage this build? Everything except my teammates' builds.
function canDamageBuild(id,b){
  if(b.team===MAP_TEAM||isPit()||isBR()) return true;
  if(id.startsWith(myUserId+'_')) return true;
  return b.team!==myTeam;
}
function hitBuild(id,dmg,point){
  const b=buildMap.get(id); if(!b) return;
  const mine=id.startsWith(myUserId+'_');
  showFloat(point,'-'+dmg,'#7dd3fc',15);
  spawnChips(point,b.team===MAP_TEAM?0xbbbbbb:0xc8955a);
  netSend({type:'bdmg',id,dmg});
  const r=damageBuild(id,dmg);
  if(r.destroyed){
    netSend({type:'build',action:'remove',id});
    if(!mine){ stats.demolished++; saveStats(); }
    if(r.collapsed>=10) ach('collapse');
  }
}
function sendHit(uid,dmg,point,w,head){
  netSend({type:'hit',targetId:uid,dmg,from:myUserId,w,h:head?1:0,hp:{x:+point.x.toFixed(2),y:+point.y.toFixed(2),z:+point.z.toFixed(2)}});
}

// ── Primary action for whatever is in your hands ──
function doPrimary(){
  if(isDead||inBus||buildMode!=='gun'||usingItem) return;
  const t=curType(); if(!t) return;
  const d=ITEMS[t];
  if(d.kind==='melee') return swingPickaxe();
  if(d.kind==='gun') return shootGun(curItem(),d);
  if(d.kind==='launcher') return fireRocket(curItem(),d);
  if(d.kind==='throw') return throwGrenade(curItem(),d);
  if(d.kind==='heal'||d.kind==='shield') return startUse(currentSlot);
}

function shootGun(it,d){
  const now=performance.now();
  if(now-lastShot<d.cd||isReloading) return;
  if(it.ammo<=0){ startReload(); return; }
  lastShot=now; it.ammo--;
  gunRecoil=1; doFlash(it.type); SFX.shot(it.type);
  camYaw.x-=d.recoil*(aiming?.6:1); camYaw.y+=(Math.random()-.5)*d.recoilH;
  const mult=RARITY[it.rarity|0].m;
  const pHits=collectTargets();
  const meshes=[groundHit,...buildMeshes(),...propMeshes,...pHits.map(h=>h.mesh)];
  let spread=d.spread;
  if(d.scope) spread=(aiming&&camera.fov<40)?0:d.spread; else if(aiming) spread*=.55;
  camera.updateMatrixWorld();
  const muzzle=muzzlePos();
  let firstDir=null; let hitSomeone=false, headSomeone=false;
  for(let i=0;i<d.pellets;i++){
    RAY.setFromCamera(new THREE.Vector2((Math.random()-.5)*spread,(Math.random()-.5)*spread),camera);
    const dir=RAY.ray.direction.clone(); if(!firstDir) firstDir=dir;
    spawnTracer(muzzle,dir);
    const hits=RAY.intersectObjects(meshes,false);
    if(!hits.length) continue;
    const h=hits[0], ph=pHits.find(x=>x.mesh===h.object);
    if(ph){
      const dmg=Math.round(d.dmg*mult*(ph.isHead?d.headMult:1));
      showDmgNum(h.point,dmg,ph.isHead?'#ff8800':'#ff3333',ph.isHead?24:20);
      sendHit(ph.uid,dmg,h.point,it.type,ph.isHead);
      hitSomeone=true; if(ph.isHead) headSomeone=true;
    } else if(h.object.userData.buildId){
      const id=h.object.userData.buildId, b=buildMap.get(id);
      if(b&&canDamageBuild(id,b)) hitBuild(id,Math.round(d.dmg*mult*(d.buildMult||1)),h.point);
    }
  }
  if(hitSomeone){ hitMarker(headSomeone); if(headSomeone){ stats.headshots++; saveStats(); } }
  if(firstDir) netSend({type:'shot',w:it.type,o:[+muzzle.x.toFixed(2),+muzzle.y.toFixed(2),+muzzle.z.toFixed(2)],d:[+firstDir.x.toFixed(3),+firstDir.y.toFixed(3),+firstDir.z.toFixed(3)]});
  updateAmmoUI(); updateHotbarUI();
  if(it.ammo===0) setTimeout(startReload,200);
}

function swingPickaxe(){
  const now=performance.now(), d=ITEMS.pickaxe;
  if(now-lastSwing<d.cd) return;
  lastSwing=now; swingT=1; SFX.swing(); netSend({type:'sw'});
  const pHits=collectTargets();
  camera.updateMatrixWorld();
  RAY.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=RAY.intersectObjects([...buildMeshes(),...propMeshes,...pHits.map(h=>h.mesh)],false);
  if(!hits.length||hits[0].distance>d.range) return;
  const h=hits[0], o=h.object, ph=pHits.find(x=>x.mesh===o);
  if(ph){ showDmgNum(h.point,d.dmg); sendHit(ph.uid,d.dmg,h.point,'pickaxe',false); hitMarker(false); return; }
  if(o.userData.buildId){
    const id=o.userData.buildId, b=buildMap.get(id); if(!b||!canDamageBuild(id,b)) return;
    SFX.chop(h.point);
    gainWood(b.team===MAP_TEAM?8:5,h.point);
    hitBuild(id,d.buildDmg,h.point);
    return;
  }
  if(o.userData.propId){
    const pid=o.userData.propId, pr=propMap.get(pid); if(!pr) return;
    SFX.chop(h.point); spawnChips(h.point,pr.kind==='tree'?0x7a5230:0x8a8a80);
    gainWood(pr.wood,h.point);
    if(damageProp(pid,d.buildDmg)) netSend({type:'prop',id:pid});
  }
}
function gainWood(n,pt){
  stats.wood+=n; saveStats();
  if(infMats()) return;
  wood=Math.min(MAX_WOOD,wood+n); updateMatsUI();
  showFloat(pt,'+'+n+' 🪵','#fbbf24',16);
}

// ── Drop what you are holding (drop key) ──
function dropCurrent(){
  if(isDead||inBus||currentSlot<0) return;
  const it=inventory[currentSlot]; if(!it) return;
  cancelReload(); cancelUse();
  dropItem(it); inventory[currentSlot]=null; autoSelect();
  SFX.swing(); updateHotbarUI(); updateAmmoUI();
}

// ── Rockets & grenades ──
const ROCKET_GEO=new THREE.CylinderGeometry(.09,.09,.6,8); ROCKET_GEO.rotateX(Math.PI/2);
const GREN_GEO=new THREE.SphereGeometry(.12,10,8);
const ROCKET_MAT=M(0x4d6b35), GREN_MAT=M(0x3f5f2a);
function spawnProjectile(kind,pos,v,mine,rarity){
  const mesh=new THREE.Mesh(kind==='rocket'?ROCKET_GEO:GREN_GEO,kind==='rocket'?ROCKET_MAT:GREN_MAT);
  mesh.position.copy(pos); scene.add(mesh);
  projectiles.push({kind,mesh,pos:pos.clone(),vel:v.clone(),t:0,mine,rarity:rarity|0});
}
function fireRocket(it,d){
  const now=performance.now();
  if(now-lastShot<d.cd||isReloading) return;
  if(it.ammo<=0){ startReload(); return; }
  lastShot=now; it.ammo--; gunRecoil=1.4; doFlash('rocket'); SFX.shot('rocket');
  camYaw.x-=d.recoil;
  camera.updateMatrixWorld();
  const dir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  const pos=camera.position.clone().addScaledVector(dir,.9).add(new THREE.Vector3(.12,-.12,0).applyQuaternion(camera.quaternion));
  spawnProjectile('rocket',pos,dir.clone().multiplyScalar(d.speed),true,it.rarity);
  netSend({type:'proj',k:'rocket',p:[pos.x,pos.y,pos.z].map(v=>+v.toFixed(2)),v:[dir.x*d.speed,dir.y*d.speed,dir.z*d.speed].map(v=>+v.toFixed(2))});
  updateAmmoUI(); updateHotbarUI();
  if(it.ammo===0) setTimeout(startReload,300);
}
function throwGrenade(it,d){
  const now=performance.now(); if(now-lastShot<d.cd) return;
  lastShot=now;
  camera.updateMatrixWorld();
  const dir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  const pos=camera.position.clone().addScaledVector(dir,.6);
  const v=dir.clone().multiplyScalar(21); v.y+=5;
  spawnProjectile('grenade',pos,v,true,0);
  netSend({type:'proj',k:'grenade',p:[pos.x,pos.y,pos.z].map(x=>+x.toFixed(2)),v:[v.x,v.y,v.z].map(x=>+x.toFixed(2))});
  SFX.swing();
  it.count--; if(it.count<=0){ inventory[currentSlot]=null; autoSelect(); }
  updateHotbarUI(); updateAmmoUI();
}
function pointInWall(p){ for(const c of wallCols) if(p.x>c.x1&&p.x<c.x2&&p.y>c.y1&&p.y<c.y2&&p.z>c.z1&&p.z<c.z2) return true; return false; }
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){
    const pr=projectiles[i]; pr.t+=dt;
    if(pr.kind==='rocket'){
      const step=pr.vel.clone().multiplyScalar(dt), len=step.length();
      RAY.set(pr.pos,step.clone().normalize()); RAY.far=len+.1;
      const targets=[groundHit,...buildMeshes(),...propMeshes];
      if(pr.mine) collectTargets().forEach(h=>targets.push(h.mesh));
      const hits=RAY.intersectObjects(targets,false); RAY.far=Infinity;
      if(hits.length||pr.t>4){ explode(pr,hits.length?hits[0].point:pr.pos); projectiles.splice(i,1); continue; }
      pr.pos.add(step); pr.mesh.position.copy(pr.pos); pr.mesh.lookAt(pr.pos.clone().add(pr.vel));
      if(Math.random()<.7) spawnPuff(pr.pos);
    } else {
      pr.vel.y+=GRAV*dt;
      const prev=pr.pos.clone();
      pr.pos.addScaledVector(pr.vel,dt);
      if(pointInWall(pr.pos)){ pr.pos.copy(prev); pr.vel.x*=-.4; pr.vel.z*=-.4; }
      const fl=getFloorY(pr.pos.x,pr.pos.z,prev.y);
      if(pr.pos.y<fl+.12){ pr.pos.y=fl+.12; pr.vel.y=Math.abs(pr.vel.y)*.35; pr.vel.x*=.6; pr.vel.z*=.6; }
      pr.mesh.position.copy(pr.pos); pr.mesh.rotation.x+=dt*8;
      if(pr.t>=ITEMS.grenade.fuse){ explode(pr,pr.pos); projectiles.splice(i,1); }
    }
  }
}
function explode(pr,at){
  scene.remove(pr.mesh);
  const def=ITEMS[pr.kind==='rocket'?'rocket':'grenade'];
  if(!pr.mine) return;   // the thrower calculates damage and tells everyone
  const pos=at.clone();
  showBoom(pos,def.radius);
  netSend({type:'boom',x:+pos.x.toFixed(2),y:+pos.y.toFixed(2),z:+pos.z.toFixed(2),r:def.radius});
  const m=RARITY[pr.rarity].m, R=def.radius+.5;
  let hitAny=false;
  others.forEach((p,uid)=>{
    if(aliveMap.get(uid)===false||!p.group.visible) return;
    if(!isPit()&&p.team===myTeam) return;
    const c=p.group.position.clone(); c.y+=1;
    const dd=c.distanceTo(pos);
    if(dd<R){ const dmg=Math.round(def.dmg*m*(1-dd/R*.6)); showDmgNum(c,dmg,'#ff8800',22); sendHit(uid,dmg,c,pr.kind,false); hitAny=true; }
  });
  if(hitAny) hitMarker(false);
  const hitIds=[];
  buildMap.forEach((b,id)=>{
    const c=new THREE.Vector3((b.col.x1+b.col.x2)/2,(b.col.y1+b.col.y2)/2,(b.col.z1+b.col.z2)/2);
    const dd=c.distanceTo(pos);
    if(dd<def.radius+2&&canDamageBuild(id,b)) hitIds.push([id,Math.round(def.buildDmg*(1-dd/(def.radius+2)*.5)),c]);
  });
  hitIds.forEach(([id,dmg,c])=>hitBuild(id,dmg,c));
}

// ── Effects: explosions, smoke puffs, wood chips ──
const BOOM_GEO=new THREE.SphereGeometry(1,16,12), PUFF_GEO=new THREE.SphereGeometry(.18,6,5), CHIP_GEO=new THREE.BoxGeometry(.12,.06,.12);
function showBoom(pos,r){
  const m=new THREE.Mesh(BOOM_GEO,new THREE.MeshBasicMaterial({color:0xff8a1f,transparent:true,opacity:.9,fog:false}));
  m.position.copy(pos); scene.add(m);
  effects.push({mesh:m,t:0,dur:.5,kind:'boom',r});
  SFX.boom(pos);
  const d=camera.position.distanceTo(pos); if(d<14){ camYaw.x+=(Math.random()-.5)*.04; }
}
function spawnPuff(pos){
  const m=new THREE.Mesh(PUFF_GEO,new THREE.MeshBasicMaterial({color:0xcccccc,transparent:true,opacity:.6}));
  m.position.copy(pos); scene.add(m); effects.push({mesh:m,t:0,dur:.6,kind:'puff'});
}
function spawnChips(pos,color){
  const mat=new THREE.MeshLambertMaterial({color,transparent:true});
  for(let i=0;i<5;i++){
    const m=new THREE.Mesh(CHIP_GEO,mat); m.position.copy(pos); scene.add(m);
    effects.push({mesh:m,t:0,dur:.6,kind:'chip',v:new THREE.Vector3((Math.random()-.5)*5,Math.random()*4+1,(Math.random()-.5)*5),mat});
  }
}
function updateEffects(dt){
  for(let i=effects.length-1;i>=0;i--){
    const e=effects[i]; e.t+=dt; const k=e.t/e.dur;
    if(e.kind==='boom'){ e.mesh.scale.setScalar(.5+k*e.r); e.mesh.material.opacity=Math.max(0,.9*(1-k)); e.mesh.material.color.setHSL(.08-k*.06,1,.55-k*.2); }
    else if(e.kind==='puff'){ e.mesh.scale.setScalar(1+k*2); e.mesh.material.opacity=.6*(1-k); }
    else { e.v.y+=GRAV*.7*dt; e.mesh.position.addScaledVector(e.v,dt); e.mesh.rotation.x+=dt*10; e.mat.opacity=1-k; }
    if(e.t>=e.dur){ scene.remove(e.mesh); if(e.kind!=='chip') e.mesh.material.dispose(); effects.splice(i,1); }
  }
}

// ── Healing & shield items ──
function startUse(slot){
  const it=inventory[slot]; if(!it) return;
  const d=ITEMS[it.type];
  if(d.kind==='heal'&&hp>=d.cap){ toast(hp>=MAX_HP?'Je HP is al vol':`${d.name} heelt maximaal tot ${d.cap} HP`); return; }
  if(d.kind==='shield'&&shield>=d.cap){ toast(shield>=MAX_SH?'Je schild is al vol':`${d.name} werkt maar tot ${d.cap} schild`); return; }
  usingItem={slot,type:it.type,start:performance.now(),dur:d.use};
  barInfo={label:`${d.name} gebruiken…`,start:usingItem.start,dur:d.use};
}
function cancelUse(){ if(usingItem){ usingItem=null; barInfo=null; } }
function updateUse(now){
  if(!usingItem) return;
  if(now-usingItem.start<usingItem.dur) return;
  const slot=usingItem.slot, type=usingItem.type, it=inventory[slot], d=ITEMS[type];
  usingItem=null; barInfo=null;
  if(!it||it.type!==type) return;
  // heal/shield up to the item's cap, never lower than what you already have
  if(d.kind==='heal'){ hp=Math.min(MAX_HP,Math.max(hp,Math.min(d.cap,hp+d.amount))); SFX.heal(); }
  else { shield=Math.min(MAX_SH,Math.max(shield,Math.min(d.cap,shield+d.amount))); SFX.shieldUp(); }
  it.count--; if(it.count<=0){ inventory[slot]=null; if(currentSlot===slot) autoSelect(); }
  stats.heals++; saveStats();
  if(hp>=MAX_HP&&shield>=MAX_SH) ach('full_shield');
  updateHpUI(); updateHotbarUI(); updateAmmoUI();
}
function addHealth(n){
  const toHp=Math.min(n,MAX_HP-hp); hp+=toHp;
  shield=Math.min(MAX_SH,shield+(n-toHp));
  updateHpUI();
  if(hp>=MAX_HP&&shield>=MAX_SH) ach('full_shield');
}

// ── Reloading ──
function startReload(){
  const it=curItem(); if(!it||!isGunLike(it.type)) return;
  const d=ITEMS[it.type];
  if(isReloading||it.ammo===d.ammo||it.res===0) return;
  isReloading=true; SFX.reload();
  barInfo={label:'Herladen',start:performance.now(),dur:d.reload};
  const slot=currentSlot;
  reloadTid=setTimeout(()=>{
    isReloading=false; barInfo=null;
    const w=inventory[slot]; if(!w) return;
    const take=Math.min(d.ammo-w.ammo,w.res); w.ammo+=take; w.res-=take;
    SFX.click(); updateAmmoUI(); updateHotbarUI();
  },d.reload);
}
function cancelReload(){ if(isReloading){ clearTimeout(reloadTid); isReloading=false; barInfo=null; } }
function updateBar(now){
  const w=$('reload-wrap');
  if(!barInfo){ w.style.display='none'; return; }
  w.style.display='block'; $('reload-label').textContent=barInfo.label;
  $('reload-fill').style.width=Math.min(100,(now-barInfo.start)/barInfo.dur*100)+'%';
}

// ── Taking damage ──
function takeDmg(dmg,fromId,hitPt,w){
  if(isDead||inBus) return;
  if(isPit()&&performance.now()<spawnProtUntil) return;
  lastHit={uid:fromId,w};
  let rest=dmg;
  if(shield>0){ const a=Math.min(shield,rest); shield-=a; rest-=a; SFX.shieldHit(); }
  hp=Math.max(0,hp-rest);
  if(rest>0) SFX.hurt();
  updateHpUI();
  const vig=$('vig'); vig.style.opacity='.9'; setTimeout(()=>vig.style.opacity='0',320);
  camYaw.x+=.04; setTimeout(()=>camYaw.x-=.04,80);
  if(hitPt) showDmgNum(new THREE.Vector3(hitPt.x,hitPt.y,hitPt.z),dmg,'#fff',18);
  if(hp<=0) die(fromId);
}
function stormDmg(n){
  if(isDead) return;
  hp=Math.max(0,hp-n); updateHpUI(); SFX.stormTick();
  const vig=$('vig'); vig.style.opacity='.5'; setTimeout(()=>vig.style.opacity='0',250);
  if(hp<=0){ lastHit={uid:'storm',w:'storm'}; die('storm'); }
}
function makeDeathDrops(){
  const list=[], base=camera.position, y=getFeetY()+.6;
  const items=inventory.filter(Boolean).map(x=>JSON.parse(JSON.stringify(x)));
  if(wood>0) items.push({type:'wood',count:wood});
  items.forEach((it,i)=>{
    const a=i/Math.max(1,items.length)*Math.PI*2;
    list.push({id:myUserId+'_d'+SESSION_TAG+'_'+i+'_'+Date.now().toString(36),item:it,
      x:+(base.x+Math.cos(a)*1.4).toFixed(2),y:+y.toFixed(2),z:+(base.z+Math.sin(a)*1.4).toFixed(2)});
  });
  return list;
}
function die(killerId){
  if(isDead) return;
  isDead=true; aliveMap.set(myUserId,false);
  mouseHeld=false; aiming=false; cancelUse(); cancelReload(); brGlide=false;
  $('glide').style.display='none'; $('storm-tint').style.display='none'; SFX.stormLoop(false);
  showGun(null); if(ghostMesh) ghostMesh.visible=false;
  SFX.death();
  const kn=nameOf(killerId), kt=teamOf(killerId);
  const w=lastHit&&lastHit.uid===killerId?lastHit.w:null;
  let drops=[];
  if(isBR()){
    drops=makeDeathDrops();
    drops.forEach(d=>addPickup(d.id,d.item,d.x,d.y,d.z,false,true));
    inventory=[null,null,null,null,null]; currentSlot=-1; wood=0;
    updateHotbarUI(); updateMatsUI(); updateAmmoUI();
  }
  netSend({type:'dead',by:killerId,w,drops});
  startKillcam(killerId);
  addKF(killerId==='storm'?'De storm heeft je te pakken gekregen':`Je bent uitgeschakeld door ${kn}`,'mine');
  $('elim').style.display='flex';
  const by=$('elim-by'); by.innerHTML='';
  const sp=document.createElement('span'); sp.textContent=kn; sp.style.color=killerId==='storm'?'#c084fc':(TEAM_HEX[teamTint(kt)]||'#fff');
  by.append(killerId==='storm'?'Uitgeschakeld door ':'Uitgeschakeld door ',sp);
  if(isPit()){
    $('elim-btns').style.display='none'; $('elim-place').textContent='';
    pitDeaths++; pitStreak=0;
    if(killerId&&killerId!=='storm'){ const ks=pitScores.get(killerId)||{k:0,d:0}; ks.k++; pitScores.set(killerId,ks); }
    updatePitBoard();
    let n=3;
    const show=()=>{ $('elim-place').textContent=`Respawn over ${n}…`; };
    show(); clearInterval(respawnTid);
    respawnTid=setInterval(()=>{ n--; if(n<=0){ clearInterval(respawnTid); respawnPit(false); } else show(); },1000);
    return;
  }
  $('elim-btns').style.display='flex';
  if(isBR()){
    let alive=0; others.forEach((p,uid)=>{ if(aliveMap.get(uid)!==false) alive++; });
    const place=alive+1;
    $('elim-place').textContent=`#${place} van de ${members.length}`;
    if(place<=3&&members.length>=3) ach('br_top3');
  } else $('elim-place').textContent='';
  document.exitPointerLock();
  checkWin();
}
