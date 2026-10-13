// Built Worker/D1 integration check. Uses Miniflare directly; no browser or preview UI.
import {createRequire} from 'node:module';
import {realpathSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync('./node_modules/wrangler/package.json'));
const {Miniflare}=require('miniflare');
function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(p=>p.isDirectory()?files(resolve(path,p.name)):[resolve(path,p.name)]);}
const workerFiles=files(resolve('dist/server')).filter(p=>p.endsWith('.js')).sort((a,b)=>a===resolve('dist/server/index.js')?-1:b===resolve('dist/server/index.js')?1:a.localeCompare(b));
const runtime=new Miniflare({modules:workerFiles.map(path=>({type:'ESModule',path,contents:readFileSync(path,'utf8')})),modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},cf:false});
try{
  const db=await runtime.getD1Database('DB');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  const post=async(body,token='')=>{const response=await runtime.dispatchFetch('http://game.test/api/rooms',{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':token,Origin:'http://game.test'},body:JSON.stringify(body)});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;};
  const host=await post({action:'create',name:'Runtime host'}),guest=await post({action:'join',code:host.room.code,name:'Runtime guest'});
  await post({action:'sync',code:host.room.code,ready:true},host.token);await post({action:'sync',code:host.room.code,ready:true},guest.token);
  await new Promise(resolve=>setTimeout(resolve,1900));
  await post({action:'sync',code:host.room.code},guest.token);
  const started=await post({action:'sync',code:host.room.code,commands:[{seq:1,type:'snap'}]},host.token);assert.equal(started.room.game.phase,'live');
  const seen=await post({action:'sync',code:host.room.code},guest.token);assert.equal(seen.room.game.phase,'live');assert.equal(seen.room.slot,1);
  for(const path of ['/','/game/index.html','/game/','/game/app.js','/game/style.css']){const r=await runtime.dispatchFetch('http://game.test'+path);console.log('Asset route',path,r.status,r.headers.get('location'));}
  let page=await runtime.dispatchFetch('http://game.test/game/index.html');if(page.status>=300&&page.status<400)page=await runtime.dispatchFetch(new URL(page.headers.get('location'),'http://game.test').href);
  assert.equal(page.status,200);assert.match(await page.text(),/ONLINE 1V1/);
  console.log('Built Worker + native D1: create, join, ready, snap, guest synchronization and game assets passed.');
}finally{await runtime.dispose();}
