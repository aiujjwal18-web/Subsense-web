import { safeCompare } from "./http.ts"

const RAZORPAY_ORDERS_ENDPOINT = "https://api.razorpay.com/v1/orders"

export type CreateOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; code: "PAY_005"; message: string }

// Razorpay's Orders API — plain fetch + HTTP Basic Auth, no SDK (Razorpay's own npm
// package targets Node/axios, no Deno build; matches this repo's existing
// _shared/resend-client.ts / _shared/openai-client.ts pattern of calling REST directly).
export async function createRazorpayOrder(
  amountInPaise: number,
  currency: string,
  receipt: string
): Promise<CreateOrderResult> {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID")
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")

  if (!keyId || !keySecret) {
    return { ok: false, code: "PAY_005", message: "Razorpay credentials are not configured." }
  }

  try {
    const response = await fetch(RAZORPAY_ORDERS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: amountInPaise, currency, receipt }),
    })

    if (!response.ok) {
      const bodyText = await response.text()
      return { ok: false, code: "PAY_005", message: `Razorpay order creation failed (HTTP ${response.status}): ${bodyText}` }
    }

    const json = await response.json()
    if (typeof json.id !== "string") {
      return { ok: false, code: "PAY_005", message: "Razorpay order response had no id." }
    }

    return { ok: true, orderId: json.id }
  } catch (err) {
    return { ok: false, code: "PAY_005", message: err instanceof Error ? err.message : String(err) }
  }
}

// Razorpay's documented signature scheme: hex(HMAC_SHA256(key_secret, order_id + "|" + payment_id)),
// compared to the client-supplied razorpay_signature. Pure HMAC — no network call needed.
export async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): Promise<boolean> {
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")
  if (!keySecret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${orderId}|${paymentId}`))
  const expectedHex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")

  return safeCompare(expectedHex, signature)
}
