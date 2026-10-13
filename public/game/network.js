import {snapshot,moveControlled,passPlan,DT} from './engine.js?online=7';
const STORAGE_KEY='pocket-drive-room-v1';
const zero=()=>({x:0,y:0,sprint:false});
function store(value){try{if(typeof sessionStorage!=='undefined'){if(value)sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value));else sessionStorage.removeItem(STORAGE_KEY);}}catch{}}
export function savedRoom(){try{return typeof sessionStorage!=='undefined'?JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null'):null;}catch{return null;}}
export function projectGame(raw,slot){
  const game=snapshot(raw);game.possession=raw.possession^slot;game.localSlot=slot;
  if(slot===1){game.score=raw.opponentScore;game.opponentScore=raw.score;game.stats=snapshot(raw.opponentStats);game.opponentStats=snapshot(raw.stats);
    const mapping={'TOUCHDOWN!':'HALIFAX TOUCHDOWN.','PORTLAND TOUCHDOWN.':'TOUCHDOWN!','PICKED OFF.':'INTERCEPTED!','INTERCEPTED!':'PICKED OFF.','SAFETY.':'SAFETY! TWO FOR PORTLAND.','SAFETY! TWO FOR HALIFAX.':'SAFETY.'};game.message=mapping[game.message]||game.message;
  }
  if(game.phase==='ready'){game.message=game.possession===0?'YOUR BALL. CALL THE PLAY.':'DEFENSE. MAKE A STOP.';}
  game.defenseStats=snapshot(raw.defenseByTeam[slot]);
  if(game.possession===1){game.stamina=raw.defenseStamina;game.sprinting=raw.defenseSprinting;}
  return game;
}
export class RoomSession{
  constructor({code,token,slot,fetcher=globalThis.fetch,onChange=()=>{},onError=()=>{}}){this.code=code;this.token=token;this.slot=slot;this.fetcher=fetcher;this.onChange=onChange;this.onError=onError;this.room=null;this.raw=null;this.state=null;this.latestInput=zero();this.pending=[];this.commandSeq=0;this.inputSeq=0;this.meta={};this.active=false;this.inFlight=false;this.timer=null;this.latency=0;this.lastReceive=0;this.disconnected=false;this.fatal=false;}
  static async connect({action='create',code='',name='Player',fetcher=globalThis.fetch,...callbacks}){
    const response=await fetcher('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code,name}),cache:'no-store'});const data=await readResponse(response);
    const session=new RoomSession({code:data.room.code,token:data.token,slot:data.slot,fetcher,...callbacks});session.accept(data.room);store({code:session.code,token:session.token,slot:session.slot});return session;
  }
  static restore(credentials,options={}){if(!credentials||!/^[A-Z2-9]{7}$/.test(credentials.code)||!/^[a-f0-9]{48}$/.test(credentials.token)||![0,1].includes(credentials.slot))return null;return new RoomSession({...credentials,...options});}
  accept(room){
    const prior=this.state,oldId=prior?(prior.possession===0?prior.carrier:prior.selectedDefender):null,oldPlayer=prior?.players.find(p=>p.id===oldId);
    this.slot=room.slot;this.room=room;this.raw=room.game;this.state=projectGame(room.game,this.slot);this.commandSeq=Math.max(this.commandSeq,room.ack);this.inputSeq=Math.max(this.inputSeq,room.inputAck??0);this.pending=this.pending.filter(c=>c.seq>room.ack);this.lastReceive=performance.now();this.disconnected=false;
    const newId=this.state.possession===0?this.state.carrier:this.state.selectedDefender,newPlayer=this.state.players.find(p=>p.id===newId);
    if(prior?.phase==='live'&&this.state.phase==='live'&&oldId===newId&&oldPlayer&&newPlayer&&Math.hypot(oldPlayer.x-newPlayer.x,oldPlayer.y-newPlayer.y)<3){newPlayer.x=oldPlayer.x;newPlayer.y=oldPlayer.y;newPlayer.vx=oldPlayer.vx;newPlayer.vy=oldPlayer.vy;}
    this.onChange(this);
  }
  start(){if(this.active)return;this.active=true;this.poll();}
  stop(){this.active=false;if(this.timer)clearTimeout(this.timer);this.timer=null;}
  async poll(){
    if(!this.active||this.inFlight)return;if(this.timer)clearTimeout(this.timer);this.timer=null;this.inFlight=true;const started=performance.now();
    const meta={...this.meta};this.meta={};
    try{
      const response=await this.fetcher('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':this.token},body:JSON.stringify({action:'sync',code:this.code,input:{...this.latestInput,seq:++this.inputSeq},commands:this.pending.slice(0,12),...meta}),cache:'no-store',...(typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(5000)}:{})});
      const data=await readResponse(response);this.latency=Math.round(performance.now()-started);this.accept(data.room);
    }catch(error){this.meta={...meta,...this.meta};this.disconnected=true;this.fatal=[403,404,409].includes(error.status);this.onError(error,this);this.onChange(this);if(this.fatal)this.stop();}
    finally{this.inFlight=false;if(this.active)this.timer=setTimeout(()=>this.poll(),this.disconnected?700:this.room?.stage==='finished'?250:120);}
  }
  send(c){
    if(!this.room||this.room.stage!=='playing'||this.disconnected||!['select','selectDefense','switch','selectDefender','throw','throwAway','juke','tackle','swat','pick','punt','snap','next'].includes(c.type))return false;
    if(c.type==='throw'&&c.receiver===undefined){const plan=passPlan(this.state,c,c.style||'bullet');if(!plan)return false;c={...c,x:plan.x,y:plan.y};}
    if(this.pending.length>=24)return false;
    this.pending.push({...c,seq:++this.commandSeq});this.poll();return true;
  }
  ready(value=true){this.meta.ready=value;this.poll();}
  rematch(){this.meta.rematch=true;this.poll();}
  async leave(){this.stop();store(null);try{await this.fetcher('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':this.token},body:JSON.stringify({action:'leave',code:this.code}),cache:'no-store'});}catch{}}
  update(input,dt=DT){
    this.latestInput={x:Math.max(-1,Math.min(1,Number(input.x)||0)),y:Math.max(-1,Math.min(1,Number(input.y)||0)),sprint:!!input.sprint};
    if(!this.state||!this.raw||this.room.stage!=='playing'||this.disconnected||this.state.phase!=='live')return;
    const age=Math.min(.15,(performance.now()-this.lastReceive)/1000),defending=this.state.possession===1,controlled=defending?this.state.selectedDefender:this.state.carrier;
    for(const p of this.state.players){
      const base=this.raw.players.find(q=>q.id===p.id);if(!base)continue;
      if(p.id===controlled){let x=this.latestInput.x,y=this.latestInput.y,len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}
        if(!defending&&p.id!=='qb'&&len<.1){const v=Math.hypot(base.vx,base.vy);x=v>.1?base.vx/v:1;y=v>.1?base.vy/v:0;}
        if(this.state.handoff>0&&!defending){p.x=base.x+base.vx*age;p.y=base.y+base.vy*age;continue;}
        const speed=(p.speed+(defending?.2:0))*1.1*(this.latestInput.sprint&&this.state.stamina>1?1.23:1)*(defending&&p.blocked?.08:1)*(p.stun>0?.12:1)*(!defending&&this.state.juke>0?1.15:1);
        if(p.diveTime>0){x=base.diveX;y=base.diveY;}
        moveControlled(p,x,y,p.diveTime>0?p.speed*1.8:speed,dt);
        const tx=base.x+base.vx*(age+.04),ty=base.y+base.vy*(age+.04);if(Math.hypot(tx-p.x,ty-p.y)>2.5){p.x+=(tx-p.x)*.25;p.y+=(ty-p.y)*.25;}
      }else{const k=1-Math.exp(-dt/.055);p.x+=(base.x+base.vx*age-p.x)*k;p.y+=(base.y+base.vy*age-p.y)*k;}
    }
    if(this.state.ball&&this.raw.ball){const b=this.state.ball,r=this.raw.ball;b.t=Math.min(r.duration,r.t+age);const t=b.t/b.duration;b.x=r.fromX+(r.toX-r.fromX)*t;b.y=r.fromY+(r.toY-r.fromY)*t;}
  }
}
async function readResponse(response){let data;try{data=await response.json();}catch{const error=new Error('The game server could not be reached. Reload the page and check Site access.');error.status=response.status;throw error;}if(!response.ok){const error=new Error(data.error||'Could not connect to the room.');error.status=response.status;throw error;}return data;}
