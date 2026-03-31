# ⛓ BlockChain Coin Collector — M.Tech Seminar Demo

Real-time 2D coin collection game proving:
- **Decentralized sync** via GUN.js peer-to-peer
- **Tamper-proof ledger** via SHA-256 chained blocks

---

## Setup (3 steps)

### 1. Copy game files into your project
```
public/game.html   ← main game page
public/game.js     ← game logic + blockchain + GUN sync
public/game.css    ← professional dark UI
```

### 2. Add /game route to your server.js
Open your existing `server.js` and add ONE line inside your routes:
```js
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});
```
See `server-patch.js` for the exact placement.

### 3. Run
```bash
npm start
# Open → http://localhost:3000/game
```

---

## Seminar Demo Script

| Step | Action | Shows |
|------|--------|-------|
| 1 | Open `/game` in two browser tabs | Two independent players |
| 2 | Start game, collect coins | Score updates in real-time in both tabs via GUN |
| 3 | Watch Blockchain Ledger panel | Every coin event creates a signed block |
| 4 | Click **Verify Integrity** | All blocks go green — SHA-256 chain valid |
| 5 | Click **Simulate Tamper** | Middle block score is altered (no hash update) |
| 6 | Click **Verify Integrity** again | Red warning, corrupted block highlighted |

---

## Architecture

```
Browser A                    GUN Relay (your server.js)       Browser B
─────────                    ──────────────────────────       ─────────
Collect coin                         │                        Watching
  → SHA-256 hash new block           │                          ↓
  → gunScores.put(score)  ──────────►│◄────────────── gunScores.map().on()
  → gunEvents.put(block)             │                     score updates
  → Local blockchain[]               │                        live
```

---

## Blockchain Block Structure

```json
{
  "index": 3,
  "timestamp": 1718000000000,
  "player": "player_AB12C",
  "event": "COIN_COLLECTED",
  "prevScore": 20,
  "newScore": 30,
  "posX": 284,
  "posY": 195,
  "previousHash": "a1b2c3d4e5f6...",
  "hash": "7g8h9i0j1k2l..."
}
```

Hash = SHA-256(`index|timestamp|player|event|prevScore|newScore|posX|posY|previousHash`)

Tampering any field → hash mismatch → **TAMPERING DETECTED** 🔴

---

## Viva Q&A Cheat Sheet

**Q: How is this decentralized?**  
A: GUN syncs peer-to-peer without a central database. The relay server is just a message broker — any peer can relay.

**Q: How does tamper detection work?**  
A: Each block's hash includes its data AND the previous block's hash. Changing any value breaks the chain — just like Bitcoin.

**Q: What hashing algorithm?**  
A: SHA-256 via the browser's native `crypto.subtle` API — no external library.

**Q: Is this the same as blockchain in industry?**  
A: Same cryptographic principle (Merkle chain of hashes). This demo adds GUN for the real-time P2P sync layer.
