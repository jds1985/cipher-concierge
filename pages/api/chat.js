import propertyConfig from "../../config/property.json";

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { messages, roomId } = await req.json();

    const hotelInfo = JSON.stringify(propertyConfig.property, null, 2);

    const systemPrompt = `You are Cipher, an intelligent, sovereign digital concierge hosting guests in Room ${roomId || "Guest Suite"} at ${propertyConfig.property.name} in ${propertyConfig.property.location}.

HOTEL KNOWLEDGE BASE:
${hotelInfo}

CORE DIRECTIVES:
1. HOSPITALITY GROUNDING: Use the property knowledge base for hours, amenities, policies, and Wi-Fi. If unsure or if physical staff assistance is needed, advise the guest to dial 0 for the front desk.
2. CONVERSATIONAL FREEDOM: You are warm, engaging, and articulate. Always open with a complete, polite first sentence (never clip or omit the first words).
3. ABSOLUTE PRIVACY: Remind guests when asked that this session runs statelessly in volatile RAM with zero logging, zero telemetry, and zero tracking.
4. MOBILE-FIRST FORMATTING (STRICT):
   - NEVER use Markdown tables or pipe characters (|).
   - When providing lists, ALWAYS place a blank line between every item (double newline) so each bullet renders cleanly on its own separate line.
   - Limit local recommendations to 3 or 4 top spots with 1 to 2 concise sentences each.
   - Bold key names, walking times, and hours for easy skimming.

FORMAT EXAMPLE:
Here are three great walkable dinner options:

• **The Oliver Royale** (On-site) — New American bistro in the hotel lobby. Open 5:00 PM–10:00 PM.

• **Tupelo Honey** (2-min walk) — Southern comfort food on Market Square. Open until 10:00 PM.

• **Knox Mason** (4-min walk) — Upscale regional fare and seasonal cocktails.`;

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(messages) ? messages : []),
    ];

    const apiKey = (process.env.MODEL_API_KEY || "").trim();
    const endpoint = (process.env.MODEL_API_URL || "https://api.groq.com/openai/v1/chat/completions").trim();
    const model = (process.env.MODEL_NAME || "openai/gpt-oss-120b").replace(/\s+/g, "");

    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: fullMessages,
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!upstreamResponse.ok) {
      const errText = await upstreamResponse.text();
      console.error("Groq Upstream Error:", errText);
      return new Response(errText, { status: upstreamResponse.status });
    }

    // Pipe the raw SSE stream directly back to the browser reader
    return new Response(upstreamResponse.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("Edge Stream Crash:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
