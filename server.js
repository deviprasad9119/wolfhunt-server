const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ── GAME CONSTANTS ──
const TICK = 50; // ms per server tick (20 Hz)
const T = 48;    // tile size
const MW = 44, MH = 34;
const SCAN_RADIUS = 240;
const SCAN_COOLDOWN = 10000;
const LIGHT_CUT_TIME = 20000; // 20 seconds
const GAME_DURATION = 120000; // 2 minutes
const HIDE_RADIUS = 32; // distance to enter hiding spot
const WOLF_CATCH_RADIUS = 28;

// ── MAP ──
const W_ = 0, FL = 1, WD = 2, ST = 3, CP = 4, GR = 5;

const ROOMS = [
  [1,1,14,9,WD],[17,1,10,7,CP],[29,1,12,9,FL],
  [1,12,10,10,ST],[13,12,13,9,WD],[28,12,15,9,CP],
  [1,23,16,9,FL],[19,23,24,9,GR],
];
const CORRIDORS = [
  [14,5,17,5],[26,5,29,5],[10,6,10,12],[24,7,24,12],
  [37,9,37,12],[10,20,10,23],[22,20,22,23],[28,20,28,23],
  [15,27,19,27],[16,16,16,20],[26,16,28,16],[38,12,38,20],
];

// Hiding spots — world positions, type, capacity
const HIDING_SPOTS = [
  // Great Hall
  { id:'h0', x:3.5*T, y:2.5*T, type:'under_table', label:'Under Table', cap:2 },
  { id:'h1', x:7.5*T, y:5.5*T, type:'behind_pillar', label:'Behind Pillar', cap:1 },
  { id:'h2', x:12.5*T, y:2.5*T, type:'behind_pillar', label:'Behind Pillar', cap:1 },
  // Library
  { id:'h3', x:18.5*T, y:2.5*T, type:'behind_shelf', label:'Behind Shelves', cap:2 },
  { id:'h4', x:24.5*T, y:3.5*T, type:'under_desk', label:'Under Desk', cap:1 },
  // Armory
  { id:'h5', x:31.5*T, y:2.5*T, type:'behind_barrels', label:'Behind Barrels', cap:2 },
  { id:'h6', x:34.5*T, y:5.5*T, type:'inside_crate', label:'Inside Crate', cap:1 },
  // Barracks
  { id:'h7', x:14.5*T, y:14.5*T, type:'under_bed', label:'Under Bed', cap:2 },
  { id:'h8', x:19.5*T, y:14.5*T, type:'under_bed', label:'Under Bed', cap:2 },
  // Crypt
  { id:'h9', x:29.5*T, y:14.5*T, type:'behind_sarc', label:'Behind Sarcophagus', cap:1 },
  { id:'h10', x:33.5*T, y:14.5*T, type:'behind_sarc', label:'Behind Sarcophagus', cap:1 },
  { id:'h11', x:36.5*T, y:17.5*T, type:'behind_altar', label:'Behind Altar', cap:2 },
  // Courtyard
  { id:'h12', x:3.5*T, y:15.5*T, type:'behind_pillar', label:'Behind Pillar', cap:1 },
  { id:'h13', x:8.5*T, y:15.5*T, type:'behind_pillar', label:'Behind Pillar', cap:1 },
  { id:'h14', x:5.5*T, y:18.5*T, type:'behind_fountain', label:'Behind Fountain', cap:2 },
  // Dungeon
  { id:'h15', x:3.5*T, y:25.5*T, type:'behind_barrels', label:'Behind Barrels', cap:2 },
  { id:'h16', x:10.5*T, y:26.5*T, type:'inside_crate', label:'Inside Crate', cap:1 },
  // Gardens
  { id:'h17', x:21.5*T, y:25.5*T, type:'behind_tree', label:'Behind Tree', cap:1 },
  { id:'h18', x:27.5*T, y:25.5*T, type:'behind_tree', label:'Behind Tree', cap:1 },
  { id:'h19', x:33.5*T, y:27.5*T, type:'in_bushes', label:'In Bushes', cap:2 },
  { id:'h20', x:38.5*T, y:25.5*T, type:'behind_tree', label:'Behind Tree', cap:1 },
];

function buildMap() {
  const map = [];
  for (let y = 0; y < MH; y++) { map[y] = []; for (let x = 0; x < MW; x++) map[y][x] = W_; }
  for (const [rx,ry,rw,rh,ft] of ROOMS)
    for (let y = ry; y < ry+rh && y < MH; y++)
      for (let x = rx; x < rx+rw && x < MW; x++) map[y][x] = ft;
  for (const [x1,y1,x2,y2] of CORRIDORS) {
    let cx=x1, cy=y1;
    while (cx !== x2 || cy !== y2) {
      if (cx<MW && cy<MH) map[cy][cx] = ST;
      if (cx<x2) cx++; else if (cx>x2) cx--;
      if (cy<y2) cy++; else if (cy>y2) cy--;
    }
    if (x2<MW && y2<MH) map[y2][x2] = ST;
  }
  return map;
}

const MAP_DATA = buildMap();

function walkable(wx, wy) {
  const tx = Math.floor(wx/T), ty = Math.floor(wy/T);
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return false;
  return MAP_DATA[ty][tx] !== W_;
}

// ── ROOMS ──
const ROOMS_LIST = [
  { id: 'r0', name: 'Great Hall', x: 1*T, y: 1*T, w: 14*T, h: 9*T },
  { id: 'r1', name: 'Library', x: 17*T, y: 1*T, w: 10*T, h: 7*T },
  { id: 'r2', name: 'Armory', x: 29*T, y: 1*T, w: 12*T, h: 9*T },
  { id: 'r3', name: 'Courtyard', x: 1*T, y: 12*T, w: 10*T, h: 10*T },
  { id: 'r4', name: 'Barracks', x: 13*T, y: 12*T, w: 13*T, h: 9*T },
  { id: 'r5', name: 'Crypt', x: 28*T, y: 12*T, w: 15*T, h: 9*T },
  { id: 'r6', name: 'Dungeon', x: 1*T, y: 23*T, w: 16*T, h: 9*T },
  { id: 'r7', name: 'Gardens', x: 19*T, y: 23*T, w: 24*T, h: 9*T },
];

function getRoomAt(wx, wy) {
  for (const r of ROOMS_LIST) {
    if (wx >= r.x && wx < r.x+r.w && wy >= r.y && wy < r.y+r.h) return r.name;
  }
  return 'Corridor';
}

// ── GAME STATE ──
const games = new Map(); // roomCode -> gameState
const playerToGame = new Map(); // ws -> roomCode

function createGame(code) {
  return {
    code,
    phase: 'lobby',    // lobby | countdown | playing | ended
    players: new Map(),// id -> playerState
    wolf: null,        // wolf player id
    startTime: null,
    lightCutTime: null,
    lightPhase: 'day', // day | night
    scanCooldowns: new Map(), // playerId -> timestamp
    hidingSpots: new Map(HIDING_SPOTS.map(s => [s.id, { ...s, occupants: [] }])),
    tick: 0,
    countdownInterval: null,
    gameInterval: null,
  };
}

function genId() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

function genCode() {
  let c;
  do { c = Math.random().toString(36).slice(2,6).toUpperCase(); } while (games.has(c));
  return c;
}

const SPAWN_HIDERS = [
  {x:420, y:200}, {x:640, y:400}, {x:1100, y:130}, {x:990, y:550}, {x:300, y:580},
  {x:720, y:580}, {x:850, y:290}, {x:530, y:190}, {x:1150, y:440}, {x:370, y:470},
];
const SPAWN_WOLF = { x: 88, y: 88 };

function broadcast(game, msg, excludeId = null) {
  const data = JSON.stringify(msg);
  for (const [id, p] of game.players) {
    if (id === excludeId) continue;
    if (p.ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
  }
}

function broadcastAll(game, msg) { broadcast(game, msg, null); }

function sendTo(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function getPublicState(game) {
  const players = {};
  for (const [id, p] of game.players) {
    players[id] = {
      id, name: p.name, role: p.role,
      x: p.x, y: p.y,
      hiding: p.hiding, hideSpotId: p.hideSpotId,
      caught: p.caught, alive: p.alive,
      anim: p.anim, facing: p.facing,
      color: p.color,
      // Only send hider positions if visible to wolf or it's daylight
    };
  }
  return {
    type: 'state',
    phase: game.phase,
    lightPhase: game.lightPhase,
    players,
    wolf: game.wolf,
    timeLeft: game.startTime ? Math.max(0, GAME_DURATION - (Date.now() - game.startTime)) : 0,
    hidingSpots: [...game.hidingSpots.values()].map(s => ({
      id: s.id, x: s.x, y: s.y, type: s.type, label: s.label,
      cap: s.cap, count: s.occupants.length
    })),
    tick: game.tick,
  };
}

function startGame(game) {
  game.phase = 'playing';
  game.startTime = Date.now();
  game.lightPhase = 'day';

  // Assign wolf — first person who joined, or random
  const ids = [...game.players.keys()];
  game.wolf = ids[0]; // first joiner is wolf

  let hiderIdx = 0;
  for (const [id, p] of game.players) {
    p.caught = false; p.alive = true; p.hiding = false; p.hideSpotId = null;
    if (id === game.wolf) {
      p.role = 'wolf'; p.x = SPAWN_WOLF.x; p.y = SPAWN_WOLF.y;
    } else {
      const sp = SPAWN_HIDERS[hiderIdx++ % SPAWN_HIDERS.length];
      p.role = 'hider'; p.x = sp.x; p.y = sp.y;
    }
    p.anim = 'idle'; p.facing = 'down'; p.vx = 0; p.vy = 0;
    sendTo(p.ws, { type: 'role_assigned', role: p.role, yourId: id });
  }

  broadcastAll(game, { type: 'game_start', wolf: game.wolf, mapData: MAP_DATA, hidingSpots: [...game.hidingSpots.values()] });
  broadcastAll(game, getPublicState(game));

  // Light cut timer
  game.lightCutTime = setTimeout(() => {
    game.lightPhase = 'night';
    broadcastAll(game, { type: 'lights_out' });
  }, LIGHT_CUT_TIME);

  // Game tick
  game.gameInterval = setInterval(() => tickGame(game), TICK);

  // Game end timer
  setTimeout(() => endGame(game, 'timeout'), GAME_DURATION);
}

function tickGame(game) {
  if (game.phase !== 'playing') return;
  game.tick++;

  // Check win condition: all hiders caught
  const hiders = [...game.players.values()].filter(p => p.role === 'hider');
  if (hiders.length > 0 && hiders.every(p => p.caught)) {
    endGame(game, 'wolf_wins');
    return;
  }

  // Broadcast state every 2 ticks (10 Hz)
  if (game.tick % 2 === 0) broadcastAll(game, getPublicState(game));
}

function endGame(game, reason) {
  if (game.phase === 'ended') return;
  game.phase = 'ended';
  clearInterval(game.gameInterval);
  clearTimeout(game.lightCutTime);
  const hiders = [...game.players.values()].filter(p => p.role === 'hider');
  const caught = hiders.filter(p => p.caught).length;
  broadcastAll(game, {
    type: 'game_over',
    reason,
    wolfWins: reason === 'wolf_wins',
    caught, total: hiders.length,
  });
}

// ── WS HANDLER ──
wss.on('connection', (ws) => {
  const clientId = genId();
  ws.clientId = clientId;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'create_room': {
        const code = genCode();
        const game = createGame(code);
        games.set(code, game);
        const p = {
          id: clientId, ws, name: msg.name || 'Player',
          x: 200, y: 200, role: 'hider', color: msg.color || '#4488ff',
          anim: 'idle', facing: 'down', vx: 0, vy: 0,
          hiding: false, hideSpotId: null, caught: false, alive: true,
        };
        game.players.set(clientId, p);
        playerToGame.set(ws, code);
        sendTo(ws, { type: 'room_created', code, yourId: clientId });
        sendTo(ws, { type: 'lobby_state', players: [...game.players.values()].map(p2=>({id:p2.id,name:p2.name,color:p2.color})) });
        break;
      }

      case 'join_room': {
        const code = msg.code?.toUpperCase();
        const game = games.get(code);
        if (!game) { sendTo(ws, { type: 'error', msg: 'Room not found' }); return; }
        if (game.phase !== 'lobby') { sendTo(ws, { type: 'error', msg: 'Game already started' }); return; }
        if (game.players.size >= 6) { sendTo(ws, { type: 'error', msg: 'Room full (max 6)' }); return; }
        const p = {
          id: clientId, ws, name: msg.name || 'Player',
          x: 200, y: 200, role: 'hider', color: msg.color || '#44ff88',
          anim: 'idle', facing: 'down', vx: 0, vy: 0,
          hiding: false, hideSpotId: null, caught: false, alive: true,
        };
        game.players.set(clientId, p);
        playerToGame.set(ws, code);
        sendTo(ws, { type: 'room_joined', code, yourId: clientId });
        broadcastAll(game, { type: 'lobby_state', players: [...game.players.values()].map(p2=>({id:p2.id,name:p2.name,color:p2.color})) });
        break;
      }

      case 'start_game': {
        const code = playerToGame.get(ws);
        const game = games.get(code);
        if (!game || game.phase !== 'lobby') return;
        if (game.players.size < 2) { sendTo(ws, { type: 'error', msg: 'Need at least 2 players' }); return; }
        startGame(game);
        break;
      }

      case 'move': {
        const code = playerToGame.get(ws);
        const game = games.get(code);
        if (!game || game.phase !== 'playing') return;
        const p = game.players.get(clientId);
        if (!p || p.caught) return;
        if (p.hiding) return; // can't move while hiding

        const spd = p.role === 'wolf' ? 172 : 140;
        const dt = TICK / 1000;
        let { dx, dy } = msg;

        // Clamp
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }

        const PR = 12;
        const nx = p.x + dx * spd * dt;
        const ny = p.y + dy * spd * dt;

        if (walkable(nx - PR, p.y) && walkable(nx + PR, p.y)) p.x = nx;
        if (walkable(p.x, ny - PR) && walkable(p.x, ny + PR)) p.y = ny;

        // Animation state
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          p.anim = 'walk';
          if (Math.abs(dx) > Math.abs(dy)) p.facing = dx > 0 ? 'right' : 'left';
          else p.facing = dy > 0 ? 'down' : 'up';
        } else {
          p.anim = 'idle';
        }

        // Wolf catch check
        if (p.role === 'wolf') {
          for (const [hid, h] of game.players) {
            if (h.role !== 'hider' || h.caught || h.hiding) continue;
            const d = Math.hypot(h.x - p.x, h.y - p.y);
            if (d < WOLF_CATCH_RADIUS) {
              h.caught = true; h.alive = false; h.anim = 'caught';
              broadcastAll(game, { type: 'player_caught', id: hid, catcherId: clientId });
            }
          }
        }
        break;
      }

      case 'hide': {
        const code = playerToGame.get(ws);
        const game = games.get(code);
        if (!game || game.phase !== 'playing') return;
        const p = game.players.get(clientId);
        if (!p || p.role !== 'hider' || p.caught) return;

        // Find nearest hiding spot
        let best = null, bestDist = Infinity;
        for (const [sid, spot] of game.hidingSpots) {
          const d = Math.hypot(spot.x - p.x, spot.y - p.y);
          if (d < HIDE_RADIUS && d < bestDist && spot.occupants.length < spot.cap) {
            best = spot; bestDist = d;
          }
        }

        if (best) {
          if (p.hiding) {
            // Leave current spot
            const old = game.hidingSpots.get(p.hideSpotId);
            if (old) old.occupants = old.occupants.filter(i => i !== clientId);
          }
          best.occupants.push(clientId);
          p.hiding = true; p.hideSpotId = best.id;
          p.x = best.x; p.y = best.y; // snap to spot
          p.anim = 'hiding';
          sendTo(ws, { type: 'hide_success', spotId: best.id, label: best.label });
          broadcastAll(game, { type: 'player_hiding', id: clientId, spotId: best.id, hiding: true });
        } else {
          sendTo(ws, { type: 'hide_fail', msg: 'No hiding spot nearby' });
        }
        break;
      }

      case 'unhide': {
        const code = playerToGame.get(ws);
        const game = games.get(code);
        if (!game) return;
        const p = game.players.get(clientId);
        if (!p || !p.hiding) return;
        const spot = game.hidingSpots.get(p.hideSpotId);
        if (spot) spot.occupants = spot.occupants.filter(i => i !== clientId);
        p.hiding = false; p.hideSpotId = null; p.anim = 'idle';
        broadcastAll(game, { type: 'player_hiding', id: clientId, spotId: null, hiding: false });
        break;
      }

      case 'scan': {
        const code = playerToGame.get(ws);
        const game = games.get(code);
        if (!game || game.phase !== 'playing') return;
        const p = game.players.get(clientId);
        if (!p || p.role !== 'wolf') return;

        const lastScan = game.scanCooldowns.get(clientId) || 0;
        if (Date.now() - lastScan < SCAN_COOLDOWN) {
          sendTo(ws, { type: 'scan_cooldown', remaining: SCAN_COOLDOWN - (Date.now() - lastScan) });
          return;
        }
        game.scanCooldowns.set(clientId, Date.now());

        const detected = [];
        for (const [hid, h] of game.players) {
          if (h.role !== 'hider' || h.caught) continue;
          const d = Math.hypot(h.x - p.x, h.y - p.y);
          if (d < SCAN_RADIUS) {
            detected.push({ id: hid, x: h.x, y: h.y, hiding: h.hiding, room: getRoomAt(h.x, h.y) });
          }
        }
        sendTo(ws, { type: 'scan_result', detected, px: p.x, py: p.y });
        broadcastAll(game, { type: 'scan_wave', x: p.x, y: p.y, radius: SCAN_RADIUS });
        break;
      }

      case 'ping_location': {
        // Wolf taunts a hider's location to everyone
        const code = playerToGame.get(ws);
        const game = games.get(code);
        if (!game) return;
        const p = game.players.get(clientId);
        if (!p) return;
        broadcastAll(game, { type: 'location_ping', x: msg.x, y: msg.y, label: msg.label, senderId: clientId });
        break;
      }

      case 'chat': {
        const code = playerToGame.get(ws);
        const game = games.get(code);
        if (!game) return;
        const p = game.players.get(clientId);
        if (!p) return;
        broadcastAll(game, { type: 'chat', name: p.name, text: msg.text.slice(0, 80), role: p.role, id: clientId });
        break;
      }
    }
  });

  ws.on('close', () => {
    const code = playerToGame.get(ws);
    if (code) {
      const game = games.get(code);
      if (game) {
        const p = game.players.get(clientId);
        if (p?.hiding) {
          const spot = game.hidingSpots.get(p.hideSpotId);
          if (spot) spot.occupants = spot.occupants.filter(i => i !== clientId);
        }
        game.players.delete(clientId);
        broadcast(game, { type: 'player_left', id: clientId });
        if (game.players.size === 0) {
          clearInterval(game.gameInterval);
          clearTimeout(game.lightCutTime);
          games.delete(code);
        }
      }
      playerToGame.delete(ws);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`WolfHunt server running on port ${PORT}`));
