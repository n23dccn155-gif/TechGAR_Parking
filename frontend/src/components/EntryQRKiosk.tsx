import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { getWaitingSessions } from "../api/backendApi";
import type { ParkingSpotState } from "../domain/parking";
import type { VehicleSession } from "../domain/session";

interface EntryQRKioskProps {
  spots?: readonly ParkingSpotState[];
  standalone?: boolean;
}

const QR_DISPLAY_MS = 10_000;
const WAITING_SESSIONS_POLL_MS = 250;

function qrExpiryTime(session: VehicleSession): number {
  const explicitExpiry = Date.parse(session.qrExpiresAt);
  if (Number.isFinite(explicitExpiry)) return explicitExpiry;
  return Date.parse(session.createdAt) + QR_DISPLAY_MS;
}

function isQrVisible(session: VehicleSession, now = Date.now()): boolean {
  return qrExpiryTime(session) > now;
}

export function EntryQRKiosk({ spots = [], standalone = false }: EntryQRKioskProps) {
  const [session, setSession] = useState<VehicleSession | null>(null);
  const [generatedQr, setGeneratedQr] = useState<{ navigationUrl: string; dataUrl: string } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const navigationUrl = useMemo(
    () => session ? `${window.location.origin}/?session=${encodeURIComponent(session.sessionId)}` : null,
    [session],
  );
  const qrDataUrl = generatedQr?.navigationUrl === navigationUrl ? generatedQr.dataUrl : null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const waiting = await getWaitingSessions(controller.signal);
        if (!active) return;
        const next = waiting.filter((candidate) => isQrVisible(candidate)).at(-1) ?? null;
        setSession((current) => current?.sessionId === next?.sessionId ? current : next);
        if (!next) setGeneratedQr(null);
      } catch {
        // Kiosk remains idle while the session API is temporarily unavailable.
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, WAITING_SESSIONS_POLL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const remainingMs = qrExpiryTime(session) - Date.now();
    if (remainingMs <= 0) {
      setSession(null);
      setGeneratedQr(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      setSession((current) => current?.sessionId === session.sessionId ? null : current);
    }, remainingMs);
    return () => window.clearTimeout(timeout);
  }, [session]);

  useEffect(() => {
    setGeneratedQr(null);
    if (!navigationUrl) return;
    let active = true;
    void QRCode.toDataURL(navigationUrl, { width: 256, margin: 2, errorCorrectionLevel: "M" })
      .then((value) => active && setGeneratedQr({ navigationUrl, dataUrl: value }))
      .catch((error: unknown) => console.warn("Không thể sinh QR cục bộ", error));
    return () => { active = false; };
  }, [navigationUrl]);

  if (!session || !navigationUrl) {
    return standalone ? <main className="kiosk-empty" aria-live="polite"><h1>Cổng vào TechGAR</h1><p>Đang chờ xe đi qua vạch cổng vào…</p></main> : null;
  }

  const content = (
    <section className={standalone ? "entry-qr-kiosk entry-qr-kiosk--standalone" : "entry-qr-kiosk"} aria-live="polite">
      <header>
        <strong>CỔNG VÀO · QUÉT MÃ QR</strong>
        {!standalone && <button type="button" onClick={() => setMinimized((value) => !value)} aria-label="Thu gọn bảng QR">{minimized ? "+" : "−"}</button>}
      </header>
      {!minimized && (
        <div className="entry-qr-kiosk__content">
          {spots.length > 0 && <p>Còn trống: <strong>{spots.filter((spot) => spot.status === "empty").length}</strong>{" · "}Đang đỗ: <strong>{spots.filter((spot) => spot.status === "occupied").length}</strong></p>}
          <p>Đã phát hiện xe Global ID <strong>#{session.globalVehicleId}</strong></p>
          <p>Quét mã để theo dõi vị trí xe trong bãi.</p>
          {qrDataUrl ? <img src={qrDataUrl} width={256} height={256} alt={`QR phiên xe ${session.globalVehicleId}`} /> : <p>Đang sinh QR…</p>}
          <a href={navigationUrl} target="_blank" rel="noreferrer">Mở trang theo dõi xe</a>
        </div>
      )}
    </section>
  );
  return standalone ? <main className="kiosk-page">{content}</main> : content;
}
