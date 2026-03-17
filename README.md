# 🐺 WEREWOLF HUNT — Multiplayer Horror Game

## Quick Start

```bash
npm install
npm start
```
Then open `http://localhost:3000` on any device on your network.

## For Mobile
1. Run on your PC/laptop
2. Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
3. Open `http://YOUR_IP:3000` on any phone on the same WiFi

## How to Play
- **Create Room** — host creates a room and shares the 4-letter code
- **Join Room** — friends enter the code to join
- **Host presses "Begin The Hunt"** when ready (min 2 players, max 6)

### Roles
- **🐺 Werewolf** (first player to join) — Hunt all hiders before time runs out
  - Use the **SCAN** button to detect hiders within 240px (10s cooldown)
  - In darkness: your vision radius is large
- **🏃 Hiders** — Survive until the 2-minute timer expires
  - Blue circles on the map = hiding spots (walk near and press **HIDE HERE**)
  - In darkness: stay away from the werewolf — your vision is tiny
  
### Phases
- **First 20 seconds**: Full light — find good hiding spots fast!
- **After 20 seconds**: Total darkness — only the werewolf can see well

## Controls
| Platform | Move | Scan (Wolf) | Hide (Hider) |
|----------|------|-------------|--------------|
| Mobile | Left joystick | SCAN button | HIDE HERE button |
| Desktop | WASD / Arrow keys | Space | H key |

## Hiding Spots (21 total)
- Great Hall: Under tables, behind pillars
- Library: Behind shelves, under desk
- Armory: Behind barrels, inside crates
- Barracks: Under beds (×4)
- Crypt: Behind sarcophagi (×3), behind altar
- Courtyard: Behind pillars (×2), behind fountain
- Dungeon: Behind barrels, inside crate
- Gardens: Behind trees (×4), in bushes

## Deploy to Production (Render.com / Railway)
1. Push to GitHub
2. Connect to Render.com → New Web Service
3. Start command: `npm start`
4. Done — share the URL with anyone worldwide!
