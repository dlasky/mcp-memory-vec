# Vec Memory MCP Server

An MCP (Model Context Protocol) server that provides graph-based semantic memory using SQLite vec0 and Ollama embeddings.

## Features

- **Semantic Search**: Vector-based similarity search using embeddings
- **Graph Relationships**: Create and traverse relationships between memories
- **Flexible Transport**: Support for both stdio and SSE (HTTP) transports
- **Flexible Storage**: SQLite with vec0 extension for efficient vector operations
- **MCP Integration**: Standard MCP server for easy integration

## Prerequisites

- **Node.js 18+**
- **Ollama**: Install from [ollama.ai](https://ollama.ai/download) or:
  - macOS: `brew install ollama`
  - Linux: `curl -fsSL https://ollama.ai/install.sh | sh`
  - Windows: Download from [ollama.ai/download](https://ollama.ai/download)

## Installation

```bash
npm install
npm run build
```

## Usage

Start the MCP server with stdio transport (default):

```bash
npm start
# or
npm run dev
```

Start with SSE transport for HTTP clients:

```bash
npm run build && node dist/index.js --sse
# or custom port
npm run build && node dist/index.js --sse --port 8080
```

Run `npm run build && node dist/index.js --help` for all options.

## Environment Variables

- `MEMORY_DB_PATH`: Path to SQLite database (default: `./memory.db`)
- `OLLAMA_BASE_URL`: Ollama API URL (default: `http://localhost:11434`)
- `OLLAMA_MODEL`: Embedding model to use (default: `nomic-embed-text`)

## MCP Tools

### Memory Operations
- `add_memory`: Store content with semantic embedding
- `get_memory`: Retrieve memory by ID
- `update_memory`: Update memory content or metadata
- `delete_memory`: Remove a memory
- `search_memories`: Semantic search across memories

### Relationship Operations
- `add_relationship`: Create relationships between memories
- `get_relationships`: Query relationships with filtering
- `update_relationship`: Modify relationship strength or metadata
- `delete_relationship`: Remove a relationship
- `get_connected_memories`: Find memories connected through relationships

## Architecture

- `src/ollama.ts`: Ollama management and embedding generation
- `src/database.ts`: SQLite database schema and vec0 integration
- `src/memory.ts`: Core memory operations and graph traversal
- `src/server.ts`: MCP server implementation
- `src/index.ts`: Entry point and configuration

## Requirements

- Node.js 18+
- SQLite with vec0 extension (automatically checked)
- Ollama (must be installed separately)