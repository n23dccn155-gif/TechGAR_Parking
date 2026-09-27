import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { getWaitingSessions } from "../api/backendApi";
import type { VehicleSession } from "../domain/session";

const QR_DISPLAY_MS = 120_000;
const WAITING_SESSIONS_POLL_MS = 250;

function qrExpiryTime(session: VehicleSession): number {
  const explicitExpiry = Date.parse(session.qrExpiresAt);
  if (Number.isFinite(explicitExpiry)) return explicitExpiry;
  return Date.parse(session.createdAt) + QR_DISPLAY_MS;
}

function isQrVisible(session: VehicleSession, now = Date.now()): boolean {
  return qrExpiryTime(session) > now;
}

export function EntryQRKiosk() {
  const [session, setSession] = useState<VehicleSession | null>(null);
  const [generatedQr, setGeneratedQr] = useState<{ navigationUrl: string; dataUrl: string } | null>(null);
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
    return <main className="kiosk-empty" aria-live="polite"><h1>Cổng vào TechGAR</h1><p>Đang chờ xe đi qua vạch cổng vào…</p></main>;
  }

  return (
    <main className="kiosk-page">
      <section className="entry-qr-kiosk entry-qr-kiosk--standalone" aria-live="polite">
        <header>
          <strong>CỔNG VÀO · QUÉT MÃ QR</strong>
        </header>
        <div className="entry-qr-kiosk__content">
          <p>Đã phát hiện xe Global ID <strong>#{session.globalVehicleId}</strong></p>
          <p>Quét mã để theo dõi vị trí xe trong bãi.</p>
          {qrDataUrl ? <img src={qrDataUrl} width={256} height={256} alt={`QR phiên xe ${session.globalVehicleId}`} /> : <p>Đang sinh QR…</p>}
          <a href={navigationUrl} target="_blank" rel="noreferrer">Mở trang theo dõi xe</a>
        </div>
      </section>
    </main>
  );
}
