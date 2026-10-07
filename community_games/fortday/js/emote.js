'use strict';
// ═══════════════════════════════════════════════════════════
//  EMOTES: press the emote key (B), pick 1-8. The camera swings behind you so you
//  can see your own character; everyone else sees the dance + an emoji above your head.
//  Moving, jumping, shooting or building cancels the emote.
// ═══════════════════════════════════════════════════════════
let myEmote=null, selfAv=null, emotePickerOpen=false;
const emotesUsed=new Set();
const emoteCam=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.05,600);

function ensureSelfAv(){
  if(!selfAv){ selfAv=makeOtherPlayer(myTeam,null,settings.skin); selfAv.group.visible=false; scene.add(selfAv.group); }
  else applySkin(selfAv,settings.skin);
}
function openEmotePicker(){
  if(isDead||inBus||!gameStarted) return;
  const w=$('emote-wheel'); w.innerHTML='';
  EMOTES.forEach((e,i)=>{
    const b=document.createElement('button'); b.className='emo';
    b.innerHTML='<span class="ek"></span><span class="ei"></span><span class="en"></span>';
    b.querySelector('.ek').textContent=i+1; b.querySelector('.ei').textContent=e.icon; b.querySelector('.en').textContent=e.name;
    b.onclick=()=>playEmote(e.id); w.appendChild(b);
  });
  const tip=document.createElement('div'); tip.className='emo-tip'; tip.textContent=`Druk op 1-8 · ${keyLabel(BINDS.emote)} of Esc = sluiten`; w.appendChild(tip);
  w.style.display='grid'; emotePickerOpen=true;
}
function closeEmotePicker(){ emotePickerOpen=false; $('emote-wheel').style.display='none'; }
function playEmote(id){
  closeEmotePicker();
  const e=EMOTE_BY_ID[id]; if(!e||isDead||inBus) return;
  ensureSelfAv();
  cancelUse(); cancelReload(); mouseHeld=false; aiming=false;
  if(editing) finishEdit(true);
  if(buildMode!=='gun') setMode('gun');
  myEmote={id,t:0,dur:e.dur};
  selfAv.group.position.set(camera.position.x,getFeetY(),camera.position.z);
  selfAv.group.rotation.y=camYaw.y; selfAv.speed=0; selfAv.air=false;
  setHeld(selfAv,null); setEmote(selfAv,id); selfAv.group.visible=true;
  showGun(null);
  netSend({type:'emote',e:id});
  SFX.emote();
  emotesUsed.add(id); if(emotesUsed.size>=EMOTES.length) ach('dancer');
}
function stopEmote(send){
  if(!myEmote) return;
  myEmote=null;
  if(selfAv){ selfAv.group.visible=false; setEmote(selfAv,null); }
  if(send!==false) netSend({type:'emote',e:null});
  if(buildMode==='gun') showGun(curType());
}
function updateEmote(dt){
  if(!myEmote) return;
  myEmote.t+=dt;
  if(myEmote.t>myEmote.dur||isDead||inBus){ stopEmote(false); return; }
  const feet=getFeetY();
  selfAv.group.position.set(camera.position.x,feet,camera.position.z);
  selfAv.speed=0;
  if(!selfAv.emote) setEmote(selfAv,myEmote.id);
  animateAvatar(selfAv,dt,1-Math.exp(-dt*14));
  // orbit camera behind you (look around with the mouse)
  const pitch=clamp(-camYaw.x,-.3,1.1), dist=4.6;
  const bx=Math.sin(camYaw.y)*Math.cos(pitch)*dist, bz=Math.cos(camYaw.y)*Math.cos(pitch)*dist;
  emoteCam.position.set(camera.position.x+bx,feet+1.4+Math.sin(pitch)*dist,camera.position.z+bz);
  emoteCam.lookAt(camera.position.x,feet+1.1,camera.position.z);
}
