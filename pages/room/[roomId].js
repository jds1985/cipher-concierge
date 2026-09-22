import Head from "next/head";
import { useRouter } from "next/router";
import { useState, useRef, useEffect } from "react";

// Lightweight renderer: converts **bold** and *italic* into native HTML
function FormattedText({ text }) {
  if (!text) return null;

  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={index} className="font-bold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }

        const subParts = part.split(/(\*[^*]+\*)/g);
        return subParts.map((sub, sIdx) => {
          if (sub.startsWith("*") && sub.endsWith("*")) {
            return (
              <em key={sIdx} className="text-slate-300 italic">
                {sub.slice(1, -1)}
              </em>
            );
          }
          return sub;
        });
      })}
    </>
  );
}

export default function RoomChat() {
  const router = useRouter();
  const { roomId } = router.query;

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Welcome to The Oliver Hotel. I am Cipher, your private digital concierge for Room ${
        roomId || "Guest Suite"
      }. How can I assist your stay tonight?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Voice output handler using native browser Web Speech API
  const handleToggleVoice = (text, index) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean markdown characters out before speaking aloud
    const cleanText = text.replace(/[*_#•|-]/g, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    }

    const userMsg = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMsg];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomId || "Guest Suite",
          messages: updatedMessages,
        }),
      });

      if (!res.ok) {
        throw new Error("Unable to reach Cipher inference engine");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.replace("data: ", "").trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const token =
                parsed.choices?.[0]?.delta?.content ||
                parsed.choices?.[0]?.text ||
                "";
              assistantResponse += token;

              setMessages((prev) => {
                const newArr = [...prev];
                newArr[newArr.length - 1] = {
                  role: "assistant",
                  content: assistantResponse,
                };
                return newArr;
              });
            } catch {
              // Ignore non-JSON stream chunks
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I apologize, but I am momentarily experiencing network interference. Please contact the front desk at extension 0.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearSession = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
    }
    setMessages([
      {
        role: "assistant",
        content: `Session cleared from temporary memory. How may I assist you with Room ${
          roomId || "Guest Suite"
        }?`,
      },
    ]);
  };

  return (
    <>
      <Head>
        <title>{`The Oliver Hotel | Room ${roomId || "Guest"} Concierge`}</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="bg-canvas" />

      <div className="bg-watermark">
        <img
          src="/images/cipher-cts-bg.png"
          alt="Cipher CTS Watermark"
          className="watermark-img"
        />
      </div>

      <div className="chat-viewport">
        <header className="room-header glass-panel">
          <div className="room-brand">
            <img
              src="/images/cipher-cts-logo.png"
              alt="Cipher Logo"
              className="room-logo"
            />
            <div>
              <h1 className="hotel-name">THE OLIVER HOTEL</h1>
              <p className="room-sub">
                Room {roomId || "Guest"} • <span>Private Session</span>
              </p>
            </div>
          </div>
          <button onClick={clearSession} className="btn-clear" title="Clear RAM History">
            Clear
          </button>
        </header>

        <main className="messages-area">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`bubble ${
                msg.role === "user" ? "user-bubble" : "assistant-bubble glass-bubble"
              }`}
            >
              <div className="bubble-header-row">
                <span className="bubble-sender">
                  {msg.role === "user" ? "You" : "Cipher Concierge"}
                </span>
                {msg.role === "assistant" && msg.content && (
                  <button
                    onClick={() => handleToggleVoice(msg.content, i)}
                    className="btn-voice"
                    title={speakingIndex === i ? "Stop Audio" : "Listen to Response"}
                  >
                    {speakingIndex === i ? "⏹ Stop" : "🔊 Listen"}
                  </button>
                )}
              </div>
              <div className="bubble-text">
                <FormattedText text={msg.content} />
              </div>
            </div>
          ))}

          {loading && (
            <div className="thinking-indicator glass-bubble">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        <footer className="input-dock">
          <form onSubmit={handleSend} className="input-bar glass-panel">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about amenities, dining, or Knoxville..."
              disabled={loading}
              className="chat-input"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="btn-send"
              aria-label="Send Message"
            >
              ↑
            </button>
          </form>
          <div className="privacy-badge">
            🔒 Ephemeral In-Memory Session • Zero Telemetry
          </div>
        </footer>
      </div>

      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: "Inter", sans-serif;
          background-color: #05060a;
          color: rgba(255, 255, 255, 0.94);
          height: 100dvh;
          overflow: hidden;
        }

        .bg-canvas {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background:
            radial-gradient(circle at 15% 10%, rgba(90, 70, 255, 0.35), transparent 40%),
            radial-gradient(circle at 85% 90%, rgba(0, 255, 200, 0.25), transparent 45%),
            radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.03), transparent 60%),
            #05060a;
          z-index: -2;
        }

        .bg-watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          max-width: 600px;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: -1;
          opacity: 0.06;
          filter: drop-shadow(0 0 40px rgba(0, 255, 200, 0.3));
        }

        .watermark-img {
          width: 75%;
          max-width: 380px;
          object-fit: contain;
        }

        .chat-viewport {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          max-width: 640px;
          margin: 0 auto;
          position: relative;
        }

        .glass-panel {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(28px) saturate(140%);
          -webkit-backdrop-filter: blur(28px) saturate(140%);
        }

        .room-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          margin: 12px 14px 0 14px;
          border-radius: 20px;
          flex-shrink: 0;
          z-index: 10;
        }

        .room-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .room-logo {
          width: 32px;
          height: 32px;
          object-fit: contain;
          border-radius: 8px;
        }

        .hotel-name {
          font-family: "Plus Jakarta Sans", sans-serif;
          font-size: 13px;
          letter-spacing: 1.5px;
          color: #ffffff;
          font-weight: 700;
        }

        .room-sub {
          font-size: 11.5px;
          color: #94a3b8;
        }

        .room-sub span {
          color: #00ffd5;
        }

        .btn-clear {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          font-size: 11px;
          padding: 6px 12px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-clear:hover {
          color: #ff6b6b;
          border-color: rgba(255, 107, 107, 0.3);
        }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 16px 16px 130px 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          -webkit-overflow-scrolling: touch;
        }

        .bubble {
          max-width: 85%;
          padding: 14px 16px;
          border-radius: 18px;
          line-height: 1.55;
          font-size: 14px;
          animation: fadeSlideUp 0.25s ease forwards;
        }

        .bubble-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .bubble-sender {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          opacity: 0.6;
        }

        .btn-voice {
          background: rgba(0, 255, 213, 0.08);
          border: 1px solid rgba(0, 255, 213, 0.2);
          color: #00ffd5;
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-voice:hover {
          background: rgba(0, 255, 213, 0.2);
        }

        .bubble-text {
          white-space: pre-wrap;
          word-break: break-word;
        }

        .bubble-text strong {
          font-weight: 700;
          color: #ffffff;
        }

        .bubble-text em {
          font-style: italic;
          color: #cbd5e1;
        }

        .glass-bubble {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          color: #e2e8f0;
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }

        .user-bubble {
          background: linear-gradient(135deg, #5a46ff, #00ffd5);
          color: #ffffff;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
          box-shadow: 0 4px 20px rgba(90, 70, 255, 0.35);
        }

        .user-bubble .bubble-sender {
          color: rgba(255, 255, 255, 0.8);
        }

        .thinking-indicator {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 12px 18px;
          border-radius: 16px;
          align-self: flex-start;
        }

        .dot {
          width: 6px;
          height: 6px;
          background: #00ffd5;
          border-radius: 50%;
          animation: pulse 1.4s infinite ease-in-out;
        }

        .dot:nth-child(2) {
          animation-delay: 0.2s;
        }
        .dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes pulse {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .input-dock {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 10px 14px 18px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: linear-gradient(to top, #05060a 75%, transparent);
        }

        .input-bar {
          display: flex;
          align-items: center;
          border-radius: 20px;
          padding: 6px 8px 6px 16px;
        }

        .chat-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #ffffff;
          font-size: 14px;
          font-family: inherit;
        }

        .chat-input::placeholder {
          color: #64748b;
        }

        .btn-send {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #5a46ff, #00ffd5);
          color: white;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s;
        }

        .btn-send:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .btn-send:not(:disabled):hover {
          transform: scale(1.05);
        }

        .privacy-badge {
          text-align: center;
          font-size: 10px;
          color: #64748b;
          letter-spacing: 0.5px;
        }
      `}</style>
    </>
  );
}
