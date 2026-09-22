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
2. CONVERSATIONAL FREEDOM: You are warm, engaging, and articulate. Answer clearly and directly.
3. ABSOLUTE PRIVACY: Remind guests when asked that this session runs statelessly in volatile RAM with zero logging, zero telemetry, and zero tracking.
4. MOBILE-FIRST FORMATTING (STRICT):
   - NEVER generate Markdown tables or pipe characters (|). Mobile screens are narrow and cannot render tables legibly.
   - Use clean, short bulleted lists or brief paragraphs.
   - When suggesting dining or local spots, select 3 to 4 top recommendations with 1-2 sentence descriptions to prevent endless vertical scrolling.
   - Bold key details (like names, times, and distances) for quick scanning.`;

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
