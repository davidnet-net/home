'use strict';
// ═══════════════════════════════════════════════════════════
//  CHESTS (Battle Royale): golden chests in houses, on towers and out in the open.
//  Press E to open → a better weapon, a heal/shield item, ammo and some wood pop out.
//  Contents come from the match seed + chest id, so every client spawns the same loot.
// ═══════════════════════════════════════════════════════════
const chestMap=new Map();
let nearChest=null, chestHumT=0;
const CHEST_WOOD=M(0x8b5a2b), CHEST_DARK=M(0x5a3a1c);
const CHEST_GOLD=new THREE.MeshLambertMaterial({color:0xf2c230,emissive:0xb8860b,emissiveIntensity:.55});

function makeChestMesh(){
  const g=new THREE.Group();
  g.add(box(.9,.45,.6,CHEST_WOOD,[0,.225,0]));
  [-.42,.42].forEach(x=>g.add(box(.07,.47,.62,CHEST_GOLD,[x,.235,0])));
  g.add(box(.92,.06,.62,CHEST_GOLD,[0,.08,0]));
  const lid=new THREE.Group(); lid.position.set(0,.45,.3);           // hinge at the back
  lid.add(box(.9,.2,.6,CHEST_DARK,[0,.1,-.3]));
  lid.add(box(.92,.05,.62,CHEST_GOLD,[0,.2,-.3]));
  [-.42,.42].forEach(x=>lid.add(box(.07,.21,.62,CHEST_GOLD,[x,.1,-.3])));
  lid.add(box(.12,.14,.04,CHEST_GOLD,[0,.02,-.61]));                  // lock
  g.add(lid);
  const spark=new THREE.Sprite(new THREE.SpriteMaterial({map:iconTex('✨'),transparent:true,depthWrite:false}));
  spark.scale.set(.55,.55,1); spark.position.y=1; g.add(spark);
  g.traverse(c=>{ if(c.isMesh){ c.castShadow=true; c.userData.noHit=true; } });
  return {g,lid,spark};
}
function addChest(id,x,y,z,rotY){
  if(chestMap.has(id)) return;
  const m=makeChestMesh(); m.g.position.set(x,y,z); m.g.rotation.y=rotY||0; scene.add(m.g);
  chestMap.set(id,{id,...m,x,y,z,opened:false,t:0});
}
const CHEST_GUNS=['ar','ar','smg','shotgun','tac','pistol','revolver','sniper','minigun','rocket'];
const CHEST_EXTRA=['bandage','minishield','minishield','medkit','bigshield','grenade'];
function chestContents(id){
  const R=rng((brSeed^hashStr('chest-'+id))>>>0);
  const gun=CHEST_GUNS[Math.floor(R()*CHEST_GUNS.length)];
  const rar=1+(+pickWeighted(R,[[0,45],[1,32],[2,17],[3,6]]));       // chests never give grey weapons
  return [makeItem(gun,Math.min(4,rar)),makeItem(CHEST_EXTRA[Math.floor(R()*CHEST_EXTRA.length)]),makeItem('ammo'),{type:'wood',count:30}];
}
function openChest(id,fromNet){
  const c=chestMap.get(id); if(!c||c.opened) return;
  c.opened=true; c.spark.visible=false;
  SFX.chest(c.g.position);
  const fwd=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0),c.g.rotation.y);
  const side=new THREE.Vector3(fwd.z,0,-fwd.x);
  chestContents(id).forEach((it,k)=>{
    const off=(k-1.5)*.75;
    addPickup(id+'_'+k,it,c.x+fwd.x*1.1+side.x*off,c.y+.55,c.z+fwd.z*1.1+side.z*off,false);
  });
  if(!fromNet) netSend({type:'chest',id});
}
function updateChests(dt){
  nearChest=null;
  if(!chestMap.size) return;
  const pos=camera.position, feet=getFeetY();
  let best=2.4, closestUnopened=1e9;
  chestMap.forEach(c=>{
    if(c.opened){ if(c.t<1){ c.t=Math.min(1,c.t+dt*3); c.lid.rotation.x=-1.9*(1-Math.pow(1-c.t,3)); } return; }
    c.spark.position.y=1+Math.sin(performance.now()*.003+c.x)*.1;
    const d=Math.hypot(pos.x-c.x,pos.z-c.z);
    if(d<closestUnopened&&Math.abs(feet-c.y)<3) closestUnopened=d;
    if(isDead||inBus) return;
    if(d<best&&Math.abs(feet-c.y)<1.6){ best=d; nearChest=c; }
  });
  // chests "sing" when you're close (like in Fortnite)
  chestHumT-=dt;
  if(closestUnopened<14&&chestHumT<=0){ chestHumT=1.6; SFX.chestHum(1-closestUnopened/14); }
  if(nearChest){
    const pd=nearPickup?Math.hypot(pos.x-nearPickup.pos.x,pos.z-nearPickup.pos.z):1e9;
    if(best<pd+.8){                                   // chest wins unless loot is clearly closer
      nearPickup=null;
      const pp=$('pickup-prompt'); pp.style.display='block';
      pp.innerHTML=`<kbd></kbd><span style="color:#fde047">Kist openen</span>`; pp.querySelector('kbd').textContent=keyLabel(BINDS.use);
    } else nearChest=null;
  }
}
function clearChests(){ chestMap.forEach(c=>scene.remove(c.g)); chestMap.clear(); }
