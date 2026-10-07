'use strict';
// ═══════════════════════════════════════════════════════════
//  BUILDING: pieces, real edge connections, damage looks, collapse, ghost
// ═══════════════════════════════════════════════════════════
const BUILD_HP={wall:150, floor:140, ramp:140};

// ── Procedural textures: 4 damage stages (0 = new, 3 = almost broken) ──
function makeBuildTex(kind,stage){
  const S=128, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const c=cv.getContext('2d'), R=rng(1234+stage*977+(kind==='wood'?1:2));
  if(kind==='wood'){
    for(let y=0;y<S;y+=32){
      const t=200+Math.floor(R()*30);
      c.fillStyle=`rgb(${t},${Math.floor(t*.72)},${Math.floor(t*.45)})`; c.fillRect(0,y,S,30);
      c.fillStyle='rgba(80,48,20,.75)'; c.fillRect(0,y+30,S,2);
      c.strokeStyle='rgba(120,75,35,.35)'; c.lineWidth=1;
      for(let k=0;k<5;k++){ const gy=y+3+R()*24; c.beginPath(); c.moveTo(0,gy); c.bezierCurveTo(40,gy+R()*4-2,90,gy+R()*4-2,S,gy); c.stroke(); }
      c.fillStyle='rgba(60,60,60,.8)'; c.fillRect(6,y+13,3,3); c.fillRect(S-9,y+13,3,3);
    }
  } else {
    c.fillStyle='#ececec'; c.fillRect(0,0,S,S);
    for(let i=0;i<260;i++){ const v=215+Math.floor(R()*35); c.fillStyle=`rgb(${v},${v},${v})`; c.fillRect(R()*S,R()*S,3,3); }
    c.strokeStyle='rgba(150,150,150,.6)'; c.lineWidth=2;
    for(let y=0;y<=S;y+=21){ c.beginPath(); c.moveTo(0,y); c.lineTo(S,y); c.stroke();
      const off=(y/21)%2?0:21; for(let x=off;x<S;x+=42){ c.beginPath(); c.moveTo(x,y); c.lineTo(x,y+21); c.stroke(); } }
  }
  // cracks get bigger and more numerous with each stage
  c.strokeStyle=kind==='wood'?'rgba(35,18,6,.9)':'rgba(40,40,40,.85)';
  for(let k=0;k<stage*4;k++){
    let x=R()*S, y=R()*S; c.lineWidth=1.2+stage*.6; c.beginPath(); c.moveTo(x,y);
    for(let s=0;s<6+stage*2;s++){ x+=(R()-.5)*26; y+=(R()-.5)*26; c.lineTo(x,y); }
    c.stroke();
  }
  if(stage===3){
    c.fillStyle=kind==='wood'?'rgba(25,12,4,.95)':'rgba(30,30,30,.9)';
    for(let h=0;h<3;h++){ const cx=20+R()*88, cy=20+R()*88; c.beginPath();
      for(let a=0;a<7;a++){ const r=6+R()*9, an=a/7*Math.PI*2; c.lineTo(cx+Math.cos(an)*r,cy+Math.sin(an)*r); } c.closePath(); c.fill(); }
  }
  const t=new THREE.CanvasTexture(cv); t.anisotropy=4; return t;
}
const BUILD_TEX={wood:[0,1,2,3].map(s=>makeBuildTex('wood',s)), plain:[0,1,2,3].map(s=>makeBuildTex('plain',s))};

function buildMat(team,color){
  if(color!=null) return new THREE.MeshLambertMaterial({color,map:BUILD_TEX.plain[0]});
  const ti=teamTint(team);
  const c=new THREE.Color(0xffffff).lerp(new THREE.Color(TEAM_RGB[ti]!=null?TEAM_RGB[ti]:TEAM_RGB[0]),.22);
  return new THREE.MeshLambertMaterial({color:c,map:BUILD_TEX.wood[0]});
}
const ghostOK =new THREE.MeshLambertMaterial({color:0x44ff88,transparent:true,opacity:.4,depthWrite:false});
const ghostBAD=new THREE.MeshLambertMaterial({color:0xff3311,transparent:true,opacity:.35,depthWrite:false});

function buildAABB(type,gx,gy,gz,rot){
  const wx=gx*GRID, wy=gy*GRID_H, wz=gz*GRID, hw=GRID/2, ht=WALL_T/2;
  if(type==='wall'){
    if(rot%2===0) return {x1:wx-hw,x2:wx+hw,y1:wy,y2:wy+GRID_H,z1:wz-ht,z2:wz+ht};
    return {x1:wx-ht,x2:wx+ht,y1:wy,y2:wy+GRID_H,z1:wz-hw,z2:wz+hw};
  }
  if(type==='floor') return {x1:wx-hw,x2:wx+hw,y1:wy,y2:wy+WALL_T,z1:wz-hw,z2:wz+hw};
  return {x1:wx-hw,x2:wx+hw,y1:wy,y2:wy+GRID_H,z1:wz-hw,z2:wz+hw,rot};
}
function applyBuildTransform(mesh,type,aabb,rot,gx,gy,gz){
  if(type==='ramp'){
    mesh.rotation.order='YXZ'; mesh.rotation.set(Math.PI/4,rot*Math.PI/2,0);
    mesh.position.set(gx*GRID,gy*GRID_H+GRID_H/2,gz*GRID);
  } else {
    mesh.rotation.set(0,0,0);
    mesh.position.set((aabb.x1+aabb.x2)/2,(aabb.y1+aabb.y2)/2,(aabb.z1+aabb.z2)/2);
  }
}
const geoCache=new Map();
function buildGeo(type,aabb){
  const key=type==='ramp'?'ramp':type+':'+(aabb.x2-aabb.x1).toFixed(2)+':'+(aabb.y2-aabb.y1).toFixed(2)+':'+(aabb.z2-aabb.z1).toFixed(2);
  let g=geoCache.get(key);
  if(!g){ g=type==='ramp'?new THREE.BoxGeometry(GRID,WALL_T,GRID*Math.SQRT2):new THREE.BoxGeometry(aabb.x2-aabb.x1,aabb.y2-aabb.y1,aabb.z2-aabb.z1); geoCache.set(key,g); }
  return g;
}

// opts: {color, hp} -> used for map buildings (houses / towers)
function placeBuild(type,gx,gy,gz,rot,team,id,opts){
  if(buildMap.has(id)) return;
  opts=opts||{};
  const aabb=buildAABB(type,gx,gy,gz,rot);
  const mesh=new THREE.Mesh(buildGeo(type,aabb),buildMat(team,opts.color));
  mesh.castShadow=true; mesh.receiveShadow=true; mesh.userData.buildId=id;
  applyBuildTransform(mesh,type,aabb,rot,gx,gy,gz);
  scene.add(mesh); mesh.updateMatrixWorld(true);
  const col=type==='ramp'?{...aabb,rot,id}:{...aabb,id};
  const maxHp=opts.hp||BUILD_HP[type]||150;
  const pe=pieceEdges(type,{gx,gy,gz,rot});
  const b={mesh,type,col,team,g:{gx,gy,gz,rot},hp:maxHp,maxHp,base:mesh.material.color.clone(),
    edges:pe.edges,grounded:pe.grounded,stage:0,tex:team===MAP_TEAM?'plain':'wood',baseRot:mesh.rotation.clone(),
    mask:FULL_MASK[type],cols:[]};
  buildMap.set(id,b);
  registerCols(id,b);
  indexAdd(id,pe.edges);
  if(opts.mask!=null&&opts.mask!==b.mask) applyMask(id,opts.mask);
}

// ── EDIT MASKS: walls are a 3x3 grid of tiles, floors 2x2. Removed tiles = doors/windows/holes ──
const FULL_MASK={wall:0x1FF,floor:0xF,ramp:1};
const colArr=t=>t==='wall'?wallCols:t==='floor'?floorCols:rampCols;
// Collision boxes for the tiles that are still there
function tileBoxes(b){
  const c=b.col, out=[];
  if(b.type==='wall'){
    const alongX=(b.g.rot||0)%2===0, L=GRID/3, H=GRID_H/3;
    for(let j=0;j<3;j++) for(let i=0;i<3;i++){
      if(!(b.mask>>(j*3+i)&1)) continue;
      if(alongX) out.push({x1:c.x1+i*L,x2:c.x1+(i+1)*L,y1:c.y1+j*H,y2:c.y1+(j+1)*H,z1:c.z1,z2:c.z2,tile:j*3+i});
      else       out.push({x1:c.x1,x2:c.x2,y1:c.y1+j*H,y2:c.y1+(j+1)*H,z1:c.z1+i*L,z2:c.z1+(i+1)*L,tile:j*3+i});
    }
  } else if(b.type==='floor'){
    const L=GRID/2;
    for(let j=0;j<2;j++) for(let i=0;i<2;i++){
      if(!(b.mask>>(j*2+i)&1)) continue;
      out.push({x1:c.x1+i*L,x2:c.x1+(i+1)*L,y1:c.y1,y2:c.y2,z1:c.z1+j*L,z2:c.z1+(j+1)*L,tile:j*2+i});
    }
  }
  return out;
}
function registerCols(id,b){
  b.cols=(b.type==='ramp'||b.mask===FULL_MASK[b.type])?[{...b.col,id}]:tileBoxes(b).map(a=>({...a,id}));
  const arr=colArr(b.type); b.cols.forEach(a=>arr.push(a));
}
function unregisterCols(id,b){ const arr=colArr(b.type); for(let i=arr.length-1;i>=0;i--) if(arr[i].id===id) arr.splice(i,1); }
// One merged geometry for all remaining tiles (one mesh, so damage tint/raycasts keep working)
function tileGeometry(b){
  const c=b.col, cx=(c.x1+c.x2)/2, cy=(c.y1+c.y2)/2, cz=(c.z1+c.z2)/2;
  const pos=[],nor=[],uv=[];
  tileBoxes(b).forEach(t=>{
    const g=new THREE.BoxGeometry(t.x2-t.x1,t.y2-t.y1,t.z2-t.z1).toNonIndexed();
    g.translate((t.x1+t.x2)/2-cx,(t.y1+t.y2)/2-cy,(t.z1+t.z2)/2-cz);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); g.dispose();
  });
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  out.computeBoundingSphere(); out.computeBoundingBox(); out.userData.custom=true;
  return out;
}
function applyMask(id,mask){
  const b=buildMap.get(id); if(!b||b.type==='ramp'||b.doomed) return;
  mask&=FULL_MASK[b.type];
  if(mask===0){ removeBuild(id); return; }
  b.mask=mask;
  unregisterCols(id,b); registerCols(id,b);
  if(b.mesh.geometry.userData.custom) b.mesh.geometry.dispose();
  b.mesh.geometry=mask===FULL_MASK[b.type]?buildGeo(b.type,b.col):tileGeometry(b);
}
function buildMeshes(){ const a=[]; buildMap.forEach(b=>a.push(b.mesh)); return a; }

// ── STRUCTURAL CONNECTIONS ──
// Pieces only connect when they share an exact edge, so orientation matters:
//   floor: its 4 outer edges · wall: bottom, top and 2 side edges · ramp: low edge, high edge, 2 sloped sides
const kn=v=>Math.round(v*10)/10;
function pieceEdges(type,g){
  const wx=g.gx*GRID, y=g.gy*GRID_H, wz=g.gz*GRID, h=GRID/2, H=GRID_H;
  const hx=(x,yy,z)=>`hx:${kn(x)},${kn(yy)},${kn(z)}`;
  const hz=(x,yy,z)=>`hz:${kn(x)},${kn(yy)},${kn(z)}`;
  const v =(x,yy,z)=>`v:${kn(x)},${kn(yy)},${kn(z)}`;
  const s =(x1,y1,z1,x2,y2,z2)=>`s:${kn(x1)},${kn(y1)},${kn(z1)}|${kn(x2)},${kn(y2)},${kn(z2)}`;
  const E=[];
  if(type==='floor') E.push(hx(wx-h,y,wz-h),hx(wx-h,y,wz+h),hz(wx-h,y,wz-h),hz(wx+h,y,wz-h));
  else if(type==='wall'){
    if((g.rot||0)%2===0) E.push(hx(wx-h,y,wz),hx(wx-h,y+H,wz),v(wx-h,y,wz),v(wx+h,y,wz));
    else                 E.push(hz(wx,y,wz-h),hz(wx,y+H,wz-h),v(wx,y,wz-h),v(wx,y,wz+h));
  } else {
    switch((g.rot||0)%4){
      case 0: E.push(hx(wx-h,y,wz+h),hx(wx-h,y+H,wz-h),s(wx-h,y,wz+h,wx-h,y+H,wz-h),s(wx+h,y,wz+h,wx+h,y+H,wz-h)); break;
      case 1: E.push(hz(wx+h,y,wz-h),hz(wx-h,y+H,wz-h),s(wx+h,y,wz-h,wx-h,y+H,wz-h),s(wx+h,y,wz+h,wx-h,y+H,wz+h)); break;
      case 2: E.push(hx(wx-h,y,wz-h),hx(wx-h,y+H,wz+h),s(wx-h,y,wz-h,wx-h,y+H,wz+h),s(wx+h,y,wz-h,wx+h,y+H,wz+h)); break;
      case 3: E.push(hz(wx-h,y,wz-h),hz(wx+h,y+H,wz-h),s(wx-h,y,wz-h,wx+h,y+H,wz-h),s(wx-h,y,wz+h,wx+h,y+H,wz+h)); break;
    }
  }
  return {edges:E,grounded:y<=0.01};
}
const edgeIndex=new Map();
function indexAdd(id,edges){ for(const e of edges){ let s=edgeIndex.get(e); if(!s) edgeIndex.set(e,s=new Set()); s.add(id); } }
function indexRemove(id,edges){ for(const e of edges||[]){ const s=edgeIndex.get(e); if(s){ s.delete(id); if(!s.size) edgeIndex.delete(e); } } }
function isBuildSupported(type,g){ const p=pieceEdges(type,g); return p.grounded||p.edges.some(e=>edgeIndex.has(e)); }

// Map buildings never collapse (they count as anchored), so only player-made builds fall down
function supportedSet(excludeId){
  const sup=new Set(), q=[];
  buildMap.forEach((b,id)=>{ if(id!==excludeId&&!b.doomed&&(b.grounded||b.team===MAP_TEAM)){ sup.add(id); q.push(id); } });
  while(q.length){
    const b=buildMap.get(q.pop());
    for(const e of b.edges){ const s=edgeIndex.get(e); if(!s) continue;
      for(const o of s) if(o!==excludeId&&!sup.has(o)){ sup.add(o); q.push(o); } }
  }
  return sup;
}
function isLoadBearing(id){ let live=0; buildMap.forEach(b=>{ if(!b.doomed) live++; }); return supportedSet(id).size<live-1; }

const fallingPieces=[];
function removeBuildRaw(id,fx){
  const b=buildMap.get(id); if(!b) return;
  unregisterCols(id,b);
  indexRemove(id,b.edges);
  buildMap.delete(id);
  if(fx){
    b.mesh.material.transparent=true; b.mesh.castShadow=false;
    fallingPieces.push({mesh:b.mesh,vy:0,t:0,spin:(Math.random()-.5)*2.4});
  } else { scene.remove(b.mesh); b.mesh.material.dispose(); if(b.mesh.geometry.userData.custom) b.mesh.geometry.dispose(); }
}
// Remove a piece and let every player build that no longer reaches the ground collapse.
// Returns how many extra pieces collapsed.
function removeBuild(id){
  if(!buildMap.has(id)) return 0;
  const pos=buildMap.get(id).mesh.position.clone();
  removeBuildRaw(id,true);
  const n=collapseUnsupported(pos);
  SFX.collapse(pos);
  return n;
}
// Everything that lost its connection to the ground breaks one piece at a time, nearest first
// (like Fortnite). Pieces stop giving support right away but stay solid until they break.
function collapseUnsupported(origin){
  if(!buildMap.size) return 0;
  const sup=supportedSet(null), doomed=[];
  buildMap.forEach((b,id)=>{ if(!sup.has(id)&&!b.doomed) doomed.push(id); });
  if(!doomed.length) return 0;
  const o=origin||doomed.map(id=>buildMap.get(id).mesh.position)[0];
  doomed.sort((a,b)=>buildMap.get(a).mesh.position.distanceTo(o)-buildMap.get(b).mesh.position.distanceTo(o));
  doomed.forEach((id,i)=>{
    const b=buildMap.get(id);
    b.doomed=true; indexRemove(id,b.edges); b.edges=[];
    b.mesh.material.color.lerp(new THREE.Color(0x3a2a1a),.25);
    setTimeout(()=>{
      if(buildMap.get(id)!==b) return;
      spawnChipsAt(b.mesh.position);
      if(i%3===0) SFX.buildHit(b.mesh.position);
      removeBuildRaw(id,true);
    },Math.min(3000,110+i*85));
  });
  return doomed.length;
}
function spawnChipsAt(pos){ if(typeof spawnChips==='function') spawnChips(pos.clone(),0xc8955a); }
function updateFalling(dt){
  for(let i=fallingPieces.length-1;i>=0;i--){
    const f=fallingPieces[i];
    f.t+=dt; f.vy+=GRAV*.6*dt;
    f.mesh.position.y+=f.vy*dt; f.mesh.rotation.z+=f.spin*dt;
    f.mesh.material.opacity=Math.max(0,1-f.t/.8);
    if(f.t>.8){ scene.remove(f.mesh); f.mesh.material.dispose(); if(f.mesh.geometry.userData.custom) f.mesh.geometry.dispose(); fallingPieces.splice(i,1); }
  }
}

// The build looks more broken the more damage it has taken
function setDamageLook(b){
  const f=Math.max(0,b.hp/b.maxHp);
  const stage=f>.75?0:f>.5?1:f>.25?2:3;
  if(stage!==b.stage){
    b.stage=stage; b.mesh.material.map=BUILD_TEX[b.tex][stage]; b.mesh.material.needsUpdate=true;
    if(stage===3&&b.type!=='ramp'){ b.mesh.rotation.z=b.baseRot.z+(Math.random()-.5)*.03; b.mesh.rotation.x=b.baseRot.x+(Math.random()-.5)*.03; }
  }
  b.mesh.material.color.copy(b.base).lerp(new THREE.Color(0x2a1a0e),(1-f)*.45);
}
// Applied identically on every client (bdmg messages) -> same result everywhere.
// Returns {destroyed, collapsed}
function damageBuild(id,dmg){
  const b=buildMap.get(id); if(!b||b.doomed) return {destroyed:false,collapsed:0};
  b.hp-=dmg;
  SFX.buildHit(b.mesh.position);
  if(b.hp<=0){ const n=removeBuild(id); return {destroyed:true,collapsed:n}; }
  setDamageLook(b);
  const s0=b.mesh.scale.x; b.mesh.scale.setScalar(.975); setTimeout(()=>{ if(b.mesh) b.mesh.scale.setScalar(s0); },60);
  return {destroyed:false,collapsed:0};
}

// ── Don't allow building inside a player (you or anyone else) ──
function bodyBlocks(type,aabb,rot,feet,px,pz){
  const r=PR*.9;
  if(type==='wall') return px+r>aabb.x1&&px-r<aabb.x2&&pz+r>aabb.z1&&pz-r<aabb.z2&&feet+HEAD>aabb.y1&&feet+.05<aabb.y2;
  if(type==='floor'){
    if(!(px+r>aabb.x1&&px-r<aabb.x2&&pz+r>aabb.z1&&pz-r<aabb.z2)) return false;
    return aabb.y2>feet+.5&&aabb.y1<feet+HEAD;
  }
  const c={...aabb,rot};
  for(const [dx,dz] of [[0,0],[r,0],[-r,0],[0,r],[0,-r]]){
    const x=px+dx, z=pz+dz;
    if(x<c.x1||x>c.x2||z<c.z1||z>c.z2) continue;
    const h=rampH(c,x,z);
    if(h>feet+.5&&h<feet+HEAD+.2) return true;
  }
  return false;
}
function inFootprint(aabb,x,z){ return x>aabb.x1&&x<aabb.x2&&z>aabb.z1&&z<aabb.z2; }
function blocksAnyPlayer(type,aabb,rot){
  const selfRamp=type==='ramp'&&inFootprint(aabb,camera.position.x,camera.position.z);
  if(!isDead&&!inBus&&!selfRamp&&bodyBlocks(type,aabb,rot,getFeetY(),camera.position.x,camera.position.z)) return true;
  for(const [uid,p] of others){
    if(aliveMap.get(uid)===false||!p.group.visible) continue;
    const g=p.group.position;
    if(bodyBlocks(type,aabb,rot,g.y,g.x,g.z)) return true;
  }
  return false;
}

// ── Ghost preview (Fortnite-style placement relative to your tile + where you look) ──
let ghostMesh=null, ghostType=null, ghostValid=false, ghostWhy='', ghostLastT=0;
const ghostTarget=new THREE.Object3D();
function wallAt(ex,gy,ez){
  for(const b of buildMap.values()) if(b.type==='wall'&&!b.doomed&&b.g.gy===gy&&Math.abs(b.g.gx-ex)<.01&&Math.abs(b.g.gz-ez)<.01) return true;
  return false;
}
function getRampRot(){
  const fx=-Math.sin(camYaw.y), fz=-Math.cos(camYaw.y);
  if(Math.abs(fz)>=Math.abs(fx)) return fz<=0?0:2;
  return fx<=0?1:3;
}
function ensureGhost(type){
  if(ghostMesh&&ghostType===type) return;
  if(ghostMesh) scene.remove(ghostMesh);
  ghostMesh=new THREE.Mesh(buildGeo(type,buildAABB(type,0,0,0,0)),ghostOK);
  ghostMesh.visible=false; ghostType=type; scene.add(ghostMesh);
}
function updateGhost(){
  if(buildMode==='gun'||buildMode==='edit'||isDead||inBus){ if(ghostMesh) ghostMesh.visible=false; return; }
  ensureGhost(buildMode);
  const p=camera.position, feet=getFeetY(), pitch=camYaw.x;
  const dir=getRampRot(), [dx,dz]=[[0,-1],[-1,0],[0,1],[1,0]][dir];
  const pcx=Math.round(p.x/GRID), pcz=Math.round(p.z/GRID);
  let gy=Math.max(0,Math.floor((feet+.35)/GRID_H));
  let gx=pcx+dx, gz=pcz+dz, rot=dir;
  if(buildMode==='wall'){ gx=pcx+dx*.5; gz=pcz+dz*.5; rot=dir%2===0?0:1; if(pitch>.6) gy+=1; }
  else if(buildMode==='floor'){ rot=0; if(pitch>.35){ gx=pcx; gz=pcz; gy+=1; } }
  else if(buildMode==='ramp'){
    const on=rampCols.find(c=>p.x>=c.x1&&p.x<=c.x2&&p.z>=c.z1&&p.z<=c.z2&&Math.abs(rampH(c,p.x,p.z)-feet)<.6);
    if(on&&on.rot===dir){
      gx=Math.round(((on.x1+on.x2)/2)/GRID)+dx; gz=Math.round(((on.z1+on.z2)/2)/GRID)+dz; gy=Math.round(on.y1/GRID_H)+1;
    } else {
      if(pitch>.6) gy+=1;
      // walled in (e.g. 4 walls around you): the ramp goes in the tile you stand on
      if(wallAt(pcx+dx*.5,gy,pcz+dz*.5)){ gx=pcx; gz=pcz; }
    }
  }
  const aabb=buildAABB(buildMode,gx,gy,gz,rot);
  applyBuildTransform(ghostTarget,buildMode,aabb,rot,gx,gy,gz);
  // glide smoothly to the new spot instead of teleporting
  const now=performance.now(), gdt=Math.min(.1,(now-ghostLastT)/1000); ghostLastT=now;
  if(!ghostMesh.visible||ghostMesh.position.distanceTo(ghostTarget.position)>9) ghostMesh.position.copy(ghostTarget.position);
  else ghostMesh.position.lerp(ghostTarget.position,1-Math.exp(-gdt*32));
  ghostMesh.rotation.copy(ghostTarget.rotation);
  ghostMesh.visible=true;
  const dup=[...buildMap.values()].some(b=>!b.doomed&&b.type===buildMode&&Math.abs(b.col.x1-aabb.x1)<.01&&Math.abs(b.col.z1-aabb.z1)<.01&&
    Math.abs(b.col.y1-aabb.y1)<.01&&Math.abs(b.col.x2-aabb.x2)<.01&&(buildMode!=='ramp'||b.col.rot===rot));
  ghostWhy='';
  if(dup) ghostWhy='dup';
  else if(!infMats()&&wood<BUILD_COST) ghostWhy='wood';
  else if(!isBuildSupported(buildMode,{gx,gy,gz,rot})) ghostWhy='air';
  else if(blocksAnyPlayer(buildMode,aabb,rot)) ghostWhy='body';
  ghostValid=!ghostWhy;
  ghostMesh.material=ghostValid?ghostOK:ghostBAD;
  ghostMesh._d={gx,gy,gz,rot};
}

const rampTimes=[];
function doBuild(){
  if(!ghostValid||!ghostMesh||!ghostMesh.visible||!myUserId) return;
  const {gx,gy,gz,rot}=ghostMesh._d, type=buildMode;
  if(!isBuildSupported(type,{gx,gy,gz,rot})) return;
  if(blocksAnyPlayer(type,buildAABB(type,gx,gy,gz,rot),rot)) return;
  if(!infMats()){ if(wood<BUILD_COST) return; wood-=BUILD_COST; updateMatsUI(); }
  const id=myUserId+'_'+SESSION_TAG+'-'+(++buildIdSeq);
  placeBuild(type,gx,gy,gz,rot,myTeam,id);
  netSend({type:'build',action:'place',btype:type,gx,gy,gz,rot,id});
  SFX.build();
  if(type==='ramp') liftOntoRamp(buildMap.get(id));
  stats.builds++; saveStats();
  if(type==='ramp'){ const now=performance.now(); rampTimes.push(now); while(rampTimes.length&&now-rampTimes[0]>4000) rampTimes.shift(); if(rampTimes.length>=8) ach('ramp_rush'); }
  if(isPit()){
    for(let i=myBuildIds.length-1;i>=0;i--) if(!buildMap.has(myBuildIds[i])) myBuildIds.splice(i,1);
    myBuildIds.push(id);
    while(myBuildIds.length>PIT_MAX_BUILDS){
      let idx=-1;
      for(let i=0;i<Math.min(20,myBuildIds.length-1);i++){ if(!isLoadBearing(myBuildIds[i])){ idx=i; break; } }
      if(idx<0) idx=0;
      const old=myBuildIds.splice(idx,1)[0];
      removeBuild(old); netSend({type:'build',action:'remove',id:old});
    }
  }
}
function liftOntoRamp(b){
  if(!b) return;
  const x=camera.position.x, z=camera.position.z, feet=getFeetY();
  if(!inFootprint(b.col,x,z)) return;
  const h=rampH(b.col,x,z);
  if(h>feet&&ceilingY(x,z,h-.01)>=h+HEAD){ camera.position.y=h+PEYE; vel.y=0; onGround=true; }
}
