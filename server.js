const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, 'public')));

const TICK = 50;
const T = 48;
const MW = 44, MH = 34;
const SCAN_RADIUS = 240;
const SCAN_COOLDOWN = 10000;
const LIGHT_CUT_TIME = 25000;
const GAME_DURATION = 120000;
const HIDE_RADIUS = 38;
const WOLF_CATCH_RADIUS = 28;
const MAX_HIDE_TIME = 10000; // 10 seconds max hide time

const W_ = 0, FL = 1, WD = 2, ST = 3, CP = 4, GR = 5;

const ROOM_DEFS = [
  { id:'great_hall',  name:'Great Hall',  x:1,  y:1,  w:14, h:9,  ft:WD },
  { id:'library',     name:'Library',     x:17, y:1,  w:10, h:7,  ft:CP },
  { id:'armory',      name:'Armory',      x:29, y:1,  w:12, h:9,  ft:FL },
  { id:'courtyard',   name:'Courtyard',   x:1,  y:12, w:10, h:10, ft:ST },
  { id:'barracks',    name:'Barracks',    x:13, y:12, w:13, h:9,  ft:WD },
  { id:'crypt',       name:'Crypt',       x:28, y:12, w:15, h:9,  ft:CP },
  { id:'dungeon',     name:'Dungeon',     x:1,  y:23, w:16, h:9,  ft:FL },
  { id:'gardens',     name:'Gardens',     x:19, y:23, w:24, h:9,  ft:GR },
];

const CORRIDORS = [
  [14,5,17,5],[26,5,29,5],[10,6,10,12],[24,7,24,12],
  [37,9,37,12],[10,20,10,23],[22,20,22,23],[28,20,28,23],
  [15,27,19,27],[16,16,16,20],[26,16,28,16],[38,12,38,20],
];

const PROP_POOLS = {
  great_hall: [
    [[3,2,'table_l'],[5,2,'table_l'],[7,2,'table_l'],[3,5,'chair'],[6,5,'chair'],[9,5,'chair'],[2,2,'pillar'],[12,2,'pillar'],[2,8,'pillar'],[12,8,'pillar'],[7,7,'fireplace']],
    [[2,3,'table_l'],[4,3,'table_l'],[8,3,'table_l'],[10,3,'table_l'],[3,6,'chair'],[7,6,'chair'],[2,2,'pillar'],[12,2,'pillar'],[2,7,'pillar'],[12,7,'pillar'],[6,2,'fireplace']],
    [[4,2,'table_l'],[9,2,'table_l'],[4,7,'table_l'],[9,7,'table_l'],[2,4,'pillar'],[12,4,'pillar'],[7,4,'fireplace'],[3,4,'chair'],[11,4,'chair']],
  ],
  library: [
    [[0,1,'shelf'],[1,1,'shelf'],[2,1,'shelf'],[3,1,'shelf'],[4,1,'shelf'],[5,1,'shelf'],[0,3,'shelf'],[1,3,'shelf'],[2,3,'shelf'],[3,3,'shelf'],[7,2,'desk'],[8,4,'chair']],
    [[0,1,'shelf'],[1,1,'shelf'],[2,1,'shelf'],[3,1,'shelf'],[0,3,'shelf'],[1,3,'shelf'],[0,5,'shelf'],[1,5,'shelf'],[6,1,'desk'],[7,3,'chair'],[8,2,'desk']],
    [[0,1,'shelf'],[1,1,'shelf'],[0,3,'shelf'],[1,3,'shelf'],[0,5,'shelf'],[4,2,'shelf'],[5,2,'shelf'],[4,4,'shelf'],[5,4,'shelf'],[8,1,'desk'],[8,3,'chair']],
  ],
  armory: [
    [[1,1,'barrel'],[2,1,'barrel'],[3,1,'barrel'],[4,1,'barrel'],[1,4,'crate'],[3,4,'crate'],[5,3,'crate'],[7,2,'barrel'],[9,5,'crate'],[10,3,'barrel']],
    [[1,1,'crate'],[2,1,'crate'],[5,1,'barrel'],[6,1,'barrel'],[7,1,'barrel'],[1,5,'barrel'],[3,5,'crate'],[8,4,'crate'],[10,2,'barrel'],[10,5,'crate']],
    [[1,1,'barrel'],[1,2,'barrel'],[1,3,'barrel'],[3,1,'crate'],[5,2,'crate'],[7,1,'barrel'],[9,1,'crate'],[9,3,'barrel'],[7,5,'crate'],[4,5,'barrel']],
  ],
  courtyard: [
    [[1,1,'pillar'],[7,1,'pillar'],[1,8,'pillar'],[7,8,'pillar'],[4,5,'fountain']],
    [[2,2,'pillar'],[6,2,'pillar'],[2,7,'pillar'],[6,7,'pillar'],[4,4,'fountain']],
    [[1,2,'pillar'],[7,2,'pillar'],[1,7,'pillar'],[7,7,'pillar'],[4,5,'fountain'],[4,2,'bush']],
  ],
  barracks: [
    [[1,1,'bed'],[3,1,'bed'],[6,1,'bed'],[1,7,'bed'],[4,7,'bed'],[8,3,'table_s'],[9,5,'chair']],
    [[1,1,'bed'],[4,1,'bed'],[7,1,'bed'],[2,6,'bed'],[6,6,'bed'],[1,4,'table_s'],[10,2,'chair']],
    [[2,1,'bed'],[5,1,'bed'],[8,1,'bed'],[2,7,'bed'],[5,7,'bed'],[8,7,'bed'],[0,4,'table_s']],
  ],
  crypt: [
    [[1,1,'sarc'],[3,1,'sarc'],[5,1,'sarc'],[1,6,'sarc'],[4,6,'sarc'],[8,3,'altar'],[12,3,'pillar']],
    [[2,1,'sarc'],[4,1,'sarc'],[6,1,'sarc'],[2,6,'sarc'],[5,6,'sarc'],[9,4,'altar'],[0,4,'pillar']],
    [[1,1,'sarc'],[3,1,'sarc'],[1,5,'sarc'],[3,5,'sarc'],[6,2,'sarc'],[6,6,'sarc'],[10,3,'altar']],
  ],
  dungeon: [
    [[1,2,'barrel'],[3,2,'crate'],[6,3,'barrel'],[9,1,'crate'],[12,3,'barrel'],[14,5,'crate'],[2,6,'crate'],[8,6,'barrel']],
    [[1,1,'crate'],[2,1,'crate'],[5,3,'barrel'],[8,2,'crate'],[11,4,'barrel'],[13,2,'crate'],[3,6,'barrel'],[10,6,'crate']],
    [[1,2,'barrel'],[4,1,'barrel'],[4,2,'crate'],[7,3,'barrel'],[10,1,'crate'],[13,3,'barrel'],[1,6,'crate'],[7,6,'crate']],
  ],
  gardens: [
    [[1,2,'tree'],[4,4,'tree'],[8,2,'tree'],[12,4,'tree'],[16,2,'tree'],[20,4,'tree'],[3,1,'bush'],[6,3,'bush'],[10,1,'bush'],[14,3,'bush'],[18,1,'bush']],
    [[2,1,'tree'],[5,3,'tree'],[9,1,'tree'],[13,3,'tree'],[17,1,'tree'],[21,3,'tree'],[4,2,'bush'],[8,4,'bush'],[12,2,'bush'],[16,4,'bush']],
    [[1,3,'tree'],[3,1,'tree'],[7,4,'tree'],[11,1,'tree'],[15,4,'tree'],[19,1,'tree'],[23,4,'tree'],[5,2,'bush'],[9,3,'bush'],[13,2,'bush'],[17,3,'bush']],
  ],
};

const PROP_HIDE_OFFSETS = {
  table_l:  [{dx:0,  dy:0,  type:'under_table',    label:'Under Table',        cap:2}],
  table_s:  [{dx:0,  dy:0,  type:'under_table',    label:'Under Table',        cap:1}],
  bed:      [{dx:0,  dy:4,  type:'under_bed',       label:'Under Bed',          cap:2}],
  barrel:   [{dx:0,  dy:0,  type:'behind_barrel',  label:'Behind Barrels',     cap:1}],
  crate:    [{dx:0,  dy:0,  type:'in_crate',        label:'Inside Crate',       cap:1}],
  shelf:    [{dx:-8, dy:0,  type:'behind_shelf',   label:'Behind Shelf',       cap:1}],
  desk:     [{dx:0,  dy:6,  type:'under_desk',      label:'Under Desk',         cap:1}],
  sarc:     [{dx:0,  dy:12, type:'behind_sarc',    label:'Behind Sarcophagus', cap:1}],
  altar:    [{dx:0,  dy:14, type:'behind_altar',   label:'Behind Altar',       cap:2}],
  pillar:   [{dx:-14,dy:0,  type:'behind_pillar',  label:'Behind Pillar',      cap:1},
             {dx:14, dy:0,  type:'behind_pillar',  label:'Behind Pillar',      cap:1}],
  fountain: [{dx:0,  dy:18, type:'behind_fountain',label:'Behind Fountain',    cap:2}],
  tree:     [{dx:0,  dy:0,  type:'behind_tree',    label:'Behind Tree',        cap:1}],
  bush:     [{dx:0,  dy:0,  type:'in_bushes',      label:'In Bushes',          cap:2}],
  fireplace:[],
  chair:    [],
};

function buildMap() {
  const map = [];
  for (let y = 0; y < MH; y++) { map[y] = []; for (let x = 0; x < MW; x++) map[y][x] = W_; }
  for (const r of ROOM_DEFS)
    for (let y = r.y; y < r.y + r.h && y < MH; y++)
      for (let x = r.x; x < r.x + r.w && x < MW; x++) map[y][x] = r.ft;
  for (const [x1,y1,x2,y2] of CORRIDORS) {
    let cx=x1,cy=y1;
    while(cx!==x2||cy!==y2){if(cx<MW&&cy<MH)map[cy][cx]=ST;if(cx<x2)cx++;else if(cx>x2)cx--;if(cy<y2)cy++;else if(cy>y2)cy--;}
    if(x2<MW&&y2<MH)map[y2][x2]=ST;
  }
  return map;
}

const MAP_BASE = buildMap();

function walkable(wx,wy){
  const tx=Math.floor(wx/T),ty=Math.floor(wy/T);
  if(tx<0||ty<0||tx>=MW||ty>=MH)return false;
  return MAP_BASE[ty][tx]!==W_;
}

function seededRNG(seed){let s=seed;return function(){s=(s*1664525+1013904223)&0xffffffff;return(s>>>0)/0xffffffff;};}

function generateLayout(seed){
  const rng=seededRNG(seed);
  const props=[];const hidingSpots=[];let spotId=0;
  for(const room of ROOM_DEFS){
    const pool=PROP_POOLS[room.id];if(!pool)continue;
    const variant=pool[Math.floor(rng()*pool.length)];
    for(const[dx,dy,type]of variant){
      const wx=(room.x+dx)*T+T/2,wy=(room.y+dy)*T+T/2;
      props.push({tx:room.x+dx,ty:room.y+dy,t:type,wx,wy});
      const hideDefs=PROP_HIDE_OFFSETS[type]||[];
      for(const hd of hideDefs){
        const jx=(rng()-0.5)*16,jy=(rng()-0.5)*16;
        hidingSpots.push({id:`s${spotId++}`,x:wx+hd.dx+jx,y:wy+hd.dy+jy,type:hd.type,label:hd.label,cap:hd.cap,room:room.name,occupants:[],hideTimers:{}});
      }
    }
  }
  return {props,hidingSpots};
}

function getRoomAt(wx,wy){
  for(const r of ROOM_DEFS)if(wx>=r.x*T&&wx<(r.x+r.w)*T&&wy>=r.y*T&&wy<(r.y+r.h)*T)return r.name;
  return 'Corridor';
}

const games=new Map();
const playerToGame=new Map();
function genId(){return Math.random().toString(36).slice(2,8).toUpperCase();}
function genCode(){let c;do{c=Math.random().toString(36).slice(2,6).toUpperCase();}while(games.has(c));return c;}

function createGame(code){
  return{code,phase:'lobby',players:new Map(),wolf:null,startTime:null,lightPhase:'day',
    scanCooldowns:new Map(),props:[],hidingSpots:new Map(),layoutSeed:0,
    gameInterval:null,lightTimeout:null,endTimeout:null,tick:0};
}

function broadcast(game,msg,excludeId=null){
  const d=JSON.stringify(msg);
  for(const[id,p]of game.players){if(id===excludeId)continue;if(p.ws?.readyState===WebSocket.OPEN)p.ws.send(d);}
}
function broadcastAll(game,msg){broadcast(game,msg,null);}
function sendTo(ws,msg){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));}

const SPAWN_HIDERS=[{x:420,y:200},{x:640,y:400},{x:1100,y:130},{x:990,y:550},{x:300,y:580},{x:720,y:580},{x:850,y:290},{x:530,y:190},{x:1150,y:440},{x:370,y:470}];
const SPAWN_WOLF={x:88,y:88};

function startGame(game){
  game.phase='playing';
  game.startTime=Date.now();
  game.lightPhase='day';

  // ── RANDOMIZE who is wolf — pick random player, not always first ──
  const ids=[...game.players.keys()];
  const wolfIdx=Math.floor(Math.random()*ids.length);
  game.wolf=ids[wolfIdx];

  // Generate layout
  game.layoutSeed=Math.floor(Math.random()*999999);
  const{props,hidingSpots}=generateLayout(game.layoutSeed);
  game.props=props;
  game.hidingSpots=new Map(hidingSpots.map(s=>[s.id,s]));

  let hi=0;
  for(const[id,p]of game.players){
    p.caught=false;p.alive=true;p.hiding=false;p.hideSpotId=null;p.hideStartTime=null;
    if(id===game.wolf){
      p.role='wolf';p.x=SPAWN_WOLF.x;p.y=SPAWN_WOLF.y;
    }else{
      p.role='hider';
      const sp=SPAWN_HIDERS[hi++%SPAWN_HIDERS.length];
      p.x=sp.x;p.y=sp.y;
    }
    p.anim='idle';p.facing='down';
    sendTo(p.ws,{type:'role_assigned',role:p.role,yourId:id});
  }

  broadcastAll(game,{type:'game_start',wolf:game.wolf,mapData:MAP_BASE,props:game.props,
    hidingSpots:[...game.hidingSpots.values()].map(s=>({id:s.id,x:s.x,y:s.y,type:s.type,label:s.label,cap:s.cap,room:s.room,count:0})),
    layoutSeed:game.layoutSeed});

  game.lightTimeout=setTimeout(()=>{
    game.lightPhase='night';
    broadcastAll(game,{type:'lights_out'});
  },LIGHT_CUT_TIME);

  game.gameInterval=setInterval(()=>tickGame(game),TICK);
  game.endTimeout=setTimeout(()=>endGame(game,'timeout'),GAME_DURATION);
}

function tickGame(game){
  if(game.phase!=='playing')return;
  game.tick++;

  const now=Date.now();

  // ── CHECK MAX HIDE TIME (10 seconds) — kick hiders out after limit ──
  for(const[,p]of game.players){
    if(p.role==='hider'&&p.hiding&&p.hideStartTime){
      const hideDuration=now-p.hideStartTime;
      if(hideDuration>=MAX_HIDE_TIME){
        // Force them out after 10 seconds
        const spot=game.hidingSpots.get(p.hideSpotId);
        if(spot)spot.occupants=spot.occupants.filter(i=>i!==p.id);
        p.hiding=false;p.hideSpotId=null;p.hideStartTime=null;p.anim='idle';
        sendTo(p.ws,{type:'force_unhide',msg:'You have been hiding too long! You must move.'});
        broadcastAll(game,{type:'player_hiding',id:p.id,spotId:null,hiding:false});
      }
    }
  }

  // WIN CHECK
  const hiders=[...game.players.values()].filter(p=>p.role==='hider');
  if(hiders.length>0&&hiders.every(p=>p.caught)){endGame(game,'wolf_wins');return;}

  if(game.tick%2===0)broadcastAll(game,buildPublicState(game));
}

function buildPublicState(game){
  const players={};
  const now=Date.now();
  for(const[id,p]of game.players){
    players[id]={id,name:p.name,role:p.role,x:p.x,y:p.y,
      hiding:p.hiding,hideSpotId:p.hideSpotId,
      caught:p.caught,alive:p.alive,anim:p.anim,facing:p.facing,color:p.color,
      // Send hide time remaining so client can show countdown
      hideTimeLeft:p.hiding&&p.hideStartTime?Math.max(0,MAX_HIDE_TIME-(now-p.hideStartTime)):0};
  }
  return{type:'state',phase:game.phase,lightPhase:game.lightPhase,players,wolf:game.wolf,
    timeLeft:game.startTime?Math.max(0,GAME_DURATION-(Date.now()-game.startTime)):0,
    hidingSpots:[...game.hidingSpots.values()].map(s=>({id:s.id,x:s.x,y:s.y,type:s.type,label:s.label,cap:s.cap,count:s.occupants.length,room:s.room})),
    tick:game.tick};
}

function endGame(game,reason){
  if(game.phase==='ended')return;
  game.phase='ended';
  clearInterval(game.gameInterval);
  clearTimeout(game.lightTimeout);
  clearTimeout(game.endTimeout);
  const hiders=[...game.players.values()].filter(p=>p.role==='hider');
  const caught=hiders.filter(p=>p.caught).length;
  const results=[];
  for(const[id,p]of game.players){
    results.push({id,name:p.name,role:p.role,color:p.color,caught:p.caught});
  }
  broadcastAll(game,{type:'game_over',reason,wolfWins:reason==='wolf_wins',caught,total:hiders.length,results});

  // ── RESET GAME TO LOBBY after 5 seconds ──
  // Players stay in the room — just reset state
  setTimeout(()=>{
    if(game.players.size===0)return;
    game.phase='lobby';
    game.wolf=null;
    game.lightPhase='day';
    game.hidingSpots=new Map();
    game.props=[];
    game.tick=0;
    // Reset all player states
    for(const[,p]of game.players){
      p.role='hider';p.hiding=false;p.hideSpotId=null;p.hideStartTime=null;p.caught=false;p.alive=true;
    }
    // Send everyone back to lobby
    broadcastAll(game,{type:'return_to_lobby',players:[...game.players.values()].map(p=>({id:p.id,name:p.name,color:p.color}))});
  },5000);
}

wss.on('connection',ws=>{
  const clientId=genId();
  ws.clientId=clientId;

  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    const code=playerToGame.get(ws);
    const game=code?games.get(code):null;
    const p=game?.players.get(clientId);

    switch(msg.type){
      case 'create_room':{
        const c=genCode();const g=createGame(c);games.set(c,g);
        const pl={id:clientId,ws,name:msg.name||'PLAYER',x:200,y:200,role:'hider',color:msg.color||'#4488ff',anim:'idle',facing:'down',hiding:false,hideSpotId:null,hideStartTime:null,caught:false,alive:true};
        g.players.set(clientId,pl);playerToGame.set(ws,c);
        sendTo(ws,{type:'room_created',code:c,yourId:clientId});
        sendTo(ws,{type:'lobby_state',players:[...g.players.values()].map(pp=>({id:pp.id,name:pp.name,color:pp.color}))});
        break;
      }
      case 'join_room':{
        const c=msg.code?.toUpperCase();const g=games.get(c);
        if(!g){sendTo(ws,{type:'error',msg:'Room not found'});return;}
        if(g.phase==='playing'){sendTo(ws,{type:'error',msg:'Game already in progress'});return;}
        if(g.players.size>=6){sendTo(ws,{type:'error',msg:'Room is full (max 6)'});return;}
        const pl={id:clientId,ws,name:msg.name||'PLAYER',x:200,y:200,role:'hider',color:msg.color||'#44ff88',anim:'idle',facing:'down',hiding:false,hideSpotId:null,hideStartTime:null,caught:false,alive:true};
        g.players.set(clientId,pl);playerToGame.set(ws,c);
        sendTo(ws,{type:'room_joined',code:c,yourId:clientId});
        broadcastAll(g,{type:'lobby_state',players:[...g.players.values()].map(pp=>({id:pp.id,name:pp.name,color:pp.color}))});
        break;
      }
      case 'start_game':
        if(!game||game.phase!=='lobby')return;
        if(game.players.size<2){sendTo(ws,{type:'error',msg:'Need at least 2 players'});return;}
        startGame(game);
        break;

      case 'move':
        if(!game||game.phase!=='playing'||!p||p.caught||p.hiding)return;
        {const spd=p.role==='wolf'?172:140;const dt=TICK/1000;
        let{dx,dy}=msg;const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
        const PR=12;const nx=p.x+dx*spd*dt,ny=p.y+dy*spd*dt;
        if(walkable(nx-PR,p.y)&&walkable(nx+PR,p.y))p.x=nx;
        if(walkable(p.x,ny-PR)&&walkable(p.x,ny+PR))p.y=ny;
        if(Math.abs(dx)>0.1||Math.abs(dy)>0.1){p.anim='walk';p.facing=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');}
        else p.anim='idle';
        if(p.role==='wolf'){
          for(const[hid,h]of game.players){
            if(h.role!=='hider'||h.caught||h.hiding)continue;
            if(Math.hypot(h.x-p.x,h.y-p.y)<WOLF_CATCH_RADIUS){h.caught=true;h.alive=false;h.anim='caught';broadcastAll(game,{type:'player_caught',id:hid});}
          }
        }}
        break;

      case 'hide':
        if(!game||game.phase!=='playing'||!p||p.role!=='hider'||p.caught)return;
        {let best=null,bestD=Infinity;
        for(const[,spot]of game.hidingSpots){
          const d=Math.hypot(spot.x-p.x,spot.y-p.y);
          if(d<HIDE_RADIUS&&d<bestD&&spot.occupants.length<spot.cap){best=spot;bestD=d;}
        }
        if(best){
          if(p.hiding){const old=game.hidingSpots.get(p.hideSpotId);if(old)old.occupants=old.occupants.filter(i=>i!==clientId);}
          best.occupants.push(clientId);
          p.hiding=true;p.hideSpotId=best.id;p.hideStartTime=Date.now();p.anim='hiding';
          sendTo(ws,{type:'hide_success',spotId:best.id,label:best.label,maxHideMs:MAX_HIDE_TIME});
          broadcastAll(game,{type:'player_hiding',id:clientId,spotId:best.id,hiding:true});
        }else sendTo(ws,{type:'hide_fail',msg:'No hiding spot nearby'});}
        break;

      case 'unhide':
        if(!game||!p||!p.hiding)return;
        {const spot=game.hidingSpots.get(p.hideSpotId);if(spot)spot.occupants=spot.occupants.filter(i=>i!==clientId);}
        p.hiding=false;p.hideSpotId=null;p.hideStartTime=null;p.anim='idle';
        broadcastAll(game,{type:'player_hiding',id:clientId,spotId:null,hiding:false});
        break;

      case 'scan':
        if(!game||game.phase!=='playing'||!p||p.role!=='wolf')return;
        {const lastScan=game.scanCooldowns.get(clientId)||0;
        if(Date.now()-lastScan<SCAN_COOLDOWN){sendTo(ws,{type:'scan_cooldown',remaining:SCAN_COOLDOWN-(Date.now()-lastScan)});return;}
        game.scanCooldowns.set(clientId,Date.now());
        const detected=[];
        for(const[hid,h]of game.players){
          if(h.role!=='hider'||h.caught)continue;
          if(Math.hypot(h.x-p.x,h.y-p.y)<SCAN_RADIUS)
            detected.push({id:hid,x:h.x,y:h.y,hiding:h.hiding,room:getRoomAt(h.x,h.y)});
        }
        sendTo(ws,{type:'scan_result',detected,px:p.x,py:p.y});
        broadcastAll(game,{type:'scan_wave',x:p.x,y:p.y});}
        break;

      case 'chat':
        if(!game||!p)return;
        broadcastAll(game,{type:'chat',name:p.name,text:msg.text.slice(0,80),role:p.role,id:clientId});
        break;
    }
  });

  ws.on('close',()=>{
    const c=playerToGame.get(ws);
    if(c){
      const g=games.get(c);
      if(g){
        const pp=g.players.get(clientId);
        if(pp?.hiding){const spot=g.hidingSpots.get(pp.hideSpotId);if(spot)spot.occupants=spot.occupants.filter(i=>i!==clientId);}
        g.players.delete(clientId);
        broadcast(g,{type:'player_left',id:clientId,name:pp?.name||'Someone'});
        if(g.players.size===0){clearInterval(g.gameInterval);clearTimeout(g.lightTimeout);clearTimeout(g.endTimeout);games.delete(c);}
        else if(g.phase==='lobby'){
          broadcastAll(g,{type:'lobby_state',players:[...g.players.values()].map(p=>({id:p.id,name:p.name,color:p.color}))});
        }
      }
      playerToGame.delete(ws);
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`WolfHunt server on :${PORT}`));
