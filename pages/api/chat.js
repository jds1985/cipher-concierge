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
2. CONVERSATIONAL FREEDOM: You are not a rigid FAQ bot. You are warm, engaging, and articulate. You can discuss dining, history, or casual topics if the guest brings them up.
3. ABSOLUTE PRIVACY: When asked, reassure guests that this session runs statelessly in volatile RAM with zero logging, zero telemetry, and zero tracking.
4. MOBILE BREVITY: Keep room logistics answers concise and direct.`;

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(messages) ? messages : []),
    ];

    const apiKey = (process.env.MODEL_API_KEY || "").trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing MODEL_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const endpoint = (process.env.MODEL_API_URL || "https://api.groq.com/openai/v1/chat/completions").trim();
    // Enforces regex stripping of any hidden newlines, tabs, or whitespace
    const model = (process.env.MODEL_NAME || "openai/gpt-oss-120b").replace(/\s+/g, "");

    const groqResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: fullMessages,
        temperature: 0.7,
        max_completion_tokens: 1024,
      }),
    });

    const responseText = await groqResponse.text();

    if (!groqResponse.ok) {
      console.error("Groq Upstream Error:", responseText);
      return new Response(
        JSON.stringify({ error: "Upstream inference error", details: responseText }),
        { status: groqResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = JSON.parse(responseText);
    const reply =
      data.choices?.[0]?.message?.content ||
      "Welcome to The Oliver. How may I assist your stay tonight?";

    return new Response(
      JSON.stringify({
        reply: reply,
        content: reply,
        message: reply,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Handler Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
