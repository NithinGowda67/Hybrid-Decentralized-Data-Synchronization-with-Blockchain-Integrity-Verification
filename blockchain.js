const crypto = require('crypto');

class Block {
  constructor(index, timestamp, dataHash, previousHash = '') {
    this.index = index;
    this.timestamp = timestamp;
    this.dataHash = dataHash;
    this.previousHash = previousHash;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return crypto
      .createHash('sha256')
      .update(this.index + this.timestamp + this.dataHash + this.previousHash)
      .digest('hex');
  }
}

class Blockchain {

  constructor() {
    this.chain = [this.createGenesisBlock()];
  }

  createGenesisBlock() {
    return new Block(0, Date.now(), "Genesis", "0");
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addBlock(dataHash) {

    const newBlock = new Block(
      this.chain.length,
      Date.now(),
      dataHash,
      this.getLatestBlock().hash
    );

    this.chain.push(newBlock);

    console.log("New Block Added:", newBlock);
  }

  // ✅ Tamper Detection Function
  isChainValid() {

    for(let i = 1; i < this.chain.length; i++) {

      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if(currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }

      if(currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }

    }

    return true;
  }

}

module.exports = Blockchain;