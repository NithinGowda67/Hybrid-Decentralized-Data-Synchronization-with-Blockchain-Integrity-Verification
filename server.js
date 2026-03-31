const express = require('express');
const path    = require('path');
const Gun     = require('gun');
const crypto  = require('crypto');
const Blockchain = require('./blockchain');

const app = express();
const blockchain = new Blockchain();

/* -------------------------
   Node configuration
------------------------- */

const PORT    = process.env.PORT || 8765;
const NODE_ID = process.env.NODE_ID || "NODE_1";

console.log("Starting node:", NODE_ID);

/* -------------------------
   Metrics
------------------------- */

let startTime = 0;

/* -------------------------
   Static files
------------------------- */

app.use(express.static(path.join(__dirname, 'public')));

/* -------------------------
   Server
------------------------- */

const server = app.listen(PORT, () => {
  console.log(`\n  ⛓  Blockchain Coin Collector ready!`);
  console.log(`  🌐  Main app : http://localhost:${PORT}`);
  console.log(`  🎮  Game     : http://localhost:${PORT}/game\n`);
});

/* -------------------------
   GUN Database
------------------------- */

const gun = Gun({
  web: server,
  multicast: false
});

const notes = gun.get("notes");

/* -------------------------
   Blockchain Integration
------------------------- */

notes.map().on((note) => {

  if (!note || !note.text) return;

  startTime = Date.now();

  const hash = crypto
    .createHash('sha256')
    .update(note.text)
    .digest('hex');

  blockchain.addBlock(hash);

  const valid = blockchain.isChainValid();

  if (valid) {
    console.log(`✔ ${NODE_ID} Blockchain Verified`);
  } else {
    console.log(`⚠ ${NODE_ID} Data Tampering Detected!`);
  }

  const endTime = Date.now();
  console.log("Sync + Blockchain Time:", endTime - startTime, "ms");

});


/* -------------------------
   Blockchain Explorer API
------------------------- */

app.get('/blocks', (req, res) => {
  res.json({
    node: NODE_ID,
    chain: blockchain.chain
  });
});


/* -------------------------
   Game Route  ← ADDED
------------------------- */

app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});


/* -------------------------
   Tamper Simulation
------------------------- */

app.get('/tamper', (req, res) => {

  if (blockchain.chain.length > 1) {
    blockchain.chain[1].dataHash = "HACKED_DATA";
    console.log("⚠ Block manually tampered!");
  }

  const valid = blockchain.isChainValid();

  if (valid) {
    console.log("✔ Blockchain Verified");
  } else {
    console.log("⚠ Data Tampering Detected!");
  }

  res.send("Tamper simulation executed. Check terminal.");

});
