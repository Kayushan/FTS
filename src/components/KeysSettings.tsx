import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { supabase } from "../lib/supabase";
import { useSupabaseAuth } from "../lib/auth";
import { deobfuscateKey, obfuscateKey } from "../lib/openrouter";
import { getAiModel, setAiModel } from "../lib/config";

function mask(key: string) {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function KeysSettings() {
  const { user } = useSupabaseAuth();
  const [keys, setKeys] = useState<{ id: number; key: string; priority: number }[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>(getAiModel());

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("api_keys").select("id,key,priority").eq("user_id", user.id).order("priority");
    const mapped = (data as any) ?? [];
    // Keep obfuscated in state but mask using deobfuscated for UX
    setKeys(mapped);
  }

  useEffect(() => { load(); }, [user?.id]);

  async function addKey() {
    setError(null);
    if (!user || !input.trim()) return;
    if (keys.length >= 5) { setError("Maximum 5 keys"); return; }
    // Ensure user row exists for FK
    await supabase.from("users").upsert({ id: user.id }, { onConflict: "id" });
    const obKey = obfuscateKey(input.trim());
    const { error: insertError } = await supabase.from("api_keys").insert({ user_id: user.id, key: obKey, priority: (keys[keys.length - 1]?.priority ?? 0) + 1 });
    if (insertError) { setError(insertError.message); return; }
    setInput("");
    load();
  }

  async function del(id: number) {
    await supabase.from("api_keys").delete().eq("id", id);
    load();
  }

  async function move(id: number, dir: -1 | 1) {
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= keys.length) return;
    const a = keys[idx];
    const b = keys[target];
    await supabase.from("api_keys").update({ priority: b.priority }).eq("id", a.id);
    await supabase.from("api_keys").update({ priority: a.priority }).eq("id", b.id);
    load();
  }

  async function setPrimary(id: number) {
    // primary means priority = 1; shift others
    if (!keys.length) return;
    const current = keys.find((k) => k.id === id);
    if (!current) return;
    // Set selected to min priority-1
    await supabase.from("api_keys").update({ priority: 0 }).eq("id", id);
    // Re-number others incrementally
    for (const k of keys.filter((k) => k.id !== id)) {
      await supabase.from("api_keys").update({ priority: (k.priority ?? 1) + 1 }).eq("id", k.id);
    }
    // Finally set selected to 1
    await supabase.from("api_keys").update({ priority: 1 }).eq("id", id);
    load();
  }

  async function testKey(k: string) {
    // Lightweight test: call OpenRouter models list
    try {
      const plain = deobfuscateKey(k) || k;
      const resp = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${plain}` } });
      alert(resp.ok ? "✅ Key works" : `❌ Key failed (${resp.status})`);
    } catch (e: any) {
      alert(`❌ Error: ${e?.message ?? e}`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">OpenRouter API Keys</div>
      <div className="text-xs text-muted-foreground">Manage up to 5 keys. Primary is the top item.</div>
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <input className="w-full sm:flex-1 rounded-md border px-3 py-2 text-sm" placeholder="Custom AI model (e.g. openrouter/auto)" value={model} onChange={(e) => setModel(e.target.value)} />
        <Button size="sm" variant="outline" className="sm:self-auto self-end" onClick={() => setAiModel(model || "openrouter/auto")}>Save Model</Button>
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <input className="w-full sm:flex-1 rounded-md border px-3 py-2 text-sm" placeholder="New API key" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button size="sm" onClick={addKey} className="sm:self-auto self-end">Add</Button>
      </div>
      <ul className="space-y-2">
        {keys.map((k, i) => (
          <li key={k.id} className="rounded-lg border p-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="text-sm w-full sm:w-auto truncate">{mask(deobfuscateKey(k.key) || k.key)}</div>
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="sm" className="px-2" onClick={() => move(k.id, -1)} disabled={i === 0}>Up</Button>
              <Button variant="outline" size="sm" className="px-2" onClick={() => move(k.id, 1)} disabled={i === keys.length - 1}>Down</Button>
              <Button variant="outline" size="sm" className="px-2" onClick={() => setPrimary(k.id)} disabled={i === 0}>Set Primary</Button>
              <Button variant="outline" size="sm" className="px-2" onClick={() => testKey(k.key)}>Test</Button>
              <Button variant="destructive" size="sm" className="px-2" onClick={() => del(k.id)}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="text-xs text-muted-foreground">{keys.length}/5 keys</div>
    </div>
  );
}


