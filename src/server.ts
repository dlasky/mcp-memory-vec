import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from 'http';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import {
  initializeMemory,
  addMemory,
  getMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
  addRelationship,
  getRelationships,
  updateRelationship,
  deleteRelationship,
  getConnectedMemories,
  VectorMemoryConfig
} from './memory.js';

import { ensureOllamaRunning, ensureModelExists } from './ollama.js';

export interface MCPServerConfig {
  name?: string;
  version?: string;
  memory?: VectorMemoryConfig;
  transport?: {
    type: 'stdio' | 'sse';
    port?: number;
  };
}

const DEFAULT_CONFIG: Required<Omit<MCPServerConfig, 'memory'>> = {
  name: 'vec-memory-server',
  version: '1.0.0',
  transport: {
    type: 'stdio',
    port: 3000
  }
};

const TOOLS: Tool[] = [
  {
    name: 'add_memory',
    description: 'Add a new memory with semantic embedding',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The content to store' },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['content']
    }
  },
  {
    name: 'get_memory',
    description: 'Retrieve a memory by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'update_memory',
    description: 'Update memory content or metadata',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID' },
        content: { type: 'string', description: 'New content' },
        metadata: { type: 'object', description: 'New metadata' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_memory',
    description: 'Delete a memory',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Memory ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'search_memories',
    description: 'Search memories using semantic similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results', default: 10 },
        threshold: { type: 'number', description: 'Similarity threshold 0-1', default: 0.5 }
      },
      required: ['query']
    }
  },
  {
    name: 'add_relationship',
    description: 'Add a relationship between two memories',
    inputSchema: {
      type: 'object',
      properties: {
        fromMemoryId: { type: 'string', description: 'Source memory ID' },
        toMemoryId: { type: 'string', description: 'Target memory ID' },
        relationshipType: { type: 'string', description: 'Type of relationship' },
        strength: { type: 'number', description: 'Relationship strength 0-1', default: 1.0 },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['fromMemoryId', 'toMemoryId', 'relationshipType']
    }
  },
  {
    name: 'get_relationships',
    description: 'Get relationships with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: { type: 'string', description: 'Filter by memory ID' },
        relationshipType: { type: 'string', description: 'Filter by relationship type' },
        direction: { 
          type: 'string', 
          enum: ['from', 'to', 'both'],
          description: 'Relationship direction',
          default: 'both'
        },
        minStrength: { type: 'number', description: 'Minimum strength', default: 0 },
        limit: { type: 'number', description: 'Maximum results', default: 100 }
      }
    }
  },
  {
    name: 'update_relationship',
    description: 'Update relationship strength or metadata',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Relationship ID' },
        strength: { type: 'number', description: 'New strength' },
        metadata: { type: 'object', description: 'New metadata' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_relationship',
    description: 'Delete a relationship',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Relationship ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_connected_memories',
    description: 'Get memories connected to a given memory through relationships',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: { type: 'string', description: 'Starting memory ID' },
        maxDepth: { type: 'number', description: 'Maximum connection depth', default: 2 }
      },
      required: ['memoryId']
    }
  }
];

export async function createMCPServer(config: MCPServerConfig = {}): Promise<Server> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  
  try {
    await ensureOllamaRunning(config.memory?.ollama);
    await ensureModelExists(config.memory?.ollama);
  } catch (error) {
    console.error('Failed to initialize Ollama:', error);
    throw error;
  }
  
  try {
    initializeMemory(config.memory);
  } catch (error) {
    console.error('Failed to initialize memory database:', error);
    throw error;
  }
  
  const server = new Server(
    {
      name: fullConfig.name,
      version: fullConfig.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );
  
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));
  
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      switch (name) {
        case 'add_memory': {
          const id = await addMemory(args?.content as string, (args?.metadata as Record<string, any>) || {});
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ id, success: true })
              }
            ]
          };
        }
        
        case 'get_memory': {
          const memory = getMemory(args?.id as string);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(memory ? { memory, success: true } : { success: false, error: 'Memory not found' })
              }
            ]
          };
        }
        
        case 'update_memory': {
          const success = await updateMemory(args?.id as string, args?.content as string, args?.metadata as Record<string, any>);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success })
              }
            ]
          };
        }
        
        case 'delete_memory': {
          const success = deleteMemory(args?.id as string);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success })
              }
            ]
          };
        }
        
        case 'search_memories': {
          const memories = await searchMemories(args?.query as string, {
            limit: args?.limit as number,
            threshold: args?.threshold as number
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ memories, success: true })
              }
            ]
          };
        }
        
        case 'add_relationship': {
          const id = addRelationship(
            args?.fromMemoryId as string,
            args?.toMemoryId as string,
            args?.relationshipType as string,
            args?.strength as number,
            (args?.metadata as Record<string, any>) || {}
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ id, success: true })
              }
            ]
          };
        }
        
        case 'get_relationships': {
          const relationships = getRelationships({
            memoryId: args?.memoryId as string,
            relationshipType: args?.relationshipType as string,
            direction: args?.direction as 'from' | 'to' | 'both',
            minStrength: args?.minStrength as number,
            limit: args?.limit as number
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ relationships, success: true })
              }
            ]
          };
        }
        
        case 'update_relationship': {
          const success = updateRelationship(args?.id as string, args?.strength as number, args?.metadata as Record<string, any>);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success })
              }
            ]
          };
        }
        
        case 'delete_relationship': {
          const success = deleteRelationship(args?.id as string);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success })
              }
            ]
          };
        }
        
        case 'get_connected_memories': {
          const memories = getConnectedMemories(args?.memoryId as string, args?.maxDepth as number);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ memories, success: true })
              }
            ]
          };
        }
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ 
              success: false, 
              error: error instanceof Error ? error.message : String(error)
            })
          }
        ],
        isError: true
      };
    }
  });
  
  return server;
}

export async function runMCPServer(config: MCPServerConfig = {}): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const server = await createMCPServer(config);
  
  if (fullConfig.transport.type === 'sse') {
    const httpServer = createServer();
    const port = fullConfig.transport.port!;
    
    httpServer.on('request', async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      
      if (req.method === 'GET' && url.pathname === '/sse') {
        const transport = new SSEServerTransport('/message', res);
        await server.connect(transport);
        await transport.start();
      } else if (req.method === 'POST' && url.pathname === '/message') {
        // Find the transport for this session - for now we'll handle single session
        // In production, you'd need session management
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"success": true}');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    httpServer.listen(port, () => {
      console.log(`MCP Server running on http://localhost:${port}/sse`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}