'use strict';
// ═══════════════════════════════════════════════════════════
//  KILL CAM + SPECTATOR MODE
//  When you're eliminated the camera flies from your body to whoever got you (kill cam),
//  then follows them in third person. ← / → (or A / D, or click) switches to other players.
//  If the player you watch is eliminated, you automatically watch their killer.
// ═══════════════════════════════════════════════════════════
const specCam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.05,600);
let killcam=null;          // {uid, t, from:Vector3, label}
let specUid=null, specActive=false;
const specPos=new THREE.Vector3(), specLook=new THREE.Vector3();

function aliveOthers(){
  const list=[];
  others.forEach((p,uid)=>{ if(aliveMap.get(uid)!==false&&p.seen) list.push(uid); });
  return list.sort();
}
function startKillcam(killerId){
  specActive=true;
  $('hud').classList.add('spectating');
  const from=camera.position.clone();
  specPos.copy(from); specLook.copy(from).add(new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion));
  const kp=others.get(killerId);
  if(kp&&killerId!=='storm'){
    const d=Math.round(kp.group.position.distanceTo(from));
    const w=lastHit&&lastHit.uid===killerId&&ITEMS[lastHit.w]?ITEMS[lastHit.w].name:null;
    killcam={uid:killerId,t:0,from,label:`💀 ${nameOf(killerId)}${w?' · '+w:''} · ${d} m`};
    specUid=killerId;
  } else {
    killcam={uid:null,t:0,from,label:killerId==='storm'?'🌀 De storm heeft je te pakken gekregen':'💀 Uitgeschakeld'};
    specUid=aliveOthers()[0]||null;
  }
  updateSpecBar();
}
function stopSpectate(){
  specActive=false; killcam=null; specUid=null;
  $('hud').classList.remove('spectating'); $('spec-bar').style.display='none';
}
function cycleSpectate(dir){
  if(!specActive||isPit()) return;
  if(killcam&&killcam.t<1.2) return;               // let the kill cam play first
  killcam=null;
  const list=aliveOthers(); if(!list.length){ specUid=null; updateSpecBar(); return; }
  let i=list.indexOf(specUid);
  i=i<0?0:(i+dir+list.length)%list.length;
  specUid=list[i]; SFX.click(); updateSpecBar();
}
// called when someone else is eliminated
function onSpectatedDied(uid,by){
  if(!specActive||uid!==specUid) return;
  const list=aliveOthers();
  specUid=(by&&by!=='storm'&&list.includes(by))?by:(list[0]||null);
  killcam=null; updateSpecBar();
}
function updateSpecBar(){
  const bar=$('spec-bar');
  if(!specActive){ bar.style.display='none'; return; }
  bar.style.display='block';
  if(killcam&&killcam.t<3.2){ bar.textContent=killcam.label; bar.className='kc'; return; }
  bar.className='';
  if(isPit()){ bar.textContent=killcam?killcam.label:''; return; }
  const list=aliveOthers();
  bar.textContent=specUid?`👁️ Je kijkt naar ${nameOf(specUid)} · ${list.indexOf(specUid)+1}/${list.length} · ← → of klik om te wisselen`
                         :'👁️ Niemand meer om naar te kijken';
}
function updateSpectate(dt){
  if(!specActive) return;
  if(killcam){
    killcam.t+=dt;
    if(killcam.t>=3.2&&!isPit()){ killcam=null; updateSpecBar(); }
  }
  let p=specUid?others.get(specUid):null;
  if(p&&(aliveMap.get(specUid)===false||!p.group.visible)&&!(killcam&&killcam.uid===specUid)){ onSpectatedDied(specUid,null); p=specUid?others.get(specUid):null; }
  const k=1-Math.exp(-dt*(killcam&&killcam.t<1.4?2.6:7));
  let wantPos, wantLook;
  if(p){
    const g=p.group.position, ry=p.group.rotation.y;
    const tgt=g.clone(); tgt.y+=1.5;
    if(killcam&&killcam.uid===specUid){
      // kill cam: look at the killer from your body first, then swing in behind them
      if(killcam.t<1.1){ wantPos=killcam.from.clone(); }
      else { const dir=killcam.from.clone().sub(g).setY(0).normalize(); wantPos=g.clone().addScaledVector(dir,5).add(new THREE.Vector3(0,2.2,0)); }
      wantLook=tgt;
    } else {
      wantPos=g.clone().add(new THREE.Vector3(Math.sin(ry)*4.6,2.3,Math.cos(ry)*4.6));
      wantLook=tgt;
    }
  } else {
    // nobody to watch: slowly circle above where you fell
    const a=performance.now()*.0002, c=killcam?killcam.from:camera.position;
    wantPos=new THREE.Vector3(c.x+Math.cos(a)*10,c.y+7,c.z+Math.sin(a)*10); wantLook=c.clone();
  }
  specPos.lerp(wantPos,k); specLook.lerp(wantLook,1-Math.exp(-dt*8));
  specCam.position.copy(specPos); specCam.lookAt(specLook);
  if(killcam) updateSpecBar();
}
