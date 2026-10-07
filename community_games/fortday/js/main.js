'use strict';
// ═══════════════════════════════════════════════════════════
//  INPUT + GAME LOOP + BOOT
// ═══════════════════════════════════════════════════════════
//  All keys come from BINDS (changeable in the ⌨️ menu). Defaults:
//  1-5 / scroll: items · X: pickaxe · Q wall · F floor · C ramp · G edit · E pick up · Z drop
//  R reload · right mouse: aim · T chat · M main menu · Space: jump (or leave the bus)
let lastWheel=0, lastAutoBuild=0;

function focusGame(){ try{ window.focus(); }catch(e){} if(gameStarted&&!gameOver) renderer.domElement.requestPointerLock(); }
renderer.domElement.addEventListener('click',focusGame);
$('lockp').addEventListener('click',focusGame);
document.addEventListener('pointerlockchange',()=>{
  isLocked=document.pointerLockElement===renderer.domElement;
  $('lockp').style.display=(!isLocked&&gameStarted&&!gameOver&&!(isDead&&!isPit())&&!chatOpen)?'flex':'none';
  if(!isLocked){ mouseHeld=false; aiming=false; }
  resetInputState();
});
// Re-sync input whenever focus/fullscreen/visibility changes, so keys never get "stuck" or dead
function resetInputState(){
  clearKeys(); mouseHeld=false;
  if(editing&&editing.paint!=null) editing.paint=null;
  if(chatOpen&&document.activeElement!==$('chat-input')) closeChat();
}
window.addEventListener('blur',resetInputState);
window.addEventListener('focus',resetInputState);
document.addEventListener('visibilitychange',resetInputState);
document.addEventListener('fullscreenchange',()=>{ resetInputState(); if(document.fullscreenElement&&gameStarted&&!gameOver) setTimeout(focusGame,50); });
document.addEventListener('webkitfullscreenchange',resetInputState);

document.addEventListener('mousemove',e=>{
  if(!isLocked||isDead) return;
  const s=.0022*(aiming?(camera.fov/75):1);
  camYaw.y-=e.movementX*s; camYaw.x-=e.movementY*s;
  camYaw.x=clamp(camYaw.x,-Math.PI/2+.05,Math.PI/2-.05);
  // weapon lags a tiny bit behind your view (sway)
  swayX=clamp(swayX-e.movementX*.00012,-.03,.03); swayY=clamp(swayY+e.movementY*.00012,-.03,.03);
});
document.addEventListener('wheel',e=>{
  if(!gameStarted) return;
  e.preventDefault();
  if(isDead||inBus||chatOpen||editing) return;
  const dir=Math.sign(e.deltaY); if(!dir) return;
  const now=performance.now(); if(now-lastWheel<90) return; lastWheel=now;
  cycleWeapon(dir);
},{passive:false});

document.addEventListener('keydown',e=>{
  if(chatOpen){ if(document.activeElement===$('chat-input')) return; closeChat(); }
  if($('kb-modal').style.display==='flex'||$('pe-modal').style.display==='flex'){ if(e.code==='Escape'){ closeModal('kb-modal'); closeModal('pe-modal'); } return; }
  keys[e.code]=true;
  if(!gameStarted) return;
  // While playing, block ALL browser shortcuts (Alt menu, / and ' quick-find, Tab focus, Backspace…)
  // so the game never loses keyboard focus. F5/F11/F12 still work.
  if(!/^F(5|11|12)$/.test(e.code)) e.preventDefault();
  if(!e.shiftKey){ keys.ShiftLeft=false; keys.ShiftRight=false; }
  const act=actionFor(e.code);
  if(emotePickerOpen){
    e.preventDefault();
    const n=/^(Digit|Numpad)([1-8])$/.exec(e.code);
    if(n){ playEmote(EMOTES[+n[2]-1].id); return; }
    if(act==='emote'||e.code==='Escape'){ closeEmotePicker(); return; }
  }
  if(e.code==='Tab'||e.code==='Space'||act==='jump') e.preventDefault();
  if(e.repeat) return;
  if(act==='chat'){ e.preventDefault(); openChat(); return; }
  if(act==='menu'){ leaveToMenu(false); return; }
  if(act==='emote'){ if(!isDead&&!inBus){ stopEmote(); openEmotePicker(); } return; }
  if(myEmote&&act&&act!=='chat') stopEmote();
  if(e.code==='Escape'){ if(editing){ finishEdit(false); backToGun(); } document.exitPointerLock(); return; }
  if(inBus){ if(act==='jump') jumpFromBus(false); return; }
  if(isDead||!act) return;
  if(act.startsWith('slot')){ const i=+act.slice(4)-1; if(inventory[i]) switchSlot(i); return; }
  switch(act){
    case 'pickaxe': switchSlot(-1); break;
    case 'wall': case 'floor': case 'ramp': if(buildMode===act) backToGun(); else setMode(act); break;
    case 'edit': startEdit(); break;
    case 'reload': if(buildMode==='gun'&&!isReloading) startReload(); break;
    case 'use': tryPickup(); break;
    case 'drop': dropCurrent(); break;
  }
});
document.addEventListener('keyup',e=>{
  keys[e.code]=false;
  if(!e.shiftKey){ keys.ShiftLeft=false; keys.ShiftRight=false; }   // never get stuck sprinting
  if(gameStarted&&(e.code==='AltLeft'||e.code==='AltRight')) e.preventDefault();
});
document.addEventListener('mousedown',e=>{
  SFX.unlock();
  if(!isLocked||!gameStarted||isDead||inBus) return;
  if(emotePickerOpen) closeEmotePicker();
  if(myEmote) stopEmote();
  if(editing){ if(e.button===0){ mouseHeld=true; editPress(); } else if(e.button===2) editReset(); return; }
  if(e.button===0){
    mouseHeld=true;
    if(buildMode==='gun') doPrimary();
    else { lastAutoBuild=performance.now(); updateGhost(); doBuild(); }
  }
  if(e.button===2){
    if(buildMode!=='gun') backToGun();
    else if(isGunLike(curType())) aiming=true;
  }
});
document.addEventListener('mouseup',e=>{ if(e.button===0){ mouseHeld=false; editRelease(); } if(e.button===2) aiming=false; });
document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerdown',()=>SFX.unlock(),{once:true});

// Holding the mouse: automatic weapons keep firing, pickaxe keeps swinging, building keeps placing
function holdActions(now){
  if(!mouseHeld||!isLocked||isDead||inBus||editing) return;
  if(buildMode==='gun'){ const t=curType(); if(t&&ITEMS[t].auto) doPrimary(); }
  else if(buildMode!=='edit'&&now-lastAutoBuild>70){ lastAutoBuild=now; updateGhost(); doBuild(); }
}

// ═══════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════
let prevT=0, mmTimer=0;
function animate(ts){
  requestAnimationFrame(animate);
  const dt=Math.min((ts-prevT)/1000,.05); prevT=ts;
  if(!gameStarted){
    const a=ts*.0003;
    camera.position.set(Math.cos(a)*18,7,Math.sin(a)*18); camera.lookAt(0,2,0);
    renderer.autoClear=true; renderer.render(scene,camera);
    return;
  }
  const now=performance.now();
  updateBus(now);
  updatePlayer(dt);
  holdActions(now);
  updateGhost();
  updateBullets(dt); updateProjectiles(dt); updateEffects(dt);
  updatePickups(dt,ts); updateFalling(dt);
  updateUse(now); updateBar(now);
  updateOthers(dt); updateEdit(); updateEmote(dt);
  if(isBR()) updateStorm(dt,now);

  // keep the sun (and its shadow area) centred on the player
  const cx=camera.position.x, cz=camera.position.z;
  sun.position.set(cx+SUN_OFF.x,SUN_OFF.y,cz+SUN_OFF.z); sun.target.position.set(cx,0,cz); sun.target.updateMatrixWorld();
  sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR,185);

  mmTimer+=dt; if(mmTimer>.06){ mmTimer=0; renderMinimap(); }

  renderer.autoClear=true; renderer.render(scene,myEmote?emoteCam:camera);
  if(!myEmote){
    renderer.autoClear=false; renderer.clearDepth();
    wCamera.aspect=camera.aspect; wCamera.updateProjectionMatrix();
    renderer.render(wScene,wCamera);
    renderer.autoClear=true;
  }
}
window.addEventListener('resize',()=>{
  camera.aspect=wCamera.aspect=emoteCam.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix(); wCamera.updateProjectionMatrix(); emoteCam.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
buildHotbar(); updateHotbarUI(); updateHpUI();
try{
  RT().onPresence(ev=>{
    if(!ev) return;
    if(ev.room===PIT_ROOM&&isPit()) onPitPresence(ev);
    else if(ev.room===BR_LOBBY) onLobbyPresence(ev);
    else onMatchPresence(ev);
  });
}catch(e){}
(async()=>{ await loadStats(); showLB('kills'); autoRequeue(); })();
loadSettings();
pollMenuCounts(); menuPoll=setInterval(pollMenuCounts,3000);
animate(0);

// functions used from onclick="" attributes
Object.assign(window,{joinQueue,cancelQueue,joinPit,joinBR,leaveToMenu,showLB,toggleSound,toggleAchPanel,setMode,switchSlot,
  openKeybinds,resetKeybinds,openEditor,closeModal,randomSkin});
