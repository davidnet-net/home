'use strict';
// ═══════════════════════════════════════════════════════════
//  PLAYER PHYSICS: walls, floors (one-way from above), ramps, CEILINGS, props
// ═══════════════════════════════════════════════════════════
function rampH(c,px,pz){
  const cx=(c.x1+c.x2)/2, cz=(c.z1+c.z2)/2, hw=GRID/2;
  let t;
  switch((c.rot||0)%4){
    case 0: t=(cz+hw-pz)/GRID; break;   // rises toward -Z
    case 1: t=(cx+hw-px)/GRID; break;   // rises toward -X
    case 2: t=(pz-cz+hw)/GRID; break;   // rises toward +Z
    case 3: t=(px-cx+hw)/GRID; break;   // rises toward +X
  }
  return c.y1+clamp(t,0,1)*GRID_H;
}
// Highest walkable surface under the player that he can step onto
function getFloorY(px,pz,feet){
  let best=0;
  for(const c of floorCols) if(px>c.x1&&px<c.x2&&pz>c.z1&&pz<c.z2){ const top=c.y2; if(top>best&&top<=feet+.8) best=top; }
  for(const c of rampCols)  if(px>c.x1&&px<c.x2&&pz>c.z1&&pz<c.z2){ const h=rampH(c,px,pz); if(h>best&&h<=feet+1.2) best=h; }
  // you can stand on top of rocks
  for(const q of propMap.values()){
    if(q.kind!=='rock'&&q.kind!=='lavarock') continue;
    if(q.h>best&&q.h<=feet+.8&&Math.hypot(px-q.x,pz-q.z)<q.r*.9) best=q.h;
  }
  return best;
}
// If you ever end up inside something (landing on a rock, a build appearing on you, lag),
// push yourself out instead of being stuck forever.
function resolvePenetration(){
  const p=camera.position;
  for(let it=0;it<3;it++){
    const feet=getFeetY(), top=feet+HEAD-.05, bot=feet+.06;
    let moved=false;
    for(const q of propMap.values()){
      if(feet>=q.h-.02) continue;
      const dx=p.x-q.x, dz=p.z-q.z, d=Math.hypot(dx,dz), rr=q.r+PR;
      if(d>=rr) continue;
      if((q.kind==='rock'||q.kind==='lavarock')&&q.h-feet<1){ p.y=q.h+PEYE; vel.y=Math.max(0,vel.y); onGround=true; moved=true; continue; }
      const nx=d>1e-3?dx/d:1, nz=d>1e-3?dz/d:0;
      p.x=q.x+nx*(rr+.02); p.z=q.z+nz*(rr+.02); moved=true;
    }
    for(const c of wallCols){
      if(!(top>c.y1&&bot<c.y2&&p.x+PR>c.x1&&p.x-PR<c.x2&&p.z+PR>c.z1&&p.z-PR<c.z2)) continue;
      if(c.y2-feet<.55){ p.y=c.y2+PEYE; vel.y=Math.max(0,vel.y); onGround=true; moved=true; continue; }   // low wall piece: step onto it
      const opts=[[c.x2+PR+.02-p.x,0],[c.x1-PR-.02-p.x,0],[0,c.z2+PR+.02-p.z],[0,c.z1-PR-.02-p.z]];
      opts.sort((a,b)=>Math.abs(a[0]+a[1])-Math.abs(b[0]+b[1]));
      const [ax,az]=opts[0]; if(Math.abs(ax+az)<1.2){ p.x+=ax; p.z+=az; moved=true; }
    }
    if(!moved) break;
  }
}
// Lowest ceiling above the player's head (floors and ramps above you block jumping through them)
function ceilingY(px,pz,feet){
  const head=feet+HEAD; let best=Infinity;
  for(const c of floorCols) if(px>c.x1&&px<c.x2&&pz>c.z1&&pz<c.z2){ if(c.y1>=head-.08&&c.y1<best) best=c.y1; }
  for(const c of rampCols)  if(px>c.x1&&px<c.x2&&pz>c.z1&&pz<c.z2){ const h=rampH(c,px,pz)-.2; if(h>=head-.08&&h<best) best=h; }
  return best;
}
function hitWall(px,py,pz){
  const top=py+HEAD-.05, bot=py+.06;
  for(const c of wallCols) if(top>c.y1&&bot<c.y2&&px+PR>c.x1&&px-PR<c.x2&&pz+PR>c.z1&&pz-PR<c.z2) return true;
  for(const p of propMap.values()){ const dx=px-p.x, dz=pz-p.z, rr=p.r+PR; if(dx*dx+dz*dz<rr*rr&&py<p.h&&top>0) return true; }
  return false;
}
// Can the player move his feet to (px,pz)? Blocks walls and stepping up into a ceiling.
function canStand(px,pz,feet){
  if(hitWall(px,feet,pz)) return false;
  // ramps are solid: you can't walk into one from underneath or through its side
  for(const c of rampCols){
    if(px<=c.x1-PR*.5||px>=c.x2+PR*.5||pz<=c.z1-PR*.5||pz>=c.z2+PR*.5) continue;
    for(const [ox,oz] of [[0,0],[PR,0],[-PR,0],[0,PR],[0,-PR]]){
      const x=px+ox, z=pz+oz;
      if(x<=c.x1||x>=c.x2||z<=c.z1||z>=c.z2) continue;
      const h=rampH(c,x,z);
      if(h>feet+1.25&&h-.35<feet+HEAD) return false;
    }
  }
  const fl=getFloorY(px,pz,feet);
  if(fl>feet+.01&&fl+HEAD>ceilingY(px,pz,feet)) return false;
  return true;
}

let stepT=0, highGroundDone=false;
function updatePlayer(dt){
  if(isDead) return;
  // moving or jumping cancels an emote
  if(myEmote&&(bindDown('forward')||bindDown('back')||bindDown('left')||bindDown('right')||bindDown('jump')||keys.ArrowUp||keys.ArrowDown||keys.ArrowLeft||keys.ArrowRight)) stopEmote();
  if(inBus){
    // third-person camera orbiting the bus (look around with the mouse)
    if(bus){
      const p=busPos(performance.now());
      const back=new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(camYaw.x-.25,camYaw.y,0,'YXZ'));
      camera.position.copy(p).addScaledVector(back,16); camera.position.y+=4;
    }
    camera.quaternion.setFromEuler(camYaw);
    return;
  }
  const ya=new THREE.Euler(0,camYaw.y,0,'YXZ');
  const fwd=new THREE.Vector3(0,0,-1).applyEuler(ya), rgt=new THREE.Vector3(1,0,0).applyEuler(ya);
  let mx=0,mz=0;
  if(bindDown('forward')||keys.ArrowUp){mx+=fwd.x;mz+=fwd.z;}
  if(bindDown('back')||keys.ArrowDown){mx-=fwd.x;mz-=fwd.z;}
  if(bindDown('left')||keys.ArrowLeft){mx-=rgt.x;mz-=rgt.z;}
  if(bindDown('right')||keys.ArrowRight){mx+=rgt.x;mz+=rgt.z;}
  const ml=Math.hypot(mx,mz); if(ml>0){mx/=ml;mz/=ml;}

  const sprinting=bindDown('sprint');
  let spd=SPEED*(sprinting?1.6:1);
  if(usingItem) spd*=.55;
  if(aiming) spd*=.7;
  if(brGlide) spd=17;
  // accelerate/decelerate instead of instantly snapping to full speed (less "blocky")
  const acc=1-Math.exp(-dt*(onGround?18:brGlide?6:5));
  vel.x+=(mx*spd-vel.x)*acc; vel.z+=(mz*spd-vel.z)*acc;

  if(bindDown('jump')&&onGround&&!brGlide){ vel.y=JUMP_V; onGround=false; }
  if(!onGround) vel.y+=GRAV*dt;
  if(brGlide) vel.y=Math.max(vel.y,getFeetY()>30?-14:-8);

  resolvePenetration();
  let feet=getFeetY();
  const nx=camera.position.x+vel.x*dt;
  if(canStand(nx,camera.position.z,feet)) camera.position.x=nx;
  const nz=camera.position.z+vel.z*dt;
  if(canStand(camera.position.x,nz,feet)) camera.position.z=nz;

  // Vertical movement + ceiling (no more jumping through floors above you)
  const prevFeet=feet, fallV=vel.y;
  camera.position.y+=vel.y*dt;
  if(vel.y>0){
    const ceil=ceilingY(camera.position.x,camera.position.z,prevFeet);
    if(getFeetY()+HEAD>ceil){ camera.position.y=ceil-HEAD+PEYE-.01; vel.y=0; }
  }
  feet=getFeetY();
  const floor=getFloorY(camera.position.x,camera.position.z,feet);
  const wasGround=onGround;
  if(feet<floor&&vel.y<=0){ camera.position.y=floor+PEYE; vel.y=0; onGround=true; }
  else { onGround=feet<=floor+.05; if(onGround&&vel.y<0) vel.y=0; }
  if(camera.position.y<PEYE){ camera.position.y=PEYE; vel.y=0; onGround=true; }
  if(onGround&&!wasGround&&fallV<-9) SFX.land();
  if(onGround&&brGlide){ brGlide=false; $('glide').style.display='none'; }

  const B=worldB;
  camera.position.x=clamp(camera.position.x,-B,B);
  camera.position.z=clamp(camera.position.z,-B,B);
  camera.quaternion.setFromEuler(camYaw);

  if(!highGroundDone&&onGround&&feet>24){ highGroundDone=true; ach('high_ground'); }

  // Footsteps
  const moving=ml>0&&onGround;
  if(moving){ stepT-=dt; if(stepT<=0){ stepT=sprinting?.27:.36; SFX.step(); } } else stepT=0;

  // Weapon bob / recoil / pickaxe swing
  if(moving) gunBobT+=dt*9;
  equipT=Math.min(1,equipT+dt*4.5);
  swayX*=Math.exp(-dt*9); swayY*=Math.exp(-dt*9);
  if(activeGunGroup&&buildMode==='gun'){
    const t=curType(), p0=gunPos(t), e=1-equipT;
    const p=[p0[0]+swayX,p0[1]+swayY-e*e*.28,p0[2]];
    const bx=moving?Math.sin(gunBobT)*.008:0, by=moving?Math.abs(Math.sin(gunBobT))*.007:0;
    if(t==='pickaxe'){
      const s=Math.sin(Math.min(1,swingT)*Math.PI);
      activeGunGroup.position.set(p[0]+bx-s*.1,p[1]-by+s*.08,p[2]-s*.12);
      activeGunGroup.rotation.set(-.15-s*1.5,-.25,.55+s*.25);
      swingT=Math.max(0,swingT-dt*3.6);
    } else {
      const use=usingItem?Math.sin(performance.now()*.012)*.02-.04:0;
      activeGunGroup.position.set(p[0]+bx,p[1]-by-gunRecoil*.04+use,p[2]+gunRecoil*.06);
      activeGunGroup.rotation.x=-gunRecoil*.2;
      if(activeGunGroup.userData.spin&&mouseHeld) activeGunGroup.rotation.z+=dt*25;
    }
    gunRecoil=Math.max(0,gunRecoil-dt*14);
  }

  // Aim / scope zoom
  const d=ITEMS[curType()]||{};
  const targetFov=aiming?(d.scope?22:58):75;
  if(Math.abs(camera.fov-targetFov)>.05){ camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*14); camera.updateProjectionMatrix(); }
  const scoped=aiming&&d.scope&&camera.fov<35;
  $('scope').style.display=scoped?'block':'none';
  $('xhair').style.display=scoped?'none':'block';
  if(activeGunGroup) activeGunGroup.visible=!scoped;

  // Crosshair spread
  const sp=(moving?12:4)*(aiming?.5:1);
  $('xl-t').style.top=(-sp-4)+'px'; $('xl-b').style.top=(sp-4)+'px';
  $('xl-l').style.left=(-sp-4)+'px'; $('xl-r').style.left=(sp-4)+'px';
}
