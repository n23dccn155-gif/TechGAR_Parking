import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { MonitorApp } from "./app/MonitorApp";
import { KioskApp } from "./app/KioskApp";
import "./styles/index.css";
import "./styles/monitor.css";

const root = document.getElementById("root");
if (!root) throw new Error("Không tìm thấy phần tử #root");

// ── Định tuyến đơn giản dựa theo URL ──────────────────────────────────────
// ?session=1   →  Trang dẫn đường cá nhân cho xe #1 (QR)
// ?session=2   →  Trang dẫn đường cá nhân cho xe #2 (QR)
// /kiosk/entry → Bảng QR riêng tại cổng vào
// (không có tham số) →  Trang người lái; không tự polling API của kiosk
const params    = new URLSearchParams(window.location.search);
const sessionId = params.get("session");
const isMonitor = window.location.pathname === "/monitor" || window.location.pathname === "/monitor/";
const isEntryKiosk = window.location.pathname === "/kiosk/entry" || window.location.pathname === "/kiosk/entry/";

createRoot(root).render(
  <StrictMode>
    {isMonitor ? <MonitorApp /> : isEntryKiosk ? <KioskApp /> : <App sessionId={sessionId} />}
  </StrictMode>,
);
