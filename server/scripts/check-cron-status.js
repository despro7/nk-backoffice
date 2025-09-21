#!/usr/bin/env node

// Скрипт для проверки статуса cron-задач
import { cronService } from '../services/cronService.js';

console.log('🔍 Checking cron service status...');

const status = cronService.getStatus();

console.log('📊 Cron Service Status:');
console.log(`   - Has Sync Job: ${status.hasSyncJob}`);
console.log(`   - Is Running: ${status.isRunning}`);

if (status.hasSyncJob) {
  console.log('✅ Cron tasks are active');
} else {
  console.log('❌ No cron tasks running');
}

process.exit(0);
