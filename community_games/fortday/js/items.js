'use strict';
// ═══════════════════════════════════════════════════════════
//  ITEMS: definitions, rarities, first-person models, pickups on the ground
// ═══════════════════════════════════════════════════════════
const RARITY=[
  {n:'Gewoon',       c:'#9ca3af', hex:0x9ca3af, m:1.00},
  {n:'Ongewoon',     c:'#22c55e', hex:0x22c55e, m:1.06},
  {n:'Zeldzaam',     c:'#3b82f6', hex:0x3b82f6, m:1.12},
  {n:'Episch',       c:'#a855f7', hex:0xa855f7, m:1.18},
  {n:'Legendarisch', c:'#f59e0b', hex:0xf59e0b, m:1.25},
];

// kind: melee | gun | launcher | throw | heal | shield | ammo | mat
const ITEMS={
  pickaxe:   {kind:'melee',   name:'Pikhouweel', icon:'⛏️', dmg:20, buildDmg:50, cd:430, range:3.8, auto:true},
  pistol:    {kind:'gun',     name:'Pistool',    icon:'🔫', dmg:24, headMult:1.6, pellets:1, spread:.010, cd:230, reload:1100, ammo:16, res:64,  recoil:.014, recoilH:.003},
  revolver:  {kind:'gun',     name:'Revolver',   icon:'🤠', dmg:54, headMult:1.8, pellets:1, spread:.004, cd:650, reload:1900, ammo:6,  res:30,  recoil:.045, recoilH:.006},
  smg:       {kind:'gun',     name:'SMG',        icon:'💨', dmg:14, headMult:1.4, pellets:1, spread:.028, cd:70,  reload:1700, ammo:30, res:150, recoil:.006, recoilH:.004, auto:true},
  ar:        {kind:'gun',     name:'AR',         icon:'⚡', dmg:22, headMult:1.6, pellets:1, spread:.012, cd:105, reload:1800, ammo:30, res:120, recoil:.010, recoilH:.002, auto:true},
  minigun:   {kind:'gun',     name:'Minigun',    icon:'🌀', dmg:12, headMult:1.3, pellets:1, spread:.045, cd:55,  reload:3500, ammo:120,res:240, recoil:.004, recoilH:.004, auto:true, buildMult:1.6},
  shotgun:   {kind:'gun',     name:'Pump',       icon:'💥', dmg:12, headMult:1.4, pellets:8, spread:.10,  cd:800, reload:2200, ammo:5,  res:25,  recoil:.03,  recoilH:.004},
  tac:       {kind:'gun',     name:'Tactical',   icon:'🎯', dmg:9,  headMult:1.5, pellets:8, spread:.13,  cd:420, reload:2000, ammo:8,  res:32,  recoil:.02,  recoilH:.004},
  sniper:    {kind:'gun',     name:'Sniper',     icon:'🔭', dmg:105,headMult:2.5, pellets:1, spread:.09,  cd:1400,reload:2600, ammo:1,  res:12,  recoil:.08,  recoilH:.01, scope:true},
  rocket:    {kind:'launcher',name:'Raketwerper',icon:'🚀', dmg:95, buildDmg:400, radius:5, speed:55, cd:1100, reload:2800, ammo:1, res:6, recoil:.05, recoilH:.01},
  grenade:   {kind:'throw',   name:'Granaat',    icon:'💣', dmg:80, buildDmg:250, radius:4.5, fuse:2.2, cd:700, max:6, pick:3},
  bandage:   {kind:'heal',    name:'Verband',    icon:'🩹', amount:15, cap:75,  use:3000, max:15, pick:5},
  medkit:    {kind:'heal',    name:'Medkit',     icon:'🧰', amount:100,cap:100, use:6000, max:3,  pick:1},
  minishield:{kind:'shield',  name:'Mini schild',icon:'🧪', amount:25, cap:50,  use:2000, max:6,  pick:3},
  bigshield: {kind:'shield',  name:'Schilddrank',icon:'🛡️', amount:50, cap:100, use:4500, max:3,  pick:1},
  ammo:      {kind:'ammo',    name:'Munitiekist',icon:'📦'},
  wood:      {kind:'mat',     name:'Hout',       icon:'🪵'},
};
const LOOT_TABLE=[['pistol',10],['revolver',5],['smg',9],['ar',10],['minigun',2],['shotgun',9],['tac',6],['sniper',4],
  ['rocket',2],['grenade',6],['bandage',8],['medkit',4],['minishield',8],['bigshield',4],['ammo',10]];
const RARITY_W=[40,30,18,9,3];

function isGunLike(t){ const k=ITEMS[t]&&ITEMS[t].kind; return k==='gun'||k==='launcher'; }
function hasRarity(t){ return isGunLike(t); }
function makeItem(type,rarity,count){
  const d=ITEMS[type], it={type,rarity:rarity|0};
  if(isGunLike(type)){ it.ammo=d.ammo; it.res=d.res; }
  else if(d.kind!=='ammo') it.count=count||d.pick||1;
  return it;
}
function itemLabel(it){
  const d=ITEMS[it.type];
  return (hasRarity(it.type)?RARITY[it.rarity|0].n+' ':'')+d.name+(it.count>1?` ×${it.count}`:'');
}
function pickWeighted(R,list){ const tot=list.reduce((s,x)=>s+x[1],0); let r=R()*tot; for(const x of list){ r-=x[1]; if(r<=0) return x[0]; } return list[0][0]; }
function rollLoot(R,legend){
  const type=pickWeighted(R,LOOT_TABLE);
  let rar=0;
  if(hasRarity(type)) rar=legend?3+(R()<.45?1:0):+pickWeighted(R,RARITY_W.map((w,i)=>[i,w]));
  return makeItem(type,rar);
}

// ═══════════════════════════════════════════════════════════
//  FIRST-PERSON MODELS
// ═══════════════════════════════════════════════════════════
function flashMesh(z,y,size,color){
  const fl=new THREE.Mesh(new THREE.SphereGeometry(size,8,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0}));
  fl.position.set(0,y,z); fl.name='flash'; return fl;
}
function cyl(r,len,mat,pos,axis){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,10),mat);
  if(axis==='z') m.rotation.x=Math.PI/2; else if(axis==='x') m.rotation.z=Math.PI/2;
  if(pos) m.position.set(pos[0],pos[1],pos[2]); return m;
}
const FP={
  pistol(){ const g=new THREE.Group(), d=M(0x1a1a22), s=M(0x5c3d1e);
    g.add(box(.04,.04,.24,d,[0,.01,-.14]), box(.11,.08,.18,d,[0,0,.02]), box(.07,.15,.08,s,[0,-.1,.06]), box(.03,.03,.06,d,[0,.06,-.07]));
    g.add(flashMesh(-.27,.01,.03,0xffdd44)); return g; },
  revolver(){ const g=new THREE.Group(), d=M(0x2a2a30), s=M(0x6b4423), c=M(0x9a9aa5);
    g.add(box(.045,.045,.22,c,[0,.02,-.16]), cyl(.045,.07,d,[0,.01,-.03],'z'), box(.07,.07,.12,d,[0,.01,.05]), box(.065,.15,.075,s,[0,-.09,.09]));
    g.add(flashMesh(-.28,.02,.04,0xffcc55)); return g; },
  smg(){ const g=new THREE.Group(), d=M(0x22222a), m=M(0x3a3a46);
    g.add(box(.1,.09,.26,m,[0,0,0]), box(.035,.035,.12,d,[0,.01,-.19]), box(.05,.2,.05,d,[0,-.13,-.04]), box(.065,.13,.07,d,[0,-.1,.08]), box(.03,.03,.1,d,[0,.06,0]));
    g.add(flashMesh(-.26,.01,.03,0xffdd44)); return g; },
  ar(){ const g=new THREE.Group(), d=M(0x1e1e24), m=M(0x2c2c35), s=M(0x4a3520);
    g.add(box(.042,.042,.36,d,[0,.022,-.28]), cyl(.024,.055,d,[0,.022,-.495],'z'), box(.13,.09,.28,m,[0,0,.02]), box(.038,.032,.24,d,[0,.075,.01]),
      box(.018,.038,.018,d,[0,.106,-.12]), box(.055,.038,.025,d,[0,.106,.09]), box(.075,.17,.09,s,[0,-.105,.09]), box(.065,.17,.055,d,[0,-.1,0]),
      box(.095,.085,.2,s,[0,-.015,.2]), box(.095,.12,.038,d,[0,-.015,.305]));
    g.add(flashMesh(-.525,.022,.03,0xffdd44)); return g; },
  minigun(){ const g=new THREE.Group(), d=M(0x2b2b30), y=M(0xc9a227);
    for(let i=0;i<6;i++){ const a=i/6*Math.PI*2; g.add(cyl(.016,.5,d,[Math.cos(a)*.04,Math.sin(a)*.04,-.32],'z')); }
    g.add(cyl(.065,.05,y,[0,0,-.45],'z'), cyl(.065,.05,y,[0,0,-.2],'z'), box(.17,.15,.26,d,[0,-.01,.03]), box(.03,.12,.12,y,[0,.12,.02]));
    const f=flashMesh(-.6,0,.06,0xffcc33); g.add(f); g.userData.spin=true; return g; },
  shotgun(){ const g=new THREE.Group(), d=M(0x1a1a1e), w=M(0x6b3d18);
    g.add(box(.09,.045,.3,d,[-.015,.005,-.17]), box(.09,.045,.3,d,[.015,.005,-.17]), box(.1,.05,.025,d,[0,.005,-.28]), box(.1,.085,.2,d,[0,0,.04]),
      box(.1,.04,.1,M(0x553010),[0,-.015,-.05]), box(.075,.16,.085,w,[0,-.1,.08]), box(.085,.075,.18,w,[0,-.01,.19]), box(.085,.1,.034,d,[0,-.01,.285]));
    g.add(flashMesh(-.335,.005,.05,0xff8800)); return g; },
  tac(){ const g=new THREE.Group(), d=M(0x202024), t=M(0x8b7355);
    g.add(cyl(.024,.34,d,[0,.02,-.22],'z'), box(.09,.05,.12,t,[0,-.015,-.12]), box(.1,.09,.2,d,[0,0,.04]), box(.07,.15,.08,d,[0,-.1,.09]), box(.085,.08,.16,t,[0,-.01,.2]));
    g.add(flashMesh(-.4,.02,.05,0xff9922)); return g; },
  sniper(){ const g=new THREE.Group(), d=M(0x2d3b2a), b=M(0x111114), s=M(0x5a4630);
    g.add(cyl(.02,.6,b,[0,.02,-.42],'z'), box(.1,.09,.3,d,[0,0,0]), cyl(.035,.22,b,[0,.085,-.02],'z'), cyl(.042,.03,b,[0,.085,-.13],'z'),
      box(.07,.14,.07,s,[0,-.1,.08]), box(.09,.1,.24,d,[0,-.02,.26]));
    g.add(flashMesh(-.74,.02,.05,0xffdd44)); return g; },
  rocket(){ const g=new THREE.Group(), gr=M(0x4d6b35), d=M(0x1f1f22), r=M(0xc0392b);
    g.add(cyl(.085,.8,gr,[0,.06,-.12],'z'), cyl(.095,.06,d,[0,.06,-.52],'z'), cyl(.095,.06,d,[0,.06,.28],'z'), box(.06,.14,.07,d,[0,-.08,0]),
      box(.03,.05,.03,r,[0,.17,-.1]));
    g.add(flashMesh(-.56,.06,.09,0xff7722)); return g; },
  grenade(){ const g=new THREE.Group(), gr=M(0x3f5f2a), d=M(0x9a9a9a);
    const s=new THREE.Mesh(new THREE.SphereGeometry(.06,12,10),gr); g.add(s); g.add(box(.03,.04,.03,d,[0,.07,0]), box(.015,.06,.015,d,[.02,.07,.02])); return g; },
  bandage(){ const g=new THREE.Group(); g.add(cyl(.06,.1,M(0xf5f5f0),[0,0,0],'x'), cyl(.02,.102,M(0xd9c7a7),[0,0,0],'x')); return g; },
  medkit(){ const g=new THREE.Group(), r=M(0xd62828), w=M(0xffffff);
    g.add(box(.2,.14,.08,r,[0,0,0]), box(.12,.03,.01,w,[0,0,-.042]), box(.03,.1,.01,w,[0,0,-.042]), box(.08,.025,.02,M(0x333333),[0,.08,0])); return g; },
  minishield(){ const g=new THREE.Group(), b=new THREE.MeshLambertMaterial({color:0x38bdf8,emissive:0x0c4a6e});
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.055,12,10),b), cyl(.018,.05,M(0xe2e8f0),[0,.07,0]), cyl(.022,.015,M(0x334155),[0,.1,0])); return g; },
  bigshield(){ const g=new THREE.Group(), b=new THREE.MeshLambertMaterial({color:0x2563eb,emissive:0x1e3a8a});
    g.add(cyl(.06,.18,b,[0,0,0]), cyl(.025,.05,M(0xe2e8f0),[0,.11,0]), cyl(.03,.02,M(0x334155),[0,.145,0])); return g; },
  pickaxe(){ const g=new THREE.Group(), h=M(0x7a5230), m=M(0xa0a8b0), grip=M(0x3b2a1a);
    const handle=cyl(.02,.62,h,[0,.26,0]); g.add(handle, cyl(.024,.16,grip,[0,.02,0]));
    const head=box(.42,.06,.06,m,[0,.56,0]); g.add(head);
    const tipL=new THREE.Mesh(new THREE.ConeGeometry(.035,.14,6),m); tipL.rotation.z=Math.PI/2; tipL.position.set(-.27,.56,0); g.add(tipL);
    const tipR=new THREE.Mesh(new THREE.ConeGeometry(.035,.14,6),m); tipR.rotation.z=-Math.PI/2; tipR.position.set(.27,.56,0); g.add(tipR);
    // wrap so the swing animation can rotate/scale the outer group
    const w=new THREE.Group(); g.scale.setScalar(.5); g.position.y=-.12; w.add(g); return w; },
};
const GUN_GROUPS={};
Object.keys(FP).forEach(k=>{
  const g=FP[k]();
  if(isGunLike(k)){
    // rarity-coloured accent stripes along both sides of the weapon
    const bb=new THREE.Box3().setFromObject(g), sz=bb.getSize(new THREE.Vector3()), c=bb.getCenter(new THREE.Vector3());
    const am=new THREE.MeshLambertMaterial({color:0x9ca3af,emissive:0x9ca3af,emissiveIntensity:.45});
    [-1,1].forEach(s=>{ const st=box(.006,.016,sz.z*.38,am,[c.x+s*(sz.x*.32),c.y+sz.y*.12,c.z+sz.z*.08]); st.name='accent'; g.add(st); });
    g.userData.accentMat=am;
  }
  g.visible=false; g.traverse(c=>{ if(c.material) c.material.fog=false; }); wScene.add(g); GUN_GROUPS[k]=g;
});
function setAccent(group,rarity){ const am=group&&group.userData.accentMat; if(!am) return; const h=RARITY[rarity|0].hex; am.color.setHex(h); am.emissive.setHex(h); }
const GUN_POS={
  pistol:[.17,-.16,-.30], revolver:[.17,-.16,-.30], smg:[.19,-.18,-.32], ar:[.20,-.19,-.35], minigun:[.22,-.22,-.32],
  shotgun:[.18,-.18,-.32], tac:[.18,-.18,-.32], sniper:[.2,-.18,-.3], rocket:[.22,-.24,-.3],
  grenade:[.2,-.18,-.32], bandage:[.18,-.18,-.32], medkit:[.18,-.19,-.34], minishield:[.18,-.18,-.32], bigshield:[.18,-.19,-.32],
  pickaxe:[.3,-.3,-.68],
};
const gunPos=t=>GUN_POS[t]||GUN_POS.ar;
let gunRecoil=0, gunBobT=0, swingT=0, activeGunGroup=null, equipT=1, swayX=0, swayY=0;

function showGun(type){
  Object.values(GUN_GROUPS).forEach(g=>g.visible=false);
  const prev=activeGunGroup;
  activeGunGroup=null;
  if(type&&GUN_GROUPS[type]&&buildMode==='gun'&&!inBus&&!isDead){
    activeGunGroup=GUN_GROUPS[type]; activeGunGroup.visible=true;
    if(prev!==activeGunGroup) equipT=0;     // raise animation when switching
    const it=typeof curItem==='function'?curItem():null;
    setAccent(activeGunGroup,it&&it.type===type?it.rarity:0);
    const p=gunPos(type); activeGunGroup.position.set(p[0],p[1],p[2]);
    if(type==='pickaxe') activeGunGroup.rotation.set(-.15,-.25,.55); else activeGunGroup.rotation.set(0,.06,0);
  }
}
function doFlash(type){
  const g=GUN_GROUPS[type]; if(!g) return;
  const fl=g.getObjectByName('flash'); if(!fl) return;
  fl.material.opacity=1; setTimeout(()=>fl.material.opacity=0,55);
}

// ═══════════════════════════════════════════════════════════
//  OTHER PLAYERS' AVATARS
// ═══════════════════════════════════════════════════════════
function makeNameTag(name,color){
  const cv=document.createElement('canvas'); cv.width=256; cv.height=64;
  const c=cv.getContext('2d');
  c.fillStyle='rgba(0,0,0,.55)'; c.beginPath();
  if(c.roundRect) c.roundRect(4,8,248,48,14); else c.rect(4,8,248,48); c.fill();
  c.font='bold 30px Segoe UI, sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  c.fillStyle=color||'#fff'; c.fillText(String(name||'Speler').slice(0,16),128,33);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false,depthTest:false,sizeAttenuation:false,fog:false}));
  sp.scale.set(.22,.055,1); sp.position.y=2.5; sp.renderOrder=999; sp.userData.noHit=true;
  return sp;
}
// ═══════════════════════════════════════════════════════════
//  PICKUPS ON THE GROUND (synced: whoever picks one up tells the room)
// ═══════════════════════════════════════════════════════════
const pickupItems=[];      // {id,item,mesh,pos,active,respawn,tid}
let nearPickup=null, dropSeq=0;
const iconTexCache={};
function iconTex(emoji){
  if(iconTexCache[emoji]) return iconTexCache[emoji];
  const cv=document.createElement('canvas'); cv.width=cv.height=128;
  const c=cv.getContext('2d'); c.font='92px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  c.textAlign='center'; c.textBaseline='middle'; c.fillText(emoji,64,70);
  return iconTexCache[emoji]=new THREE.CanvasTexture(cv);
}
function makePickupMesh(it){
  const g=new THREE.Group();
  const d=ITEMS[it.type];
  const col=hasRarity(it.type)?RARITY[it.rarity|0].hex:(d.kind==='ammo'?0x94a3b8:d.kind==='mat'?0xd4a056:0xe2e8f0);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:iconTex(d.icon),transparent:true,depthWrite:false}));
  sp.scale.set(.85,.85,1); sp.position.y=.2; g.add(sp);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.42,.05,6,20),new THREE.MeshBasicMaterial({color:col}));
  ring.rotation.x=Math.PI/2; ring.position.y=-.32; g.add(ring);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2.4,6,1,true),
    new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:hasRarity(it.type)&&it.rarity>=3?.55:.28,depthWrite:false}));
  beam.position.y=.9; g.add(beam);
  return g;
}
// ttl: dropped stuff disappears after a while so long Pit matches don't fill up with junk
function pickupTTL(item){
  if(isGunLike(item.type)&&(item.ammo|0)===0&&(item.res|0)===0) return 15000;   // empty gun = useless
  if(item.type==='wood'&&(item.count|0)<=0) return 1000;
  return isPit()?75000:150000;
}
function addPickup(id,item,x,y,z,respawn,dropped){
  if(pickupItems.some(p=>p.id===id)) return;
  const mesh=makePickupMesh(item); mesh.position.set(x,y,z); scene.add(mesh);
  pickupItems.push({id,item,mesh,pos:new THREE.Vector3(x,y,z),active:true,respawn:!!respawn,tid:null,
    born:performance.now(),ttl:dropped?pickupTTL(item):0});
}
function takePickup(p){
  if(!p) return;
  p.active=false; p.mesh.visible=false;
  if(p.respawn){ clearTimeout(p.tid); p.tid=setTimeout(()=>{ p.active=true; p.mesh.visible=true; },20000); }
  else { scene.remove(p.mesh); const i=pickupItems.indexOf(p); if(i>=0) pickupItems.splice(i,1); }
}
function updatePickups(dt,now){
  nearPickup=null;
  const pos=camera.position, feet=getFeetY();
  let best=2.6;
  for(let i=pickupItems.length-1;i>=0;i--){
    const p=pickupItems[i];
    if(p.ttl){
      const age=now-p.born;
      if(age>p.ttl){ scene.remove(p.mesh); pickupItems.splice(i,1); continue; }
      if(p.ttl-age<5000) p.mesh.visible=Math.floor(age/200)%2===0;   // blink before vanishing
    }
    if(!p.active) continue;
    p.mesh.position.y=p.pos.y+Math.sin(now*.002+p.pos.x)*.1;
    p.mesh.children[1].rotation.z+=dt*2;
    if(isDead||inBus) continue;
    const dx=pos.x-p.pos.x, dz=pos.z-p.pos.z, d=Math.hypot(dx,dz);
    if(d<best && Math.abs(feet+.6-p.pos.y)<1.9){ best=d; nearPickup=p; }
  }
  const pp=$('pickup-prompt');
  if(nearPickup){
    const it=nearPickup.item, col=hasRarity(it.type)?RARITY[it.rarity|0].c:'#f8fafc';
    pp.style.display='block';
    pp.innerHTML=`<kbd>E</kbd><span style="color:${col}"></span>`;
    pp.querySelector('span').textContent=itemLabel(it)+' oppakken';
  } else pp.style.display='none';
}

// Fixed loot spots in the small arenas (same ids on every client so pickups stay in sync)
const ARENA_LOOT=[
  {x:0,z:0,t:'rocket',r:3},{x:12,z:-12,t:'shotgun',r:1},{x:-12,z:12,t:'smg',r:1},{x:18,z:18,t:'ar',r:2},
  {x:-18,z:-18,t:'tac',r:2},{x:18,z:-18,t:'revolver',r:1},{x:-18,z:18,t:'sniper',r:2},{x:8,z:-22,t:'minishield'},
  {x:-8,z:22,t:'minishield'},{x:22,z:8,t:'bigshield'},{x:-22,z:-8,t:'bandage'},{x:30,z:0,t:'medkit'},
  {x:-30,z:0,t:'grenade'},{x:0,z:30,t:'minigun',r:3},{x:0,z:-30,t:'ammo'},{x:26,z:-26,t:'ammo'},
  {x:-26,z:26,t:'grenade'},{x:-30,z:-30,t:'bigshield'},{x:30,z:30,t:'bandage'},{x:40,z:-12,t:'pistol',r:4},
  {x:-40,z:12,t:'ar',r:4},{x:12,z:40,t:'shotgun',r:3},{x:-12,z:-40,t:'medkit'},
];
function spawnArenaLoot(){ ARENA_LOOT.forEach((l,i)=>addPickup('f'+i,makeItem(l.t,l.r||0),l.x,.55,l.z,true)); }

function tryPickup(){
  if(!nearPickup||isDead||inBus) return;
  const p=nearPickup, it=JSON.parse(JSON.stringify(p.item)), d=ITEMS[it.type];
  if(d.kind==='ammo'){
    let any=false;
    inventory.forEach(w=>{ if(w&&isGunLike(w.type)){ const wd=ITEMS[w.type]; w.res=Math.min(wd.res*3,w.res+Math.max(wd.ammo*2,6)); any=true; } });
    if(!any){ toast('Je hebt nog geen wapen voor deze munitie'); return; }
    toast('📦 Munitie bijgevuld');
  } else if(d.kind==='mat'){
    if(!infMats()){ wood=Math.min(MAX_WOOD,wood+(it.count||0)); }
    toast(`🪵 +${it.count||0} hout`);
  } else {
    let placed=false;
    if(!isGunLike(it.type)){
      const s=inventory.findIndex(w=>w&&w.type===it.type&&w.count<d.max);
      if(s>=0){ inventory[s].count=Math.min(d.max,inventory[s].count+it.count); placed=true; }
    }
    if(!placed){
      let slot=inventory.findIndex(w=>!w);
      if(slot<0){
        if(currentSlot<0){ toast('Inventaris vol — kies eerst een slot (1-5) om te wisselen'); return; }
        slot=currentSlot; dropItem(inventory[slot]);
      }
      if(it.count) it.count=Math.min(it.count,d.max||it.count);
      inventory[slot]=it;
      if(currentSlot<0||slot===currentSlot) switchSlot(slot);
    }
    if(hasRarity(it.type)&&it.rarity>=4) ach('legendary');
    if(inventory.every(x=>x)) ach('hoarder');
  }
  netSend({type:'pick',id:p.id});
  takePickup(p);
  SFX.pickup();
  updateHotbarUI(); updateAmmoUI(); updateMatsUI();
}
function dropItem(it){
  if(!it) return;
  const id=myUserId+'_x'+SESSION_TAG+'_'+(++dropSeq), x=camera.position.x, z=camera.position.z, y=getFeetY()+.6;
  addPickup(id,it,x,y,z,false,true);
  netSend({type:'drop',id,item:it,x:+x.toFixed(2),y:+y.toFixed(2),z:+z.toFixed(2)});
}
