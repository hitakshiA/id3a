// PM2 process file. Single Node process — the render queue is in-memory,
// so cluster mode would break it.
module.exports = {
  apps: [
    {
      name: 'id3a-api',
      script: 'src/index.js',
      cwd: '/var/www/id3a/server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
      },
      out_file: '/var/log/id3a/out.log',
      error_file: '/var/log/id3a/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
