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
    const { text } = await req.json();

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400,
      });
    }

    const apiKey = (process.env.DEEPGRAM_API_KEY || "").trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Deepgram API key missing" }),
        { status: 500 }
      );
    }

    // aura-asteria-en or aura-stella-en (clean, natural, expressive female voices)
    const voiceModel = "aura-stella-en";
    const endpoint = `https://api.deepgram.com/v1/speak?model=${voiceModel}&encoding=mp3`;

    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!upstreamResponse.ok) {
      const errText = await upstreamResponse.text();
      console.error("Deepgram TTS Error:", errText);
      return new Response(errText, { status: upstreamResponse.status });
    }

    return new Response(upstreamResponse.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("TTS Endpoint Crash:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
