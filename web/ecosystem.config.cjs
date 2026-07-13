module.exports = {
  apps: [
    {
      name: 'tracker-frontend',
      script: 'server.cjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 5050
      }
    }
  ]
};
