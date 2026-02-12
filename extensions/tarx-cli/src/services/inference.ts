/**
 * Inference Service - llama-server client
 */

const INFERENCE_URL = 'http://localhost:11435';

interface ChatOptions {
  stream?: boolean;
  maxTokens?: number;
  onToken?: (token: string) => void;
}

export async function chat(prompt: string, options: ChatOptions = {}): Promise<string> {
  const { stream = false, maxTokens = 2000, onToken } = options;

  const response = await fetch(`${INFERENCE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'tarx',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      stream: stream
    })
  });

  if (!response.ok) {
    throw new Error(`Inference error: ${response.status} ${response.statusText}`);
  }

  if (stream && onToken) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            onToken(token);
            fullResponse += token;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
    return fullResponse;
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || '';
}

export async function getModels(): Promise<any[]> {
  const response = await fetch(`${INFERENCE_URL}/v1/models`);
  if (!response.ok) return [];
  const data = await response.json() as { data?: any[] };
  return data.data || [];
}
