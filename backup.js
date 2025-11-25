// backup.js - Auto backup SQLite DB for NexbitService
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'nexbit.sqlite3');

(async () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      console.error('[Backup] data folder not found.');
      process.exit(1);
    }

    if (!fs.existsSync(DB_PATH)) {
      console.error('[Backup] Database file not found:', DB_PATH);
      process.exit(1);
    }

    const BACKUP_DIR = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.sqlite3`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`[Backup] OK: ${backupName}`);

  } catch (err) {
    console.error('[Backup] Error:', err);
  }
})();
