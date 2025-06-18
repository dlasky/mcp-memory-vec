# Manual Testing Guide

## Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

## Automated Tests

Run the comprehensive test suite:
```bash
npm test
```

This will test:
- Ollama installation and setup
- Memory operations (add, get, search)
- Relationship management
- MCP server creation

## Manual MCP Server Testing

### 1. Start the MCP Server

```bash
npm start
```

The server will:
- Auto-install Ollama if needed
- Pull the embedding model
- Initialize the SQLite database with vec0
- Start listening on stdio

### 2. Test with MCP Client

You can test the server using any MCP client. Here's an example using the MCP SDK:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js']
});

const client = new Client({
  name: 'test-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log('Available tools:', tools);

// Add a memory
const result = await client.callTool({
  name: 'add_memory',
  arguments: {
    content: 'The Eiffel Tower is in Paris',
    metadata: { type: 'fact' }
  }
});
```

### 3. Test Individual Components

#### Test Ollama Setup
```bash
tsx -e "
import { ensureOllamaRunning, ensureModelExists, generateEmbedding } from './src/ollama.js';
await ensureOllamaRunning();
await ensureModelExists();
const embedding = await generateEmbedding('test');
console.log('Embedding dimensions:', embedding.length);
"
```

#### Test Database & Vector Search
```bash
tsx -e "
import { initializeDatabase } from './src/database.js';
const db = initializeDatabase({ dbPath: './test.db' });
console.log('Database initialized');
"
```

#### Test Memory Operations
```bash
tsx -e "
import { initializeMemory, addMemory, searchMemories } from './src/memory.js';
initializeMemory({ database: { dbPath: './test.db' } });
const id = await addMemory('Paris is the capital of France');
const results = await searchMemories('capital France');
console.log('Search results:', results.length);
"
```

## Environment Variables for Testing

Set these to customize test behavior:

```bash
export MEMORY_DB_PATH=./test-memory.db
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=nomic-embed-text
```

## Expected Outputs

### Successful Test Run
```
🚀 Starting Vec Memory MCP Tests

🔄 Testing Ollama setup...
✅ Ollama is running
✅ Embedding model is available
✅ Generated embedding with 768 dimensions

🔄 Testing memory operations...
✅ Memory system initialized
✅ Added 3 memories
✅ Retrieved memory: "The capital of France is Paris"
✅ Search found 2 results
✅ Added relationships
✅ Found 2 relationships for memory2
✅ Found 2 connected memories

🔄 Testing MCP server...
✅ MCP server created successfully
✅ Server provides 10 tools

📊 Test Results:
   Ollama: ✅ PASS
   Memory: ✅ PASS
   MCP:    ✅ PASS

🎯 Overall: ✅ ALL TESTS PASSED
```

## Troubleshooting

### Ollama Issues
- **"Ollama not found"**: The test will auto-install Ollama
- **"Model not found"**: The test will auto-pull the embedding model
- **"Connection refused"**: Check if Ollama is running on port 11434

### SQLite Issues
- **"vec0 not found"**: Should auto-load via sqlite-vec npm package
- **"Database locked"**: Ensure no other processes are using the test database

### Permission Issues
- **"Permission denied"**: Make sure the current directory is writable
- **"Command not found"**: Ensure Node.js and npm are installed