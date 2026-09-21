import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();

  const handleEnterRoom = (e) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    router.push(`/room/${encodeURIComponent(roomId.trim())}`);
  };

  return (
    <>
      <Head>
        <title>Cipher Concierge | Private Hotel AI</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap"
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

      <div className="portal-wrap">
        <div className="portal-card glass-panel">
          <div className="brand">
            <img
              src="/images/cipher-cts-logo.png"
              alt="Cipher Logo"
              className="brand-logo"
            />
            <h2>THE OLIVER HOTEL</h2>
            <p className="portal-sub">Digital Concierge Portal</p>
          </div>

          <form onSubmit={handleEnterRoom} className="room-form">
            <label htmlFor="roomInput">Enter Room or Suite Number</label>
            <input
              id="roomInput"
              type="text"
              placeholder="e.g. 304"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="room-input"
              autoFocus
            />
            <button type="submit" className="btn-enter">
              Access Private Concierge →
            </button>
          </form>

          <div className="quick-access">
            <span>Demo Suites:</span>
            <button type="button" onClick={() => router.push("/room/304")}>
              Room 304
            </button>
            <button type="button" onClick={() => router.push("/room/412")}>
              Room 412
            </button>
          </div>

          <div className="portal-footer">
            🔒 Stateless RAM-Only Session • No App Download Required
          </div>
        </div>
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
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
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

        .portal-wrap {
          width: 100%;
          max-width: 420px;
          padding: 20px;
          z-index: 1;
        }

        .glass-panel {
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(28px) saturate(140%);
          -webkit-backdrop-filter: blur(28px) saturate(140%);
          border-radius: 24px;
          padding: 34px 26px;
          box-shadow:
            0 0 100px rgba(0, 255, 200, 0.08),
            0 0 50px rgba(90, 70, 255, 0.15);
        }

        .brand {
          text-align: center;
          margin-bottom: 24px;
        }

        .brand-logo {
          width: 42px;
          height: 42px;
          object-fit: contain;
          margin: 0 auto 12px auto;
          display: block;
        }

        .brand h2 {
          font-family: "Plus Jakarta Sans", sans-serif;
          font-size: 15px;
          letter-spacing: 2px;
          color: #ffffff;
          margin-bottom: 4px;
        }

        .portal-sub {
          font-size: 12.5px;
          color: #00ffd5;
        }

        .room-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }

        .room-form label {
          font-size: 12px;
          color: #94a3b8;
        }

        .room-input {
          width: 100%;
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.04);
          color: #ffffff;
          font-size: 16px;
          outline: none;
          text-align: center;
          transition: border-color 0.2s;
        }

        .room-input:focus {
          border-color: #00ffd5;
        }

        .btn-enter {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: linear-gradient(135deg, #5a46ff, #00ffd5);
          color: #ffffff;
          font-family: "Plus Jakarta Sans", sans-serif;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 0 25px rgba(90, 70, 255, 0.4);
        }

        .btn-enter:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 35px rgba(90, 70, 255, 0.6);
        }

        .quick-access {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 20px;
        }

        .quick-access button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 8px;
          cursor: pointer;
        }

        .quick-access button:hover {
          color: #ffffff;
          border-color: #00ffd5;
        }

        .portal-footer {
          text-align: center;
          font-size: 11px;
          color: #64748b;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 16px;
        }
      `}</style>
    </>
  );
}
