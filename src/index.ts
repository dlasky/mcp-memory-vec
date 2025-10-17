#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runMCPServer } from './server.js';
import { homedir } from 'os';
import { join } from 'path';

const config = {
  name: 'vec-memory-mcp',
  version: '1.0.0',
  memory: {
    database: {
      dbPath: process.env.MEMORY_DB_PATH || join(homedir(), '.vec-memory-mcp.db'),
      enableWAL: true
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'nomic-embed-text'
    }
  }
};

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('sse', {
      type: 'boolean',
      default: false,
      description: 'Use SSE transport instead of stdio'
    })
    .option('port', {
      type: 'number',
      default: 3000,
      description: 'Port for SSE transport'
    })
    .help()
    .parse();

  const serverConfig = {
    ...config,
    transport: {
      type: argv.sse ? 'sse' as const : 'stdio' as const,
      port: argv.port
    }
  };

  try {
    await runMCPServer(serverConfig);
  } catch (error) {
    process.exit(1);
  }
}

main();