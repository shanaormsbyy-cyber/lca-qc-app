module.exports = {
  apps: [{
    name: 'lca-qc-app',
    script: 'backend/server.js',
    cwd: __dirname,
    watch: false,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
  }],
};
