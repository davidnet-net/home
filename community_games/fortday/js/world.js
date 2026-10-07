'use strict';
// ═══════════════════════════════════════════════════════════
//  BATTLE ROYALE WORLD: trees/rocks, houses & towers, loot, storm, battle bus
//  Everything is generated from the match seed, so every client builds the same map.
// ═══════════════════════════════════════════════════════════

// ── Props (trees & rocks): block movement & bullets, give wood with the pickaxe ──
const propMap=new Map(), propMeshes=[];
const propGroup=new THREE.Group(); scene.add(propGroup);
const TRUNK_GEO=new THREE.CylinderGeometry(.35,.45,3,7), LEAF_GEO=new THREE.ConeGeometry(2.2,5,8), LEAF2_GEO=new THREE.ConeGeometry(1.5,3.4,8);
const ROCK_GEO=new THREE.DodecahedronGeometry(1,0);
const trunkMat=M(0x7a5230), leafMats=[M(0x2f7d32),M(0x3f8f3a),M(0x2b6e2e),M(0x4a9a3a)], rockMat=M(0x8a8a80);

const PINE_GEO=new THREE.ConeGeometry(1.7,3.2,7), CACTUS_GEO=new THREE.CylinderGeometry(.38,.42,3.2,8), CARM_GEO=new THREE.CylinderGeometry(.24,.26,1.3,7);
const autumnMats=[M(0xd97706),M(0xc2410c),M(0xeab308),M(0xb91c1c)];
const pineMat=M(0x245c33), snowMat=M(0xf4f8fb), cactusMat=M(0x4f8f3a), deadMat=M(0x4a3b30), lavaRockMat=new THREE.MeshLambertMaterial({color:0x2a2424,emissive:0x5a1405,emissiveIntensity:.35});
// kinds: tree · pine · snowpine · cactus · deadtree · rock · lavarock
function addProp(id,kind,x,z,s,R){
  const g=new THREE.Group(); g.position.set(x,0,z);
  const parts=[];
  const P=(geo,mat,px,py,pz,sx,sy,sz)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(px,py,pz); m.scale.set(sx,sy==null?sx:sy,sz==null?sx:sz); parts.push(m); return m; };
  const isRock=kind==='rock'||kind==='lavarock';
  if(kind==='tree'||kind==='autumn'){
    P(TRUNK_GEO,trunkMat,0,1.5*s,0,s);
    const mats=kind==='autumn'?autumnMats:leafMats, lm=mats[Math.floor(R()*mats.length)];
    P(LEAF_GEO,lm,0,4.8*s,0,s); P(LEAF2_GEO,lm,0,6.9*s,0,s);
  } else if(kind==='pine'||kind==='snowpine'){
    P(TRUNK_GEO,trunkMat,0,1.5*s,0,s*.8,s,s*.8);
    for(let i=0;i<3;i++){ const k=1-i*.25; P(PINE_GEO,pineMat,0,(3.2+i*1.9)*s,0,s*k); if(kind==='snowpine') P(PINE_GEO,snowMat,0,(3.75+i*1.9)*s,0,s*k*.62); }
  } else if(kind==='cactus'){
    P(CACTUS_GEO,cactusMat,0,1.6*s,0,s);
    const a1=P(CARM_GEO,cactusMat,.6*s,2*s,0,s); a1.rotation.z=-.15;
    const a2=P(CARM_GEO,cactusMat,-.55*s,1.6*s,0,s*.85); a2.rotation.z=.15;
  } else if(kind==='deadtree'){
    P(TRUNK_GEO,deadMat,0,1.5*s,0,s*.7,s*1.3,s*.7);
    const b1=P(CARM_GEO,deadMat,.5*s,3.4*s,0,s*.6,s*1.4,s*.6); b1.rotation.z=-.8;
    const b2=P(CARM_GEO,deadMat,-.45*s,2.8*s,0,s*.5,s*1.2,s*.5); b2.rotation.z=.9;
  } else {
    const r=P(ROCK_GEO,kind==='lavarock'?lavaRockMat:rockMat,0,s*.4,0,s*1.2,s*.85,s); r.rotation.set(R()*3,R()*3,R()*3);
  }
  parts.forEach(m=>{ m.castShadow=true; m.receiveShadow=true; m.userData.propId=id; g.add(m); propMeshes.push(m); });
  g.rotation.y=R()*Math.PI*2;
  propGroup.add(g);
  const hp=isRock?300:kind==='cactus'?150:200;
  propMap.set(id,{g,parts,x,z,kind,r:isRock?s*1.05:kind==='cactus'?.45*s:.5*s,h:isRock?s*1.3:kind==='cactus'?3.4*s:8*s,hp,maxHp:hp,wood:isRock?8:10});
}
function damageProp(id,dmg){
  const p=propMap.get(id); if(!p) return false;
  p.hp-=dmg;
  if(p.hp<=0){ removeProp(id); return true; }
  const k=1-.04; p.g.scale.setScalar(k); setTimeout(()=>p.g.scale.setScalar(1),70);
  return false;
}
function removeProp(id){
  const p=propMap.get(id); if(!p) return;
  propMap.delete(id);
  p.parts.forEach(m=>{ const i=propMeshes.indexOf(m); if(i>=0) propMeshes.splice(i,1); });
  SFX.collapse(p.g.position);
  // quick shrink-and-vanish animation
  let t=0; const g=p.g; const iv=setInterval(()=>{ t+=.05; g.scale.setScalar(Math.max(0,1-t*2.5)); g.rotation.z+=.06; if(t>=.4){ clearInterval(iv); propGroup.remove(g); } },16);
}

// ── Houses & towers are made of normal build pieces (same collision/damage code),
//    but they belong to the map: anyone can break them, and they never collapse.
function genBRWorld(seed,theme){
  theme=theme||{trees:'tree',extra:'autumn',rock:'rock'};
  const R=rng(seed);
  const used=[]; // occupied rectangles in grid cells
  const free=(x,z,w,d,pad)=>!used.some(o=>x<o.x2+pad&&x+w>o.x1-pad&&z<o.z2+pad&&z+d>o.z1-pad);
  function findSpot(w,d,pad){
    for(let t=0;t<120;t++){
      const x=Math.floor(R()*(92-w))-46, z=Math.floor(R()*(92-d))-46;
      if(free(x,z,w,d,pad)){ used.push({x1:x,z1:z,x2:x+w,z2:z+d}); return [x,z]; }
    }
    return null;
  }
  let n=0;
  const P=(type,gx,gy,gz,rot,color,hp)=>placeBuild(type,gx,gy,gz,rot,MAP_TEAM,'m'+(n++),{color,hp});
  const loot=[], chests=[];
  const L=(cx,cz,y,legend)=>loot.push({x:cx*GRID+(R()-.5)*1.2,y,z:cz*GRID+(R()-.5)*1.2,legend});
  const C=(cx,cz,y)=>chests.push({x:cx*GRID,y,z:cz*GRID,rot:Math.floor(R()*4)*Math.PI/2});
  function perimeter(x0,z0,w,d){
    const out=[];
    for(let i=0;i<w;i++){ out.push([x0+i,z0-.5,0]); out.push([x0+i,z0+d-.5,0]); }
    for(let j=0;j<d;j++){ out.push([x0-.5,z0+j,1]); out.push([x0+w-.5,z0+j,1]); }
    return out;
  }
  // Tower: 2x3 cells, straight ramps that switch back every floor, open roof for snipers
  function tower(x0,z0,N){
    const col=0x9b9b94, top=0x6b6b66, hp=320;
    for(let s=0;s<N;s++){
      perimeter(x0,z0,2,3).forEach(([gx,gz,rot])=>{
        if(s===0&&gx===x0&&gz===z0+2.5) return;            // door next to the first ramp
        if(s>0&&R()<.2) return;                            // window gap
        P('wall',gx,s,gz,rot,col,hp);
      });
      if(s%2===0) P('ramp',x0,s,z0+1,0,col,hp); else P('ramp',x0+1,s,z0+1,2,col,hp);
    }
    for(let k=1;k<=N;k++){
      const hole=(k-1)%2===0?[x0,z0+1]:[x0+1,z0+1];
      for(let i=0;i<2;i++) for(let j=0;j<3;j++){ if(x0+i===hole[0]&&z0+j===hole[1]) continue; P('floor',x0+i,k,z0+j,0,k===N?top:col,hp); }
    }
    L(x0+(N%2?1:0),z0+(N%2?2:0),N*GRID_H+WALL_T+.6,true);
    C(x0+(N%2?0:1),z0+(N%2?0:2),N*GRID_H+WALL_T);      // a chest on the roof
    L(x0+1,z0+2,.6,false);
  }
  const HOUSE_PAL=[[0xb5523b,0x6e2f22],[0xd8c3a5,0x8a5a3a],[0x7d8ea3,0x3f4a5a],[0x9fb38a,0x5b4636],[0xe0d6c3,0x9b3b2e],[0xc9a66b,0x4b3a2a]];
  function house(x0,z0,w,d,stories){
    const [col,roof]=HOUSE_PAL[Math.floor(R()*HOUSE_PAL.length)], hp=260;
    const walls=perimeter(x0,z0,w,d), door=Math.floor(R()*walls.length);
    for(let s=0;s<stories;s++) walls.forEach(([gx,gz,rot],i)=>{
      if(s===0&&i===door) return;
      if(R()<.14&&!(s===0&&Math.abs(i-door)<=1)) return;   // window gaps
      P('wall',gx,s,gz,rot,col,hp);
    });
    const stairs=stories===2&&w>=3;
    if(stairs) P('ramp',x0+1,0,z0,3,col,hp);              // rises +X from cell (0,0) to cell (2,0)
    for(let k=1;k<=stories;k++) for(let i=0;i<w;i++) for(let j=0;j<d;j++){
      if(stairs&&k===1&&i===1&&j===0) continue;
      P('floor',x0+i,k,z0+j,0,k===stories?roof:col,hp);
    }
    if(R()<.75){ const s=Math.floor(R()*stories); C(x0+Math.floor(R()*w),z0+d-1,s*GRID_H+(s>0?WALL_T:0)); }
    for(let s=0;s<stories;s++){
      const cnt=1+(R()<.5?1:0);
      for(let c=0;c<cnt;c++){ const i=Math.floor(R()*w), j=1+Math.floor(R()*(d-1)); L(x0+i,z0+Math.min(d-1,j),s*GRID_H+(s>0?WALL_T:0)+.6,false); }
    }
  }
  for(let i=0;i<6;i++){ const s=findSpot(2,3,3); if(s) tower(s[0],s[1],3+Math.floor(R()*3)); }
  for(let i=0;i<18;i++){
    const big=R()<.6, w=big?3:2, d=big?(R()<.5?2:3):2;
    const s=findSpot(w,d,2); if(s) house(s[0],s[1],w,d,big&&R()<.7?2:1);
  }
  // Trees & rocks (not inside buildings)
  const inUsed=(x,z,pad)=>used.some(o=>x>o.x1*GRID-2-pad&&x<o.x2*GRID-2+pad&&z>o.z1*GRID-2-pad&&z<o.z2*GRID-2+pad);
  let pid=0;
  for(let i=0;i<150;i++){ const x=(R()*2-1)*(BR_B-6), z=(R()*2-1)*(BR_B-6); if(inUsed(x,z,3)) continue; addProp('t'+(pid++),R()<.22?theme.extra:theme.trees,x,z,.8+R()*.6,R); }
  for(let i=0;i<45;i++){ const x=(R()*2-1)*(BR_B-6), z=(R()*2-1)*(BR_B-6); if(inUsed(x,z,3)) continue; addProp('r'+(pid++),theme.rock,x,z,1+R()*1.4,R); }
  // Floor loot out in the open
  for(let i=0;i<55;i++){ const x=(R()*2-1)*(BR_B-10), z=(R()*2-1)*(BR_B-10); if(inUsed(x,z,1)) continue; loot.push({x,y:.6,z,legend:R()<.04}); }
  for(let i=0;i<14;i++){ const x=(R()*2-1)*(BR_B-12), z=(R()*2-1)*(BR_B-12); if(inUsed(x,z,2)) continue; chests.push({x,y:0,z,rot:R()*Math.PI*2}); }
  loot.forEach((l,i)=>addPickup('l'+i,rollLoot(R,l.legend),l.x,l.y,l.z,false));
  chests.forEach((c,i)=>addChest('c'+i,c.x,c.y,c.z,c.rot));
}

// ═══════════════════════════════════════════════════════════
//  STORM: waits, then shrinks while the circle moves to the next centre
// ═══════════════════════════════════════════════════════════
const STORM_PHASES=[
  {wait:50,shrink:35,r:150,dps:1},{wait:40,shrink:30,r:100,dps:2},{wait:32,shrink:26,r:62,dps:3},
  {wait:26,shrink:22,r:36,dps:5},{wait:20,shrink:20,r:18,dps:7},{wait:15,shrink:18,r:7,dps:9},{wait:10,shrink:15,r:0,dps:12}
];
let storm=null, stormTickT=0, stormPhaseSeen=-1, stormWasIn=false;
const stormWall=new THREE.Mesh(new THREE.CylinderGeometry(1,1,180,72,1,true),
  new THREE.MeshBasicMaterial({color:0x8b2bd9,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false,fog:false}));
stormWall.position.y=70; stormWall.visible=false; scene.add(stormWall);

function makeStorm(seed,t0){
  const R=rng(seed^0x5eed);
  let c={x:0,z:0,r:BR_B*1.45};
  const ph=[]; let t=0;
  for(const p of STORM_PHASES){
    const maxOff=Math.max(0,c.r-p.r)*(ph.length===0?.4:.85);
    const a=R()*Math.PI*2, d=R()*maxOff, lim=Math.max(0,BR_B-p.r*.6-10);
    const nx=clamp(c.x+Math.cos(a)*d,-lim,lim), nz=clamp(c.z+Math.sin(a)*d,-lim,lim);
    ph.push({from:{...c},to:{x:nx,z:nz,r:p.r},shrinkStart:t+p.wait,end:t+p.wait+p.shrink,dps:p.dps});
    t+=p.wait+p.shrink; c={x:nx,z:nz,r:p.r};
  }
  return {ph,t0,final:c};
}
function stormState(now){
  const t=(now-storm.t0)/1000, ph=storm.ph;
  if(t<0) return {x:ph[0].from.x,z:ph[0].from.z,r:ph[0].from.r,next:ph[0].to,mode:'wait',left:ph[0].shrinkStart-t,dps:0,idx:0};
  for(let i=0;i<ph.length;i++){
    const p=ph[i];
    if(t<p.shrinkStart) return {x:p.from.x,z:p.from.z,r:p.from.r,next:p.to,mode:'wait',left:p.shrinkStart-t,dps:i?ph[i-1].dps:1,idx:i};
    if(t<p.end){
      const k=(t-p.shrinkStart)/(p.end-p.shrinkStart);
      return {x:p.from.x+(p.to.x-p.from.x)*k,z:p.from.z+(p.to.z-p.from.z)*k,r:p.from.r+(p.to.r-p.from.r)*k,next:p.to,mode:'shrink',left:p.end-t,dps:p.dps,idx:i};
    }
  }
  return {x:storm.final.x,z:storm.final.z,r:storm.final.r,next:null,mode:'final',left:0,dps:12,idx:ph.length};
}
function fmtT(s){ s=Math.max(0,Math.ceil(s)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function updateStorm(dt,now){
  if(!storm) return;
  const s=stormState(now);
  stormWall.position.x=s.x; stormWall.position.z=s.z; stormWall.scale.set(Math.max(.01,s.r),1,Math.max(.01,s.r));
  // the wall is more visible the closer you are to it (and hidden while it is still outside the map)
  const toWall=Math.abs(Math.hypot(camera.position.x-s.x,camera.position.z-s.z)-s.r);
  stormWall.visible=s.r<BR_B*1.35;
  stormWall.material.opacity=clamp(.42-toWall/260,.1,.42);
  const pill=$('storm-pill');
  const inside=Math.hypot(camera.position.x-s.x,camera.position.z-s.z)<=s.r;
  pill.style.display='block';
  let txt=s.mode==='wait'?`🌀 Storm krimpt over ${fmtT(s.left)}`:s.mode==='shrink'?`🌀 Storm trekt samen · ${fmtT(s.left)}`:'🌀 Laatste cirkel';
  if(!inside&&!isDead&&!inBus) txt+=' · ⚠️ JE ZIT IN DE STORM';
  pill.textContent=txt;
  pill.classList.toggle('warn',!inside&&!isDead);
  if(s.mode==='shrink'&&stormPhaseSeen!==s.idx){ stormPhaseSeen=s.idx; SFX.storm(); toast('🌀 De storm trekt samen!'); }
  const inStorm=!inside&&!isDead&&!inBus&&!brGlideHigh();
  $('storm-tint').style.display=inStorm?'block':'none';
  if(inStorm!==stormWasIn){ SFX.stormLoop(inStorm); stormWasIn=inStorm; }
  if(inStorm){
    matchStats.stormTime+=dt;
    if(matchStats.stormTime>=30) ach('storm_rider');
    stormTickT+=dt;
    if(stormTickT>=1){ stormTickT=0; stormDmg(Math.max(1,s.dps)); }
  } else stormTickT=0;
}
const brGlideHigh=()=>brGlide&&getFeetY()>40;   // no storm damage while still high up after the jump

// ═══════════════════════════════════════════════════════════
//  BATTLE BUS
// ═══════════════════════════════════════════════════════════
const BUS_DRIVERS=['Tom','Viktor','Tung tung sahur'];
const BUS_H=95, BUS_SPEED=30;
let bus=null;
function makeBusMesh(driver){
  const g=new THREE.Group();
  const blue=M(0x2f6fe0), dark=M(0x1e293b), glass=new THREE.MeshLambertMaterial({color:0x9bd5ff,emissive:0x1b4a6b}), white=M(0xf1f5f9), red=M(0xe11d48);
  g.add(box(3.2,2.8,8,blue,[0,0,0]));
  g.add(box(3.25,.35,8.05,white,[0,.6,0]));
  for(let i=-3;i<=3;i+=1.5){ g.add(box(3.3,1,1.1,glass,[0,.2,i])); }
  g.add(box(2.8,1.1,.1,glass,[0,.3,4.02]));
  g.add(box(3.4,.3,.3,M(0x94a3b8),[0,-1.2,4.1]));
  [[-1.5,-1.3,2.6],[1.5,-1.3,2.6],[-1.5,-1.3,-2.6],[1.5,-1.3,-2.6]].forEach(p=>{ const w=cyl(.55,.4,dark,p,'x'); g.add(w); });
  // Balloon on top
  const bal=new THREE.Mesh(new THREE.SphereGeometry(3.2,16,12),red); bal.position.y=7; g.add(bal);
  g.add(box(.08,3.2,.08,dark,[1.2,3.4,1.5]), box(.08,3.2,.08,dark,[-1.2,3.4,1.5]), box(.08,3.2,.08,dark,[1.2,3.4,-1.5]), box(.08,3.2,.08,dark,[-1.2,3.4,-1.5]));
  // Name tag for the driver
  const tag=makeNameTag('🚌 '+driver,'#fde68a'); tag.scale.set(.3,.075,1); tag.position.set(0,11,0); g.add(tag);
  g.traverse(c=>{ if(c.isMesh){ c.castShadow=true; c.userData.noHit=true; } });
  return g;
}
function makeBus(seed,t0){
  const R=rng(seed^0xb05);
  const ang=R()*Math.PI*2, off=(R()-.5)*140;
  const dir=new THREE.Vector3(Math.cos(ang),0,Math.sin(ang)), perp=new THREE.Vector3(-dir.z,0,dir.x);
  const c=perp.clone().multiplyScalar(off), L=BR_B+30;
  const start=c.clone().addScaledVector(dir,-L), end=c.clone().addScaledVector(dir,L);
  start.y=end.y=BUS_H;
  const driver=BUS_DRIVERS[Math.floor(R()*BUS_DRIVERS.length)];
  const group=makeBusMesh(driver);
  group.rotation.y=Math.atan2(dir.x,dir.z);
  scene.add(group);
  return {start,end,dir,driver,group,t0,dur:start.distanceTo(end)/BUS_SPEED*1000};
}
function busProgress(now){ return bus?clamp((now-bus.t0)/bus.dur,0,1):1; }
function busPos(now){ return bus.start.clone().lerp(bus.end,busProgress(now)); }
function updateBus(now){
  if(!bus) return;
  const p=busPos(now); bus.group.position.copy(p);
  bus.group.children.forEach(c=>{ if(c.geometry&&c.geometry.type==='SphereGeometry') c.position.y=7+Math.sin(now*.002)*.3; });
  if(inBus){
    const left=Math.max(0,(bus.dur-(now-bus.t0))/1000);
    $('bus-prompt').innerHTML=`🚌 Je zit in de Battle Bus — druk op <kbd>SPATIE</kbd> om te springen<small></small>`;
    $('bus-prompt').querySelector('small').textContent=`Chauffeur: ${bus.driver} · automatisch springen over ${Math.ceil(left)}s`;
    if(now<bus.t0) $('bus-prompt').querySelector('small').textContent=`Chauffeur: ${bus.driver} · de bus vertrekt bijna…`;
    if(busProgress(now)>=1) jumpFromBus(true);
  }
  if(busProgress(now)>=1&&now>bus.t0+bus.dur+4000&&bus.group.parent){ scene.remove(bus.group); }
}
function jumpFromBus(auto){
  if(!inBus) return;
  const now=performance.now();
  if(now<bus.t0){ return; }                       // bus hasn't left yet
  inBus=false;
  const p=busPos(now);
  camera.position.set(p.x+bus.dir.z*2.5,p.y-2,p.z-bus.dir.x*2.5);
  vel.set(0,0,0); onGround=false; brGlide=true;
  $('bus-prompt').style.display='none'; $('glide').style.display='block';
  SFX.busLoop(false); SFX.jump();
  if(!auto&&now-bus.t0<1000) ach('impatient');
  setMode('gun'); showGun(curType());
  sendPos();
}
function clearBRWorld(){
  propMap.forEach((p,id)=>{ propGroup.remove(p.g); }); propMap.clear(); propMeshes.length=0;
  if(bus&&bus.group.parent) scene.remove(bus.group); bus=null;
  storm=null; stormWall.visible=false;
}
