import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
}

const DEFAULT_CONFIG: Required<OllamaConfig> = {
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text'
};

export async function ensureOllamaRunning(config: OllamaConfig = {}): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  try {
    await fetch(`${fullConfig.baseUrl}/api/version`);
  } catch (error) {
    try {
      await startOllama();
      
      let retries = 30;
      while (retries > 0) {
        try {
          await fetch(`${fullConfig.baseUrl}/api/version`);
          break;
        } catch {
          await new Promise(resolve => setTimeout(resolve, 1000));
          retries--;
        }
      }
      
      if (retries === 0) {
        throw new Error(
          `Failed to start Ollama after 30 seconds. Please check:\n` +
          `• Ollama is properly installed\n` +
          `• No other process is using port 11434\n` +
          `• Try running 'ollama serve' manually first`
        );
      }
    } catch (startError) {
      if (startError instanceof Error && startError.message.includes('not installed')) {
        throw startError;
      }
      throw new Error(
        `Failed to ensure Ollama is running: ${startError}\n` +
        `Please try starting Ollama manually: 'ollama serve'`
      );
    }
  }
}

export async function ensureModelExists(config: OllamaConfig = {}): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  try {
    const response = await fetch(`${fullConfig.baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fullConfig.model })
    });
    
    if (response.ok) {
      return;
    }
  } catch (error) {
  }
  
  try {
    console.log(`Pulling model ${fullConfig.model}...`);
    await pullModel(fullConfig.model, fullConfig.baseUrl);
    console.log(`Model ${fullConfig.model} installed successfully`);
  } catch (error) {
    throw new Error(
      `Failed to pull model '${fullConfig.model}'. Please check:\n` +
      `• Ollama is running and accessible at ${fullConfig.baseUrl}\n` +
      `• Model name '${fullConfig.model}' is correct\n` +
      `• Try running 'ollama pull ${fullConfig.model}' manually\n` +
      `Error: ${error}`
    );
  }
}

export async function generateEmbedding(text: string, config: OllamaConfig = {}): Promise<number[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const response = await fetch(`${fullConfig.baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: fullConfig.model,
      prompt: text
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to generate embedding: ${response.statusText}`);
  }
  
  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

async function startOllama(): Promise<void> {
  try {
    await execAsync('which ollama');
  } catch {
    throw new Error(
      'Ollama is not installed. Please install Ollama first:\n' +
      '• macOS: brew install ollama\n' +
      '• Linux: curl -fsSL https://ollama.ai/install.sh | sh\n' +
      '• Windows: Download from https://ollama.ai/download'
    );
  }
  
  spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore'
  }).unref();
  
  await new Promise(resolve => setTimeout(resolve, 2000));
}


async function pullModel(model: string, baseUrl: string): Promise<void> {
  
  const response = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to pull model ${model}: ${response.statusText}`);
  }
  
  if (!response.body) {
    throw new Error('No response body');
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.status) {
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  }
  
}