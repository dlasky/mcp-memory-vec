import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export interface Memory {
  id: string;
  content: string;
  embedding?: Float32Array;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface Relationship {
  id: string;
  from_memory_id: string;
  to_memory_id: string;
  relationship_type: string;
  strength: number;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface DatabaseConfig {
  dbPath?: string;
  enableWAL?: boolean;
}

const DEFAULT_CONFIG: Required<DatabaseConfig> = {
  dbPath: './memory.db',
  enableWAL: true
};

export function initializeDatabase(config: DatabaseConfig = {}): Database.Database {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const db = new Database(fullConfig.dbPath);
  
  if (fullConfig.enableWAL) {
    db.pragma('journal_mode = WAL');
  }
  
  try {
    sqliteVec.load(db);
  } catch {
    // sqlite-vec not available - vector operations will gracefully fall back to text search
  }
  
  createTables(db);
  return db;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      from_memory_id TEXT NOT NULL,
      to_memory_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      strength REAL DEFAULT 1.0,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_memory_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (to_memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at);
    CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_memory_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_memory_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);
    CREATE INDEX IF NOT EXISTS idx_relationships_strength ON relationships(strength);
  `);
  
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[768]
      );
    `);
  } catch {
    // Vector table creation failed - vector search operations will handle this gracefully
  }
  
  const updateTrigger = db.prepare(`
    CREATE TRIGGER IF NOT EXISTS update_memories_updated_at 
    AFTER UPDATE ON memories
    BEGIN
      UPDATE memories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);
  
  try {
    updateTrigger.run();
  } catch {
    // Update trigger creation failed - timestamps will still work via manual updates
  }
}

