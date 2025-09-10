import { useState } from "react";
import { Button } from "./ui/button";
import { useSupabaseAuth } from "../lib/auth";

export function AuthInline() {
  const { signIn, signUp } = useSupabaseAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(action: "signin" | "signup") {
    setLoading(true);
    setError(null);
    try {
      if (action === "signin") await signIn(email, password);
      else await signUp(email, password);
    } catch (e: any) {
      setError(e?.message || "Authentication error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border p-3 space-y-2">
      <div className="text-sm font-medium">Supabase Account</div>
      <input
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={loading} onClick={() => handle("signin")}>Sign in</Button>
        <Button className="flex-1" variant="outline" disabled={loading} onClick={() => handle("signup")}>Sign up</Button>
      </div>
    </div>
  );
}


