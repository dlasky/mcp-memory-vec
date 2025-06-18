// Jest setup file
import { existsSync, unlinkSync } from 'fs';

// Clean up test databases after each test
afterEach(() => {
  const testDbFiles = ['./test-memory.db', './test-memory.db-wal', './test-memory.db-shm'];
  testDbFiles.forEach(file => {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  });
  
  // Clean up any test databases with timestamps
  const fs = require('fs');
  const files = fs.readdirSync('.');
  files.filter((f: string) => f.startsWith('test-') && f.endsWith('.db')).forEach((f: string) => {
    try {
      fs.unlinkSync(f);
      fs.unlinkSync(f + '-wal');
      fs.unlinkSync(f + '-shm');
    } catch (e) {
      // Ignore cleanup errors
    }
  });
});