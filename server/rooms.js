import {createGame,command,step,DT} from '../public/game/engine.js';
const LETTERS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const HEARTBEAT_LIMIT=3000,RECONNECT_GRACE=45000,ROOM_TTL=2*60*60*1000;
const zero=()=>({x:0,y:0,sprint:false});
const copy=o=>JSON.parse(JSON.stringify(o));
export class RoomError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function cleanName(value){return String(value||'Player').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,20)||'Player';}
function normalizeCode(value){const code=String(value||'').trim().toUpperCase();if(!/^[A-Z2-9]{7}$/.test(code))throw new RoomError('Enter the seven-character room code.');return code;}
function randomCode(){const bytes=crypto.getRandomValues(new Uint8Array(7));return [...bytes].map(x=>LETTERS[x%LETTERS.length]).join('');}
function newToken(){return [...crypto.getRandomValues(new Uint8Array(24))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function hash(value){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(data)].map(n=>n.toString(16).padStart(2,'0')).join('');}
function player(name,tokenHash,now){return{name:cleanName(name),tokenHash,lastSeen:now,connected:true,ready:false,rematch:false,input:zero(),inputSeq:-1,commandAck:0};}
function safeInput(value){if(!value||!Number.isSafeInteger(value.seq)||value.seq<0||!Number.isFinite(value.x)||!Number.isFinite(value.y)||Math.abs(value.x)>1||Math.abs(value.y)>1||typeof value.sprint!=='boolean')return null;return{seq:value.seq,x:value.x,y:value.y,sprint:value.sprint};}
const TYPES=new Set(['select','selectDefense','switch','selectDefender','throw','throwAway','juke','tackle','swat','pick','punt','snap','next']);
function safeCommand(value){
  if(!value||!Number.isSafeInteger(value.seq)||value.seq<=0||!TYPES.has(value.type))return null;
  const c={type:value.type};
  if(value.type==='select'){if(typeof value.play!=='string'||value.play.length>16)return null;c.play=value.play;}
  if(value.type==='selectDefense'){if(typeof value.defense!=='string'||value.defense.length>16)return null;c.defense=value.defense;}
  if(value.type==='selectDefender'){if(typeof value.id!=='string'||value.id.length>8)return null;c.id=value.id;}
  if(value.type==='throw'){
    if(value.style!==undefined&&!['bullet','lob'].includes(value.style))return null;c.style=value.style||'bullet';
    if(value.receiver!==undefined){if(!Number.isInteger(value.receiver)||value.receiver<0||value.receiver>4)return null;c.receiver=value.receiver;}
    else{if(!Number.isFinite(value.x)||!Number.isFinite(value.y)||value.x< -10||value.x>110||value.y< -5||value.y>58)return null;c.x=value.x;c.y=value.y;}
  }
  return c;
}
function publicRoom(room,slot,now){return{code:room.code,revision:room.revision,stage:room.stage,round:room.round,slot,serverTime:now,countdownAt:room.countdownAt,pausedUntil:room.pausedUntil,winner:room.winner,pauseReason:room.pauseReason,players:room.players.map(p=>p?{name:p.name,connected:p.connected,ready:p.ready,rematch:p.rematch}:null),game:copy(room.game),ack:room.players[slot]?.commandAck||0,inputAck:room.players[slot]?.inputSeq??-1,inputs:room.players.map(p=>p?.input||zero())};}
function startRound(room,now){room.game=createGame(crypto.getRandomValues(new Uint32Array(1))[0],'normal','online');room.stage='countdown';room.countdownAt=now+1800;room.lastStepAt=now;room.carryMs=0;room.round++;room.winner=null;room.pauseReason=null;room.pausedUntil=null;for(const p of room.players){p.input=zero();p.rematch=false;}}
function advance(room,now){
  for(const p of room.players)if(p)p.connected=now-p.lastSeen<HEARTBEAT_LIMIT;
  if(room.stage==='lobby'||room.stage==='finished'){room.lastStepAt=now;return;}
  if(room.stage==='countdown'){if(now>=room.countdownAt){room.stage='playing';room.lastStepAt=now;}else return;}
  for(const p of room.players)if(p)p.connected=now-p.lastSeen<HEARTBEAT_LIMIT;
  if(room.stage==='paused'&&room.pausedUntil&&now>=room.pausedUntil){room.stage='finished';room.winner=room.missingSlot===0?1:room.missingSlot===1?0:null;room.game.phase='final';room.game.message='MATCH ENDED BY DISCONNECT.';room.game.detail='The reconnect window expired.';room.game.eventId++;room.lastStepAt=now;return;}
  if(room.players.some(p=>!p||!p.connected)){
    if(room.stage!=='paused'){room.stage='paused';room.pausedUntil=now+RECONNECT_GRACE;room.pauseReason='Connection lost. Waiting for the other player.';room.missingSlot=room.players.filter(p=>p?.connected).length===1?room.players.findIndex(p=>!p?.connected):null;}
    if(now>=room.pausedUntil){const winner=room.players.findIndex(p=>p?.connected);room.stage='finished';room.winner=winner<0?null:winner;room.game.phase='final';room.game.message=winner<0?'MATCH CLOSED.':'MATCH ENDED BY DISCONNECT.';room.game.detail='The reconnect window expired.';room.game.eventId++;}
    room.lastStepAt=now;room.carryMs=0;return;
  }
  if(room.stage==='paused'){room.stage='countdown';room.countdownAt=now+1000;room.pauseReason=null;room.pausedUntil=null;room.lastStepAt=now;return;}
  const elapsed=Math.max(0,Math.min(250,now-room.lastStepAt));room.lastStepAt=now;room.carryMs+=elapsed;
  const ticks=Math.min(15,Math.floor(room.carryMs/(1000*DT)));room.carryMs-=ticks*1000*DT;
  const inputs=room.players.map(p=>now-p.lastSeen<350?p.input:zero());
  for(let i=0;i<ticks&&room.game.phase==='live';i++)step(room.game,{offense:inputs[room.game.possession],defense:inputs[1-room.game.possession]});
  if(room.game.phase==='final'){room.stage='finished';room.winner=room.game.score===room.game.opponentScore?null:room.game.score>room.game.opponentScore?0:1;}
}
export function mutateRoom(room,slot,payload,now){
  const p=room.players[slot];p.lastSeen=now;p.connected=true;advance(room,now);
  if(room.stage==='paused'&&room.players.every(x=>x?.connected&&now-x.lastSeen<HEARTBEAT_LIMIT))advance(room,now);
  if(payload.action==='leave'){p.connected=false;p.lastSeen=now-HEARTBEAT_LIMIT-1;p.input=zero();p.ready=false;if(room.stage==='lobby'&&slot===1)room.players[1]=null;else if(room.stage!=='finished'){room.stage='paused';room.pausedUntil=now+RECONNECT_GRACE;room.pauseReason='The other player left the match.';room.missingSlot=slot;}return;}
  if(payload.ready!==undefined&&room.stage==='lobby'){if(typeof payload.ready!=='boolean')throw new RoomError('Invalid ready state.');p.ready=payload.ready;}
  if(payload.rematch&&room.stage==='finished')p.rematch=true;
  const input=safeInput(payload.input);if(payload.input&&!input)throw new RoomError('Invalid movement input.');
  if(input&&input.seq>p.inputSeq){p.inputSeq=input.seq;p.input={x:input.x,y:input.y,sprint:input.sprint};}
  const commands=payload.commands??[];if(!Array.isArray(commands)||commands.length>12)throw new RoomError('Too many queued actions.');
  for(const item of commands){
    if(!Number.isSafeInteger(item?.seq)||item.seq<=0)throw new RoomError('Invalid action sequence.');
    if(item.seq<=p.commandAck)continue;if(item.seq!==p.commandAck+1)break;
    const c=safeCommand(item);if(!c)throw new RoomError('Invalid game action.');p.commandAck=item.seq;
    if(room.stage==='playing')command(room.game,c,slot);
  }
  if(room.stage==='lobby'&&room.players.every(x=>x?.ready&&x.connected&&now-x.lastSeen<HEARTBEAT_LIMIT))startRound(room,now);
  if(room.stage==='finished'&&room.players.every(x=>x?.rematch&&x.connected))startRound(room,now);
  if(room.stage==='playing'&&room.game.phase==='final'){room.stage='finished';room.winner=room.game.score===room.game.opponentScore?null:room.game.score>room.game.opponentScore?0:1;}
}
export async function roomRequest(db,payload,token='',now=Date.now()){
  if(!db)throw new RoomError('The match server is not ready. Please try again shortly.',503);
  if(!payload||!['create','join','sync','leave'].includes(payload.action))throw new RoomError('Unknown room action.');
  if(payload.action==='create'){
    const secret=newToken(),tokenHash=await hash(secret);
    for(let attempt=0;attempt<5;attempt++){
      const code=randomCode(),room={format:1,code,revision:0,stage:'lobby',round:0,countdownAt:null,pausedUntil:null,pauseReason:null,winner:null,createdAt:now,lastStepAt:now,carryMs:0,expiresAt:now+ROOM_TTL,players:[player(payload.name,tokenHash,now),null],game:createGame(crypto.getRandomValues(new Uint32Array(1))[0],'normal','online')};
      const result=await db.prepare('INSERT OR IGNORE INTO football_rooms (code,revision,state,expires_at) VALUES (?,0,?,?)').bind(code,JSON.stringify(room),room.expiresAt).run();
      if(result.meta.changes){await db.prepare('DELETE FROM football_rooms WHERE expires_at < ?').bind(now).run();return{room:publicRoom(room,0,now),token:secret,slot:0};}
    }
    throw new RoomError('Could not allocate a room. Try again.',503);
  }
  const code=normalizeCode(payload.code),secret=payload.action==='join'?newToken():token;
  if(!/^[a-f0-9]{48}$/.test(secret))throw new RoomError('Your room session expired. Rejoin using the room code.',403);
  const tokenHash=await hash(secret);
  for(let attempt=0;attempt<6;attempt++){
    const row=await db.prepare('SELECT revision,state,expires_at FROM football_rooms WHERE code = ?').bind(code).first();
    if(!row||row.expires_at<=now)throw new RoomError('Room not found or expired.',404);
    const room=JSON.parse(row.state);let slot;
    if(payload.action==='join'){
      if(room.stage!=='lobby'||room.players[1])throw new RoomError('This room already has two players.',409);
      room.players[1]=player(payload.name,tokenHash,now);slot=1;
    }else{
      slot=room.players.findIndex(p=>p?.tokenHash===tokenHash);if(slot<0)throw new RoomError('This room session is not valid.',403);
      mutateRoom(room,slot,payload,now);
    }
    room.revision=row.revision+1;
    const write=await db.prepare('UPDATE football_rooms SET state = ?, revision = ? WHERE code = ? AND revision = ?').bind(JSON.stringify(room),room.revision,code,row.revision).run();
    if(write.meta.changes)return{room:publicRoom(room,slot,now),...(payload.action==='join'?{token:secret,slot}: {})};
  }
  throw new RoomError('The room is busy. Retrying should restore the connection.',503);
}
export async function handleRoomRequest(request,db){
  try{
    const url=new URL(request.url),origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw new RoomError('Use the game page to access this room.',403);
    if(request.method!=='POST')throw new RoomError('Use POST for game rooms.',405);
    if(Number(request.headers.get('content-length')||0)>12000)throw new RoomError('Request too large.',413);
    const text=await request.text();if(text.length>12000)throw new RoomError('Request too large.',413);
    let body;try{body=JSON.parse(text);}catch{throw new RoomError('Invalid room request.');}
    const result=await roomRequest(db,body,request.headers.get('x-room-token')||'');return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({error:error instanceof RoomError?error.message:'The match server had a problem. Please retry.'},{status:error instanceof RoomError?error.status:500,headers:{'Cache-Control':'no-store'}});}
}
