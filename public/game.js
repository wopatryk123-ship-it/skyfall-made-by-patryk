const SKYFALL_VERSION='v21'; let token='',profile=null,ws=null,players={},remote={},room='PUBLIC',mapName='neon',mode='ffa',myTeam=null; window.pickupState={};
const W={
 pistol:{name:'VIPER',mag:15,rate:.26,reload:.8,recoil:.035,auto:false},
 smg:{name:'RAPTOR',mag:30,rate:.085,reload:1.05,recoil:.055,auto:true},
 shotgun:{name:'MAMMOTH',mag:6,rate:.85,reload:1.35,recoil:.12,auto:false},
 sniper:{name:'PHANTOM',mag:5,rate:1.15,reload:1.65,recoil:.18,auto:false}
};
const MAPS={
 neon:[[-13,0,2,26],[13,0,2,26],[-16,0,4,20],[16,0,4,20],[-8,-8,7,5],[8,8,7,5],[-9,9,4,8],[9,-9,4,8]],
 desert:[[-13,0,2,26],[13,0,2,26],[-16,0,4,20],[16,0,4,20],[-8,-7,9,4],[8,7,9,4],[-7,8,4,8],[7,-8,4,8]],
 arctic:[[-13,0,2,26],[13,0,2,26],[-16,0,4,20],[16,0,4,20],[-9,-8,5,9],[9,8,5,9],[-8,7,9,3],[8,-7,9,3]],
 skyline:[[-13,0,2,26],[13,0,2,26],[-16,0,4,20],[16,0,4,20],[-8,-8,7,4],[8,8,7,4],[-8,8,4,8],[8,-8,4,8]]
};
let weapon='pistol',ammo=15,reloading=false,cool=0,recoil=0,yaw=0,pitch=0;
let move={x:0,z:0},vel={x:0,y:0,z:0},grounded=true,sprint=false,fireHeld=false,alive=true;let stamina=100,staminaMax=100,coyote=0,jumpBuffer=0,stepTime=0;
let player,cam,weaponRoot,arms,muzzle,app,lastNet=0,footBob=0,wasMoving=false, audioCtx=null, flashTimer=0, hitTimer=0, weaponAnim=0, damageFlashTimer=0, deathTimer=0, grenades=2, grenadeCooldown=0, pickupEntities={}, lastFootstep=0, surfaceNow='concrete';
const GRAVITY=-22,JUMP=7.2,WALK=5.2,SPRINT=8.2,RADIUS=.42,HEIGHT=1.8,ACCEL_GROUND=32,ACCEL_AIR=10,FRICTION=12;
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
async function api(u,o={}){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const r=await fetch(u,{...o,headers:{'Content-Type':'application/json',...(o.headers||{})},signal:controller.signal});
  const text=await r.text(); let j={};
  try{j=JSON.parse(text)}catch{j={error:text||`HTTP ${r.status}`}}
  if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);
  return j;
 }catch(e){
  if(e.name==='AbortError')throw Error('Serwer nie odpowiedział w ciągu 10 s.');
  if(location.protocol==='file:')throw Error('Uruchom grę przez serwer: npm install, potem npm start. Nie otwieraj index.html dwuklikiem.');
  if(!navigator.onLine)throw Error('Brak połączenia z internetem.');
  throw Error(e.message||'Brak połączenia z serwerem');
 }finally{clearTimeout(timeout)}
}
let authBusy=false;
async function auth(kind){
 if(authBusy)return;
 const username=$('user').value.trim(),password=$('pass').value;
 if(!username||!password){$('msg').textContent='Wpisz nick i hasło.';return}
 authBusy=true;$('reg').disabled=true;$('login').disabled=true;
 $('msg').textContent=kind==='register'?'Tworzenie konta...':'Logowanie...';
 try{
  const j=await api('/api/'+kind,{method:'POST',body:JSON.stringify({username,password})});
  token=j.token;profile=j.profile;sessionStorage.setItem('skyfall_token',token);
  showLobby();
 }catch(e){$('msg').textContent=e.message||'Błąd autoryzacji.'}
 finally{authBusy=false;$('reg').disabled=false;$('login').disabled=false}
}
function showLobby(){
 $('auth').style.display='none';$('lobby').style.display='block';$('msg').textContent='';refreshProfile();
}
async function restoreSession(){
 const saved=sessionStorage.getItem('skyfall_token');if(!saved)return;
 token=saved;
 try{const j=await api('/api/me',{headers:{Authorization:'Bearer '+token}});profile=j.profile;showLobby()}
 catch{sessionStorage.removeItem('skyfall_token');token='';profile=null}
}
function bindUI(){
 $('reg').addEventListener('click',()=>auth('register'));
 $('login').addEventListener('click',()=>auth('login'));
 $('play').addEventListener('click',()=>{try{startGame()}catch(e){$('msg').textContent='Nie udało się uruchomić gry: '+e.message}});
 $('shop').addEventListener('click',async()=>{try{const j=await api('/api/shop');$('closeShop').style.display='inline-block';$('shopBox').innerHTML=j.items.map(x=>`<div class="shopitem"><span>${x.name} — ${x.price} 🪙</span><button type="button" data-buy="${x.id}">KUP</button></div>`).join('');document.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>buySkin(b.dataset.buy)))}catch(e){$('shopBox').textContent=e.message}});
 $('closeShop').addEventListener('click',()=>{$('shopBox').innerHTML='';$('closeShop').style.display='none'});
 $('respawn').addEventListener('click',requestRespawn);
 $('again').addEventListener('click',()=>{if(ws?.readyState===1){$('matchEnd').style.display='none';requestRespawn()}else location.reload()});
 $('user').addEventListener('keydown',e=>{if(e.key==='Enter')auth('login')});
 $('pass').addEventListener('keydown',e=>{if(e.key==='Enter')auth('login')});
}
async function buySkin(id){try{profile=await api('/api/shop/buy',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({id})});refreshProfile();await openShop()}catch(e){$('shopBox').textContent=e.message}}
async function openShop(){const j=await api('/api/shop');$('closeShop').style.display='inline-block';$('shopBox').innerHTML=j.items.map(x=>`<div class="shopitem"><span>${x.name} — ${x.price} 🪙</span><button type="button" data-buy="${x.id}">KUP</button></div>`).join('');document.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>buySkin(b.dataset.buy)))}
bindUI();restoreSession();
function mat(c,metal=0,rough=.7){const m=new pc.StandardMaterial();m.diffuse=new pc.Color(...c);m.metalness=metal;m.shininess=(1-rough)*100;m.update();return m}
function box(parent,x,y,z,sx,sy,sz,c,m){const e=new pc.Entity();e.addComponent('render',{type:'box',material:m||mat(c)});e.setLocalScale(sx,sy,sz);e.setLocalPosition(x,y,z);(parent||app.root).addChild(e);return e}
function buildMap(){
 const c={neon:[[.025,.04,.08],[.08,.48,.65]],desert:[[.38,.22,.09],[.75,.43,.16]],arctic:[[.68,.78,.88],[.25,.48,.68]],skyline:[[.045,.045,.07],[.38,.16,.62]]}[mapName]||[[.02,.03,.06],[.1,.4,.6]];
 box(null,0,-.5,0,70,1,70,c[0]);
 MAPS[mapName].forEach(v=>box(null,v[0],1,v[1],v[2],2,v[3],c[1]));
 player=new pc.Entity('player');player.setPosition(0,0,22);app.root.addChild(player);
 cam=new pc.Entity('camera');cam.addComponent('camera',{fov:78,nearClip:.03,farClip:140});cam.setLocalPosition(0,1.55,0);player.addChild(cam);buildHands();
 let sun=new pc.Entity();sun.addComponent('light',{type:'directional',intensity:1.25,color:new pc.Color(1,1,1)});sun.setEulerAngles(50,25,0);app.root.addChild(sun);
 let fill=new pc.Entity();fill.addComponent('light',{type:'omni',intensity:.8,color:new pc.Color(.3,.55,1),range:50});fill.setPosition(0,8,0);app.root.addChild(fill);$('map').textContent=mapName.toUpperCase();
}
function buildHands(){arms=new pc.Entity('arms');cam.addChild(arms);arms.setLocalPosition(0,-.18,0);const skin=mat([.56,.32,.19]),sleeve=mat([.08,.12,.17]);box(arms,-.19,-.02,-.45,.16,.16,.55,null,sleeve);box(arms,.19,-.02,-.45,.16,.16,.55,null,sleeve);box(arms,-.12,-.02,-.58,.13,.15,.32,null,skin);box(arms,.12,-.02,-.58,.1,.15,.32,null,skin);setWeaponModel()}
function setWeaponModel(){if(weaponRoot)weaponRoot.destroy();weaponRoot=new pc.Entity('weapon');arms.addChild(weaponRoot);const gun=mat([.1,.1,.1],.4,.35),metal=mat([.18,.2,.22],.75,.25);weaponRoot.setLocalPosition(.17,-.22,-.63);if(weapon==='pistol'){box(weaponRoot,0,0,0,.22,.16,.52,null,gun);box(weaponRoot,0,-.12,.13,.13,.25,.2,null,gun);box(weaponRoot,0,.01,-.36,.09,.09,.3,null,metal)}if(weapon==='smg'){box(weaponRoot,0,0,0,.27,.17,.65,null,gun);box(weaponRoot,0,-.13,.12,.14,.3,.23,null,gun);box(weaponRoot,0,.02,-.47,.1,.1,.45,null,metal)}if(weapon==='shotgun'){box(weaponRoot,0,0,0,.22,.19,.72,null,gun);box(weaponRoot,0,.03,-.58,.1,.1,.75,null,metal);box(weaponRoot,0,-.14,.12,.14,.3,.25,null,gun)}if(weapon==='sniper'){box(weaponRoot,0,0,0,.22,.18,.9,null,gun);box(weaponRoot,0,.12,-.12,.12,.1,.45,null,metal);box(weaponRoot,0,.03,-.66,.08,.08,.55,null,metal);box(weaponRoot,0,-.14,.2,.14,.3,.25,null,gun)}muzzle=box(weaponRoot,0,.03,-(weapon==='sniper'?.96:.7),.12,.12,.12,[1,.55,.08]);muzzle.enabled=false}
function switchWeapon(id){if(!W[id]||reloading||id===weapon||!alive)return;weapon=id;ammo=W[id].mag;if(ws?.readyState===1)ws.send(JSON.stringify({type:'switch',weapon}));setWeaponModel();$('weaponName').textContent=W[id].name;updateAmmo();document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('active',b.dataset.weapon===id))}
document.querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>switchWeapon(b.dataset.weapon));
function connect(){
 const proto=location.protocol==='https:'?'wss':'ws';
 ws=new WebSocket(`${proto}://${location.host}`);
 ws.onopen=()=>{ws.send(JSON.stringify({type:'join',token,room,map:mapName,mode}));};
 ws.onerror=()=>{$('msg').textContent='Nie udało się połączyć z serwerem.'};
 ws.onclose=()=>{if(alive)$('msg').textContent='Połączenie z serwerem zostało przerwane.'};
 ws.onmessage=e=>{
  const m=JSON.parse(e.data);
  if(m.type==='joined'){myTeam=m.team||null;mode=m.mode||mode;updateTeamBadge();$('msg').textContent='Połączono z serwerem.';}
  if(m.type==='error'){alive=false;try{ws.close()}catch{};$('menu').style.display='flex';$('lobby').style.display='block';$('msg').textContent=m.message||'Błąd serwera.';return;}
  if(m.type==='state'){
   players=m.players||{};
   syncRemotes();
   updateMatch(m.match);updatePickups(m.match?.pickups||{});
   const me=players[profile.username];
   if(me){
    alive=!!me.alive;myTeam=me.team||myTeam;
    setHP(me.hp);showSpawnProtection(Number(me.spawnProtectedUntil||0)>Date.now());if(me.weapon&&W[me.weapon]&&me.weapon!==weapon){weapon=me.weapon;setWeaponModel();$('weaponName').textContent=W[weapon].name;document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('active',b.dataset.weapon===weapon))}if(Number.isFinite(me.ammo)){ammo=me.ammo;updateAmmo()}if(Number.isFinite(me.grenades)){grenades=me.grenades;updateGrenades()}reloading=!!me.reloading;if(!reloading&&$('reload').textContent==='...')$('reload').textContent='RELOAD';
    if(me.y!==undefined&&player){
     const p=player.getPosition();
     player.setPosition(p.x,me.y,p.z);
     vel.y=me.vy||0;
     grounded=!!me.grounded;
    }
    if(!alive && !document.getElementById('matchEnd').style.display)showDeath(m);
   }
  }
  if(m.type==='shot'&&m.hits)showHit(m.damage);
  if(m.type==='reward'){profile.coins=m.coins;profile.xp=m.xp;profile.kills=m.kills;refreshProfile()}
  if(m.type==='reloadStart'){reloading=true;$('reload').textContent='...'}
  if(m.type==='reloadDone'){reloading=false;ammo=W[weapon].mag;$('reload').textContent='RELOAD';updateAmmo()}
  if(m.type==='damage'){setHP(m.hp);showDamageFlash();if(m.hp>0)playDamageSound();}
  if(m.type==='death'){alive=false;showDeath(m);playDeathSound();document.body.classList.add('playerdead');setTimeout(()=>document.body.classList.remove('playerdead'),650);}
  if(m.type==='killfeed'){addKill(m);if(m.killer===profile.username)playKillSound()}
  if(m.type==='grenade'){playGrenadeThrowSound();}
  if(m.type==='explosion'){createExplosion(m);}
  if(m.type==='pickup'){setPickupActive(m.id,false);playPickupSound(m.pickupType);}
  if(m.type==='pickupRespawn'){setPickupActive(m.id,true);playPickupRespawnSound();}
  if(m.type==='pickup'){if(window.pickupState[m.id])window.pickupState[m.id].active=false}
  if(m.type==='pickupRespawn'){if(window.pickupState[m.id])window.pickupState[m.id].active=true}
  if(m.type==='matchEnd')showMatchEnd(m);
  if(m.type==='matchRestart'){document.getElementById('matchEnd').style.display='none';alive=true;requestRespawn();}
  if(m.type==='error')$('msg').textContent=m.message;
 };
}

function drawMinimap(){
 const c=document.getElementById('minimap'); if(!c||!player)return; const g=c.getContext('2d'),w=c.width,h=c.height;
 g.clearRect(0,0,w,h); g.fillStyle='rgba(5,10,18,.88)';g.fillRect(0,0,w,h);
 const scale=Math.min(w,h)/70, ox=w/2, oz=h/2;
 const mapTo=(x,z)=>[ox+x*scale,oz+z*scale];
 // map bounds
 g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=2;g.strokeRect(5,5,w-10,h-10);
 // walls / cover
 const walls=MAPS[mapName]||[]; for(const [x,z,ww,dd] of walls){const [cx,cz]=mapTo(x,z);g.fillStyle='rgba(148,163,184,.42)';g.fillRect(cx-ww*scale/2,cz-dd*scale/2,ww*scale,dd*scale)}
 // pickup locations
 if(window.pickupState){for(const q of Object.values(window.pickupState)){if(!q.active)continue;const [x,z]=mapTo(q.x,q.z);g.fillStyle=q.type==='health'?'#22c55e':'#facc15';g.beginPath();g.arc(x,z,3,0,Math.PI*2);g.fill()}}
 // players
 for(const [name,p] of Object.entries(players)){if(!p.alive)continue; if(name===profile?.username){const [x,z]=mapTo(p.x,p.z);g.fillStyle='#fff';g.beginPath();g.arc(x,z,4,0,Math.PI*2);g.fill();g.strokeStyle='#67e8f9';g.lineWidth=2;g.stroke();
   const a=(p.a||0)*Math.PI/180;g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.moveTo(x,z);g.lineTo(x-Math.sin(a)*9,z-Math.cos(a)*9);g.stroke();
 } else {const [x,z]=mapTo(p.x,p.z);let col='#ef4444';if(mode==='tdm')col=p.team===myTeam?'#60a5fa':'#ef4444';else col='#fb7185';g.fillStyle=col;g.beginPath();g.arc(x,z,p.bot?3:3.5,0,Math.PI*2);g.fill()}}
 g.fillStyle='rgba(255,255,255,.65)';g.font='bold 9px system-ui';g.fillText('N',w/2-3,14);
}
function syncRemotes(){const names=Object.keys(players);for(const n of Object.keys(remote))if(!players[n]){remote[n].destroy();delete remote[n]}for(const [n,p]of Object.entries(players)){if(n===profile.username)continue;let e=remote[n];if(!e){e=new pc.Entity(n);e.addComponent('render',{type:'capsule',material:mat(p.team==='red'?[.95,.18,.25]:p.team==='blue'?[.18,.45,1]:[.95,.2,.25])});e.setLocalScale(.7,1.6,.7);app.root.addChild(e);remote[n]=e}e.enabled=!!p.alive;e.setPosition(p.x,p.y+.8,p.z);e.setEulerAngles(0,p.a,0)}}
function updatePickups(list){if(!app)return;const seen={};for(const [id,q] of Object.entries(list||{})){seen[id]=1;let e=pickupEntities[id];if(!e){e=new pc.Entity('pickup_'+id);const c=q.type==='health'?[.15,1,.35]:[1,.72,.12];e.addComponent('render',{type:'box',material:mat(c,.15,.35)});e.setLocalScale(.55,.75,.55);e.setPosition(q.x,.45,q.z);app.root.addChild(e);const glow=new pc.Entity('glow');glow.addComponent('render',{type:'sphere',material:mat(c,0,.2)});glow.setLocalScale(.25,.25,.25);e.addChild(glow);pickupEntities[id]=e}e.enabled=!!q.active;e.setPosition(q.x,.45,q.z)}for(const id of Object.keys(pickupEntities))if(!seen[id]){pickupEntities[id].destroy();delete pickupEntities[id]}}
function setPickupActive(id,on){const e=pickupEntities[id];if(e)e.enabled=on}
function playPickupSound(type){ensureAudio();try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=type==='health'?620:820;g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.08,audioCtx.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.16);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.17)}catch(e){}}
function playPickupRespawnSound(){ensureAudio();try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='triangle';o.frequency.value=540;g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.045,audioCtx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.12);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13)}catch(e){}}
function updateTeamBadge(){const t=myTeam?myTeam.toUpperCase():'FFA';$('map').textContent=mapName.toUpperCase()+' • '+t}
function updateMatch(match){if(!match)return;mode=match.mode||mode;const sec=Math.max(0,Math.ceil((match.remaining||0)/1000));const mm=Math.floor(sec/60),ss=String(sec%60).padStart(2,'0');$('matchTimer').textContent=`${mm}:${ss}`;if(mode==='tdm'){$('matchHud').childNodes[0].textContent='TDM 5v5 • ';$('matchHud').lastChild;const ts=match.teams||{red:0,blue:0};$('teamScore').innerHTML=`<span class="teamred">🔴 ${ts.red||0}</span><span>—</span><span class="teamblue">🔵 ${ts.blue||0}</span>`;}else{$('matchHud').childNodes[0].textContent='FFA • ';$('teamScore').innerHTML='';}const scoreEntries=Object.entries(match.scores||{}).sort((a,b)=>b[1]-a[1]);if(scoreEntries.length)$('players').textContent=`${scoreEntries.length} PLAYERS • ${scoreEntries.slice(0,3).map(x=>x[0]+':'+x[1]).join('  ')}`;updateTeamBadge()}
function showMatchEnd(m){alive=false;fireHeld=false;reloading=false;const isTdm=m.mode==='tdm';$('matchWinner').textContent=isTdm?(m.winner==='draw'?'REMIS MECZU':(m.winner===myTeam?'WYGRYWA TWOJA DRUŻYNA':'WYGRYWA DRUŻYNA '+String(m.winner).toUpperCase())):(m.winner===profile.username?'WYGRYWASZ MECZ!':'KONIEC MECZU');$('matchWinnerSub').textContent=isTdm?`🔴 ${m.teams?.red||0} — 🔵 ${m.teams?.blue||0} • CEL ${50}`:`${m.winner} • ${m.score} eliminacji`;const entries=Object.entries(m.scores||{}).sort((a,b)=>b[1]-a[1]);$('scores').innerHTML=(isTdm?['red','blue'].map(team=>`<div class="${team==='red'?'teamred':'teamblue'}"><span>${team==='red'?'🔴 CZERWONI':'🔵 NIEBIESCY'}</span><b>${m.teams?.[team]||0}</b></div>`).join(''):'')+entries.map(([n,s],i)=>{const p=players[n];return `<div><span class="${p?.team==='red'?'teamred':p?.team==='blue'?'teamblue':''}">${isTdm?(p?.team==='red'?'🔴 ':'🔵 '):''}${n}${n.startsWith('BOT_')?' <span class="botbadge">BOT</span>':''}</span><b>${s}</b></div>`}).join('');$('matchEnd').style.display='flex'}
$('again').onclick=()=>{location.reload()};
function updateGrenades(){$('grenades').textContent='💣 '+grenades}
function showDamageFlash(){const f=$('damageFlash');f.classList.remove('show');void f.offsetWidth;f.classList.add('show');clearTimeout(damageFlashTimer);damageFlashTimer=setTimeout(()=>f.classList.remove('show'),230)}
function playDamageSound(){tone(180,.09,'sawtooth',.055,75)}
function playDeathSound(){tone(120,.22,'sawtooth',.07,45);setTimeout(()=>tone(70,.28,'triangle',.05,35),90)}
function playGrenadeThrowSound(){tone(430,.05,'triangle',.035,620)}
function throwGrenade(){if(!alive||grenades<=0||grenadeCooldown>0||!ws||ws.readyState!==1)return;ensureAudio();grenadeCooldown=.9;weaponAnim=1;weaponRoot?.setLocalEulerAngles(-18,0,0);playGrenadeThrowSound();ws.send(JSON.stringify({type:'grenade'}));setTimeout(()=>{if(weaponRoot)weaponRoot.setLocalEulerAngles(0,0,0)},220)}
function createExplosion(m){
 if(!app)return;
 const root=new pc.Entity('explosion');root.setPosition(m.x,m.y||.5,m.z);app.root.addChild(root);
 const matx=new pc.StandardMaterial();matx.diffuse=new pc.Color(1,.16,.02);matx.emissive=new pc.Color(1,.08,.01);matx.emissiveIntensity=3;matx.opacity=.9;matx.blendType=pc.BLEND_ADDITIVE;matx.update();
 const core=new pc.Entity('blast');core.addComponent('render',{type:'sphere',material:matx});core.setLocalScale(.3,.3,.3);root.addChild(core);
 const light=new pc.Entity('blastLight');light.addComponent('light',{type:'omni',color:new pc.Color(1,.22,.04),intensity:5,range:10});root.addChild(light);
 const start=performance.now();const dur=420;function anim(){const t=(performance.now()-start)/dur;if(t>=1){root.destroy();return}const s=.3+t*5.5;core.setLocalScale(s,s,s);light.light.intensity=5*(1-t);requestAnimationFrame(anim)}anim();tone(70,.28,'sawtooth',.09,35);tone(220,.11,'square',.045,60);const f=$('explosionFlash');f.classList.remove('show');void f.offsetWidth;f.classList.add('show');setTimeout(()=>f.classList.remove('show'),120);
}
function setHP(h){$('hp').textContent='HP '+Math.max(0,Math.round(h))}
function showDeath(m){$('death').style.display='flex';$('deathText').textContent=m?.killer?`Zabił Cię ${m.killer} • odrodzenie za 3 s`:'Odrodzenie za 3 s';alive=false;fireHeld=false;clearTimeout(deathTimer);if(player){player.setLocalEulerAngles(0,yaw,0);player.setLocalPosition(player.getPosition().x,player.getPosition().y-.15,player.getPosition().z)}$('death').classList.add('deadanim');deathTimer=setTimeout(()=>$('death').classList.remove('deadanim'),650)}
function requestRespawn(){if(ws?.readyState===1){ws.send(JSON.stringify({type:'respawn'}));$('death').style.display='none'}}
function addKill(m){const d=document.createElement('div');d.textContent=`${m.killer}  ${m.weapon.toUpperCase()}  ${m.victim}`;$('killfeed').prepend(d);setTimeout(()=>d.remove(),4500)}
function ensureAudio(){try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume()}catch(e){}}
function tone(freq,dur,type='square',gain=.045,endFreq=freq){ensureAudio();if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,endFreq),audioCtx.currentTime+dur);g.gain.setValueAtTime(gain,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur+.01)}
function playShotSound(){const f={pistol:210,smg:125,shotgun:75,sniper:95}[weapon]||150;tone(f,.07,'sawtooth',.065,f*.45);tone(f*2.1,.035,'square',.025,f*.8)}
function playReloadSound(){tone(520,.055,'triangle',.035,380);setTimeout(()=>tone(260,.07,'triangle',.04,190),120);setTimeout(()=>tone(700,.08,'triangle',.04,900),Math.max(180,(W[weapon]?.reload||1)*700))}
function playHitSound(){tone(980,.055,'square',.045,1250)}
function playKillSound(){tone(520,.07,'triangle',.055,760);setTimeout(()=>tone(760,.11,'triangle',.045,1050),65)}
function showHit(d){playHitSound();const h=$('hit');h.textContent=d?`✦ ${d}`:'✦';h.classList.add('hitflash');h.style.opacity=1;clearTimeout(hitTimer);hitTimer=setTimeout(()=>{h.style.opacity=0;h.classList.remove('hitflash')},170)}
function updateAmmo(){$('ammo').textContent=`${ammo}/${W[weapon].mag}`}
function reload(){if(!alive||reloading||ammo===W[weapon].mag||!ws||ws.readyState!==1)return;ensureAudio();playReloadSound();reloading=true;$('reload').textContent='...';arms.classList.add('reloadanim');setTimeout(()=>arms&&arms.classList.remove('reloadanim'),Math.max(450,(W[weapon].reload||1)*1000));ws.send(JSON.stringify({type:'reload',weapon}))}
function fire(){if(!alive||reloading||cool>0||ammo<=0||!ws||ws.readyState!==1)return;ensureAudio();ammo--;cool=W[weapon].rate;recoil=W[weapon].recoil;weaponAnim=1;playShotSound();if(muzzle){muzzle.enabled=true;muzzle.setLocalScale(1.8,1.8,1.8);clearTimeout(flashTimer);flashTimer=setTimeout(()=>{if(muzzle){muzzle.enabled=false;muzzle.setLocalScale(1,1,1)}},55)}weaponAnim=Math.max(weaponAnim,1);ws.send(JSON.stringify({type:'fire',weapon}));updateAmmo();if(ammo===0)reload()}
function tryMove(dx,dz){let p=player.getPosition(),nx=p.x+dx,nz=p.z+dz;const obs=MAPS[mapName]||[];const blocked=(x,z)=>obs.some(([ox,oz,w,d])=>x>ox-w/2-RADIUS&&x<ox+w/2+RADIUS&&z>oz-d/2-RADIUS&&z<oz+d/2+RADIUS);if(blocked(nx,nz)){if(!blocked(nx,p.z))nz=p.z;else if(!blocked(p.x,nz))nx=p.x;else{nx=p.x;nz=p.z}}return {x:clamp(nx,-32+RADIUS,32-RADIUS),z:clamp(nz,-32+RADIUS,32-RADIUS)}}
function startGame(){
 if(!token||!profile){$('msg').textContent='Najpierw zaloguj się.';return}
 if(typeof pc==='undefined'){$('msg').textContent='Nie załadował się silnik PlayCanvas. Sprawdź internet i odśwież stronę.';return}
 const canvas=$('pc');
 if(!canvas||!(canvas instanceof HTMLCanvasElement)){$('msg').textContent='Brak canvasu gry. Odśwież stronę.';return}
 mapName=$('mapSel').value;mode=$('modeSel').value;room=($('room').value.trim().toUpperCase()||'PUBLIC');
 const boot=document.getElementById('bootError');
 try{
  if(app){try{app.destroy()}catch(e){} app=null}
  app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:false,antialias:true}});
  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.start();
  buildMap();
  setupLook();setupTouch();setupKeyboard();
  app.on('update',tick);
  updateAmmo();updateGrenades();
  $('menu').style.display='none';
  if(boot)boot.style.display='none';
  connect();
 }catch(e){
  console.error('SKYFALL startGame error',e);
  $('menu').style.display='flex';
  $('msg').textContent='Nie udało się uruchomić gry: '+(e?.message||e);
  if(boot){$('bootErrorText').textContent=e?.stack||e?.message||String(e);boot.style.display='flex'}
  try{if(app)app.destroy()}catch(_){} app=null;
 }
}
function getSurface(x,z){
 if(mapName==='desert') return 'sand';
 if(mapName==='arctic') return 'ice';
 if(mapName==='skyline') return (Math.abs(x)>11||Math.abs(z)>11)?'metal':'concrete';
 return (Math.abs(x)>11||Math.abs(z)>11)?'metal':'concrete';
}
function playFootstep(surface){
 ensureAudio(); if(!audioCtx)return;
 const cfg={concrete:[105,.045,'triangle',.035],metal:[145,.05,'square',.03],sand:[72,.065,'triangle',.028],ice:[190,.04,'sine',.025]}[surface]||[105,.045,'triangle',.03];
 tone(cfg[0],cfg[1],cfg[2],cfg[3],cfg[0]*.55);
}
function maybeFootstep(moving,sprinting,dt){
 if(!moving)return;
 const interval=sprinting?.27:.38; lastFootstep+=dt; if(lastFootstep>=interval){lastFootstep=0;surfaceNow=getSurface(player.getPosition().x,player.getPosition().z);playFootstep(surfaceNow);}
}
function showSpawnProtection(active){
 const hp=$('hp'); if(!hp)return; hp.style.textShadow=active?'0 0 10px #67e8f9,0 0 20px #67e8f9':'0 2px 5px #000';
}
function tick(dt){if(!player)return;grenadeCooldown=Math.max(0,grenadeCooldown-dt);cool=Math.max(0,cool-dt);recoil=Math.max(0,recoil-dt*5);if(fireHeld&&W[weapon].auto)fire();jumpBuffer=Math.max(0,jumpBuffer-dt);if(!grounded)coyote=Math.max(0,coyote-dt);else coyote=.11;const len=Math.hypot(move.x,move.z);const wantsSprint=sprint&&len>.2&&stamina>0;const target=len>.05?(wantsSprint?SPRINT:WALK):0;if(wantsSprint)stamina=Math.max(0,stamina-18*dt);else stamina=Math.min(staminaMax,stamina+24*dt);if(stamina<=0)sprint=false;$('stamina').textContent=`⚡ ${Math.round(stamina)}`;const fwdX=-Math.sin(yaw*Math.PI/180),fwdZ=-Math.cos(yaw*Math.PI/180),rightX=Math.cos(yaw*Math.PI/180),rightZ=-Math.sin(yaw*Math.PI/180);let tx=(rightX*move.x+fwdX*move.z)*target,tz=(rightZ*move.x+fwdZ*move.z)*target;const accel=grounded?ACCEL_GROUND:ACCEL_AIR;vel.x+=(tx-vel.x)*Math.min(1,accel*dt);vel.z+=(tz-vel.z)*Math.min(1,accel*dt);if(len<.05&&grounded){const f=Math.max(0,1-FRICTION*dt);vel.x*=f;vel.z*=f}if(jumpBuffer>0&&(grounded||coyote>0)&&stamina>=10){vel.y=JUMP;grounded=false;coyote=0;jumpBuffer=0;stamina-=10}vel.y+=GRAVITY*dt;const oldY=player.getPosition().y;let dy=vel.y*dt;let pos=player.getPosition();let next=tryMove(vel.x*dt,vel.z*dt);player.setPosition(next.x,Math.max(0,pos.y+dy),next.z);if(player.getPosition().y<=0){if(oldY>0&&vel.y<-5){}const q=player.getPosition();player.setPosition(q.x,0,q.z);vel.y=0;if(!grounded)coyote=.11;grounded=true}else grounded=false;const moving=len>.1&&grounded;maybeFootstep(moving,wantsSprint,dt);stepTime+=dt*(moving?(wantsSprint?15:10):0);if(weaponRoot){const fireKick=weaponAnim;weaponAnim=Math.max(0,weaponAnim-dt*10);const bob=moving?Math.abs(Math.sin(stepTime))*.012:0;weaponRoot.setLocalEulerAngles(-recoil*9+Math.sin(stepTime)*.6-fireKick*7,fireKick*1.5,recoil*2+Math.cos(stepTime)*.35);weaponRoot.setLocalPosition(.17,-.22-recoil*.12-bob+fireKick*.035,-.63+fireKick*.07)}cam.setLocalEulerAngles(pitch-recoil,yaw,0);drawMinimap();if(ws?.readyState===1&&alive&&(performance.now()-lastNet>60)){lastNet=performance.now();const p=player.getPosition();ws.send(JSON.stringify({type:'state',x:p.x,y:p.y,z:p.z,vy:vel.y,a:yaw,grounded,sprint:wantsSprint}))}}
function setupLook(){const c=$('pc');let looking=false,lastX=0,lastY=0;c.addEventListener('pointerdown',e=>{if(e.target.closest('.mobile')||e.target.closest('.weaponbar'))return;looking=true;lastX=e.clientX;lastY=e.clientY});c.addEventListener('pointermove',e=>{if(looking){yaw-=((e.clientX-lastX)*.16);pitch=clamp(pitch+(e.clientY-lastY)*.12,-82,82);lastX=e.clientX;lastY=e.clientY}});window.addEventListener('pointerup',()=>looking=false);c.addEventListener('click',()=>{if(matchMedia('(pointer:fine)').matches&&c.requestPointerLock)c.requestPointerLock()});document.addEventListener('mousemove',e=>{if(document.pointerLockElement===c){yaw-=e.movementX*.12;pitch=clamp(pitch+e.movementY*.09,-82,82)}})}
function setupKeyboard(){const keys={};addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='ShiftLeft'||e.code==='ShiftRight')sprint=true;if(e.code==='Space'){e.preventDefault();jump()}});addEventListener('keyup',e=>{keys[e.code]=false;if(e.code==='ShiftLeft'||e.code==='ShiftRight')sprint=false});app.on('update',()=>{move.x=(keys.KeyD?1:0)-(keys.KeyA?1:0);move.z=(keys.KeyS?1:0)-(keys.KeyW?1:0)})}
function jump(){if(!alive)return;jumpBuffer=.14;if((grounded||coyote>0)&&stamina>=10){vel.y=JUMP;grounded=false;coyote=0;stamina=Math.max(0,stamina-10)}}
function setupTouch(){const joy=$('joy'),knob=$('knob');let id=null;joy.onpointerdown=e=>{id=e.pointerId;joy.setPointerCapture(id);moveJoy(e)};joy.onpointermove=e=>{if(e.pointerId===id)moveJoy(e)};joy.onpointerup=()=>{id=null;move={x:0,z:0};knob.style.transform=''};function moveJoy(e){const r=joy.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,d=Math.min(42,Math.hypot(x,y)),a=Math.atan2(y,x),nx=Math.cos(a)*d/42,ny=Math.sin(a)*d/42;knob.style.transform=`translate(${nx*42}px,${ny*42}px)`;move={x:nx,z:ny};if(d>30)sprint=true;else sprint=false}$('fire').onpointerdown=e=>{e.preventDefault();fireHeld=true;fire()};$('fire').onpointerup=()=>fireHeld=false;$('reload').onclick=reload;$('jump').onclick=jump;$('exit').onclick=()=>{try{ws?.close()}catch{};location.reload()}}
