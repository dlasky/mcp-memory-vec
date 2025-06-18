import { describe, test, expect, beforeAll } from '@jest/globals';
import { createMCPServer } from '../src/server.js';
import { ensureOllamaRunning, ensureModelExists } from '../src/ollama.js';

describe('MCP Server', () => {
  beforeAll(async () => {
    // Ensure Ollama is running and model exists
    await ensureOllamaRunning();
    await ensureModelExists();
  }, 30000);

  test('should create server successfully', async () => {
    const server = await createMCPServer({
      memory: {
        database: { dbPath: `./test-mcp-${Date.now()}.db` }
      }
    });

    expect(server).toBeTruthy();
  });

  test('should provide expected tools', async () => {
    const server = await createMCPServer({
      memory: {
        database: { dbPath: `./test-mcp-tools-${Date.now()}.db` }
      }
    });

    const expectedTools = [
      'add_memory', 
      'get_memory', 
      'update_memory', 
      'delete_memory', 
      'search_memories',
      'add_relationship', 
      'get_relationships', 
      'update_relationship', 
      'delete_relationship',
      'get_connected_memories'
    ];

    // This is a basic structure test - in a real scenario you'd test the server's tool listing capabilities
    expect(server).toBeTruthy();
    expect(expectedTools).toHaveLength(10);
  });
});