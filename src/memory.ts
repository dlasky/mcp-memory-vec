import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { generateEmbedding, OllamaConfig } from './ollama.js';
import { 
  initializeDatabase, 
  Memory, 
  Relationship, 
  DatabaseConfig
} from './database.js';

export interface VectorMemoryConfig {
  database?: DatabaseConfig;
  ollama?: OllamaConfig;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  includeEmbeddings?: boolean;
}

export interface RelationshipQuery {
  memoryId?: string;
  relationshipType?: string;
  direction?: 'from' | 'to' | 'both';
  minStrength?: number;
  limit?: number;
}

let db: Database.Database;
let ollamaConfig: OllamaConfig;

export function initializeMemory(config: VectorMemoryConfig = {}): void {
  db = initializeDatabase(config.database);
  ollamaConfig = config.ollama || {};
}

export function addMemory(content: string, metadata: Record<string, any> = {}): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const id = randomUUID();
      const now = new Date().toISOString();
      
      const embedding = await generateEmbedding(content, ollamaConfig);
      
      const insertMemory = db.prepare(`
        INSERT INTO memories (id, content, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      insertMemory.run(
        id, 
        content, 
        JSON.stringify(metadata), 
        now, 
        now
      );
      
      try {
        const insertEmbedding = db.prepare(`
          INSERT INTO memory_embeddings (id, embedding)
          VALUES (?, ?)
        `);
        const embeddingBuffer = new Float32Array(embedding);
        insertEmbedding.run(id, Buffer.from(embeddingBuffer.buffer));
      } catch {
        // Vector table insert failed - vector search will not be available for this memory
      }
      
      resolve(id);
    } catch (error) {
      reject(error);
    }
  });
}

export function getMemory(id: string): Memory | null {
  const stmt = db.prepare(`
    SELECT id, content, metadata, created_at, updated_at
    FROM memories 
    WHERE id = ?
  `);
  
  const row = stmt.get(id) as any;
  if (!row) return null;
  
  return {
    id: row.id,
    content: row.content,
    metadata: JSON.parse(row.metadata || '{}'),
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at)
  };
}

export function updateMemory(id: string, content?: string, metadata?: Record<string, any>): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    try {
      const memory = getMemory(id);
      if (!memory) {
        resolve(false);
        return;
      }
      
      const updates: string[] = [];
      const values: any[] = [];
      
      if (content !== undefined) {
        updates.push('content = ?');
        values.push(content);
        
        const embedding = await generateEmbedding(content, ollamaConfig);
        try {
          const updateEmbedding = db.prepare(`
            UPDATE memory_embeddings SET embedding = ? WHERE id = ?
          `);
          const embeddingBuffer = new Float32Array(embedding);
          updateEmbedding.run(Buffer.from(embeddingBuffer.buffer), id);
        } catch {
          // Vector table update failed - vector search may be stale for this memory
        }
      }
      
      if (metadata !== undefined) {
        updates.push('metadata = ?');
        values.push(JSON.stringify(metadata));
      }
      
      if (updates.length === 0) {
        resolve(true);
        return;
      }
      
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      
      const stmt = db.prepare(`
        UPDATE memories 
        SET ${updates.join(', ')}
        WHERE id = ?
      `);
      
      const result = stmt.run(...values);
      resolve(result.changes > 0);
    } catch (error) {
      reject(error);
    }
  });
}

export function deleteMemory(id: string): boolean {
  const stmt = db.prepare('DELETE FROM memories WHERE id = ?');
  const result = stmt.run(id);
  
  try {
    const deleteEmbedding = db.prepare('DELETE FROM memory_embeddings WHERE id = ?');
    deleteEmbedding.run(id);
  } catch {
    // Vector table delete failed - stale embedding may remain
  }
  
  return result.changes > 0;
}

export function searchMemories(query: string, options: SearchOptions = {}): Promise<Memory[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const { limit = 10, threshold = 0.5 } = options;
      
      try {
        const queryEmbedding = await generateEmbedding(query, ollamaConfig);
        const queryBuffer = new Float32Array(queryEmbedding);
        
        const stmt = db.prepare(`
          SELECT m.id, m.content, m.metadata, m.created_at, m.updated_at,
                 vec_distance_cosine(v.embedding, ?) as distance
          FROM memories m
          JOIN memory_embeddings v ON m.id = v.id
          WHERE vec_distance_cosine(v.embedding, ?) < ?
          ORDER BY distance ASC
          LIMIT ?
        `);
        
        const rows = stmt.all(Buffer.from(queryBuffer.buffer), Buffer.from(queryBuffer.buffer), 1 - threshold, limit) as any[];
        
        const memories = rows.map(row => ({
          id: row.id,
          content: row.content,
          metadata: JSON.parse(row.metadata || '{}'),
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at)
        }));
        
        resolve(memories);
      } catch (vectorError) {
        
        const stmt = db.prepare(`
          SELECT id, content, metadata, created_at, updated_at
          FROM memories
          WHERE content LIKE ?
          ORDER BY created_at DESC
          LIMIT ?
        `);
        
        const rows = stmt.all(`%${query}%`, limit) as any[];
        
        const memories = rows.map(row => ({
          id: row.id,
          content: row.content,
          metadata: JSON.parse(row.metadata || '{}'),
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at)
        }));
        
        resolve(memories);
      }
    } catch (error) {
      reject(error);
    }
  });
}

export function addRelationship(
  fromMemoryId: string, 
  toMemoryId: string, 
  relationshipType: string, 
  strength: number = 1.0,
  metadata: Record<string, any> = {}
): string {
  const id = randomUUID();
  
  const stmt = db.prepare(`
    INSERT INTO relationships (id, from_memory_id, to_memory_id, relationship_type, strength, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, fromMemoryId, toMemoryId, relationshipType, strength, JSON.stringify(metadata));
  return id;
}

export function getRelationships(query: RelationshipQuery = {}): Relationship[] {
  const { memoryId, relationshipType, direction = 'both', minStrength = 0, limit = 100 } = query;
  
  let whereClause = 'WHERE strength >= ?';
  const params: any[] = [minStrength];
  
  if (memoryId) {
    if (direction === 'from') {
      whereClause += ' AND from_memory_id = ?';
      params.push(memoryId);
    } else if (direction === 'to') {
      whereClause += ' AND to_memory_id = ?';
      params.push(memoryId);
    } else {
      whereClause += ' AND (from_memory_id = ? OR to_memory_id = ?)';
      params.push(memoryId, memoryId);
    }
  }
  
  if (relationshipType) {
    whereClause += ' AND relationship_type = ?';
    params.push(relationshipType);
  }
  
  params.push(limit);
  
  const stmt = db.prepare(`
    SELECT id, from_memory_id, to_memory_id, relationship_type, strength, metadata, created_at
    FROM relationships
    ${whereClause}
    ORDER BY strength DESC, created_at DESC
    LIMIT ?
  `);
  
  const rows = stmt.all(...params) as any[];
  
  return rows.map(row => ({
    id: row.id,
    from_memory_id: row.from_memory_id,
    to_memory_id: row.to_memory_id,
    relationship_type: row.relationship_type,
    strength: row.strength,
    metadata: JSON.parse(row.metadata || '{}'),
    created_at: new Date(row.created_at)
  }));
}

export function updateRelationship(id: string, strength?: number, metadata?: Record<string, any>): boolean {
  const updates: string[] = [];
  const values: any[] = [];
  
  if (strength !== undefined) {
    updates.push('strength = ?');
    values.push(strength);
  }
  
  if (metadata !== undefined) {
    updates.push('metadata = ?');
    values.push(JSON.stringify(metadata));
  }
  
  if (updates.length === 0) return true;
  
  values.push(id);
  
  const stmt = db.prepare(`
    UPDATE relationships 
    SET ${updates.join(', ')}
    WHERE id = ?
  `);
  
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteRelationship(id: string): boolean {
  const stmt = db.prepare('DELETE FROM relationships WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getConnectedMemories(memoryId: string, maxDepth: number = 2): Memory[] {
  const visited = new Set<string>([memoryId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: memoryId, depth: 0 }];
  const connectedIds = new Set<string>();
  
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    
    if (depth >= maxDepth) continue;
    
    const relationships = getRelationships({ memoryId: id });
    
    for (const rel of relationships) {
      const nextId = rel.from_memory_id === id ? rel.to_memory_id : rel.from_memory_id;
      
      if (!visited.has(nextId)) {
        visited.add(nextId);
        connectedIds.add(nextId);
        queue.push({ id: nextId, depth: depth + 1 });
      }
    }
  }
  
  return Array.from(connectedIds)
    .map(id => getMemory(id))
    .filter((memory): memory is Memory => memory !== null);
}