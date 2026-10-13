import {LocalSession,PLAYS,DT,ordinal,routePoints,DEFENSES,DEFENSE_CALLS,PASS_TYPES,passPlan,passHeight} from './engine.js?online=7';
import {VIEW,physicalX,fieldToScreen,screenToField,cameraGoal,updateCamera} from './camera.js?online=7';
import {RoomSession,savedRoom} from './network.js?online=7';
const $=id=>document.getElementById(id),canvas=$('field'),ctx=canvas.getContext('2d');
let session=new LocalSession(Date.now()>>>0),started=false,paused=false,sound=false,audio=null,keys={},touch={x:0,y:0},mouse=null,view={x:-10,y:0,zoom:1},lastTime=0,accumulator=0,lastEvent=-1,flashTime=0,touchSprint=false,viewPossession=0,aim=null,passStyle='bullet';
const W=VIEW.width,H=VIEW.height,fieldTop=VIEW.top,fieldHeight=VIEW.fieldHeight;let scaleX=VIEW.baseX,scaleY=VIEW.baseY;
const state=()=>session.state;
const online=()=>session instanceof RoomSession;
const defending=()=>state()?.possession===1;
let lastRoomStage=null,connectionBusy=false;
function releaseInput(){keys={};touch={x:0,y:0};touchSprint=false;if(online())session.update({x:0,y:0,sprint:false});}
function roomChanged(room){if(session!==room)return;const r=room.room;if(!r)return;
  if(lastRoomStage!==r.stage&&['countdown','playing'].includes(r.stage)&&$('lobby-dialog').open)$('lobby-dialog').close();lastRoomStage=r.stage;sync();syncRoom();
}
function syncRoom(){
  const connected=online(),room=connected?session.room:null;$('online-bar').classList.toggle('hidden',!connected);$('room-connected').classList.toggle('hidden',!connected);$('room-entry').classList.toggle('hidden',connected);
  if(!connected){$('network-overlay').classList.add('hidden');return;}
  $('room-code').textContent=session.code;$('online-code').textContent=session.code;
  $('online-status').textContent=session.disconnected?'RECONNECTING':room?.stage==='playing'?`${session.latency}ms · LIVE`:room?.stage?.toUpperCase()||'CONNECTING';
  $('room-status').textContent=session.disconnected?'Connection lost. Retrying your player slot.':room?.stage==='lobby'?'Both players must ready up.':room?.stage==='paused'?room.pauseReason:room?.stage==='finished'?'Match finished. Both players can request a rematch.':room?.stage==='countdown'?'Starting shortly…':'Match in progress. This menu does not pause play.';
  for(let i=0;i<2;i++){const player=room?.players[i];$('room-player-'+i).textContent=player?`${player.name} · ${i===0?'Halifax':'Portland'}${i===session.slot?' / YOU':''} · ${!player.connected?'OFFLINE':player.ready?'READY':'CONNECTED'}`:'Waiting for a player…';}
  $('room-ready').classList.toggle('hidden',room?.stage!=='lobby');$('room-ready').textContent=room?.players[session.slot]?.ready?'CANCEL READY':'READY UP';$('room-rematch').classList.toggle('hidden',room?.stage!=='finished');$('room-rematch').disabled=!!room?.players[session.slot]?.rematch;$('room-rematch').textContent=room?.players[session.slot]?.rematch?'WAITING FOR OPPONENT':'REQUEST REMATCH';
  const blocked=!room||session.disconnected||!['playing','finished'].includes(room.stage);$('network-overlay').classList.toggle('hidden',!blocked);
  if(blocked){$('network-title').textContent=session.disconnected?'RECONNECTING.':room?.stage==='countdown'?String(Math.max(1,Math.ceil((room.countdownAt-(Date.now()+(room.serverTime-Date.now())))/1000))):room?.stage==='paused'?'MATCH PAUSED.':'BRING A RIVAL.';
    $('network-detail').textContent=session.fatal?'This room is no longer available. Open the lobby to start again.':session.disconnected?'Your player slot is saved. We’re trying to reconnect.':room?.stage==='paused'?room.pauseReason:room?.stage==='countdown'?'GET READY.':'Room '+session.code+' · Waiting for both players to ready up.';
    $('network-ready').classList.toggle('hidden',room?.stage!=='lobby'||session.disconnected);$('network-ready').textContent=room?.players[session.slot]?.ready?'WAITING FOR RIVAL':'READY UP';$('network-ready').disabled=!!room?.players[session.slot]?.ready;}
}
function openLobby(){releaseInput();$('lobby-error').textContent='';syncRoom();$('lobby-dialog').showModal();}
async function connectRoom(action,credentials=null){if(connectionBusy)return;connectionBusy=true;$('lobby-error').textContent='Connecting…';
  try{
    const callbacks={onChange:roomChanged,onError:error=>{$('lobby-error').textContent=error.message;}};
    const remote=credentials?RoomSession.restore(credentials,callbacks):await RoomSession.connect({action,code:$('join-code').value,name:$('player-name').value,...callbacks});
    if(!remote)throw Error('Room session could not be restored.');
    if(!remote.state){remote.active=true;await remote.poll();remote.stop();if(!remote.state)throw Error('Could not resume the room. You can create or join a new match.');}
    if(online())session.stop();session=remote;lastRoomStage=null;started=true;paused=false;aim=null;releaseInput();
    $('splash').classList.add('hidden');$('pause-overlay').classList.add('hidden');$('pause').classList.remove('hidden');remote.start();$('lobby-error').textContent='';roomChanged(remote);
  }catch(error){$('lobby-error').textContent=error.message;openLobby();$('lobby-error').textContent=error.message;}finally{connectionBusy=false;}
}
$('online-button').onclick=$('open-room').onclick=$('network-menu').onclick=openLobby;$('close-lobby').onclick=()=>{$('lobby-dialog').close();canvas.focus({preventScroll:true});};
$('create-room').onclick=()=>connectRoom('create');$('join-room').onclick=()=>connectRoom('join');$('room-ready').onclick=()=>{if(online())session.ready(!session.room?.players[session.slot]?.ready);};$('network-ready').onclick=()=>{if(online())session.ready(true);};$('room-rematch').onclick=()=>{if(online())session.rematch();};
$('room-leave').onclick=async()=>{if(online())await session.leave();lastRoomStage=null;session=new LocalSession(Date.now()>>>0);releaseInput();aim=null;view={x:-10,y:0,zoom:1};sync();syncRoom();$('lobby-dialog').close();};
$('copy-room').onclick=async()=>{try{await navigator.clipboard.writeText(session.code);$('lobby-error').textContent='Room code copied.';}catch{$('lobby-error').textContent='Room code: '+session.code;}};
$('copy-room-link').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',session.code);try{await navigator.clipboard.writeText(url.href);$('lobby-error').textContent='Invite link copied. Your opponent also needs Site access.';}catch{$('lobby-error').textContent=url.href;}};
function beep(freq=440,time=.1,type='square'){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+time);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+time);}catch{}}
function send(c){if(paused)return;if(c.type==='throw')c={...c,style:c.style||passStyle};session.send(c);sync();}
function choosePass(style){if(!PASS_TYPES[style])return;passStyle=style;sync();}
$('pass-bullet').onclick=()=>{choosePass('bullet');canvas.focus({preventScroll:true});};$('pass-lob').onclick=()=>{choosePass('lob');canvas.focus({preventScroll:true});};
$('swat-button').onclick=$('touch-swat').onclick=()=>{send({type:'swat'});canvas.focus({preventScroll:true});};$('pick-button').onclick=$('touch-pick').onclick=()=>{send({type:'pick'});canvas.focus({preventScroll:true});};
function start(){started=true;$('splash').classList.add('hidden');$('pause').classList.remove('hidden');beep(220,.12);sync();canvas.focus({preventScroll:true});}
function action(){if(online()){if(session.room?.stage==='finished')session.rematch();else if(session.room?.stage==='playing'&&state().possession===0&&['ready','dead'].includes(state().phase))send({type:state().phase==='ready'?'snap':'next'});canvas.focus({preventScroll:true});return;}if(!started){start();return;}if(paused)return;const s=state();if(s.phase==='ready')send({type:'snap'});else if(s.phase==='dead')send({type:'next'});else if(s.phase==='final')newGame();canvas.focus({preventScroll:true});}
function newGame(){session=new LocalSession(Date.now()>>>0,$('difficulty').value);paused=false;keys={};touch={x:0,y:0};touchSprint=false;lastEvent=-1;view={x:-10,y:0,zoom:1};aim=null;accumulator=0;$('pause-overlay').classList.add('hidden');if(!started)start();sync();}
$('start').onclick=start;$('snap').onclick=action;$('new-game').onclick=()=>{if(online()){openLobby();return;}if(!started||state().phase==='final'||confirm('Start a fresh game? Your current match will reset.'))newGame();};
$('punt').onclick=()=>send({type:'punt'});
$('difficulty').onchange=()=>{send({type:'difficulty',value:$('difficulty').value});};
$('sound').onclick=()=>{sound=!sound;$('sound').innerHTML='♪ <span>'+(sound?'ON':'OFF')+'</span>';$('sound').setAttribute('aria-label',sound?'Mute sound':'Enable sound');beep(520);};
function setPause(value){if(online()){releaseInput();if(value)openLobby();return;}if(!started||state().phase==='final')return;paused=value;aim=null;keys={};touch={x:0,y:0};touchSprint=false;$('pause-overlay').classList.toggle('hidden',!paused);$('pause').setAttribute('aria-label',paused?'Resume game':'Pause game');}
$('pause').onclick=()=>setPause(!paused);$('resume').onclick=()=>setPause(false);
let wasPaused=false;$('help').onclick=()=>{wasPaused=paused;if(started&&!online())setPause(true);releaseInput();$('help-dialog').showModal();};
function closeHelp(){$('help-dialog').close();if(!wasPaused)setPause(false);}
$('close-help').onclick=closeHelp;$('got-it').onclick=closeHelp;$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
window.addEventListener('blur',()=>{if(started&&!online()&&state().phase==='live')setPause(true);releaseInput();keys={};touch={x:0,y:0};});
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseInput();if(started&&!online()&&state().phase==='live')setPause(true);}});
const diagrams={slants:'M8 27 L25 10 L53 10 M8 8 L25 25 L53 25',verticals:'M9 9 L54 9 M9 24 L54 24',cross:'M8 7 L26 7 L51 27 M8 26 L25 26 L51 5',sweep:'M8 22 L19 22 Q28 22 28 12 L52 12',inside:'M7 22 L19 22 L29 15 L52 15',draw:'M7 22 L22 22 L31 17 L52 17',screen:'M8 10 L25 10 L50 10 M8 24 L19 30 L35 30 L50 24'};
Object.entries(PLAYS).forEach(([id,p],i)=>{
  const b=document.createElement('button');b.className='play-card';b.dataset.play=id;b.setAttribute('aria-label',p.name+', '+p.type);
  b.innerHTML=`<svg viewBox="0 0 62 34" aria-hidden="true"><path d="M13 1 V33" stroke="#44535d" stroke-dasharray="2 3"/><path d="${diagrams[id]}" fill="none" stroke="${p.type==='RUN'?'#f0c76b':'#6bbead'}" stroke-width="1.4"/><circle cx="8" cy="8" r="2.5" fill="#f2eadd"/><circle cx="8" cy="27" r="2.5" fill="#f2eadd"/></svg><span><b>${p.name}</b><small>${p.type} PLAY</small></span><span class="play-key">0${i+1}</span>`;
  b.onclick=()=>{send({type:'select',play:id});canvas.focus({preventScroll:true});};$('plays').append(b);
});
Object.entries(DEFENSE_CALLS).forEach(([id,d],i)=>{
  const b=document.createElement('button');b.className='defense-card';b.dataset.defense=id;
  const zones=id==='cover2'?'<ellipse cx="41" cy="9" rx="16" ry="7"/><ellipse cx="41" cy="25" rx="16" ry="7"/>':id==='cover3'?'<ellipse cx="41" cy="6" rx="16" ry="5"/><ellipse cx="41" cy="17" rx="16" ry="5"/><ellipse cx="41" cy="28" rx="16" ry="5"/>':id==='man'?'<path d="M12 7L48 7 M12 17L48 17 M12 27L48 27"/>':'<path d="M42 9L15 17 M42 25L15 17 M25 17L12 17"/>';
  b.innerHTML=`<svg viewBox="0 0 62 34" aria-hidden="true"><g fill="#64c0b22b" stroke="#74cbb7" stroke-width="1.2">${zones}</g><circle cx="12" cy="17" r="3" fill="#ed9469"/></svg><span><b>${d.name}</b><small>${i+1} / DEFENSIVE CALL</small></span>`;
  b.onclick=()=>{send({type:'selectDefense',defense:id});canvas.focus({preventScroll:true});};$('defensive-plays').append(b);
});
function special(){send({type:state().possession===1?'tackle':'juke'});}
window.addEventListener('keydown',e=>{
  if($('help-dialog').open||$('lobby-dialog').open||['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.target.tagName==='BUTTON'&&['Enter',' '].includes(e.key))return;
  const k=e.key.toLowerCase(),defending=state().possession===1,playFocus=['CANVAS','BODY'].includes(e.target.tagName);
  if([' ','arrowup','arrowdown','arrowleft','arrowright','enter'].includes(k)||(defending&&k==='tab'&&playFocus))e.preventDefault();
  keys[k]=true;if(e.repeat)return;
  if(k==='p'||k==='escape'){setPause(!paused);return;}if(paused)return;
  if(k==='enter')action();if(k===' ')special();
  if(defending){if(k==='e')send({type:'swat'});if(k==='r')send({type:'pick'});if(k==='q'||k==='tab'&&playFocus)send({type:'switch'});if(state().phase==='ready'&&['1','2','3','4'].includes(k))send({type:'selectDefense',defense:Object.keys(DEFENSE_CALLS)[Number(k)-1]});}
  else {if(k==='f')choosePass(passStyle==='bullet'?'lob':'bullet');if(k==='x')send({type:'throwAway'});if(['1','2','3','4','5'].includes(k)&&started)send({type:'throw',receiver:Number(k)-1});}
});
window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};}
function coords(e){const p=canvasPoint(e);return screenToField(state(),view,p.x,p.y);}
function aimTarget(){
  if(!aim)return mouse;const s=state(),qb=s.players[0];
  if(aim.mode==='pull'){return{x:qb.x-(aim.current.x-aim.start.x)/scaleX*3,y:qb.y-(aim.current.y-aim.start.y)/scaleY*3};}
  return screenToField(s,view,aim.current.x,aim.current.y);
}
function previewPlan(){const s=state();return s.possession===0&&s.phase==='live'&&s.carrier==='qb'&&!s.passThrown&&aimTarget()?passPlan(s,aimTarget(),passStyle):null;}
canvas.addEventListener('pointermove',e=>{mouse=coords(e);if(aim&&e.pointerId===aim.pointerId)aim.current=canvasPoint(e);});
canvas.addEventListener('pointerleave',()=>{if(!aim)mouse=null;});
canvas.addEventListener('pointerdown',e=>{
  const s=state();if(!started||paused||(online()&&session.room?.stage!=='playing')||!['ready','live'].includes(s.phase)||e.button>0)return;
  e.preventDefault();canvas.focus({preventScroll:true});const p=coords(e);
  if(s.possession===1){const d=s.players.find(d=>d.team===1&&Math.hypot(d.x-p.x,d.y-p.y)<3);send(d?{type:'selectDefender',id:d.id}:{type:'switch'});}
  else if(s.phase==='live'&&s.carrier==='qb'&&!s.passThrown){const qb=s.players[0],start=canvasPoint(e);aim={pointerId:e.pointerId,start,current:start,mode:Math.hypot(p.x-qb.x,p.y-qb.y)<3?'pull':'point'};mouse=p;canvas.setPointerCapture(e.pointerId);}
});
canvas.addEventListener('pointerup',e=>{
  if(!aim||aim.pointerId!==e.pointerId)return;e.preventDefault();aim.current=canvasPoint(e);
  const gesture=aim,target=aimTarget(),moved=Math.hypot(gesture.current.x-gesture.start.x,gesture.current.y-gesture.start.y)>6;
  const s=state();aim=null;
  if(paused||s.possession!==0||s.phase!=='live'||s.carrier!=='qb'||s.passThrown)return;
  if(!moved){if(gesture.mode==='pull')return;const p=coords(e),receiver=s.players.find(r=>r.eligible&&Math.hypot(r.x-p.x,r.y-p.y)<3);send(receiver?{type:'throw',receiver:receiver.number-1}:{type:'throw',...p});}
  else send({type:'throw',...target});
});
canvas.addEventListener('pointercancel',e=>{if(aim?.pointerId===e.pointerId)aim=null;});
canvas.addEventListener('lostpointercapture',e=>{if(aim?.pointerId===e.pointerId)aim=null;});
document.querySelectorAll('[data-move]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);const [x,y]=b.dataset.move.split(',').map(Number);touch={x,y};};b.onpointerup=b.onpointercancel=()=>touch={x:0,y:0};});$('touch-juke').onpointerdown=e=>{e.preventDefault();special();};
$('touch-sprint').onpointerdown=e=>{e.preventDefault();e.target.setPointerCapture(e.pointerId);touchSprint=true;};$('touch-sprint').onpointerup=$('touch-sprint').onpointercancel=()=>touchSprint=false;
$('touch-switch').onclick=$('defender-switch').onclick=()=>{send({type:'switch'});canvas.focus({preventScroll:true});};
$('tackle-button').onclick=()=>{special();canvas.focus({preventScroll:true});};
for(const b of document.querySelectorAll('[data-receiver]'))b.onclick=()=>send({type:'throw',receiver:Number(b.dataset.receiver)});
function sync(){
  const s=state(),defending=s.possession===1,selected=s.players.find(p=>p.id===s.selectedDefender);
  if(aim&&(s.phase!=='live'||s.possession!==0||s.carrier!=='qb'||s.passThrown))aim=null;
  if(viewPossession!==s.possession){viewPossession=s.possession;view={...view,...cameraGoal(s,view.zoom)};aim=null;mouse=null;keys={};touch={x:0,y:0};touchSprint=false;}
  $('home-score').textContent=String(s.score).padStart(2,'0');$('away-score').textContent=String(s.opponentScore).padStart(2,'0');
  $('home-status').textContent=defending?'YOU / DEFENSE':'YOU / OFFENSE';$('away-status').textContent=(online()?'RIVAL':'CPU')+(defending?' / OFFENSE':' / DEFENSE');
  const guest=online()&&session.slot===1;$('game-body').classList.toggle('guest-team',guest);$('home-team-name').textContent=guest?'PORTLAND':'HALIFAX';$('away-team-name').textContent=guest?'HALIFAX':'PORTLAND';$('home-team-nickname').textContent=guest?'PINES':'HARBOR';$('away-team-nickname').textContent=guest?'HARBOR':'PINES';$('home-badge').textContent=guest?'P':'H';$('away-badge').textContent=guest?'H':'P';
  $('mode-phase').textContent=defending?'YOU: DEFENSE':'YOU: OFFENSE';
  $('quarter').textContent=s.phase==='final'?'FINAL':`${ordinal(Math.min(4,s.quarter)).toUpperCase()} QUARTER`;
  $('clock').textContent=`${Math.floor(Math.max(0,s.clock)/60)}:${String(Math.floor(Math.max(0,s.clock)%60)).padStart(2,'0')}`;
  $('down').textContent=s.possessionEnded?'DRIVE COMPLETE':`${ordinal(s.down).toUpperCase()} & ${s.firstDown===100?'GOAL':Math.ceil(s.firstDown-s.spot)}`;
  const physical=defending?100-s.spot:s.spot,own=guest?'PDX':'HFX',opponent=guest?'HFX':'PDX';$('field-position').textContent=`BALL ON ${physical<=50?own+' '+physical:opponent+' '+(100-physical)}`;
  $('drive-number').textContent=String(s.drive).padStart(2,'0');$('attack-direction').textContent=defending?'← '+opponent+' OFFENSE':own+' OFFENSE →';
  $('possession-label').textContent=defending?'YOU ARE DEFENDING':'YOU HAVE THE BALL';$('possession-label').classList.toggle('defending',defending);
  $('book-title').textContent=defending?'DEFENSIVE PLAYBOOK':'OFFENSIVE PLAYBOOK';
  $('phase-label').textContent={ready:'PRE-SNAP',live:'IN PLAY',dead:'WHISTLE',final:'FINAL'}[s.phase];
  $('call-title').textContent=s.phase==='final'?(s.score>s.opponentScore?'Nice work, coach.':'Run it back?'):s.phase==='dead'?'On to the next.':defending?(s.phase==='ready'?'Make the call.':'Make the stop.'):(s.phase==='ready'?'What’s the call?':s.ball?'Let it fly.':s.carrier==='qb'?'Read the defense.':'Find daylight.');
  if(online()&&session.room?.stage==='finished')$('call-title').textContent=session.room.winner===session.slot?'You win, coach.':session.room.winner===null?'All square.':'Next time, coach.';
  $('call-desc').textContent=s.phase==='ready'?(defending?DEFENSE_CALLS[s.defense].desc:PLAYS[s.play].desc):s.phase==='live'?(defending?'Q to switch · Space to tackle':'Keep your eyes downfield.'):s.detail;
  $('plays').classList.toggle('hidden',defending);$('defensive-plays').classList.toggle('hidden',!defending);$('defense-actions').classList.toggle('hidden',!defending);
  for(const b of document.querySelectorAll('.play-card')){b.classList.toggle('active',b.dataset.play===s.play);b.setAttribute('aria-pressed',b.dataset.play===s.play);b.disabled=s.phase!=='ready'||defending;}
  for(const b of document.querySelectorAll('.defense-card')){b.classList.toggle('active',b.dataset.defense===s.defense);b.setAttribute('aria-pressed',b.dataset.defense===s.defense);b.disabled=s.phase!=='ready'||!defending;}
  $('snap').disabled=!started||s.phase==='live'||online()&&(session.room?.stage!=='playing'&&session.room?.stage!=='finished'||s.possession===1&&s.phase!=='final');
  $('snap').innerHTML=({ready:defending?'READY FOR THEIR SNAP':'SNAP THE BALL',live:'PLAY IN PROGRESS',dead:s.possessionEnded?'CHANGE POSSESSION':'NEXT PLAY',final:'PLAY AGAIN'}[s.phase])+' <span>↗</span>';if(online()){if(s.phase==='final')$('snap').innerHTML='REQUEST REMATCH <span>↗</span>';else if(s.possession===1)$('snap').innerHTML='OPPONENT CALLS THE SNAP';}
  $('punt').classList.toggle('hidden',!(started&&!defending&&s.phase==='ready'&&s.down===4));$('difficulty').disabled=online()||s.phase!=='ready';
  $('defender-switch').disabled=!started||!['ready','live'].includes(s.phase);$('tackle-button').disabled=s.phase!=='live'||s.tackleCooldown>0||s.stamina<15;
  $('action-hint').innerHTML=s.phase==='live'?(defending?'SPACE TO TACKLE / '+(s.tackleCooldown>0?s.tackleCooldown.toFixed(1)+'s':'READY'):'SPACE TO JUKE / '+(s.jukeCooldown>0?s.jukeCooldown.toFixed(1)+'s':'READY')):'OR PRESS <kbd>ENTER</kbd>';
  $('yards').textContent=s.stats.yards;$('passing').textContent=`${s.stats.completions} / ${s.stats.attempts}`;$('tds').textContent=s.stats.touchdowns;$('ints').textContent=s.stats.interceptions;$('rushing').textContent=`${s.stats.rushes} / ${s.stats.rushYards}`;
  $('defense-box').textContent=`DEFENSE   ${s.defenseStats.tackles} tackles · ${s.defenseStats.sacks} sacks · ${s.defenseStats.picks} picks · ${s.defenseStats.breakups} breakups · ${s.defenseStats.stops} stops`;
  $('coverage').textContent=defending?`${DEFENSES[s.defense]} · YOU CONTROL ${selected?.role||'LB'}`:s.phase==='ready'?'4–3 FRONT · READ THE SAFETIES':DEFENSES[s.defense];
  $('energy-fill').style.width=s.stamina+'%';$('energy-fill').style.background=s.stamina<25?'#ff8050':'#6fd6b5';
  $('energy-label').textContent=defending?(selected?.stun>0?'RECOVERING':selected?.blocked?'BLOCKED / SPACE TO SHED':`${selected?.role||'LB'} / STAMINA`):s.handoff>0?'HANDOFF':s.sprinting?'SPRINT':s.carrier==='qb'?(s.pressure>.6?'PRESSURE!':'POCKET'):'STAMINA';
  $('pressure-fill').style.width=(!defending&&s.carrier==='qb'?s.pressure*100:0)+'%';$('hud-hint').textContent=defending?(s.ball?'E: SWAT · R: PICK':'Q: SWITCH · SPACE: TACKLE'):'SHIFT: SPRINT · SPACE: JUKE';
  $('runner-hud').classList.toggle('hidden',!started||s.phase!=='live');$('receiver-buttons').classList.toggle('hidden',!started||defending||s.phase!=='live'||s.carrier!=='qb'||s.passThrown);
  $('touch-juke').textContent=defending?'TACKLE':'JUKE';$('touch-switch').classList.toggle('hidden',!defending);$('control-action').textContent=defending?'Tackle / shed':'Juke';
  $('pointer-control').textContent=defending?'Click a defender to select':'Drag to aim / release to throw';
  const canPass=!defending&&PLAYS[s.play].type==='PASS'&&['ready','live'].includes(s.phase)&&!s.passThrown;
  $('pass-style-panel').classList.toggle('hidden',defending);$('pass-mode-chip').classList.toggle('hidden',!started||!canPass);$('pass-mode-chip').textContent=passStyle.toUpperCase()+' / F TO SWITCH';
  for(const style of ['bullet','lob']){$('pass-'+style).classList.toggle('active',passStyle===style);$('pass-'+style).setAttribute('aria-pressed',passStyle===style);$('pass-'+style).disabled=defending;}
  const canContest=defending&&s.phase==='live'&&!!s.ball&&s.passDefenseCooldown<=0&&selected?.stun<=0&&!selected?.blocked;
  $('pass-defense-actions').classList.toggle('hidden',!defending);$('touch-pass-defense').classList.toggle('hidden',!started||!defending||s.phase!=='live'||!s.ball);
  for(const id of ['swat-button','touch-swat'])$(id).disabled=!canContest||s.stamina<8;
  for(const id of ['pick-button','touch-pick'])$(id).disabled=!canContest||s.stamina<12;
  $('pass-defense-hint').textContent=s.passDefenseCooldown>0?'RECOVER / '+s.passDefenseCooldown.toFixed(1)+'s':'E SWAT · R PICK · TIME THE ARRIVAL';
  $('flight-status').classList.toggle('hidden',!started||!s.ball);$('flight-status').textContent=s.ball?`${(s.ball.style||'bullet').toUpperCase()} · ${Math.max(0,s.ball.duration-s.ball.t).toFixed(1)}s TO LAND`:'';
  $('offense-controls').classList.toggle('hidden',defending);$('offense-extra-controls').classList.toggle('hidden',defending);$('defense-controls').classList.toggle('hidden',!defending);
  $('live-hint').textContent=s.phase==='ready'?(defending?'CHOOSE A COVERAGE. PICK YOUR DEFENDER.':'PICK A PLAY. TAKE THE FIELD.'):s.phase==='live'?(defending?(s.ball?'E SWAT · R PICK':'Q SWITCH · SPACE TACKLE'):aim?'RELEASE TO THROW · F TO SWITCH ARC':'FIND YOUR MOMENT.'):s.message;
  if(s.eventId!==lastEvent){lastEvent=s.eventId;flashTime=performance.now();if(started){$('ticker').textContent=s.message;$('ticker-detail').textContent=s.detail;if(s.phase==='dead'||s.phase==='final'){const good=s.message==='TOUCHDOWN!'||s.message==='INTERCEPTED!'||s.message==='PORTLAND PUNTS.';beep(good?660:220,.2);if(good)setTimeout(()=>beep(880,.3),130);}else if(s.message.startsWith('CAUGHT'))beep(540,.09);}}
  const showResult=started&&!paused&&(s.phase==='dead'||s.phase==='final'||(s.message==='CAUGHT. GO!'&&performance.now()-flashTime<650));
  $('result').classList.toggle('hidden',!showResult);$('result-title').textContent=s.message;$('result-detail').textContent=s.detail;
}
function worldX(x){return physicalX(state(),x);}
function fx(x){return(x-view.x)*scaleX;}
function px(x){return fx(worldX(x));}
function py(y){return fieldTop+(y-view.y)*scaleY;}
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function drawField(s){ctx.clearRect(0,0,W,H);rect(0,0,W,H,'#203a34');
// Tiny colored stadium seats give the field an intentionally pixel-built border.
for(let y=0;y<36;y+=7)for(let x=0;x<W;x+=12){const n=(x*31+y*17)%13;rect(x,y,8,4,['#344c49','#627264','#9c9881','#3e675b','#a87252'][n%5]);}
for(let y=575;y<H;y+=7)for(let x=0;x<W;x+=12)rect(x,y,8,4,['#344c49','#627264','#817d63','#3e675b'][(x+y)%4]);
rect(0,38,W,18,'#d5d6b4');rect(0,555,W,18,'#d5d6b4');
ctx.save();ctx.beginPath();ctx.rect(0,fieldTop,W,fieldHeight);ctx.clip();
rect(0,fieldTop,W,fieldHeight,'#427c57');for(let x=-10;x<110;x+=5)rect(fx(x),fieldTop,scaleX*5,fieldHeight,Math.floor(x/5)%2?'#417956':'#47825b');
rect(fx(-10),fieldTop,10*scaleX,fieldHeight,'#9c6548');rect(fx(100),fieldTop,10*scaleX,fieldHeight,'#294f43');
ctx.save();ctx.translate(fx(-5),py(26.65));ctx.rotate(-Math.PI/2);ctx.font='bold 49px Impact, sans-serif';ctx.textAlign='center';ctx.fillStyle='#7daba0';ctx.fillText(online()&&session.slot===1?'PINES':'HARBOR',0,15);ctx.restore();ctx.save();ctx.translate(fx(105),py(26.65));ctx.rotate(Math.PI/2);ctx.font='bold 49px Impact, sans-serif';ctx.textAlign='center';ctx.fillStyle='#efd3a5';ctx.fillText(online()&&session.slot===1?'HARBOR':'PINES',0,15);ctx.restore();
for(let x=0;x<=100;x+=5){const sx=fx(x);rect(sx,fieldTop, x%10===0?2:1,fieldHeight,x%10===0?'#b8cdb083':'#b8cdb044');if(x%10===0&&x>0&&x<100){const label=x<=50?x:100-x;ctx.font='bold 24px monospace';ctx.textAlign='center';ctx.fillStyle='#d6ddbcaf';ctx.fillText(label,sx,py(7));ctx.save();ctx.translate(sx,py(47));ctx.rotate(Math.PI);ctx.fillText(label,0,0);ctx.restore();}}
for(let x=1;x<100;x++){if(x%5===0)continue;for(const y of [1,22,31,51])rect(fx(x),py(y),1,6,'#d0daba70');}
ctx.save();ctx.translate(fx(50),py(26.5));ctx.globalAlpha=.17;ctx.rotate(-.16);ctx.fillStyle='#ededd1';ctx.font='italic bold 115px Impact, sans-serif';ctx.textAlign='center';ctx.fillText('H',0,40);ctx.restore();
rect(px(s.spot),fieldTop,2,fieldHeight,'#77bff5');rect(px(s.firstDown),fieldTop,3,fieldHeight,'#edd477');
for(const x of [s.spot,s.firstDown]){rect(px(x)-4,39,8,16,'#f18649');rect(px(x)-2,41,4,7,'#302c28');}
rect(0,py(0),W,2,'#d5d6b4');rect(0,py(53.3),W,2,'#d5d6b4');ctx.restore();
// Benches and the small pixel sideline crew.
for(let i=0;i<8;i++){const x=fx(28+i*4);rect(x,561,7,9,i%3?'#dc8e62':'#d8d8b9');rect(x+1,558,5,4,'#ebca9e');}
}
function drawRoute(s,p){const route=routePoints(s,p);ctx.beginPath();ctx.moveTo(px(p.x),py(p.y));for(const [x,y]of route)ctx.lineTo(px(Math.min(105,p.startX+x)),py(Math.max(3,Math.min(50,p.startY+y))));ctx.strokeStyle='#d4dfac85';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);const a=route.at(-1),x=px(Math.min(105,p.startX+a[0])),y=py(Math.max(3,Math.min(50,p.startY+a[1])));ctx.fillStyle='#d4dfaca0';ctx.beginPath();ctx.moveTo(x+6,y);ctx.lineTo(x-4,y-4);ctx.lineTo(x-4,y+4);ctx.fill();}
function player(s,p){const x=Math.round(px(p.x)),jump=Math.max(p.swatWindow/.32,p.pickWindow/.22),y=Math.round(py(p.y)-Math.sin(Math.PI*jump)*10*view.zoom);ctx.save();ctx.translate(x,y);ctx.scale(view.zoom,view.zoom);ctx.translate(-x,-y);const active=s.carrier===p.id,controlled=s.possession===1&&s.selectedDefender===p.id;const running=s.phase==='live';const frame=running?Math.floor(s.tick/7+(p.number||p.id.charCodeAt(1)||0))%2:0;ctx.fillStyle='#163b2c55';ctx.beginPath();ctx.ellipse(x+3,y+7,11,5,0,0,Math.PI*2);ctx.fill();
if(active){ctx.strokeStyle=s.juke>0?'#ffe39c':'#fff1ba';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+5,14+(s.juke>0?4:0),9,0,0,Math.PI*2);ctx.stroke();}
if(controlled){ctx.strokeStyle='#79e5e1';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y+5,17,11,0,0,Math.PI*2);ctx.stroke();rect(x-21,y-33,42,12,'#102c33e8');ctx.fillStyle='#9ff2e5';ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillText('YOU / '+p.role,x,y-24);}
const viewAway=(p.team===0?s.possession:1-s.possession)===1,away=online()&&session.slot===1?!viewAway:viewAway;
const jersey=away?'#cddcd0':'#ed9469',dark=away?'#276557':'#b75737';
ctx.save();const facing=(s.possession===1?-1:1)*(p.team===1?-1:1);if(facing<0){ctx.translate(2*x,0);ctx.scale(-1,1);}
rect(x-6,y+3,5,8+frame*3,'#182b31');rect(x+2,y+3,5,11-frame*3,'#182b31');rect(x-7,y+10+frame*3,6,3,'#e7ddbb');rect(x+2,y+13-frame*3,6,3,'#e7ddbb');rect(x-9,y-5,18,12,dark);rect(x-7,y-6,14,11,jersey);rect(x-11,y-3+frame*2,4,7,'#d4a274');rect(x+7,y-3-frame*2,4,7,'#d4a274');rect(x-6,y-15,12,10,away?'#e2e5c9':'#f4bc83');rect(x-8,y-12,4,7,away?'#b0c8b2':'#df8153');rect(x+3,y-12,5,7,'#162e32');rect(x+4,y-7,7,2,'#dbd8b9');rect(x-3,y-15,3,7,away?'#4a8073':'#f4e2b7');
ctx.restore();
if(p.eligible||p.role==='QB'){ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillStyle=dark;ctx.fillText(p.role==='QB'?'7':p.role==='RB'?'22':String(80+p.number),x,y+3);}
if(s.possession===0&&p.eligible&&s.carrier==='qb'&&!s.passThrown&&PLAYS[s.play].type==='PASS'){rect(x-7,y-31,14,12,'#152c2dde');const separation=Math.min(...s.players.filter(d=>d.team===1).map(d=>Math.hypot(d.x-p.x,d.y-p.y)));ctx.fillStyle=separation>4?'#91f0bd':separation>2?'#ffdb9b':'#ff956d';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText(p.number,x,y-22);}
if(p.role==='RB'&&s.phase==='ready'){rect(x-11,y+20,23,12,'#15302ce0');ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillStyle='#ffd591';ctx.fillText('RB',x,y+29);}
if(p.stun>0){ctx.fillStyle='#ffe7a5';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText('×',x,y-22);}
if(active){const bx=x+(s.possession===1?-13:7);rect(bx,y-2,7,4,'#683e29');rect(bx+2,y-2,3,1,'#f0deae');}
if(p.swatWindow>0||p.pickWindow>0){ctx.fillStyle='#bdf3e0';ctx.font='bold 9px monospace';ctx.textAlign='center';ctx.fillText(p.pickWindow>0?'PICK':'SWAT',x,y-40);}
if(p.diveTime>0){ctx.strokeStyle='#fff1b290';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-(s.possession===1?-1:1)*p.diveX*22,y-p.diveY*18);ctx.lineTo(x,y);ctx.stroke();}
ctx.restore();
}
function render(t,dt=1/60){const s=state();view=updateCamera(view,s,dt,!!aim);scaleX=VIEW.baseX*view.zoom;scaleY=VIEW.baseY*view.zoom;drawField(s);ctx.save();ctx.beginPath();ctx.rect(0,fieldTop,W,fieldHeight);ctx.clip();
if(s.phase==='ready'&&s.possession===0){
  if(PLAYS[s.play].type==='PASS'){for(const p of s.players.filter(p=>p.eligible))drawRoute(s,p);}
  else{const rb=s.players.find(p=>p.id==='rb');ctx.beginPath();ctx.moveTo(px(rb.x),py(rb.y));ctx.lineTo(px(s.spot-3),py(27));for(const [x,y]of PLAYS[s.play].runPath)ctx.lineTo(px(s.spot+x),py(27+y));ctx.strokeStyle='#ffd478';ctx.lineWidth=4;ctx.setLineDash([8,5]);ctx.stroke();ctx.setLineDash([]);ctx.font='bold 12px monospace';ctx.fillStyle='#ffe6aa';ctx.textAlign='left';ctx.fillText('FOLLOW YOUR BLOCKS',px(s.spot+3),py(PLAYS[s.play].runPath.at(-1)[1]+27)-13);}
}else if(s.phase==='ready'&&s.possession===1){
  for(const d of s.players.filter(p=>p.team===1&&(p.role==='S'||p.role==='CB'&&s.defense==='cover3'))){ctx.fillStyle='#73d6c122';ctx.strokeStyle='#93ead655';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(px(d.x+4),py(d.y),58,48,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
}
for(const [bid,did]of s.blocks){const b=s.players.find(p=>p.id===bid),d=s.players.find(p=>p.id===did);ctx.beginPath();ctx.moveTo(px(b.x),py(b.y));ctx.lineTo(px(d.x),py(d.y));ctx.strokeStyle='#ffcf8a80';ctx.lineWidth=7;ctx.stroke();}
if(s.possession===0&&s.phase==='live'&&s.carrier==='qb'&&!s.passThrown&&!paused){
  const qb=s.players[0],plan=previewPlan();
  if(plan){
    const color=plan.style==='lob'?'#91e7d3':'#ffca83';ctx.strokeStyle=color+'70';ctx.lineWidth=1.5;ctx.setLineDash([4,7]);ctx.beginPath();ctx.moveTo(px(qb.x),py(qb.y));ctx.lineTo(px(plan.x),py(plan.y));ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.beginPath();
    for(let i=0;i<=36;i++){const t=i/36,x=qb.x+(plan.x-qb.x)*t,y=qb.y+(plan.y-qb.y)*t,height=1+Math.sin(Math.PI*t)*PASS_TYPES[plan.style].arc;if(i===0)ctx.moveTo(px(x),py(y)-height*scaleY*.8);else ctx.lineTo(px(x),py(y)-height*scaleY*.8);}ctx.stroke();
    ctx.beginPath();ctx.ellipse(px(plan.x),py(plan.y),11*view.zoom,6*view.zoom,0,0,Math.PI*2);ctx.stroke();ctx.font='bold 10px monospace';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(`${plan.style.toUpperCase()} · ${Math.round(plan.distance)} YD`,px(plan.x),py(plan.y)+18);
  }else if(aim){ctx.font='bold 13px monospace';ctx.fillStyle='#ffc28a';ctx.textAlign='center';ctx.fillText('PULL BACK TO THROW FORWARD',px(qb.x),py(qb.y)-45);}
}
for(const p of [...s.players].sort((a,b)=>a.y-b.y)){if(s.tackle?.id===p.id){ctx.save();ctx.translate(px(p.x),py(p.y));ctx.rotate(Math.PI/2);ctx.translate(-px(p.x),-py(p.y));player(s,p);ctx.restore();}else player(s,p);}
if(s.ball){
  const b=s.ball,z=passHeight(b)*scaleY*.8,t=b.t/b.duration;
  ctx.strokeStyle=t>.7?'#fff2b1':'#eee3af80';ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.ellipse(px(b.toX),py(b.toY),12*view.zoom,7*view.zoom,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#183d2c66';ctx.beginPath();ctx.ellipse(px(b.x),py(b.y),7*view.zoom,3*view.zoom,0,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.translate(px(b.x),py(b.y)-z);ctx.rotate(t*22);ctx.scale(view.zoom,view.zoom);rect(-6,-3,12,6,'#6a3e29');rect(-3,-3,6,2,'#f2dfb3');ctx.restore();
}
if(s.passEffect&&s.tick-s.passEffect.tick<40){const e=s.passEffect;ctx.strokeStyle=e.kind==='pick'?'#a9f2d8':'#ffd491';ctx.lineWidth=3;ctx.beginPath();ctx.arc(px(e.x),py(e.y),18+(s.tick-e.tick)*.8,0,Math.PI*2);ctx.stroke();}
ctx.restore();
if(s.phase==='final'&&s.score>s.opponentScore||s.phase==='dead'&&s.message==='TOUCHDOWN!'){for(let i=0;i<60;i++){const x=(i*149+Math.sin(i)*30)%W,y=(t*.045+i*53)%H;rect(x,y,4,8,['#ffc28a','#dce1af','#6dd0b4'][i%3]);}}
}
function frame(t){const elapsed=lastTime?Math.min((t-lastTime)/1000,.1):0;lastTime=t;if(started&&!paused&&(!online()||state())){accumulator+=elapsed;while(accumulator>=DT){session.update({x:(online()&&($('lobby-dialog').open||$('help-dialog').open)?0:touch.x+(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0))*(state().possession===1?-1:1),y:touch.y+(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0),sprint:!!keys.shift||touchSprint});accumulator-=DT;}}else accumulator=0;if(state())render(t,elapsed);if(Math.floor(t/90)!==Math.floor((t-elapsed*1000)/90)){if(state())sync();if(online())syncRoom();}requestAnimationFrame(frame);}
sync();syncRoom();requestAnimationFrame(frame);
if(typeof location!=='undefined'){const code=new URL(location.href).searchParams.get('room'),remembered=savedRoom();if(remembered&&(!code||code===remembered.code))connectRoom('sync',remembered);else if(code){$('join-code').value=code;openLobby();}}
