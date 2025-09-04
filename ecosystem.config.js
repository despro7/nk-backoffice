module.exports = {
	apps: [{
	  name: 'nk-backoffice',
	  script: 'dist/server/production.mjs',
	  instances: 1,
	  autorestart: true,
	  watch: false,
	  max_memory_restart: '1G',
	  env: {
		NODE_ENV: 'production',
		PORT: 3001
	  },
	  env_production: {
		NODE_ENV: 'production',
		PORT: 3001
	  },
	  error_log: './logs/app-error.log',
	  out_log: './logs/app-out.log',
	  log_log: './logs/app-combined.log',
	  time: true,
	  merge_logs: true,
	  log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
	}]
  };