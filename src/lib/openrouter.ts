export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const OBFUSCATION_SALT = "fts-lite-salt";

export function obfuscateKey(key: string): string {
  const mixed = Array.from(key)
    .map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ OBFUSCATION_SALT.charCodeAt(i % OBFUSCATION_SALT.length)))
    .join("");
  return btoa(mixed);
}

export function deobfuscateKey(obKey: string): string {
  try {
    const mixed = atob(obKey);
    return Array.from(mixed)
      .map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ OBFUSCATION_SALT.charCodeAt(i % OBFUSCATION_SALT.length)))
      .join("");
  } catch {
    return "";
  }
}

export async function callOpenRouter(messages: ChatMessage[], apiKeys: string[], model: string): Promise<string> {
  let lastError: any = null;
  for (const key of apiKeys) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
        }),
      });
      if (!resp.ok) {
        lastError = new Error(`OpenRouter error: ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("No content from OpenRouter");
      return content;
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  throw lastError ?? new Error("All OpenRouter keys failed");
}

export async function callOpenRouterStream(
  messages: ChatMessage[],
  apiKeys: string[],
  model: string,
  onDelta: (text: string) => void
): Promise<string> {
  let lastError: any = null;
  for (const key of apiKeys) {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages,
        }),
      });
      if (!resp.ok || !resp.body) {
        lastError = new Error(`OpenRouter error: ${resp.status}`);
        continue;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Process SSE messages separated by "\n\n"
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = chunk.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              return full;
            }
            try {
              const json = JSON.parse(data);
              const delta: string | undefined = json?.choices?.[0]?.delta?.content;
              if (delta) {
                full += delta;
                onDelta(delta);
              }
            } catch {
              // ignore parse errors for keep-alives
            }
          }
        }
      }
      return full;
    } catch (e) {
      lastError = e;
      continue;
    }
  }
  throw lastError ?? new Error("All OpenRouter keys failed (stream)");
}


