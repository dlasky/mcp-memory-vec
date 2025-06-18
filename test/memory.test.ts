import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { ensureOllamaRunning, ensureModelExists, generateEmbedding } from '../src/ollama.js';
import { 
  initializeMemory, 
  addMemory, 
  getMemory, 
  searchMemories, 
  addRelationship, 
  getRelationships, 
  getConnectedMemories 
} from '../src/memory.js';

describe('Vec Memory MCP', () => {
  beforeAll(async () => {
    // Ensure Ollama is running and model exists
    await ensureOllamaRunning();
    await ensureModelExists();
  }, 30000);

  beforeEach(() => {
    // Initialize with unique test database for each test
    initializeMemory({
      database: { dbPath: `./test-memory-${Date.now()}.db` }
    });
  });

  describe('Ollama Integration', () => {
    test('should generate embeddings', async () => {
      const embedding = await generateEmbedding('test sentence');
      expect(embedding).toHaveLength(768);
      expect(Array.isArray(embedding)).toBe(true);
      expect(typeof embedding[0]).toBe('number');
    });
  });

  describe('Memory Operations', () => {
    test('should add and retrieve memories', async () => {
      const memoryId = await addMemory('The capital of France is Paris', { type: 'fact' });
      expect(memoryId).toBeTruthy();
      expect(typeof memoryId).toBe('string');

      const memory = getMemory(memoryId);
      expect(memory).toBeTruthy();
      expect(memory!.content).toBe('The capital of France is Paris');
      expect(memory!.metadata.type).toBe('fact');
    });

    test('should return null for non-existent memory', () => {
      const memory = getMemory('non-existent-id');
      expect(memory).toBeNull();
    });

    test('should perform semantic search', async () => {
      await addMemory('The capital of France is Paris', { type: 'fact' });
      await addMemory('Paris is a beautiful city with the Eiffel Tower', { type: 'description' });
      await addMemory('The Eiffel Tower was built in 1889', { type: 'fact' });

      const results = await searchMemories('What is the capital of France?', { limit: 2 });
      expect(results).toHaveLength(2);
      expect(results[0].content).toContain('Paris');
    });

    test('should fallback to text search when vector search fails', async () => {
      await addMemory('Simple text without embeddings', { type: 'test' });
      
      const results = await searchMemories('Simple text', { limit: 1 });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Simple text without embeddings');
    });
  });

  describe('Relationships', () => {
    let memory1Id: string;
    let memory2Id: string;
    let memory3Id: string;

    beforeEach(async () => {
      memory1Id = await addMemory('The capital of France is Paris', { type: 'fact' });
      memory2Id = await addMemory('Paris is a beautiful city with the Eiffel Tower', { type: 'description' });
      memory3Id = await addMemory('The Eiffel Tower was built in 1889', { type: 'fact' });
    });

    test('should add and retrieve relationships', () => {
      const relationshipId = addRelationship(memory1Id, memory2Id, 'relates_to', 0.8);
      expect(relationshipId).toBeTruthy();
      expect(typeof relationshipId).toBe('string');

      const relationships = getRelationships({ memoryId: memory1Id });
      expect(relationships).toHaveLength(1);
      expect(relationships[0].from_memory_id).toBe(memory1Id);
      expect(relationships[0].to_memory_id).toBe(memory2Id);
      expect(relationships[0].relationship_type).toBe('relates_to');
      expect(relationships[0].strength).toBe(0.8);
    });

    test('should find connected memories', () => {
      addRelationship(memory1Id, memory2Id, 'relates_to', 0.8);
      addRelationship(memory2Id, memory3Id, 'contains', 0.9);

      const connected = getConnectedMemories(memory1Id);
      expect(connected).toHaveLength(2);
      
      const connectedIds = connected.map(m => m.id);
      expect(connectedIds).toContain(memory2Id);
      expect(connectedIds).toContain(memory3Id);
    });

    test('should filter relationships by type', () => {
      addRelationship(memory1Id, memory2Id, 'relates_to', 0.8);
      addRelationship(memory1Id, memory3Id, 'different_type', 0.5);

      const relationships = getRelationships({ 
        memoryId: memory1Id, 
        relationshipType: 'relates_to' 
      });
      expect(relationships).toHaveLength(1);
      expect(relationships[0].relationship_type).toBe('relates_to');
    });

    test('should filter relationships by minimum strength', () => {
      addRelationship(memory1Id, memory2Id, 'weak', 0.3);
      addRelationship(memory1Id, memory3Id, 'strong', 0.9);

      const relationships = getRelationships({ 
        memoryId: memory1Id, 
        minStrength: 0.5 
      });
      expect(relationships).toHaveLength(1);
      expect(relationships[0].strength).toBe(0.9);
    });
  });
});