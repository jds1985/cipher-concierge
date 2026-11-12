export const SETUP_CSS = `
  .setup-page{box-sizing:border-box;max-width:760px;width:100%}
  .setup-page .nav{flex-wrap:wrap;max-width:100%;row-gap:8px}
  .setup-page .nav a,.setup-page .nav form,.setup-page .nav button{margin-left:0 !important;max-width:100%}
  .setup-h1{font-size:clamp(28px,4vw,40px);line-height:1.15;margin:8px 0 12px;letter-spacing:-.02em;overflow-wrap:anywhere}
  .setup-lede{font-size:18px;line-height:1.55;color:var(--muted);margin-bottom:22px}
  .setup-form,.created,.qr-box{box-sizing:border-box;width:100%;max-width:100%;min-width:0;border-radius:22px;padding:24px;display:grid;grid-template-columns:minmax(0,1fr);gap:16px;margin-bottom:22px}
  .field{display:flex;flex-direction:column;gap:8px;min-width:0;max-width:100%;font-size:15px;font-weight:600;color:var(--text)}
  .field span{color:var(--muted);font-weight:600;font-size:14px;letter-spacing:.02em}
  .field input,.field textarea,.field select{
    box-sizing:border-box;display:block;width:100%;max-width:100%;min-width:0;
    min-height:52px;padding:12px 14px;border-radius:14px;border:1px solid var(--glass-border);
    background:rgba(6,11,26,.75);color:#fff;font:18px/1.4 Inter,system-ui,sans-serif;
  }
  .field textarea{min-height:110px;resize:vertical}
  .field input::placeholder,.field textarea::placeholder{color:var(--dim)}
  .check{display:flex;align-items:flex-start;gap:12px;font-size:17px;line-height:1.4;color:var(--text);cursor:pointer}
  .check input{width:22px;height:22px;margin-top:2px;accent-color:var(--cyan);flex:none}
  .form-err{color:#ffb4b4;font-size:16px}
  .form-ok{color:var(--lime);font-size:16px}
  .section-title{font-size:22px;margin:28px 0 12px}
  .grid2{display:grid;gap:14px;grid-template-columns:1fr 1fr}
  @media (max-width:640px){.grid2{grid-template-columns:1fr}}
  .created h2,.qr-box h2{font-size:22px}
  .created p,.qr-box p{color:var(--muted);font-size:16px;line-height:1.5}
  .hotel-id code{color:var(--cyan);font-size:15px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr));gap:18px;margin-top:16px;min-width:0}
  .card{border-radius:22px;padding:22px 20px;text-align:center;background:linear-gradient(160deg,#0b1430,#060b1a);border:1px solid rgba(47,221,207,.35);break-inside:avoid;position:relative;overflow:hidden}
  .card .hn{font:700 13px "Plus Jakarta Sans";letter-spacing:.14em;margin-top:8px}
  .card .rm{font:800 30px "Plus Jakarta Sans";margin:2px 0 12px}
  .card .qr{background:#fff;border-radius:14px;padding:10px;width:180px;margin:0 auto}
  .card .qr svg{display:block;width:100%;height:auto}
  .card .cta{font:600 15px Inter;margin-top:14px}
  .card .sub{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.45}
  .hint{font-size:14px;color:var(--dim);line-height:1.45}
  .btn-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
  @media print{.nav,.no-print{display:none!important}body{background:#fff}.page{padding:0;max-width:none}.cards{grid-template-columns:repeat(2,1fr)}.card{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
