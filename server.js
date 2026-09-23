const express=require('express'),http=require('http'),WebSocket=require('ws'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),fs=require('fs');
const path=require('path');
const app=express(),server=http.createServer(app),wss=new WebSocket.Server({server});
const PORT=process.env.PORT||3000,SECRET=process.env.JWT_SECRET||'CHANGE_ME_NOW',DB=process.env.DATA_FILE||path.join(__dirname,'data.json');
let db={users:{}};
try{if(fs.existsSync(DB)){const raw=fs.readFileSync(DB,'utf8').trim();if(raw)db=JSON.parse(raw);if(!db.users||typeof db.users!=='object')db={users:{}}}}catch(e){console.error('DATA LOAD ERROR:',e.message);db={users:{}}}
app.disable('x-powered-by');
app.use(express.json({limit:'32kb'}));
app.get('/health',(req,res)=>res.json({ok:true,game:'SKYFALL',version:'v22'}));
app.get('/api/ping',(req,res)=>res.json({ok:true,version:'v22'}));
app.use(express.static(path.join(__dirname,'public')));
const safe=u=>{const {password,...x}=u;return x};
function auth(req){return jwt.verify((req.headers.authorization||'').replace('Bearer ',''),SECRET)}
const save=()=>{const tmp=DB+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2),'utf8');fs.renameSync(tmp,DB)};
app.post('/api/register',async(req,res)=>{try{const username=(req.body.username||'').trim().toLowerCase(),password=req.body.password||'';if(!/^[a-z0-9_]{3,16}$/i.test(username))throw Error('Nick: 3–16 znaków, litery/cyfry/_');if(password.length<6)throw Error('Hasło musi mieć min. 6 znaków');if(db.users[username])throw Error('Taki użytkownik już istnieje');db.users[username]={username,password:await bcrypt.hash(password,10),coins:500,xp:0,kills:0,deaths:0,inventory:['default'],equipped:'default'};save();res.json({token:jwt.sign({username},SECRET),profile:safe(db.users[username])})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/login',async(req,res)=>{try{const u=db.users[(req.body.username||'').toLowerCase()];if(!u||!(await bcrypt.compare(req.body.password||'',u.password)))throw Error('Nieprawidłowy login lub hasło');res.json({token:jwt.sign({username:u.username},SECRET),profile:safe(u)})}catch(e){res.status(401).json({error:e.message})}});
app.get('/api/me',(req,res)=>{try{const p=auth(req),u=db.users[p.username];if(!u)throw Error('Sesja wygasła');res.json({profile:safe(u)})}catch(e){res.status(401).json({error:e.message||'Brak autoryzacji'})}});
const SKINS=[['neon','Neon',500],['crimson','Crimson',900],['ice','Ice',1200],['shadow','Shadow',1800],['gold','Gold',3000]];
app.get('/api/shop',(req,res)=>res.json({items:SKINS.map(([id,name,price])=>({id,name,price}))}));
app.post('/api/shop/buy',(req,res)=>{try{const p=auth(req),u=db.users[p.username],item=SKINS.find(x=>x[0]===req.body.id);if(!item)throw Error('Nie ma takiego przedmiotu');if(u.inventory.includes(item[0]))throw Error('Już posiadasz ten skin');if(u.coins<item[2])throw Error('Za mało monet');u.coins-=item[2];u.inventory.push(item[0]);save();res.json(safe(u))}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/equip',(req,res)=>{try{const p=auth(req),u=db.users[p.username];if(!u.inventory.includes(req.body.id))throw Error('Nie posiadasz tego skina');u.equipped=req.body.id;save();res.json(safe(u))}catch(e){res.status(400).json({error:e.message})}});
const WEAPONS={pistol:{damage:25,head:1.6,range:55,cooldown:260,mag:15,spread:2.2,pellets:1,reload:0.8},smg:{damage:16,head:1.5,range:38,cooldown:85,mag:30,spread:6.5,pellets:1,reload:1.05},shotgun:{damage:9,head:1.15,range:20,cooldown:850,spread:12,pellets:8,reload:1.35},sniper:{damage:100,head:2,range:115,cooldown:1150,spread:.45,pellets:1,reload:1.65}};
const GRENADE={max:2,cooldown:900,radius:6,damage:110,travel:650};
const PICKUPS={health:{amount:35,respawn:12000},ammo:{amount:10,respawn:10000},radius:1.25};
const PICKUP_LAYOUT={
 neon:[['health',-8,3],['ammo',8,3],['health',-8,-3],['ammo',8,-3],['ammo',0,10],['health',0,-10]],
 desert:[['health',-8,3],['ammo',8,3],['health',-8,-3],['ammo',8,-3],['ammo',0,10],['health',0,-10]],
 arctic:[['health',-8,3],['ammo',8,3],['health',-8,-3],['ammo',8,-3],['ammo',0,10],['health',0,-10]],
 skyline:[['health',-8,3],['ammo',8,3],['health',-8,-3],['ammo',8,-3],['ammo',0,10],['health',0,-10]]
};
const MAPS={neon:[[-13,0,2,26],[13,0,2,26],[-16,0,4,20],[16,0,4,20],[-8,-8,7,5],[8,8,7,5],[-9,9,4,8],[9,-9,4,8]],desert:[[-13,0,2,26],[13,0,2,26],[-16,0,4,20],[16,0,4,20],[-8,-7,9,4],[8,7,9,4],[-7,8,4,8],[7,-8,4,8]],arctic:[[-13,0,2,26],[13,0,2,26],[-16,0,4,20],[16,0,4,20],[-9,-8,5,9],[9,8,5,9],[-8,7,9,3],[8,-7,9,3]],skyline:[[-13,0,2,26],[13,0,2,26],[-16,0,4,20],[16,0,4,20],[-8,-8,7,4],[8,8,7,4],[-8,8,4,8],[8,-8,4,8]]};
function collides(x,z,map='neon'){for(const [ox,oz,w,d] of (MAPS[map]||MAPS.neon)){if(x>ox-w/2-.42&&x<ox+w/2+.42&&z>oz-d/2-.42&&z<oz+d/2+.42)return true}return false}
function segmentBlocked(a,b,map='neon'){const dx=b.x-a.x,dz=b.z-a.z;for(const [ox,oz,w,d] of (MAPS[map]||MAPS.neon)){const minX=ox-w/2-.02,maxX=ox+w/2+.02,minZ=oz-d/2-.02,maxZ=oz+d/2+.02;let t0=0,t1=1;for(const [p,q] of [[-dx,a.x-minX],[dx,maxX-a.x],[-dz,a.z-minZ],[dz,maxZ-a.z]]){if(Math.abs(p)<1e-9){if(q<0){t0=2;break}}else{const t=q/p;if(p<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);if(t0>t1)break}}if(t0<=t1&&t0>=0&&t0<=1)return true}return false}
function clampMove(old,x,z,map){let nx=Math.max(-32,Math.min(32,x)),nz=Math.max(-32,Math.min(32,z));if(!collides(nx,nz,map))return[nx,nz];if(!collides(nx,old.z,map))nz=old.z;else if(!collides(old.x,nz,map))nx=old.x;else return[old.x,old.z];return collides(nx,nz,map)?[old.x,old.z]:[nx,nz]}
const rooms=new Map(),clients=new Set();
function makeRoom(id,map,mode='ffa'){const r={map,mode:mode==='tdm'?'tdm':'ffa',target:mode==='tdm'?50:20,duration:300000,startAt:Date.now(),ended:false,endAt:0,players:{},teamScores:{red:0,blue:0},pickups:{}};resetPickups(r);return r}
function roomFor(ws){return rooms.get(ws.room)}
function roomIdOf(r){for(const [id,x] of rooms)if(x===r)return id;return null}
function broadcast(room,msg){const s=JSON.stringify(msg);for(const ws of clients)if(ws.readyState===1&&ws.room===room)ws.send(s)}
function scoreSnapshot(r){return Object.fromEntries(Object.entries(r.players).map(([n,p])=>[n,p.score||0]))}
function teamSnapshot(r){return Object.fromEntries(Object.entries(r.teamScores||{red:0,blue:0}).map(([k,v])=>[k,v||0]))}
function publicMatch(r){return{mode:r.mode,target:r.target,pickups:Object.fromEntries(Object.entries(r.pickups||{}).map(([id,p])=>[id,{id:p.id,type:p.type,x:p.x,z:p.z,active:p.active} ])),remaining:Math.max(0,r.ended?r.endAt-Date.now():r.duration-(Date.now()-r.startAt)),ended:r.ended,scores:scoreSnapshot(r),teams:teamSnapshot(r)}}
function sendState(room){const r=rooms.get(room);if(r)broadcast(room,{type:'state',players:r.players,match:publicMatch(r)})}
function resetPickups(r){r.pickups={};(PICKUP_LAYOUT[r.map]||PICKUP_LAYOUT.neon).forEach(([type,x,z],i)=>{const id=`${type}_${i}`;r.pickups[id]={id,type,x,z,active:true,respawnAt:0}})}
function collectPickups(r,p,name,now){if(!p||!p.alive||r.ended)return;for(const q of Object.values(r.pickups||{})){if(!q.active)continue;const d=Math.hypot(p.x-q.x,p.z-q.z);if(d>PICKUPS.radius)continue;if(q.type==='health'){if(p.hp>=100)continue;p.hp=Math.min(100,p.hp+PICKUPS.health.amount)}else{const w=WEAPONS[p.weapon]||WEAPONS.pistol;p.ammo=Math.min(w.mag,p.ammo+PICKUPS.ammo.amount)}q.active=false;q.respawnAt=now+PICKUPS[q.type].respawn;broadcast(roomIdOf(r),{type:'pickup',id:q.id,pickupType:q.type,player:name});}}
function updatePickups(r,now){for(const q of Object.values(r.pickups||{})){if(!q.active&&now>=q.respawnAt){q.active=true;q.respawnAt=0;broadcast(roomIdOf(r),{type:'pickupRespawn',id:q.id})}}}
function teamOf(r,name){return r.players[name]?.team||null}
function enemy(a,b){return a&&b&&a!==b}

const BOT_NAMES=['BOT_NOVA','BOT_RAVEN','BOT_VOLT','BOT_GHOST','BOT_FURY','BOT_ECHO','BOT_BLAZE','BOT_NIGHT','BOT_ZERO'];
const BOT_WEAPONS=['smg','pistol','shotgun','sniper','smg','pistol','smg','shotgun','sniper'];
function spawn(p,map,team=null){const red=[[0,22],[6,18],[-6,18],[18,6],[-18,6]],blue=[[0,-22],[6,-18],[-6,-18],[18,-6],[-18,-6]],ffa=[[0,22],[0,-22],[22,0],[-22,0],[6,18],[-6,-18],[18,6],[-18,-6]];const spots=team==='red'?red:team==='blue'?blue:ffa;for(let i=0;i<spots.length;i++){const s=spots[Math.floor(Math.random()*spots.length)];if(!collides(s[0],s[1],map)){p.x=s[0];p.z=s[1];break}}p.y=0;p.vy=0;p.grounded=true;p.a=Math.random()*360;p.hp=100;p.alive=true;p.respawnAt=0;p.grenades=GRENADE.max;p.nextGrenade=0;p.spawnProtectedUntil=Date.now()+2200}
function chooseTeam(r){const counts={red:0,blue:0};for(const p of Object.values(r.players))if(!p.bot&&p.team)counts[p.team]++;return counts.red<=counts.blue?'red':'blue'}
function ensureBots(r){const want=r.mode==='tdm'?9:5;for(let i=0;i<want;i++){const name=BOT_NAMES[i];if(!r.players[name]){let team=null;if(r.mode==='tdm'){const rc=Object.values(r.players).filter(p=>p.team==='red').length,bc=Object.values(r.players).filter(p=>p.team==='blue').length;team=rc<=bc?'red':'blue'}const wi=BOT_WEAPONS[i];r.players[name]={bot:true,team,x:0,y:0,z:0,vy:0,grounded:true,a:0,hp:100,alive:true,respawnAt:0,skin:['neon','crimson','ice','shadow','gold'][i%5],score:0,weapon:wi,ammo:WEAPONS[wi].mag,nextShot:0,nextThink:0,target:null,strafe:Math.random()<.5?-1:1};spawn(r.players[name],r.map,team)}}}
function addHuman(r,name){const team=r.mode==='tdm'?chooseTeam(r):null;r.players[name]={bot:false,team,x:0,y:0,z:0,vy:0,grounded:true,a:0,hp:100,alive:true,respawnAt:0,skin:db.users[name].equipped,score:0,weapon:'pistol',ammo:WEAPONS.pistol.mag,reloading:false,reloadAt:0,grenades:GRENADE.max,nextGrenade:0};spawn(r.players[name],r.map,team)}
function angleDiff(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b))}
function lineHit(shooter,target,w,map){const dx=target.x-shooter.x,dz=target.z-shooter.z,dist=Math.hypot(dx,dz);if(dist>w.range||dist<.1)return null;const targetAngle=Math.atan2(dx,dz),diff=angleDiff(targetAngle,shooter.a*Math.PI/180),cone=Math.max(w.spread*Math.PI/180,Math.atan((.45+.02*dist)/dist));if(Math.abs(diff)>cone)return null;if(segmentBlocked({x:shooter.x,z:shooter.z},{x:target.x,z:target.z},map))return null;return {dist,diff}}
function damagePlayer(r,killerName,victimName,amount,source='weapon'){
 const killer=r.players[killerName],victim=r.players[victimName];
 if(!killer||!victim||!victim.alive||amount<=0)return false;
 if(victim.spawnProtectedUntil&&Date.now()<victim.spawnProtectedUntil)return false;
 if(r.mode==='tdm'&&killer.team===victim.team)return false;
 victim.hp=Math.max(0,victim.hp-amount);
 if(!victim.bot){const sock=[...clients].find(s=>s.user===victimName&&s.room===roomIdOf(r));if(sock)sock.send(JSON.stringify({type:'damage',hp:victim.hp,source,killer:killerName}));}
 if(victim.hp<=0)return awardKill(r,killerName,victimName,source);
 return false;
}
function awardKill(r,killerName,victimName,weapon){const killer=r.players[killerName],victim=r.players[victimName];if(!killer||!victim||!victim.alive)return false;if(r.mode==='tdm'&&killer.team===victim.team)return false;killer.score=(killer.score||0)+1;victim.alive=false;victim.hp=0;victim.respawnAt=Date.now()+3000;if(r.mode==='tdm'&&killer.team)r.teamScores[killer.team]=(r.teamScores[killer.team]||0)+1;if(!killer.bot){const u=db.users[killerName];u.kills++;u.xp+=100;u.coins+=25;save();const sock=[...clients].find(s=>s.user===killerName&&s.room===roomIdOf(r));if(sock)sock.send(JSON.stringify({type:'reward',coins:u.coins,xp:u.xp,kills:u.kills}))}if(!victim.bot){const u=db.users[victimName];u.deaths=(u.deaths||0)+1;save();const sock=[...clients].find(s=>s.user===victimName&&s.room===roomIdOf(r));if(sock)sock.send(JSON.stringify({type:'death',killer:killerName}))}broadcast(roomIdOf(r),{type:'killfeed',killer:killerName,victim:victimName,weapon,team:killer.team||null});if((r.mode==='tdm'&&r.teamScores[killer.team]>=r.target)||(r.mode==='ffa'&&killer.score>=r.target)){r.ended=true;r.endAt=Date.now()+10000;const winner=r.mode==='tdm'?(r.teamScores.red===r.teamScores.blue?'draw':(r.teamScores.red>r.teamScores.blue?'red':'blue')):killerName;broadcast(roomIdOf(r),{type:'matchEnd',mode:r.mode,winner,score:r.mode==='tdm'?(r.teamScores[winner]||0):killer.score,scores:scoreSnapshot(r),teams:teamSnapshot(r)});}return true}
function fireAt(r,shooterName,weaponId){const shooter=r.players[shooterName];if(!shooter||!shooter.alive||r.ended)return false;const w=WEAPONS[weaponId]||WEAPONS.pistol;if(shooter.weapon!==weaponId)shooter.weapon=weaponId;if(!shooter.bot&&shooter.ammo<=0)return false;if(shooter.bot&&shooter.ammo<=0)shooter.ammo=w.mag;if(!shooter.bot)shooter.ammo--;else shooter.ammo--; let candidates=[];for(const[name,t]of Object.entries(r.players)){if(name===shooterName||!t.alive)continue;if(r.mode==='tdm'&&t.team===shooter.team)continue;const h=lineHit(shooter,t,w,r.map);if(h)candidates.push({name,t,...h})}candidates.sort((a,b)=>a.dist-b.dist||Math.abs(a.diff)-Math.abs(b.diff));let damage=0,hits=0,killed=null;if(weaponId==='shotgun'){const h=candidates[0];if(h){for(let i=0;i<w.pellets;i++){const pd=h.diff+(Math.random()-.5)*(w.spread*Math.PI/180);if(Math.abs(pd)<=Math.max(.035,Math.atan((.45+.02*h.dist)*.75/h.dist))){const d=w.damage*(Math.abs(pd)<.035?w.head:1);if(h.t.alive){damagePlayer(r,shooterName,h.name,d,weapon);damage+=d;hits++}}}if(h.t.hp<=0)killed=h.name}}else if(candidates[0]){const h=candidates[0];const d=w.damage*(Math.abs(h.diff)<(weaponId==='sniper'?.012:.035)?w.head:1);if(h.t.alive){damagePlayer(r,shooterName,h.name,d,weaponId);damage=d;hits=1;if(!h.t.alive)killed=h.name}}if(!shooter.bot){const sock=[...clients].find(s=>s.user===shooterName&&s.room===roomIdOf(r));if(sock)sock.send(JSON.stringify({type:'shot',hits,damage:Math.round(damage),weapon:weaponId}))}if(killed)awardKill(r,shooterName,killed,weaponId);return true}
function explodeGrenade(r,grenade){
 const roomId=roomIdOf(r);
 if(!roomId)return;
 broadcast(roomId,{type:'explosion',x:grenade.x,y:grenade.y,z:grenade.z,radius:GRENADE.radius,team:grenade.team});
 for(const [name,t] of Object.entries(r.players)){
  if(!t.alive)continue;
  if(r.mode==='tdm'&&t.team===grenade.team)continue;
  const d=Math.hypot(t.x-grenade.x,t.z-grenade.z);
  if(d>GRENADE.radius)continue;
  if(segmentBlocked({x:grenade.x,z:grenade.z},{x:t.x,z:t.z},r.map))continue;
  const falloff=Math.max(.15,1-d/GRENADE.radius);
  damagePlayer(r,grenade.owner,name,GRENADE.damage*falloff,'grenade');
 }
}
function throwGrenade(r,name){
 const p=r.players[name],now=Date.now();
 if(!p||!p.alive||r.ended||p.grenades<=0||now<p.nextGrenade)return false;
 p.grenades--;p.nextGrenade=now+GRENADE.cooldown;
 const a=p.a*Math.PI/180;
 const g={owner:name,team:p.team,x:p.x-Math.sin(a)*1.2,y:Math.max(.8,p.y+1.35),z:p.z-Math.cos(a)*1.2,vx:-Math.sin(a)*9,vz:-Math.cos(a)*9,started:now};
 broadcast(roomIdOf(r),{type:'grenade',owner:name,x:g.x,y:g.y,z:g.z});
 setTimeout(()=>{if(!r.ended)explodeGrenade(r,g)},GRENADE.travel);
 return true;
}
function reloadPlayer(r,p,now){if(!p||!p.alive||p.reloading)return false;const w=WEAPONS[p.weapon]||WEAPONS.pistol;if(p.ammo>=w.mag)return false;p.reloading=true;p.reloadAt=now+(w.reload*1000);const owner=Object.entries(r.players).find(([n,x])=>x===p)?.[0];if(owner&&!p.bot){const sock=[...clients].find(s=>s.user===owner&&s.room===roomIdOf(r));if(sock)sock.send(JSON.stringify({type:'reloadStart'}))}return true}
function finishReloads(r,now){for(const [name,p] of Object.entries(r.players)){if(p.reloading&&now>=p.reloadAt){p.reloading=false;p.ammo=(WEAPONS[p.weapon]||WEAPONS.pistol).mag;if(!p.bot){const sock=[...clients].find(s=>s.user===name&&s.room===roomIdOf(r));if(sock)sock.send(JSON.stringify({type:'reloadDone',ammo:p.ammo}))}}}}
function nearestOpenStep(r,b,t){
 const dx=t.x-b.x,dz=t.z-b.z,d=Math.hypot(dx,dz)||1;
 const ux=dx/d,uz=dz/d;
 const candidates=[[ux,uz],[uz,-ux],[-uz,ux],[ux*.7+uz*.7,uz*.7-ux*.7],[ux*.7-uz*.7,uz*.7+ux*.7]];
 for(const [sx,sz] of candidates){const step=.75;const [x,z]=clampMove({x:b.x,z:b.z},b.x+sx*step,b.z+sz*step);if(Math.hypot(x-b.x,z-b.z)>.05)return [x,z]}
 return [b.x,b.z];
}
function botThink(r,botName,now){
 const b=r.players[botName];if(!b||!b.alive||r.ended)return;if(now<b.nextThink)return;
 b.nextThink=now+150+Math.random()*180;
 let best=null,bd=Infinity;
 for(const[n,p]of Object.entries(r.players)){if(n===botName||!p.alive)continue;if(r.mode==='tdm'&&p.team===b.team)continue;const d=Math.hypot(p.x-b.x,p.z-b.z);if(d<bd){bd=d;best=[n,p]}}
 if(!best)return;
 b.target=best[0];const t=best[1];
 const desired=Math.atan2(t.x-b.x,t.z-b.z);const facing=desired;
 b.a+=Math.max(-24,Math.min(24,angleDiff(facing,b.a*Math.PI/180)*180/Math.PI));
 const visible=!segmentBlocked({x:b.x,z:b.z},{x:t.x,z:t.z},r.map);
 let tx=t.x,tz=t.z;
 if(!visible){
   // Flank: choose a side position around the target instead of blindly pushing into cover.
   const side=b.strafe||1; const dx=t.x-b.x,dz=t.z-b.z,d=Math.hypot(dx,dz)||1;
   const ux=dx/d,uz=dz/d; tx=t.x+(-uz)*side*4.5; tz=t.z+ux*side*4.5;
   if(Math.random()<.12)b.strafe*=-1;
 } else if(bd<8){
   // Close-range strafe/backpedal.
   const side=b.strafe||1;tx=b.x+(-Math.cos(facing))*1.2+(-Math.sin(facing))*side*1.2;tz=b.z+(Math.sin(facing))*1.2+(Math.cos(facing))*side*1.2;
 } else if(bd>16){
   tx=t.x;tz=t.z;
 } else {
   // Hold a mid-range combat distance and circle the target.
   const side=b.strafe||1;const dx=b.x-t.x,dz=b.z-t.z,d=Math.hypot(dx,dz)||1;tx=b.x+(-dz/d)*side*0.9;tz=b.z+(dx/d)*side*0.9;
 }
 const [mx,mz]=clampMove({x:b.x,z:b.z},b.x+(tx-b.x)*.12,b.z+(tz-b.z)*.12,r.map);b.x=mx;b.z=mz;
 if(now>=b.nextGrenade&&b.grenades>0&&bd<14&&Math.random()<.22)throwGrenade(r,botName);
 if(now>=b.nextShot&&bd<55){if(b.ammo<=0){reloadPlayer(r,b,now);b.nextShot=now+700}else if(!b.reloading&&visible){b.nextShot=now+(WEAPONS[b.weapon]?.cooldown||300)+Math.random()*260;fireAt(r,botName,b.weapon)}}
}
setInterval(()=>{const now=Date.now();for(const[rid,r]of rooms){finishReloads(r,now);updatePickups(r,now);if(!r.ended&&now-r.startAt>=r.duration){r.ended=true;r.endAt=now+10000;let winner;if(r.mode==='tdm'){winner=r.teamScores.red===r.teamScores.blue?'draw':(r.teamScores.red>r.teamScores.blue?'red':'blue')}else{const top=Object.entries(r.players).sort((a,b)=>(b[1].score||0)-(a[1].score||0))[0];winner=top?.[0]||'—'}broadcast(rid,{type:'matchEnd',mode:r.mode,winner,score:r.mode==='tdm'?(r.teamScores[winner]||0):(r.players[winner]?.score||0),scores:scoreSnapshot(r),teams:teamSnapshot(r)})}if(r.ended&&now>=r.endAt){r.startAt=now;r.ended=false;r.teamScores={red:0,blue:0};resetPickups(r);for(const p of Object.values(r.players)){p.score=0;p.alive=true;p.hp=100;p.reloading=false;spawn(p,r.map,p.team)}broadcast(rid,{type:'matchRestart'})}if(!r.ended){for(const[n,p]of Object.entries(r.players))if(p.bot){if(!p.alive&&now>=p.respawnAt)spawn(p,r.map,p.team);collectPickups(r,p,n,now);botThink(r,n,now)}}sendState(rid)}},120);
wss.on('connection',ws=>{clients.add(ws);ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}if(m.type==='join'){try{const p=jwt.verify(m.token,SECRET);if(!db.users[p.username])throw Error();ws.user=p.username;const baseRoom=(m.room||'PUBLIC').replace(/[^a-z0-9_-]/gi,'').slice(0,20)||'PUBLIC';const mode=m.mode==='tdm'?'tdm':'ffa';ws.room=baseRoom+'__'+mode;ws.map=m.map||'neon';let r=rooms.get(ws.room);if(!r){r=makeRoom(ws.room,ws.map,mode);rooms.set(ws.room,r)}else r.map=ws.map;if(!r.players[ws.user])addHuman(r,ws.user);ensureBots(r);ws.send(JSON.stringify({type:'joined',user:ws.user,room:baseRoom,mode:r.mode,team:r.players[ws.user].team||null}));sendState(ws.room)}catch{ws.send(JSON.stringify({type:'error',message:'Autoryzacja nieudana'}))}}
if(m.type==='state'&&ws.user){const r=roomFor(ws),p=r?.players[ws.user];if(!p||!p.alive||r.ended)return;const now=Date.now(),dt=Math.max(.035,Math.min(.25,(now-(ws.lastState?.t||now))/1000));const reqX=Number(m.x)||0,reqY=Math.max(0,Math.min(2.15,Number(m.y)||0)),reqZ=Number(m.z)||0;const dx=reqX-(ws.lastState?.x??p.x),dz=reqZ-(ws.lastState?.z??p.z),dist=Math.hypot(dx,dz),maxDist=((m.sprint?8.9:5.9)+1.5)*dt+.28;let tx=reqX,tz=reqZ;if(dist>maxDist){const k=maxDist/(dist||1);tx=(ws.lastState?.x??p.x)+dx*k;tz=(ws.lastState?.z??p.z)+dz*k}const old={x:p.x,z:p.z},[x,z]=clampMove(old,tx,tz,r.map);p.x=x;p.z=z;p.y=reqY;p.vy=Number(m.vy)||0;p.grounded=!!m.grounded;p.a=Number(m.a)||0;collectPickups(r,p,ws.user,now);ws.lastState={x:p.x,y:p.y,z:p.z,t:now}}
if(m.type==='switch'&&ws.user){const r=roomFor(ws),p=r?.players[ws.user],weapon=m.weapon;if(p&&p.alive&&WEAPONS[weapon]&&!p.reloading){p.weapon=weapon;p.ammo=WEAPONS[weapon].mag;p.reloading=false}}
if(m.type==='grenade'&&ws.user){const r=roomFor(ws);if(r)throwGrenade(r,ws.user)}
if(m.type==='reload'&&ws.user){const r=roomFor(ws),p=r?.players[ws.user];if(p)reloadPlayer(r,p,Date.now())}
if(m.type==='fire'&&ws.user){const r=roomFor(ws),p=r?.players[ws.user],weapon=m.weapon;if(p&&weapon&&WEAPONS[weapon]&&p.alive&&!p.reloading){const now=Date.now();ws.lastShot??=0;if(p.weapon!==weapon)p.weapon=weapon;if(now-ws.lastShot>=WEAPONS[weapon].cooldown&&p.ammo>0){ws.lastShot=now;fireAt(r,ws.user,weapon)}}}
if(m.type==='respawn'&&ws.user){const r=roomFor(ws),p=r?.players[ws.user];if(p&&!p.alive&&!r.ended&&Date.now()>=p.respawnAt){spawn(p,r.map);p.ammo=(WEAPONS[p.weapon]||WEAPONS.pistol).mag;p.reloading=false}}
});ws.on('close',()=>{if(ws.user&&ws.room){const r=rooms.get(ws.room);if(r){delete r.players[ws.user];const humans=Object.values(r.players).some(p=>!p.bot);if(!humans)rooms.delete(ws.room)}}clients.delete(ws)});});
server.listen(PORT,'0.0.0.0',()=>console.log(`SKYFALL v21 server on http://localhost:${PORT}`));
