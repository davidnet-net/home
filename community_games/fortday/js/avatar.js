'use strict';
// ═══════════════════════════════════════════════════════════
//  AVATARS: jointed characters with cosmetics (player editor), walk/jump animation,
//  the item they hold, and smooth interpolation of other players' movement
// ═══════════════════════════════════════════════════════════
const HATS=['none','cap','beanie','tophat','cowboy','crown','party','horns','halo','viking','chef','headphones'];
const HAT_LABEL={none:'Geen',cap:'Pet',beanie:'Muts',tophat:'Hoge hoed',cowboy:'Cowboyhoed',crown:'Kroon',party:'Feesthoedje',
  horns:'Hoorns',halo:'Aureool',viking:'Vikinghelm',chef:'Koksmuts',headphones:'Koptelefoon'};
const HAT_ICON={none:'🚫',cap:'🧢',beanie:'🧶',tophat:'🎩',cowboy:'🤠',crown:'👑',party:'🥳',horns:'😈',halo:'😇',viking:'⚔️',chef:'👨‍🍳',headphones:'🎧'};
const BODIES={
  normal:{tw:.58,th:.8, td:.38,lw:.23,ll:.72,aw:.22,s:1},
  slim:  {tw:.46,th:.82,td:.3, lw:.19,ll:.76,aw:.17,s:1},
  bulky: {tw:.74,th:.78,td:.48,lw:.28,ll:.68,aw:.27,s:1},
  tiny:  {tw:.56,th:.72,td:.38,lw:.24,ll:.6, aw:.21,s:.9},
};
const BODY_LABEL={normal:'Normaal',slim:'Slank',bulky:'Breed',tiny:'Klein'};
const FACES=['smile','cool','angry','surprised','robot','sleepy'];
const FACE_LABEL={smile:'😊 Blij',cool:'😎 Cool',angry:'😠 Boos',surprised:'😮 Verbaasd',robot:'🤖 Robot',sleepy:'😴 Slaperig'};
const DEFAULT_SKIN={body:'normal',skin:'#f5c8a0',outfit:'#3b82f6',pants:'#1e293b',hat:'cap',hatColor:'#ef4444',face:'smile'};

function sanitizeSkin(s){
  const o={...DEFAULT_SKIN}; if(!s||typeof s!=='object') return o;
  const col=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
  if(BODIES[s.body]) o.body=s.body;
  if(HATS.includes(s.hat)) o.hat=s.hat;
  if(FACES.includes(s.face)) o.face=s.face;
  ['skin','outfit','pants','hatColor'].forEach(k=>{ if(col(s[k])) o[k]=s[k]; });
  return o;
}

const faceTexCache={};
function faceTex(face,skin){
  const key=face+skin; if(faceTexCache[key]) return faceTexCache[key];
  const cv=document.createElement('canvas'); cv.width=cv.height=64; const c=cv.getContext('2d');
  c.fillStyle=skin; c.fillRect(0,0,64,64);
  c.fillStyle='#1b1b1b'; c.strokeStyle='#1b1b1b'; c.lineWidth=4; c.lineCap='round';
  const eye=(x,y,r)=>{ c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill(); };
  if(face==='cool'){ c.fillRect(10,20,44,10); c.fillRect(30,22,4,4); c.beginPath(); c.moveTo(22,46); c.quadraticCurveTo(34,52,44,44); c.stroke(); }
  else if(face==='angry'){ eye(22,28,4); eye(42,28,4); c.beginPath(); c.moveTo(14,18); c.lineTo(28,23); c.moveTo(50,18); c.lineTo(36,23); c.stroke(); c.beginPath(); c.moveTo(22,48); c.quadraticCurveTo(32,40,42,48); c.stroke(); }
  else if(face==='surprised'){ eye(22,26,5); eye(42,26,5); c.beginPath(); c.arc(32,46,6,0,Math.PI*2); c.stroke(); }
  else if(face==='robot'){ c.fillStyle='#38bdf8'; c.fillRect(14,20,12,8); c.fillRect(38,20,12,8); c.fillStyle='#1b1b1b'; for(let i=0;i<5;i++) c.fillRect(18+i*6,42,4,8); }
  else if(face==='sleepy'){ c.beginPath(); c.moveTo(16,28); c.lineTo(28,28); c.moveTo(36,28); c.lineTo(48,28); c.stroke(); c.beginPath(); c.arc(32,46,3,0,Math.PI*2); c.fill(); c.font='bold 12px sans-serif'; c.fillText('z',48,14); }
  else { eye(22,26,4); eye(42,26,4); c.beginPath(); c.arc(32,38,11,.15*Math.PI,.85*Math.PI); c.stroke(); }
  const t=new THREE.CanvasTexture(cv); t.magFilter=THREE.NearestFilter; return faceTexCache[key]=t;
}

function makeHat(type,color){
  const g=new THREE.Group(), m=M(color), dark=M(0x222222), gold=M(0xf2c230), white=M(0xf8fafc);
  const add=(mesh,x,y,z)=>{ mesh.position.set(x||0,y||0,z||0); g.add(mesh); return mesh; };
  const cylM=(rt,rb,h,mat,seg)=>new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||14),mat);
  switch(type){
    case 'cap': add(box(.52,.14,.52,m),0,.07); add(box(.4,.04,.26,m),0,.02,-.36); break;
    case 'beanie': add(cylM(.27,.29,.22,m),0,.1); add(new THREE.Mesh(new THREE.SphereGeometry(.08,8,6),white),0,.26); break;
    case 'tophat': add(cylM(.42,.42,.04,dark),0,.02); add(cylM(.25,.25,.42,dark),0,.23); add(cylM(.255,.255,.07,m),0,.08); break;
    case 'cowboy': add(cylM(.52,.55,.05,m),0,.02); add(cylM(.22,.27,.26,m),0,.15); break;
    case 'crown': add(cylM(.27,.27,.14,gold),0,.07);
      for(let i=0;i<5;i++){ const a=i/5*Math.PI*2; const s=new THREE.Mesh(new THREE.ConeGeometry(.06,.16,4),gold); add(s,Math.cos(a)*.22,.2,Math.sin(a)*.22); } break;
    case 'party': { const c=new THREE.Mesh(new THREE.ConeGeometry(.2,.45,12),m); add(c,0,.22); add(new THREE.Mesh(new THREE.SphereGeometry(.06,8,6),white),0,.46); break; }
    case 'horns': [-1,1].forEach(s=>{ const h=new THREE.Mesh(new THREE.ConeGeometry(.06,.22,8),M(0xb91c1c)); h.rotation.z=-s*.4; add(h,s*.17,.08); }); break;
    case 'halo': { const h=new THREE.Mesh(new THREE.TorusGeometry(.2,.03,8,24),new THREE.MeshBasicMaterial({color:0xfde047})); h.rotation.x=Math.PI/2; add(h,0,.28); break; }
    case 'viking': add(new THREE.Mesh(new THREE.SphereGeometry(.28,12,8,0,Math.PI*2,0,Math.PI/2),M(0x9ca3af)),0,-.02);
      [-1,1].forEach(s=>{ const h=new THREE.Mesh(new THREE.ConeGeometry(.06,.3,8),white); h.rotation.z=-s*1.1; add(h,s*.32,.12); }); break;
    case 'chef': add(cylM(.24,.22,.28,white),0,.14); add(new THREE.Mesh(new THREE.SphereGeometry(.28,12,8),white),0,.32); break;
    case 'headphones': { const b=new THREE.Mesh(new THREE.TorusGeometry(.28,.03,6,16,Math.PI),M(color)); add(b,0,-.05);
      [-1,1].forEach(s=>add(box(.08,.16,.16,m),s*.28,-.1)); break; }
  }
  g.traverse(c=>{ if(c.isMesh){ c.castShadow=true; c.userData.head=true; } });
  return g;
}

// Builds a character. accent = team colour index (belt) or -1
function buildAvatar(skinIn,accent){
  const skin=sanitizeSkin(skinIn), B=BODIES[skin.body];
  const root=new THREE.Group();
  const outfit=M(skin.outfit), pants=M(skin.pants), skinM=M(skin.skin);
  const mk=(w,h,d,mat,x,y,z,parent)=>{ const m=box(w,h,d,mat,[x,y,z]); m.castShadow=true; parent.add(m); return m; };
  const hipY=B.ll;
  const legL=new THREE.Group(), legR=new THREE.Group();
  legL.position.set(-B.tw*.24,hipY,0); legR.position.set(B.tw*.24,hipY,0);
  mk(B.lw,B.ll,B.lw+.02,pants,0,-B.ll/2,0,legL); mk(B.lw+.02,.1,B.lw+.1,M(0x222222),0,-B.ll+.05,-.04,legL);
  mk(B.lw,B.ll,B.lw+.02,pants,0,-B.ll/2,0,legR); mk(B.lw+.02,.1,B.lw+.1,M(0x222222),0,-B.ll+.05,-.04,legR);
  root.add(legL,legR);
  const torso=mk(B.tw,B.th,B.td,outfit,0,hipY+B.th/2,0,root);
  if(accent>=0&&TEAM_RGB[accent]!=null) mk(B.tw+.03,.1,B.td+.03,new THREE.MeshLambertMaterial({color:TEAM_RGB[accent],emissive:TEAM_RGB[accent],emissiveIntensity:.35}),0,hipY+.08,0,root);
  const shY=hipY+B.th-.06;
  const armL=new THREE.Group(), armR=new THREE.Group();
  armL.position.set(-(B.tw/2+B.aw/2),shY,0); armR.position.set(B.tw/2+B.aw/2,shY,0);
  mk(B.aw,.46,B.aw,outfit,0,-.23,0,armL); mk(B.aw*.9,.18,B.aw*.9,skinM,0,-.55,0,armL);
  mk(B.aw,.46,B.aw,outfit,0,-.23,0,armR); mk(B.aw*.9,.18,B.aw*.9,skinM,0,-.55,0,armR);
  const hand=new THREE.Group(); hand.position.set(0,-.6,0); armR.add(hand);
  root.add(armL,armR);
  const headG=new THREE.Group(); headG.position.set(0,shY+.33,0); root.add(headG);
  const faceMat=new THREE.MeshLambertMaterial({map:faceTex(skin.face,skin.skin)});
  const head=new THREE.Mesh(new THREE.BoxGeometry(.48,.5,.48),[skinM,skinM,skinM,skinM,skinM,faceMat]);
  head.castShadow=true; head.userData.head=true; headG.add(head);
  if(skin.hat!=='none'){ const h=makeHat(skin.hat,new THREE.Color(skin.hatColor).getHex()); h.position.y=.25; headG.add(h); }
  root.scale.setScalar(B.s);
  return {root,legL,legR,armL,armR,hand,headG,head,torso,skin};
}

// ── Item in the hand (third person) ──
function setHeld(p,type,rarity){
  if(p.heldType===type&&p.heldRarity===(rarity|0)) return;
  p.heldType=type; p.heldRarity=rarity|0;
  const hand=p.av.hand;
  while(hand.children.length) hand.remove(hand.children[0]);
  p.heldModel=null;
  if(!type||!GUN_GROUPS[type]) return;
  const m=GUN_GROUPS[type].clone(true);
  m.visible=true; m.scale.setScalar(type==='pickaxe'?2.3:1.45);
  m.rotation.set(-Math.PI/2,0,0); m.position.set(0,0,0);
  m.traverse(c=>{ c.userData.noHit=true; c.castShadow=true;
    if(c.name==='flash'){ c.material=c.material.clone(); c.material.opacity=0; }
    if(c.name==='accent'){ c.material=c.material.clone(); c.material.color.setHex(RARITY[rarity|0].hex); c.material.emissive.setHex(RARITY[rarity|0].hex); } });
  hand.add(m); p.heldModel=m;
}
function flashHeld(p){
  if(!p||!p.heldModel) return;
  const fl=p.heldModel.getObjectByName('flash'); if(!fl) return;
  fl.material.opacity=1; setTimeout(()=>{ fl.material.opacity=0; },60);
}

// ── Other players ──
function makeOtherPlayer(team,name,skin){
  const g=new THREE.Group();
  const ti=teamTint(team);
  const s=skin?sanitizeSkin(skin):{...DEFAULT_SKIN,outfit:'#'+new THREE.Color(TEAM_RGB[ti]!=null?TEAM_RGB[ti]:TEAM_RGB[1]).getHexString()};
  const accent=(isPit()||isBR())?-1:ti;
  const av=buildAvatar(s,accent); g.add(av.root);
  const p={group:g,av,headMesh:av.head,team,tag:null,tagName:name,skinKey:skin?JSON.stringify(s):null,
    target:null,targetYaw:0,speed:0,phase:0,air:false,heldType:null,heldModel:null,seen:false};
  if(name){ p.tag=makeNameTag(name,TEAM_HEX[ti]||'#fff'); g.add(p.tag); }
  return p;
}
function applySkin(p,skin){
  const s=sanitizeSkin(skin), key=JSON.stringify(s);
  if(p.skinKey===key) return;
  p.skinKey=key;
  const held=p.heldType;
  p.group.remove(p.av.root);
  p.av=buildAvatar(s,(isPit()||isBR())?-1:teamTint(p.team));
  p.group.add(p.av.root); p.headMesh=p.av.head;
  p.heldType=null; setHeld(p,held,p.heldRarity);
}
// All hittable meshes of a player (head = head box + hat)
function playerHitMeshes(p,out,uid){
  p.av.root.traverse(c=>{ if(c.isMesh&&!c.userData.noHit) out.push({mesh:c,uid,isHead:!!c.userData.head}); });
}

const angLerp=(a,b,k)=>{ let d=((b-a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI; return a+d*k; };
function updateOthers(dt){
  const kPos=1-Math.exp(-dt*13), kRot=1-Math.exp(-dt*16), kAnim=1-Math.exp(-dt*14);
  others.forEach(p=>{
    if(p.target&&p.group.visible&&Number.isFinite(p.group.position.x+p.group.position.z)){
      const g=p.group.position, ox=g.x, oz=g.z;
      g.lerp(p.target,kPos);
      p.group.rotation.y=angLerp(p.group.rotation.y,p.targetYaw,kRot);
      const inst=Math.hypot(g.x-ox,g.z-oz)/Math.max(dt,1e-3);
      p.speed+=(inst-p.speed)*Math.min(1,dt*10);
    }
    animateAvatar(p,dt,kAnim);
  });
}
// ── EMOTES ──
const EMOTES=[
  {id:'wave', name:'Zwaaien',   icon:'👋', dur:2.6},
  {id:'dance',name:'Dansen',    icon:'💃', dur:4.5},
  {id:'floss',name:'Flossen',   icon:'🕺', dur:4.5},
  {id:'clap', name:'Klappen',   icon:'👏', dur:2.6},
  {id:'laugh',name:'Lachen',    icon:'😂', dur:3},
  {id:'flex', name:'Spierballen',icon:'💪', dur:3},
  {id:'spin', name:'Rondjes',   icon:'🌀', dur:3},
  {id:'sit',  name:'Zitten',    icon:'🪑', dur:6},
];
const EMOTE_BY_ID=Object.fromEntries(EMOTES.map(e=>[e.id,e]));
function setEmote(p,id){
  const e=id&&EMOTE_BY_ID[id];
  p.emote=e?{id,t:0,dur:e.dur}:null;
  if(!p.bubble){
    p.bubble=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false,depthTest:false}));
    p.bubble.scale.set(.9,.9,1); p.bubble.position.y=3.15; p.bubble.renderOrder=998; p.bubble.userData.noHit=true; p.group.add(p.bubble);
  }
  p.bubble.visible=!!e;
  if(e){ p.bubble.material.map=iconTex(e.icon); p.bubble.material.needsUpdate=true; }
}

// Arm/leg rotation: positive x = swing FORWARD (arms point forward at about +1.5).
// z: positive moves the LEFT arm inward / RIGHT arm outward (z is applied before x).
function animateAvatar(p,dt,k){
  const a=p.av, sp=Math.min(1,p.speed/9);
  if(sp>.05) p.phase+=dt*(5+p.speed*.9);
  const sw=Math.sin(p.phase)*.8*sp;
  let lL=sw, lR=-sw, aL=-sw*.6, aR=sw*.6, aLz=0, aRz=0, bob=Math.abs(Math.sin(p.phase))*.05*sp;
  let rootY=0, rootX=0, rootSpin=0, rootTilt=0;
  if(p.air){ lL=.75; lR=-.35; aL=2.6; aR=2.6; bob=0; }
  // crouch: lower body + bent legs · slide: sitting back with legs forward
  if(p.slide){ lL=1.35; lR=1.25; rootY=-.74; rootTilt=.42; bob=0; }
  else if(p.crouch&&!p.air){ lL=1.0+sw*.35; lR=1.0-sw*.35; rootY=-.42; rootTilt=-.12; bob*=.4; }
  const kind=p.heldType?ITEMS[p.heldType]&&ITEMS[p.heldType].kind:null;
  if(kind==='gun'||kind==='launcher'){ aR=1.45; aL=1.3; aLz=.45; }     // both hands on the weapon, pointing forward
  else if(kind==='melee') aR=.55-sw*.3;
  else if(kind) aR=.95;
  if(p.swingT>0){ aR=2.4-(1-p.swingT)*2.4; p.swingT=Math.max(0,p.swingT-dt*3.5); }
  // emotes override the pose
  if(p.emote){
    const e=p.emote; e.t+=dt; const t=e.t;
    if(p.speed>2.5||t>e.dur){ setEmote(p,null); }
    else switch(e.id){
      case 'wave': aR=Math.PI-.2; aRz=.35+Math.sin(t*10)*.35; aL=0; break;
      case 'dance': { const s=Math.sin(t*8); aL=1.6+s*1.2; aR=1.6-s*1.2; lL=Math.max(0,s)*.6; lR=Math.max(0,-s)*.6; bob=Math.abs(Math.sin(t*8))*.12; rootTilt=Math.sin(t*4)*.15; break; }
      case 'floss': { const s=Math.sin(t*9); aL=.3; aR=.3; aLz=s*.9; aRz=s*.9; rootX=-s*.08; lL=lR=0; break; }
      case 'clap': aL=1.35; aR=1.35; aLz=.25+Math.max(0,Math.sin(t*14))*.35; aRz=-.25-Math.max(0,Math.sin(t*14))*.35; break;
      case 'laugh': aL=.7; aR=.7; aLz=.5; aRz=-.5; rootTilt=.18+Math.sin(t*16)*.06; break;
      case 'flex': aL=0; aR=0; aLz=-1.5; aRz=1.5; bob=Math.abs(Math.sin(t*3))*.04; break;
      case 'spin': aLz=-1.45; aRz=1.45; aL=aR=0; rootSpin=t*9; break;
      case 'sit': lL=1.5; lR=1.5; aL=.25; aR=.25; rootY=-.62; break;
    }
  }
  a.legL.rotation.x+=(lL-a.legL.rotation.x)*k; a.legR.rotation.x+=(lR-a.legR.rotation.x)*k;
  a.armL.rotation.x+=(aL-a.armL.rotation.x)*k; a.armR.rotation.x+=(aR-a.armR.rotation.x)*k;
  a.armL.rotation.z+=(aLz-a.armL.rotation.z)*k; a.armR.rotation.z+=(aRz-a.armR.rotation.z)*k;
  a.root.position.y+=(bob+rootY-a.root.position.y)*k;
  a.root.position.x+=(rootX-a.root.position.x)*k;
  a.root.rotation.x+=(rootTilt-a.root.rotation.x)*k;
  a.root.rotation.y=rootSpin?rootSpin:a.root.rotation.y*(1-k);
  if(p.heldModel){ p.heldModel.visible=!p.emote; if(p.heldModel.userData.spin) p.heldModel.rotation.y+=dt*20; }
}
