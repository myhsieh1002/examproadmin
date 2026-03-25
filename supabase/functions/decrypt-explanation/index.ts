import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ALGORITHM = "AES-GCM"
const KEY_HEX = Deno.env.get("EXPLANATION_ENCRYPTION_KEY") || "0".repeat(64)

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

// Decrypt AES-256-GCM (compatible with Node.js crypto)
async function decrypt(base64: string): Promise<string> {
  if (!base64) return ""

  try {
    // Decode base64
    const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

    // Extract nonce (12 bytes), ciphertext, and auth tag (16 bytes)
    const nonce = raw.slice(0, 12)
    const tag = raw.slice(raw.length - 16)
    const ciphertext = raw.slice(12, raw.length - 16)

    // Combine ciphertext + tag for WebCrypto (it expects them concatenated)
    const combined = new Uint8Array(ciphertext.length + tag.length)
    combined.set(ciphertext)
    combined.set(tag, ciphertext.length)

    // Import key
    const keyBytes = hexToBytes(KEY_HEX)
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: ALGORITHM },
      false,
      ["decrypt"]
    )

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: nonce },
      cryptoKey,
      combined
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    // Fallback: return as-is if not encrypted
    return base64
  }
}

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { question_id } = await req.json()

    if (!question_id) {
      return new Response(
        JSON.stringify({ error: "question_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Create Supabase client with service role for DB access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch encrypted explanation
    const { data, error } = await supabase
      .from("questions")
      .select("explanation_encrypted")
      .eq("id", question_id)
      .single()

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "Question not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Decrypt
    const explanation = await decrypt(data.explanation_encrypted || "")

    return new Response(
      JSON.stringify({ explanation }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
