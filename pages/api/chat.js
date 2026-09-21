import propertyConfig from "../../config/property.json";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, roomId } = req.body;

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
      ...(messages || []),
    ];

    const modelEndpoint =
      process.env.MODEL_API_URL || "https://api.groq.com/openai/v1/chat/completions";
    const modelName = process.env.MODEL_NAME || "qwen/qwen3.8-27b";
    const apiKey = process.env.MODEL_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "MODEL_API_KEY is not configured." });
    }

    const groqResponse = await fetch(modelEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: fullMessages,
        temperature: 0.6,
        max_tokens: 500,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Groq Model Error:", errorText);
      return res.status(groqResponse.status).json({
        error: "Inference provider error",
        details: errorText,
      });
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content || "How else can I assist your stay tonight?";

    return res.status(200).json({ content: reply });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
}
