'use strict';
// ═══════════════════════════════════════════════════════════
//  CORE: constants, SDK fallback, three.js scene, shared game state
//  (all files are classic scripts that share one global scope)
// ═══════════════════════════════════════════════════════════
const GRID=4, GRID_H=4, WALL_T=0.28;
const SPEED=11, JUMP_V=12, GRAV=-26;
const PEYE=1.65, PR=0.38, HEAD=1.8;
const MAX_HP=100, MAX_SH=100;
const BUILD_COST=10, MAP_TEAM=-1, MAX_WOOD=999;
const ARENA_B=57, BR_B=200;
let worldB=ARENA_B;

// ── Offline fallback so the game also opens outside Davidnet ──
if(!window.DavidnetSDK){
  const cbs={matched:[],msg:[]};
  window.DavidnetSDK={
    getJsonBlob:async()=>({data:null}), saveJsonBlob:async()=>({savedAt:Date.now()}),
    applyHighscore:async()=>({}), getHighscores:async()=>({leaderboard:[]}),
    unlockAchievement:async()=>({isNew:false}), getAchievements:async()=>({achievements:[]}),
    realtime:{
      joinQueue:async(q)=>({queue:q,position:1}), leaveQueue:async(q)=>({queue:q}),
      getQueueInfo:async(q)=>({queue:q,waiting:0}), getRoomInfo:async(r)=>({room:r,memberCount:0,members:[]}),
      onMatched:(cb)=>cbs.matched.push(cb),
      onMessage:(cb)=>{cbs.msg.push(cb);return()=>{const i=cbs.msg.indexOf(cb);if(i>=0)cbs.msg.splice(i,1);};},
      onPresence:()=>{}, onState:()=>{}, setState:async()=>({}), announce:async()=>({}), onAnnouncement:()=>{},
      send:async(r,d,o)=>{ if(o&&o.echo) cbs.msg.slice().forEach(c=>c({room:r,data:d,from:{userId:'solo',username:'Jij',displayName:'Jij'},ts:Date.now()})); },
      joinRoom:async(r)=>({room:r,members:[],state:{}}), leaveRoom:async(r)=>({room:r}),
      onDisconnect:()=>{}, onReconnect:()=>{}, onError:()=>{}
    }};
  window._testStart=()=>cbs.matched.forEach(c=>c({queue:'t',room:'test',members:[{userId:'solo',username:'Jij',displayName:'Jij',avatarUrl:''}]}));
}
const RT=()=>window.DavidnetSDK.realtime;
const $=id=>document.getElementById(id);

// Seeded random (same seed -> same map/storm/bus on every client)
function rng(seed){
  let a=seed>>>0;
  return ()=>{ a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const M=c=>new THREE.MeshLambertMaterial({color:c});
function box(w,h,d,mat,pos){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  if(pos) m.position.set(pos[0],pos[1],pos[2]);
  return m;
}

// ═══════════════════════════════════════════════════════════
//  THREE.JS SCENE
// ═══════════════════════════════════════════════════════════
const SKY=0x5da8d0;
const scene=new THREE.Scene();
scene.background=new THREE.Color(SKY);
scene.fog=new THREE.Fog(SKY,100,220);

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.insertBefore(renderer.domElement,document.getElementById('hud'));

const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.05,600);
scene.add(camera);

// First-person weapon scene (drawn on top, no fog)
const wScene=new THREE.Scene();
wScene.add(new THREE.AmbientLight(0xffffff,.5));
const wSun=new THREE.DirectionalLight(0xfff8e0,1.6); wSun.position.set(1,2,1); wScene.add(wSun);
const wCamera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.01,10);

// Lighting (sun follows the player so shadows work on the big map)
const SUN_OFF=new THREE.Vector3(70,130,60), SUN_DIR=SUN_OFF.clone().normalize();
const sun=new THREE.DirectionalLight(0xfff5d0,.95);
sun.position.copy(SUN_OFF); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near=1; sun.shadow.camera.far=400;
sun.shadow.camera.left=-90; sun.shadow.camera.right=90; sun.shadow.camera.top=90; sun.shadow.camera.bottom=-90;
sun.shadow.bias=-0.0004;
scene.add(sun); scene.add(sun.target);
scene.add(new THREE.AmbientLight(0xd4eeff,.25));
scene.add(new THREE.HemisphereLight(0x9ecfee,0x4a7c3e,.45));
const sunDisc=new THREE.Mesh(new THREE.SphereGeometry(6,16,16),new THREE.MeshBasicMaterial({color:0xfff9b0,fog:false}));
sunDisc.position.copy(SUN_DIR).multiplyScalar(185); scene.add(sunDisc);

const cloudGroup=new THREE.Group(); scene.add(cloudGroup);
{
  const cMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85,fog:false});
  for(let i=0;i<18;i++){
    const g=new THREE.Group(), a=(i/18)*Math.PI*2, r=88+Math.random()*55;
    g.position.set(Math.cos(a)*r,44+Math.random()*20,Math.sin(a)*r);
    for(let j=0;j<4;j++){ const s=6+Math.random()*10; const m=new THREE.Mesh(new THREE.BoxGeometry(s,s*.4,s*.65),cMat); m.position.set((j-1.5)*6,Math.random()*2.5,0); g.add(m); }
    cloudGroup.add(g);
  }
}

// Ground: flat play area, hills outside it
const GROUND_SIZE=760;
const gGeo=new THREE.PlaneGeometry(GROUND_SIZE,GROUND_SIZE,152,152);
function shapeGround(flatR){
  const p=gGeo.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getY(i), d=Math.hypot(x,z);
    let h=0;
    if(d>flatR){ const k=Math.min(1,(d-flatR)/18); h=(Math.sin(x*.075)*Math.cos(z*.09)*2.8+Math.sin(x*.04+z*.05)*1.6+(d-flatR)*.05)*k; }
    p.setZ(i,h);
  }
  p.needsUpdate=true; gGeo.computeVertexNormals(); gGeo.computeBoundingSphere();
}
shapeGround(54);
const ground=new THREE.Mesh(gGeo,new THREE.MeshLambertMaterial({color:0x5b8a3e}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
// Cheap invisible plane used for bullet raycasts against the ground (y=0)
const groundHit=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshBasicMaterial({visible:false}));
groundHit.rotation.x=-Math.PI/2; scene.add(groundHit); groundHit.updateMatrixWorld();

// Arena decoration (hidden in Battle Royale)
const arenaDecor=new THREE.Group(); scene.add(arenaDecor);
{
  const lineMat=new THREE.MeshBasicMaterial({color:0x4a7830,transparent:true,opacity:.4});
  for(let i=-5;i<=5;i++){
    const h=new THREE.Mesh(new THREE.PlaneGeometry(100,.08),lineMat); h.rotation.x=-Math.PI/2; h.position.set(0,.01,i*GRID); arenaDecor.add(h);
    const v=new THREE.Mesh(new THREE.PlaneGeometry(.08,100),lineMat); v.rotation.x=-Math.PI/2; v.position.set(i*GRID,.01,0); arenaDecor.add(v);
  }
  const rMat=M(0x7a7a68);
  for(let i=0;i<30;i++){
    const a=(i/30)*Math.PI*2, r=58+Math.random()*7;
    const rm=new THREE.Mesh(new THREE.DodecahedronGeometry(1.2+Math.random()*2,0),rMat);
    rm.position.set(Math.cos(a)*r,.4,Math.sin(a)*r); rm.rotation.set(Math.random(),Math.random(),Math.random()); rm.castShadow=true;
    arenaDecor.add(rm);
  }
}

function setWorldMode(br){
  worldB=br?BR_B:ARENA_B;
  shapeGround(br?BR_B+18:54);
  arenaDecor.visible=!br;
  scene.fog.near=br?150:100; scene.fog.far=br?380:220;
  cloudGroup.scale.set(br?2.6:1,1,br?2.6:1);
  ground.material.color.set(br?0x649a45:0x5b8a3e);
}

// ═══════════════════════════════════════════════════════════
//  SHARED GAME STATE
// ═══════════════════════════════════════════════════════════
const TEAM_HEX=['#3b82f6','#ef4444','#22c55e','#f59e0b'];
const TEAM_RGB=[0x3b82f6,0xef4444,0x22c55e,0xf59e0b];
const TEAM_NAMES=['Blauw','Rood','Groen','Geel'];
const SPAWN_POS=[[-36,0,-36],[36,0,36],[-36,0,36],[36,0,-36],[0,0,-50],[0,0,50],[-50,0,0],[50,0,0]];

let gameMode=null, groupSize=0, currentRoom=null;
let myUserId=null, myIndex=-1, myTeam=-1, members=[], isHost=false;
let gameStarted=false, gameOver=false, matchStart=0;
let hp=MAX_HP, shield=0, wood=0;
let isDead=false, buildMode='gun';
let isLocked=false, inQueue=false;
let aiming=false, mouseHeld=false, brGlide=false, inBus=false;
let brSeed=0;

const keys={};
// ── Key bindings (changeable in the ⌨️ menu, saved in the "settings" save slot) ──
const DEFAULT_BINDS={
  forward:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD', jump:'Space', sprint:'ShiftLeft',
  slot1:'Digit1', slot2:'Digit2', slot3:'Digit3', slot4:'Digit4', slot5:'Digit5', pickaxe:'KeyX',
  wall:'KeyQ', floor:'KeyF', ramp:'KeyC', edit:'KeyG',
  reload:'KeyR', use:'KeyE', drop:'KeyZ', chat:'KeyT', emote:'KeyB', menu:'KeyM'
};
let BINDS={...DEFAULT_BINDS};
const bindDown=a=>!!keys[BINDS[a]];
function actionFor(code){ for(const a in BINDS) if(BINDS[a]===code) return a; return null; }
function keyLabel(code){
  if(!code) return '—';
  const map={Space:'Spatie',ShiftLeft:'L-Shift',ShiftRight:'R-Shift',ControlLeft:'L-Ctrl',ControlRight:'R-Ctrl',AltLeft:'L-Alt',AltRight:'R-Alt',
    Tab:'Tab',CapsLock:'Caps',Enter:'Enter',Backspace:'Backspace',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',
    Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\'};
  if(map[code]) return map[code];
  if(code.startsWith('Key')) return code.slice(3);
  if(code.startsWith('Digit')) return code.slice(5);
  if(code.startsWith('Numpad')) return 'Num'+code.slice(6);
  return code;
}
function clearKeys(){ Object.keys(keys).forEach(k=>keys[k]=false); }
const vel=new THREE.Vector3();
let onGround=true;
const camYaw=new THREE.Euler(0,0,0,'YXZ');

let inventory=[null,null,null,null,null];   // 5 item slots
let currentSlot=-1;                           // -1 = pickaxe

const wallCols=[], floorCols=[], rampCols=[];
const buildMap=new Map();                     // id -> piece
let buildIdSeq=0;

const others=new Map();                       // uid -> {group, headMesh, team, ...}
const aliveMap=new Map();
const seenUids=new Set();
const RAY=new THREE.Raycaster();

const PIT_ROOM='fortday-pit', PIT_MAX_BUILDS=200;
const BR_LOBBY='fortday-br-lobby', BR_MIN=4, BR_COUNTDOWN=10;
const names=new Map(), pitScores=new Map(), uidTeam=new Map();
const myBuildIds=[];
const goneAt=new Map(), pendingLeave=new Map();
const SESSION_TAG=Math.random().toString(36).slice(2,8);
let pitKills=0, pitDeaths=0, pitStreak=0, bestStreak=0, spawnProtUntil=0, respawnTid=null;
const matchStats={kills:0,stormTime:0};

function isPit(){ return gameMode==='pit'; }
function isBR(){ return gameMode==='br'; }
function infMats(){ return !isBR(); }
function teamOf(uid){ if(isPit()) return uid===myUserId?0:1; return uidTeam.has(uid)?uidTeam.get(uid):0; }
// Which of the 4 team colours to show for a team (Pit/BR: you blue, everyone else red)
function teamTint(team){
  if(team===MAP_TEAM) return -1;
  if(isPit()||isBR()) return team===myTeam?0:1;
  return team;
}
function nameOf(uid){
  if(uid==='storm') return 'De storm';
  if(!uid) return 'Iemand';
  if(uid===myUserId) return 'Jij';
  return names.get(uid)||members.find(m=>m.userId===uid)?.displayName||'Speler';
}
function rememberName(from){ if(from&&from.userId) names.set(from.userId,from.displayName||from.username||'Speler'); }
function getFeetY(){ return camera.position.y-PEYE; }
