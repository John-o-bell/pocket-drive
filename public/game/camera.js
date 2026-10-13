// View-only camera math. Simulation coordinates always increase toward the offense's goal.
export const VIEW={width:1100,height:610,top:54,fieldHeight:502,baseX:12.1,baseY:502/53.3};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function physicalX(state,x){return state.possession===1?100-x:x;}
export function fieldToScreen(state,view,x,y){return{x:(physicalX(state,x)-view.x)*VIEW.baseX*view.zoom,y:VIEW.top+(y-view.y)*VIEW.baseY*view.zoom};}
export function screenToField(state,view,x,y){const world=view.x+x/(VIEW.baseX*view.zoom);return{x:state.possession===1?100-world:world,y:view.y+(y-VIEW.top)/(VIEW.baseY*view.zoom)};}
export function desiredZoom(state,aiming=false){if(state.phase==='ready'||state.phase==='final')return 1;if(state.phase==='dead')return 1.26;if(aiming)return 1.22;if(state.ball)return 1.2;return state.carrier==='qb'?1.22:1.42;}
export function cameraGoal(state,zoom=1){
  const carrier=state.players.find(p=>p.id===state.carrier)||state.players[0];
  let x=carrier?.x??state.spot,y=carrier?.y??27;
  if(state.ball){x=state.ball.x+(state.ball.toX-state.ball.x)*.17;y=state.ball.y+(state.ball.toY-state.ball.y)*.12;}
  if(state.possession===1){const selected=state.players.find(p=>p.id===state.selectedDefender);if(selected&&Math.hypot(selected.x-x,selected.y-y)<17){x=x*.84+selected.x*.16;y=y*.85+selected.y*.15;}}
  const width=VIEW.width/(VIEW.baseX*zoom),height=VIEW.fieldHeight/(VIEW.baseY*zoom);
  return{x:clamp(physicalX(state,x)-width*(state.possession===1?.7:.3),-10,110-width),y:clamp(y-height*.5,0,53.3-height)};
}
export function updateCamera(view,state,dt,aiming=false){
  const z=1-Math.exp(-Math.max(0,dt)/.22),pan=1-Math.exp(-Math.max(0,dt)/.12),zoom=view.zoom+(desiredZoom(state,aiming)-view.zoom)*z;
  const goal=cameraGoal(state,zoom);return{x:clamp(view.x+(goal.x-view.x)*pan,-10,110-VIEW.width/(VIEW.baseX*zoom)),y:clamp(view.y+(goal.y-view.y)*pan,0,53.3-VIEW.fieldHeight/(VIEW.baseY*zoom)),zoom};
}
