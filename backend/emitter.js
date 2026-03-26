// Simple in-process SSE broadcaster
// Routes call emit() after any write; server.js registers the /api/events endpoint.

const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function emit(event = 'change') {
  const msg = `event: ${event}\ndata: ${Date.now()}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch (_) { clients.delete(res); }
  }
}

module.exports = { addClient, removeClient, emit };
