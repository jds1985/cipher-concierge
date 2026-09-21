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

    const systemPrompt = `You are Cipher, the private, intelligent digital assistant currently hosting guests in Room ${roomId || "Guest Suite"} at ${propertyConfig.property.name} in ${propertyConfig.property.location}.

HOTEL KNOWLEDGE BASE:
${hotelInfo}

CORE RULES:
1. ACCURACY: Use the provided property knowledge base for hotel policies, hours, Wi-Fi, and amenities. If something isn't listed, advise the guest to dial 0 for the front desk.
2. CONVERSATIONAL & WITTY: You are not a robotic FAQ menu. You are an articulate, warm, and engaging conversationalist. Feel free to talk about dining, travel, philosophy, storytelling, or casual topics if the guest initiates.
3. ABSOLUTE PRIVACY: Remind guests when asked that this session executes completely in RAM with zero logging, zero telemetry, and zero surveillance.
4. BREVITY: Keep room logistics answers concise so guests on mobile phones get the exact information they need quickly.`;

    const fullMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || []),
    ];

    // Connects to local model runner (Ollama / vLLM / llama.cpp)
    // Default fallback to local Ollama instance port 11434
    const modelEndpoint =
      process.env.MODEL_API_URL || "http://localhost:11434/v1/chat/completions";

    const response = await fetch(modelEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MODEL_API_KEY || "not-needed"}`,
      },
      body: JSON.stringify({
        model: process.env.MODEL_NAME || "qwen2.5:3b",
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: "Model inference error", details: errText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Direct streaming back to guest browser
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
