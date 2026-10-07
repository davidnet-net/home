'use strict';
// ═══════════════════════════════════════════════════════════
//  SETTINGS: sound, key bindings, player editor (saved in the "settings" save slot)
// ═══════════════════════════════════════════════════════════
const settings={muted:false,binds:{...DEFAULT_BINDS},skin:{...DEFAULT_SKIN}};
let settingsSaveTid=null;
function saveSettings(){
  clearTimeout(settingsSaveTid);
  settingsSaveTid=setTimeout(async()=>{ try{ await window.DavidnetSDK.saveJsonBlob({...settings},{slot:'settings'}); }catch(e){} },500);
}
async function loadSettings(){
  try{
    const r=await window.DavidnetSDK.getJsonBlob({slot:'settings'}), d=r&&r.data;
    if(d&&typeof d==='object'){
      settings.muted=!!d.muted;
      if(d.binds&&typeof d.binds==='object') Object.keys(DEFAULT_BINDS).forEach(a=>{ if(typeof d.binds[a]==='string'&&d.binds[a].length<24) settings.binds[a]=d.binds[a]; });
      // v2 defaults: C = crouch/slide, V = ramp. Move old saves along if they still had ramp on C.
      if(d.binds&&!d.binds.crouch&&d.binds.ramp==='KeyC'){ settings.binds.ramp='KeyV'; settings.binds.crouch='KeyC'; }
      // never leave two actions on one key: give the later one its default (or nothing)
      const seen={}; Object.keys(DEFAULT_BINDS).forEach(a=>{ const c=settings.binds[a]; if(seen[c]&&seen[c]!==a){ settings.binds[a]=Object.values(settings.binds).includes(DEFAULT_BINDS[a])?'':DEFAULT_BINDS[a]; } seen[settings.binds[a]]=a; });
      settings.skin=sanitizeSkin(d.skin);
    }
  }catch(e){}
  BINDS=settings.binds;
  SFX.setEnabled(!settings.muted); setSoundBtn();
  refreshKeyHints();
}
function setSoundBtn(){ $('sound-btn').textContent=SFX.enabled?'🔊 Geluid aan':'🔇 Geluid uit'; }
function toggleSound(){
  SFX.setEnabled(!SFX.enabled); SFX.unlock(); setSoundBtn(); SFX.click();
  settings.muted=!SFX.enabled; saveSettings();
}

// ── Modal helper ──
function openModal(id){ document.exitPointerLock(); clearKeys(); mouseHeld=false; $(id).style.display='flex'; }
function closeModal(id){ $(id).style.display='none'; clearKeys(); }

// ═══ KEY BINDINGS ═══
const ACTION_LABEL={
  forward:'Vooruit', back:'Achteruit', left:'Links', right:'Rechts', jump:'Springen', sprint:'Sprinten', crouch:'Hurken / sliden',
  slot1:'Item slot 1', slot2:'Item slot 2', slot3:'Item slot 3', slot4:'Item slot 4', slot5:'Item slot 5', pickaxe:'Pikhouweel',
  wall:'Muur bouwen', floor:'Vloer bouwen', ramp:'Helling bouwen', edit:'Editen',
  reload:'Herladen', use:'Oppakken', drop:'Item laten vallen', chat:'Chat', emote:'Emote', menu:'Hoofdmenu'
};
const ACTION_GROUPS=[['Bewegen',['forward','back','left','right','jump','sprint','crouch']],['Items',['slot1','slot2','slot3','slot4','slot5','pickaxe','reload','use','drop']],
  ['Bouwen',['wall','floor','ramp','edit']],['Overig',['chat','emote','menu']]];
let rebinding=null;
function openKeybinds(){ renderKeybinds(); openModal('kb-modal'); }
function renderKeybinds(){
  const list=$('kb-list'); list.innerHTML='';
  ACTION_GROUPS.forEach(([title,acts])=>{
    const h=document.createElement('div'); h.className='kb-h'; h.textContent=title; list.appendChild(h);
    acts.forEach(a=>{
      const row=document.createElement('div'); row.className='kb-row';
      const l=document.createElement('span'); l.textContent=ACTION_LABEL[a];
      const b=document.createElement('button'); b.className='kb-key'+(rebinding===a?' wait':'');
      b.textContent=rebinding===a?'Druk op een toets…':keyLabel(BINDS[a]);
      b.onclick=()=>{ rebinding=a; renderKeybinds(); };
      row.append(l,b); list.appendChild(row);
    });
  });
}
// captures the next key while rebinding (runs before the game's own key handler)
document.addEventListener('keydown',e=>{
  if(!rebinding) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if(e.code!=='Escape'){
    const other=actionFor(e.code);
    if(other&&other!==rebinding) BINDS[other]=BINDS[rebinding];    // swap so no key is used twice
    BINDS[rebinding]=e.code;
    settings.binds=BINDS; saveSettings(); refreshKeyHints();
  }
  rebinding=null; renderKeybinds(); SFX.click();
},true);
function resetKeybinds(){ BINDS={...DEFAULT_BINDS}; settings.binds=BINDS; saveSettings(); renderKeybinds(); refreshKeyHints(); SFX.click(); }
function refreshKeyHints(){
  const k=a=>keyLabel(BINDS[a]);
  const hint=$('hint');
  if(hint) hint.textContent=`${k('slot1')}-${k('slot5')} / Scroll: Items · ${k('pickaxe')}: Pikhouweel · ${k('wall')}: Muur · ${k('floor')}: Vloer · ${k('ramp')}: Helling · ${k('edit')}: Edit · ${k('reload')}: Herladen · ${k('use')}: Oppakken · ${k('drop')}: Laten vallen · ${k('crouch')}: Hurken (sprint = sliden) · ${k('chat')}: Chat · ${k('emote')}: Emote · ${k('menu')}: Hoofdmenu`;
  if(typeof buildHotbar==='function'&&$('ws-pick')){ buildHotbar(); updateHotbarUI(); }
}

// ═══ PLAYER EDITOR ═══
let pvRenderer=null, pvScene=null, pvCam=null, pvAvatar=null, pvRaf=null;
function openEditor(){
  openModal('pe-modal');
  if(!pvRenderer){
    const cv=$('pe-canvas');
    pvRenderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
    pvRenderer.setPixelRatio(Math.min(devicePixelRatio,2)); pvRenderer.setSize(240,300,false);
    pvScene=new THREE.Scene();
    pvScene.add(new THREE.AmbientLight(0xffffff,.55));
    const l=new THREE.DirectionalLight(0xffffff,.9); l.position.set(2,4,3); pvScene.add(l);
    pvCam=new THREE.PerspectiveCamera(35,240/300,.1,50); pvCam.position.set(0,1.45,5.2); pvCam.lookAt(0,1.1,0);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,.08,32),new THREE.MeshLambertMaterial({color:0x334155})); base.position.y=-.04; pvScene.add(base);
  }
  renderEditorControls(); rebuildPreview();
  cancelAnimationFrame(pvRaf);
  const loop=t=>{ if($('pe-modal').style.display!=='flex') return; pvRaf=requestAnimationFrame(loop);
    if(pvAvatar){ pvAvatar.root.rotation.y=t*.0008; const sw=Math.sin(t*.004)*.5; pvAvatar.legL.rotation.x=sw; pvAvatar.legR.rotation.x=-sw; pvAvatar.armL.rotation.x=-sw*.6; pvAvatar.armR.rotation.x=sw*.6; }
    pvRenderer.render(pvScene,pvCam); };
  pvRaf=requestAnimationFrame(loop);
}
function rebuildPreview(){
  if(!pvScene) return;
  if(pvAvatar) pvScene.remove(pvAvatar.root);
  pvAvatar=buildAvatar(settings.skin,-1); pvScene.add(pvAvatar.root);
}
function renderEditorControls(){
  const s=settings.skin;
  const chips=(elId,opts,labels,key)=>{
    const el=$(elId); el.innerHTML='';
    opts.forEach(o=>{ const b=document.createElement('button'); b.className='pe-chip'+(s[key]===o?' on':''); b.textContent=labels[o]; b.title=labels[o];
      b.onclick=()=>{ s[key]=o; changed(); }; el.appendChild(b); });
  };
  chips('pe-hats',HATS,Object.fromEntries(HATS.map(h=>[h,HAT_ICON[h]+' '+HAT_LABEL[h]])),'hat');
  chips('pe-bodies',Object.keys(BODIES),BODY_LABEL,'body');
  chips('pe-faces',FACES,FACE_LABEL,'face');
  ['skin','outfit','pants','hatColor'].forEach(k=>{ const inp=$('pe-'+k); inp.value=s[k]; inp.oninput=()=>{ s[k]=inp.value; changed(false); }; });
  function changed(rerender=true){ settings.skin=sanitizeSkin(s); Object.assign(s,settings.skin); rebuildPreview(); if(rerender) renderEditorControls(); saveSettings(); if(gameStarted) sendSkin(); }
}
function randomSkin(){
  const pick=a=>a[Math.floor(Math.random()*a.length)], col=()=>'#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');
  settings.skin=sanitizeSkin({body:pick(Object.keys(BODIES)),hat:pick(HATS),face:pick(FACES),skin:pick(['#f5c8a0','#e0ac69','#c68642','#8d5524','#ffdbac','#7ad3ff','#a3e635']),outfit:col(),pants:col(),hatColor:col()});
  renderEditorControls(); rebuildPreview(); saveSettings(); if(gameStarted) sendSkin(); SFX.click();
}
