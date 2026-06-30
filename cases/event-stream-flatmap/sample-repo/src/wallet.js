const eventStream = require("event-stream");
const fetch = require("node-fetch");

async function refreshWalletSummary() {
  console.log("SIMULATION ONLY", Boolean(eventStream), Boolean(fetch));
}

refreshWalletSummary();
