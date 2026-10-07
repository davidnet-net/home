'use strict';
// ═══════════════════════════════════════════════════════════
//  SOUND: everything is synthesised with WebAudio, no audio files needed
// ═══════════════════════════════════════════════════════════
const SFX=(()=>{
  let ctx=null, master=null, noiseBuf=null, enabled=true, busNodes=null, stormNodes=null;
  const VOL=.55;

  function ensure(){
    if(ctx){ if(ctx.state==='suspended') ctx.resume().catch(()=>{}); return true; }
    try{ ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return false; }
    master=ctx.createGain(); master.gain.value=enabled?VOL:0; master.connect(ctx.destination);
    const len=Math.floor(ctx.sampleRate*1.5);
    noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
    const d=noiseBuf.getChannelData(0); for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    return true;
  }
  const ok=()=>ctx&&enabled&&ctx.state!=='closed';
  function out(v){ const g=ctx.createGain(); g.gain.value=v; g.connect(master); return g; }
  function env(g,t,a,peak,dec){
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),t+a);
    g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec);
  }
  function noise(t,o,{type='lowpass',freq=2000,q=.7,peak=.5,a=.002,dec=.15,rate=1,f1=null}={}){
    const s=ctx.createBufferSource(); s.buffer=noiseBuf; s.playbackRate.value=rate;
    const f=ctx.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(freq,t); f.Q.value=q;
    if(f1) f.frequency.exponentialRampToValueAtTime(f1,t+a+dec);
    const g=ctx.createGain(); env(g,t,a,peak,dec);
    s.connect(f); f.connect(g); g.connect(o);
    s.start(t,Math.random()*.8); s.stop(t+a+dec+.05);
  }
  function tone(t,o,{type='sine',f0=440,f1=null,peak=.3,a=.005,dec=.2}={}){
    const osc=ctx.createOscillator(); osc.type=type; osc.frequency.setValueAtTime(f0,t);
    if(f1) osc.frequency.exponentialRampToValueAtTime(f1,t+a+dec);
    const g=ctx.createGain(); env(g,t,a,peak,dec);
    osc.connect(g); g.connect(o); osc.start(t); osc.stop(t+a+dec+.05);
  }
  // Volume for a sound at a world position (quieter further away)
  function distVol(pos){
    if(!pos) return 1;
    const d=camera.position.distanceTo(pos);
    if(d>170) return 0;
    return 1/(1+d/16);
  }

  const SHOT={
    pistol:{f:2600,d:.12,p:.45,th:150}, revolver:{f:1700,d:.28,p:.7,th:90}, smg:{f:3400,d:.07,p:.32,th:190},
    ar:{f:2400,d:.11,p:.45,th:120}, minigun:{f:3000,d:.06,p:.28,th:170}, shotgun:{f:1300,d:.32,p:.8,th:70},
    tac:{f:1600,d:.22,p:.65,th:85}, sniper:{f:1400,d:.6,p:.9,th:55}, rocket:{f:600,d:.5,p:.5,th:60}
  };

  return {
    unlock(){ ensure(); },
    setEnabled(on){ enabled=on; if(master) master.gain.value=on?VOL:0; },
    get enabled(){ return enabled; },

    shot(type,pos){
      if(!ensure()||!ok()) return; const v=distVol(pos); if(v<=0) return;
      const t=ctx.currentTime, s=SHOT[type]||SHOT.ar, o=out(v);
      noise(t,o,{freq:s.f,peak:s.p,dec:s.d,f1:s.f*.4});
      tone(t,o,{type:'triangle',f0:s.th*2,f1:s.th*.5,peak:s.p*.7,dec:s.d*.9});
      if(type==='sniper') noise(t+.05,o,{type:'bandpass',freq:600,peak:.25,dec:.9,q:.5});
    },
    swing(){ if(!ensure()||!ok()) return; const t=ctx.currentTime; noise(t,out(.5),{type:'bandpass',freq:900,f1:2400,q:1.2,peak:.25,a:.03,dec:.16}); },
    chop(pos){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(distVol(pos));
      tone(t,o,{type:'square',f0:180,f1:90,peak:.25,dec:.09}); noise(t,o,{freq:1200,peak:.35,dec:.08}); },
    build(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.5);
      tone(t,o,{type:'triangle',f0:520,f1:300,peak:.35,dec:.07}); noise(t,o,{type:'bandpass',freq:1800,peak:.25,dec:.05}); },
    buildHit(pos){ if(!ensure()||!ok()) return; const t=ctx.currentTime; noise(t,out(distVol(pos)*.7),{type:'bandpass',freq:700,q:2,peak:.3,dec:.07}); },
    hit(head){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.6);
      tone(t,o,{type:'sine',f0:head?1800:1200,peak:.25,dec:head?.18:.07});
      if(head) tone(t+.05,o,{type:'sine',f0:2400,peak:.18,dec:.2}); },
    hurt(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.6);
      tone(t,o,{type:'sawtooth',f0:160,f1:70,peak:.25,dec:.18}); noise(t,o,{freq:500,peak:.3,dec:.12}); },
    shieldHit(){ if(!ensure()||!ok()) return; const t=ctx.currentTime; tone(t,out(.5),{type:'sine',f0:900,f1:500,peak:.2,dec:.15}); },
    boom(pos){ if(!ensure()||!ok()) return; const v=distVol(pos)*1.4; if(v<=0) return; const t=ctx.currentTime, o=out(v);
      noise(t,o,{freq:900,f1:80,peak:.9,a:.005,dec:1.1,q:.3}); tone(t,o,{type:'sine',f0:90,f1:30,peak:.8,dec:.8}); },
    collapse(pos){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(distVol(pos));
      for(let i=0;i<5;i++) noise(t+i*.07,o,{type:'bandpass',freq:300+Math.random()*500,q:1,peak:.3,dec:.25}); },
    pickup(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.45);
      [660,880,1320].forEach((f,i)=>tone(t+i*.06,o,{type:'triangle',f0:f,peak:.25,dec:.12})); },
    reload(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.5);
      noise(t,o,{type:'highpass',freq:2500,peak:.3,dec:.04}); noise(t+.18,o,{type:'highpass',freq:1800,peak:.35,dec:.05}); },
    heal(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.45);
      [523,659,784,1046].forEach((f,i)=>tone(t+i*.07,o,{type:'sine',f0:f,peak:.22,dec:.25})); },
    shieldUp(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.45);
      tone(t,o,{type:'sine',f0:400,f1:1600,peak:.25,a:.02,dec:.5}); },
    step(){ if(!ensure()||!ok()) return; const t=ctx.currentTime; noise(t,out(.18),{freq:450+Math.random()*200,peak:.35,dec:.05}); },
    land(){ if(!ensure()||!ok()) return; const t=ctx.currentTime; noise(t,out(.4),{freq:300,peak:.5,dec:.12}); },
    jump(){ if(!ensure()||!ok()) return; const t=ctx.currentTime; noise(t,out(.5),{type:'bandpass',freq:400,f1:1500,peak:.35,a:.05,dec:.5}); },
    click(){ if(!ensure()||!ok()) return; const t=ctx.currentTime; tone(t,out(.4),{type:'square',f0:900,peak:.12,dec:.03}); },
    beep(hi){ if(!ensure()||!ok()) return; const t=ctx.currentTime; tone(t,out(.5),{type:'sine',f0:hi?1320:880,peak:.25,dec:.15}); },
    emote(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.45);
      [523,659,784,659,880].forEach((f,i)=>tone(t+i*.09,o,{type:'triangle',f0:f,peak:.16,dec:.14})); },
    slide(){ if(!ensure()||!ok()) return; const t=ctx.currentTime; noise(t,out(.5),{type:'bandpass',freq:500,f1:180,q:.8,peak:.35,a:.03,dec:.75}); },
    chest(pos){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(distVol(pos));
      noise(t,o,{type:'bandpass',freq:300,f1:900,q:3,peak:.3,a:.02,dec:.3});
      [784,988,1175,1568].forEach((f,i)=>tone(t+.12+i*.07,o,{type:'sine',f0:f,peak:.22,dec:.35})); },
    chestHum(v){ if(!ensure()||!ok()||v<=0) return; const t=ctx.currentTime, o=out(v*.35);
      [1320,1760].forEach((f,i)=>tone(t+i*.12,o,{type:'sine',f0:f,peak:.12,a:.05,dec:.5})); },
    chat(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.4); tone(t,o,{type:'sine',f0:1000,peak:.15,dec:.06}); tone(t+.06,o,{type:'sine',f0:1500,peak:.15,dec:.08}); },
    elim(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.5);
      [784,988,1318].forEach((f,i)=>tone(t+i*.05,o,{type:'square',f0:f,peak:.12,dec:.18})); },
    death(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.5);
      [392,330,262,196].forEach((f,i)=>tone(t+i*.16,o,{type:'triangle',f0:f,peak:.25,dec:.3})); },
    victory(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.55);
      [523,659,784,1046,784,1046].forEach((f,i)=>tone(t+i*.14,o,{type:'square',f0:f,peak:.15,dec:i===5?.8:.18})); },
    storm(){ if(!ensure()||!ok()) return; const t=ctx.currentTime, o=out(.6);
      noise(t,o,{freq:200,f1:900,peak:.5,a:.3,dec:1.6,q:.4}); tone(t,o,{type:'sawtooth',f0:55,f1:40,peak:.2,a:.2,dec:1.5}); },
    stormTick(){ if(!ensure()||!ok()) return; const t=ctx.currentTime; tone(t,out(.35),{type:'sawtooth',f0:120,f1:80,peak:.18,dec:.15}); },
    busLoop(on){
      if(!ensure()) return;
      if(on&&!busNodes){
        const o1=ctx.createOscillator(), o2=ctx.createOscillator(), g=ctx.createGain(), f=ctx.createBiquadFilter();
        o1.type='sawtooth'; o1.frequency.value=48; o2.type='square'; o2.frequency.value=72;
        f.type='lowpass'; f.frequency.value=260; g.gain.value=.12;
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
        busNodes={o1,o2,g};
      } else if(!on&&busNodes){
        const n=busNodes; busNodes=null;
        try{ n.g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.5); n.o1.stop(ctx.currentTime+.6); n.o2.stop(ctx.currentTime+.6); }catch(e){}
      }
    },
    stormLoop(on){
      if(!ensure()) return;
      if(on&&!stormNodes){
        const s=ctx.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
        const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=350;
        const g=ctx.createGain(); g.gain.value=0.0001; g.gain.exponentialRampToValueAtTime(.35,ctx.currentTime+.4);
        s.connect(f); f.connect(g); g.connect(master); s.start(); stormNodes={s,g};
      } else if(!on&&stormNodes){
        const n=stormNodes; stormNodes=null;
        try{ n.g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.4); n.s.stop(ctx.currentTime+.5); }catch(e){}
      }
    }
  };
})();
