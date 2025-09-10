const AI_MODEL_KEY = "ai_model";

export function getAiModel(): string {
  if (typeof localStorage === "undefined") return "openrouter/auto";
  return localStorage.getItem(AI_MODEL_KEY) || "openrouter/auto";
}

export function setAiModel(model: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AI_MODEL_KEY, model || "openrouter/auto");
}


