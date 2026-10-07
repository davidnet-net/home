'use strict';
// ═══════════════════════════════════════════════════════════
//  MAPS: every mode has several maps. Everyone in a match gets the same one:
//   · queue modes → picked from the room name   · Battle Royale → from the match seed
//   · The Pit → the first player in the room stores it in the room state (setState)
// ═══════════════════════════════════════════════════════════
const MAP_POOLS={
  '1v1':[
    {id:'ruins',  name:'Oude Ruïnes',  ground:0x7d8b56, sky:0x9cc6dc, fog:[90,210],  rock:0x8d8a7c, line:0x5d6b3a, props:[['tree',8],['rock',14]], ruins:12, ruinColor:0xa8a294},
    {id:'temple', name:'Tempelplein',  ground:0xb9ad8f, sky:0xa9d4e8, fog:[100,230], rock:0x9c9381, line:0x9a8f72, props:[['rock',10],['tree',4]], ruins:24, ruinColor:0xd9cfb4},
    {id:'meadow', name:'Bloemenweide', ground:0x6fae4a, sky:0x8fd0f2, fog:[110,240], rock:0x8a9a7a, line:0x5a9a3a, props:[['tree',14],['autumn',6],['rock',6]]},
  ],
  '2v2':[
    {id:'pines',  name:'Dennenbos',    ground:0x4c7a36, sky:0x7fb2d0, fog:[70,190],  rock:0x6f7a68, line:0x3e6a2a, props:[['pine',40],['rock',8]]},
    {id:'autumn', name:'Herfstbos',    ground:0x8a7a3a, sky:0xe8b98a, fog:[70,190],  rock:0x7a6a58, line:0x6e5e2a, props:[['autumn',36],['tree',6],['rock',8]]},
    {id:'swamp',  name:'Moeras',       ground:0x3e4f2e, sky:0x6f7d6a, fog:[35,130],  rock:0x4a4f45, line:0x2e3a22, props:[['deadtree',24],['tree',10],['rock',10]], light:.75},
  ],
  '1v1v1':[
    {id:'desert', name:'Zonnige Woestijn', ground:0xd9bb7c, sky:0xf1c690, fog:[100,230], rock:0xb58a5a, line:0xc2a064, props:[['cactus',24],['rock',14]], ruins:7, ruinColor:0xcfae78},
    {id:'canyon', name:'Rode Canyon',  ground:0xb5653a, sky:0xf0a46c, fog:[80,210],  rock:0x8e4524, line:0x9a5530, props:[['rock',34],['cactus',8]], ruins:10, ruinColor:0xa4552e},
    {id:'oasis',  name:'Oase',         ground:0xd6c28a, sky:0x9fd6ee, fog:[100,230], rock:0xb89a6a, line:0xbfa970, props:[['tree',16],['cactus',10],['rock',6]], pond:0x2fa6c9},
  ],
  ffa4:[
    {id:'snow',   name:'Sneeuwvlakte', ground:0xe6edf2, sky:0xbcd0e2, fog:[55,170],  rock:0x9aa5b1, line:0xc9d6e0, props:[['snowpine',32],['rock',10]]},
    {id:'icelake',name:'IJsmeer',      ground:0xbfe3f2, sky:0xd6e8f5, fog:[70,200],  rock:0x8fb3c7, line:0xa9d4e8, props:[['rock',18],['snowpine',8]], pond:0x8fd3f0},
    {id:'frost',  name:'Bevroren Bos', ground:0xdfe8ee, sky:0x9fb4c8, fog:[40,140],  rock:0x8996a3, line:0xbccbd8, props:[['snowpine',55],['rock',6]], light:.85},
  ],
  pit:[
    {id:'crater', name:'De Krater',    ground:0x3b3434, sky:0x7a4a3a, fog:[80,200],  rock:0x2a2626, line:0x5a2a20, props:[['lavarock',24],['deadtree',9]], lava:0xff5a1f},
    {id:'night',  name:'Nachtarena',   ground:0x2c3a4a, sky:0x0f1a2e, fog:[60,180],  rock:0x3a4656, line:0x4a6a9a, props:[['rock',18],['pine',10]], light:.55, lava:0x3b82f6},
    {id:'crystal',name:'Kristalgrot',  ground:0x3a2e4a, sky:0x4a2a6a, fog:[60,180],  rock:0x5a3a7a, line:0x7a4aaa, props:[['lavarock',18],['rock',12]], lava:0xa855f7, light:.8},
  ],
  br:[
    {id:'island', name:'Fort Eiland',     ground:0x649a45, sky:0x5da8d0, fog:[150,380], trees:'tree',     extra:'autumn', rock:'rock'},
    {id:'dunes',  name:'Woestijnvallei',  ground:0xd4b675, sky:0xf2c995, fog:[150,380], trees:'cactus',   extra:'deadtree', rock:'rock'},
    {id:'peak',   name:'Winterpiek',      ground:0xe3ebf0, sky:0xb8cde0, fog:[120,340], trees:'snowpine', extra:'pine',   rock:'rock'},
  ],
};
let currentMap=null, pitMapId=null;
function hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }

// Which map does this match use? (same answer on every client)
function pickMap(mode){
  const pool=MAP_POOLS[mode]||MAP_POOLS['1v1'];
  let idx=0;
  if(mode==='br') idx=(brSeed>>>0)%pool.length;
  else if(mode==='pit'){ idx=Math.max(0,pool.findIndex(m=>m.id===pitMapId)); }
  else idx=hashStr(String(currentRoom||mode))%pool.length;
  return pool[idx];
}

let lavaRing=null, pondMesh=null;
function applyMapTheme(m){
  currentMap=m;
  scene.background.setHex(m.sky); scene.fog.color.setHex(m.sky);
  scene.fog.near=m.fog[0]; scene.fog.far=m.fog[1];
  ground.material.color.setHex(m.ground);
  sun.intensity=.95*(m.light||1);
  if(typeof m.rock==='number') arenaDecor.traverse(c=>{
    if(!c.isMesh) return;
    if(c.geometry.type==='DodecahedronGeometry') c.material.color.setHex(m.rock);
    else if(c.geometry.type==='PlaneGeometry') c.material.color.setHex(m.line);
  });
  if(m.lava){
    lavaRing=new THREE.Mesh(new THREE.RingGeometry(62,140,64),new THREE.MeshBasicMaterial({color:m.lava,fog:false}));
    lavaRing.rotation.x=-Math.PI/2; lavaRing.position.y=.6; scene.add(lavaRing);
  }
  if(m.pond){
    pondMesh=new THREE.Mesh(new THREE.CircleGeometry(9,40),new THREE.MeshLambertMaterial({color:m.pond,emissive:m.pond,emissiveIntensity:.15}));
    pondMesh.rotation.x=-Math.PI/2; pondMesh.position.set(-20,.03,-6); scene.add(pondMesh);
  }
  return m;
}
// Props/ruins for an arena map; seeded by the map id so it looks the same for everyone
function genArenaMap(m){
  const R=rng(hashStr('fortday-map-'+m.id));
  const keepClear=[...ARENA_LOOT.map(l=>[l.x,l.z,3.2]),...SPAWN_POS.map(p=>[p[0],p[2],5]),[0,0,5]];
  if(m.pond) keepClear.push([-20,-6,10]);
  const clear=(x,z,r)=>keepClear.every(([cx,cz,cr])=>Math.hypot(x-cx,z-cz)>cr+r);
  let pid=0;
  (m.props||[]).forEach(([kind,count])=>{
    for(let i=0,tries=0;i<count&&tries<count*12;tries++){
      const a=R()*Math.PI*2, r=8+R()*44, x=Math.cos(a)*r, z=Math.sin(a)*r, s=.75+R()*.55;
      if(!clear(x,z,2.5)) continue;
      addProp('a'+(pid++),kind,x,z,s,R); keepClear.push([x,z,2]); i++;
    }
  });
  // Ruins: small broken wall pieces made of normal (map) build pieces
  let n=0;
  for(let i=0,tries=0;i<(m.ruins||0)&&tries<(m.ruins||0)*20;tries++){
    const gx=Math.round((R()*2-1)*12), gz=Math.round((R()*2-1)*12);
    if(!clear(gx*GRID,gz*GRID,2)) continue;
    i++;
    const rot=R()<.5?0:1, len=1+Math.floor(R()*3);
    for(let k=0;k<len;k++){
      const wx=rot===0?gx+k:gx-.5, wz=rot===0?gz-.5:gz+k;
      placeBuild('wall',wx,0,wz,rot,MAP_TEAM,'r'+(n++),{color:m.ruinColor||0xa8a294,hp:300,mask:R()<.4?0x1FF&~(1<<7)&~(1<<8)&~(1<<6):0x1FF});
      if(R()<.3) placeBuild('wall',wx,1,wz,rot,MAP_TEAM,'r'+(n++),{color:m.ruinColor||0xa8a294,hp:300,mask:0x07});
    }
    keepClear.push([gx*GRID,gz*GRID,6]);
  }
}
// The Pit: use the map that's already stored in the room, or choose one and store it
async function choosePitMap(state){
  const pool=MAP_POOLS.pit;
  const stored=state&&state.map;
  if(pool.some(m=>m.id===stored)){ pitMapId=stored; return; }
  pitMapId=pool[Math.floor(Math.random()*pool.length)].id;
  try{ if(typeof RT().setState==='function') await RT().setState(PIT_ROOM,'map',pitMapId); }catch(e){}
}
