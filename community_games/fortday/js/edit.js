'use strict';
// ═══════════════════════════════════════════════════════════
//  EDITING (Fortnite style)
//  Aim at your own wall/floor and press the edit key → a tile grid appears.
//  Click (or click-drag) tiles to remove/restore them: doors, windows, holes in floors.
//  Press the edit key again to confirm · right mouse = reset · switching away also confirms.
// ═══════════════════════════════════════════════════════════
let editing=null;   // {id, mask, orig, group, tiles:[{mesh,bit}], paint}
const EDIT_ON =new THREE.MeshBasicMaterial({color:0x38bdf8,transparent:true,opacity:.38,depthWrite:false});
const EDIT_OFF=new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:.16,depthWrite:false});
const EDIT_HOV=new THREE.MeshBasicMaterial({color:0xfde047,transparent:true,opacity:.5,depthWrite:false});

function startEdit(){
  if(editing){ confirmEdit(); return; }
  if(isDead||inBus) return;
  camera.updateMatrixWorld();
  RAY.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=RAY.intersectObjects(buildMeshes(),false);
  if(!hits.length||hits[0].distance>8){ toast('✏️ Richt op je eigen muur of vloer om te editen'); return; }
  const id=hits[0].object.userData.buildId, b=buildMap.get(id);
  if(!b||b.doomed) return;
  if(!id.startsWith(myUserId+'_')){ toast('✏️ Je kunt alleen je eigen builds editen'); return; }
  if(b.type==='ramp'){ toast('✏️ Hellingen kun je niet editen — muren en vloeren wel'); return; }
  const group=new THREE.Group(), tiles=[];
  const full={...b,mask:FULL_MASK[b.type]};
  tileBoxes(full).forEach(t=>{
    const gap=.05, thick=.12;
    let w=t.x2-t.x1, h=t.y2-t.y1, d=t.z2-t.z1;
    if(b.type==='floor'){ w-=gap; d-=gap; h+=thick; }
    else if((b.g.rot||0)%2===0){ w-=gap; h-=gap; d+=thick; }
    else { d-=gap; h-=gap; w+=thick; }
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),EDIT_ON);
    m.position.set((t.x1+t.x2)/2,(t.y1+t.y2)/2,(t.z1+t.z2)/2); m.renderOrder=5;
    group.add(m); tiles.push({mesh:m,bit:t.tile});
  });
  scene.add(group);
  editing={id,mask:b.mask,orig:b.mask,group,tiles,paint:null,hover:null};
  buildMode='edit'; showGun(null); if(ghostMesh) ghostMesh.visible=false;
  $('bmode').textContent='✏️ EDIT — klik tegels · '+keyLabel(BINDS.edit)+' = klaar';
  updateHotbarUI(); refreshEditTiles(); SFX.click();
}
function refreshEditTiles(){
  if(!editing) return;
  editing.tiles.forEach(t=>{ t.mesh.material=t===editing.hover?EDIT_HOV:((editing.mask>>t.bit)&1?EDIT_ON:EDIT_OFF); });
}
function editPointerTile(){
  camera.updateMatrixWorld();
  RAY.setFromCamera(new THREE.Vector2(0,0),camera);
  const hits=RAY.intersectObjects(editing.tiles.map(t=>t.mesh),false);
  if(!hits.length||hits[0].distance>10) return null;
  return editing.tiles.find(t=>t.mesh===hits[0].object)||null;
}
function setTile(t,on){
  const before=editing.mask;
  editing.mask=on?(editing.mask|(1<<t.bit)):(editing.mask&~(1<<t.bit));
  if(editing.mask!==before) SFX.click();
}
function editPress(){
  if(!editing) return;
  const t=editPointerTile(); if(!t) return;
  editing.paint=(editing.mask>>t.bit)&1?0:1;     // drag paints the same state
  setTile(t,editing.paint); refreshEditTiles();
}
function editRelease(){ if(editing) editing.paint=null; }
function editReset(){ if(!editing) return; editing.mask=FULL_MASK[buildMap.get(editing.id).type]; refreshEditTiles(); SFX.click(); }
function updateEdit(){
  if(!editing) return;
  const b=buildMap.get(editing.id);
  if(!b||b.doomed||isDead||camera.position.distanceTo(b.mesh.position)>12){ finishEdit(false); backToGun(); return; }
  const t=editPointerTile();
  if(editing.paint!=null&&t) setTile(t,editing.paint);
  editing.hover=t; refreshEditTiles();
}
// apply=true: keep the changes
function finishEdit(apply){
  const e=editing; if(!e) return;
  editing=null;
  scene.remove(e.group); e.tiles.forEach(t=>t.mesh.geometry.dispose());
  if(apply&&e.mask!==e.orig&&buildMap.has(e.id)){
    applyMask(e.id,e.mask);
    netSend({type:'edit',id:e.id,mask:e.mask});
    SFX.build();
  }
}
function confirmEdit(){ finishEdit(true); backToGun(); }
