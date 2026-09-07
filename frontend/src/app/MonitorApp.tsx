import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Camera, CarFront, CheckCircle2, Clock3, PenLine, Radio, Save, Undo2, WifiOff, X } from "lucide-react";
import { getRuntimeGateConfig, getRuntimeSnapshot, runtimeCameraStreamUrl, saveRuntimeGateConfig } from "../api/runtimeApi";
import { runtimeCameraStates, runtimeParkingSpots } from "../adapters/runtimeAdapter";
import { createSvgToWorld, createWorldToSvg, runtimeVehiclesOnSvg } from "../calibration/worldToSvg";
import { ParkingLegend } from "../components/ParkingLegend";
import { ParkingMap, type GateMapOverlay } from "../components/ParkingMap";
import type { RuntimeCameraId, RuntimeEvent, RuntimeGateConfig, RuntimeGateLine, RuntimePoint, RuntimeSnapshot } from "../domain/runtime";
import { PARKING_GEOMETRY, type Point } from "../geometry/parkingGeometry";

const POLL_INTERVAL_MS = 200;
const MAX_RETRY_INTERVAL_MS = 5_000;
const STALE_AFTER_MS = 5_000;

interface GateDraft {
  entry: Point[];
  exit: Point[];
}

function emptyGateDraft(): GateDraft {
  return { entry: [], exit: [] };
}

function acceptedPointForGate(gate: RuntimeGateLine): RuntimePoint {
  const dx = gate.p2.x - gate.p1.x;
  const dy = gate.p2.y - gate.p1.y;
  const length = Math.hypot(dx, dy);
  const side = gate.direction === "negative" ? 1 : -1;
  const distance = Math.max(length * 0.6, 2);
  return {
    x: (gate.p1.x + gate.p2.x) / 2 + side * (-dy / length) * distance,
    y: (gate.p1.y + gate.p2.y) / 2 + side * (dx / length) * distance,
  };
}

function gateLineFromPoints(name: string, points: RuntimePoint[]): RuntimeGateLine {
  const [p1, p2, accepted] = points;
  if (!p1 || !p2 || !accepted) throw new Error(`Thiếu điểm cấu hình cho ${name}`);
  const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (length < 1e-6) throw new Error(`Hai đầu vạch ${name} phải khác nhau`);
  const side = (p2.x - p1.x) * (accepted.y - p1.y) - (p2.y - p1.y) * (accepted.x - p1.x);
  if (Math.abs(side) < 1e-6) throw new Error(`Điểm chỉ hướng của ${name} không được nằm trên vạch`);
  const rounded = (point: RuntimePoint): RuntimePoint => ({
    x: Number(point.x.toFixed(4)),
    y: Number(point.y.toFixed(4)),
  });
  return {
    name,
    p1: rounded(p1),
    p2: rounded(p2),
    direction: side > 0 ? "negative" : "positive",
  };
}

function nextGateInstruction(draft: GateDraft): string {
  if (draft.entry.length < 2) return `ENTRY: chọn đầu vạch ${draft.entry.length + 1}`;
  if (draft.entry.length < 3) return "ENTRY: chọn phía xe đi tới sau khi qua cổng";
  if (draft.exit.length < 2) return `EXIT: chọn đầu vạch ${draft.exit.length + 1}`;
  if (draft.exit.length < 3) return "EXIT: chọn phía xe đi tới sau khi qua cổng";
  return "Đã đủ 6 điểm — kiểm tra mũi tên rồi lưu";
}

function eventLabel(event: RuntimeEvent): string {
  const kind = String(event.event ?? event.type ?? "runtime_event").replaceAll("_", " ");
  const identity = typeof event.global_id === "number" ? `G#${event.global_id}` : "Hệ thống";
  const camera = event.camera ?? event.target_camera ?? event.source_camera;
  const detail = event.slot_id ? ` · ô ${event.slot_id}` : camera ? ` · ${camera}` : "";
  return `${identity} · ${kind}${detail}`;
}

function CameraPanel({ cameraId, online }: { cameraId: RuntimeCameraId; online: boolean }) {
  return (
    <section className="monitor-camera" aria-label={`Video trực tuyến ${cameraId}`}>
      <header>
        <span><Camera size={16} />{cameraId.toUpperCase()}</span>
        <span className={online ? "monitor-camera-state monitor-camera-state--online" : "monitor-camera-state"}>
          {online ? <Radio size={14} /> : <WifiOff size={14} />}
          {online ? "Trực tuyến" : "Mất tín hiệu"}
        </span>
      </header>
      <div className="monitor-camera-frame">
        {online && <img src={runtimeCameraStreamUrl(cameraId)} alt={`Khung hình có nhận diện từ ${cameraId}`} />}
        {!online && <div className="monitor-camera-offline">Chưa nhận được frame mới</div>}
      </div>
    </section>
  );
}

export function MonitorApp() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeConnected, setRuntimeConnected] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | undefined>();
  const [gateConfig, setGateConfig] = useState<RuntimeGateConfig | null>(null);
  const [gateDraft, setGateDraft] = useState<GateDraft>(emptyGateDraft);
  const [gateEditing, setGateEditing] = useState(false);
  const [gateSaving, setGateSaving] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateNotice, setGateNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let retryDelay = POLL_INTERVAL_MS;
    let timeout: number | undefined;
    let controller: AbortController | null = null;
    let cursor: { runtime: string | undefined; frame: number } | null = null;
    let progressedAt = Date.now();
    const watchdog = window.setInterval(() => {
      if (Date.now() - progressedAt > 5000) {
        setRuntimeConnected(false);
        setError("Camera không có frame mới trong 5 giây");
      }
    }, 500);
    const refresh = async () => {
      controller = new AbortController();
      try {
        const next = await getRuntimeSnapshot(controller.signal);
        if (!active) return;
        if (next.source_mode !== "live" || !Number.isFinite(Date.parse(next.published_at))
          || Date.now() - Date.parse(next.published_at) > 5000) throw new Error("Nguồn không phải live hoặc đã cũ");
        if (cursor && cursor.runtime === next.runtime_id && next.frame_index < cursor.frame) throw new Error("Frame đến ngược thứ tự");
        if (!cursor || cursor.runtime !== next.runtime_id || next.frame_index > cursor.frame) {
          cursor = { runtime: next.runtime_id, frame: next.frame_index };
          progressedAt = Date.now();
        }
        if (Date.now() - progressedAt > 5000) throw new Error("Camera không tiến triển");
        setSnapshot(next);
        setError(null);
        setRuntimeConnected(true);
        retryDelay = POLL_INTERVAL_MS;
      } catch (caught) {
        if (!active || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(caught instanceof Error ? caught.message : "Không kết nối được Runtime API");
        setRuntimeConnected(false);
        retryDelay = Math.min(Math.max(retryDelay * 2, 1_000), MAX_RETRY_INTERVAL_MS);
      } finally {
        if (active) timeout = window.setTimeout(refresh, retryDelay);
      }
    };
    timeout = window.setTimeout(refresh, 0);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(watchdog);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getRuntimeGateConfig(controller.signal)
      .then(setGateConfig)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setGateError(caught instanceof Error ? caught.message : "Không đọc được cấu hình cổng");
      });
    return () => controller.abort();
  }, []);

  const spots = useMemo(() => snapshot ? runtimeParkingSpots(snapshot) : [], [snapshot]);
  const cameras = useMemo(() => snapshot ? runtimeCameraStates(snapshot) : {
    "cam-left": { cameraId: "cam-left" as const, health: "offline" as const, updatedAt: "" },
    "cam-right": { cameraId: "cam-right" as const, health: "offline" as const, updatedAt: "" },
  }, [snapshot]);
  const vehicles = useMemo(() => snapshot ? runtimeVehiclesOnSvg(snapshot) : [], [snapshot]);
  const selectedVehicle = snapshot?.vehicles.find((vehicle) => vehicle.global_id === selectedVehicleId);
  const stale = !snapshot || Date.now() - new Date(snapshot.published_at).getTime() > STALE_AFTER_MS;
  const occupied = snapshot?.parking_slots.filter((slot) => slot.occupied).length ?? 0;
  const free = snapshot ? snapshot.parking_slots.length - occupied : 0;
  const events = snapshot?.recent_events.slice(-8).reverse() ?? [];
  const svgToWorld = useMemo(
    () => snapshot ? createSvgToWorld(snapshot.slot_layout) : null,
    [snapshot],
  );
  const gateProgress = gateDraft.entry.length + gateDraft.exit.length;

  const handleGateMapPoint = useCallback((point: Point) => {
    setGateDraft((current) => {
      if (current.entry.length < 3) return { ...current, entry: [...current.entry, point] };
      if (current.exit.length < 3) return { ...current, exit: [...current.exit, point] };
      return current;
    });
    setGateError(null);
    setGateNotice(null);
  }, []);

  const gateOverlay = useMemo<GateMapOverlay | undefined>(() => {
    if (gateEditing) {
      return {
        editing: true,
        entry: gateDraft.entry,
        exit: gateDraft.exit,
        onPointClick: handleGateMapPoint,
      };
    }
    if (!snapshot || !gateConfig) return undefined;
    const project = createWorldToSvg(snapshot.slot_layout);
    return {
      editing: false,
      entry: [
        project(gateConfig.entry_gate.p1),
        project(gateConfig.entry_gate.p2),
        project(acceptedPointForGate(gateConfig.entry_gate)),
      ],
      exit: [
        project(gateConfig.exit_gate.p1),
        project(gateConfig.exit_gate.p2),
        project(acceptedPointForGate(gateConfig.exit_gate)),
      ],
    };
  }, [gateConfig, gateDraft, gateEditing, handleGateMapPoint, snapshot]);

  const startGateEditing = (): void => {
    if (!svgToWorld) {
      setGateError("Runtime chưa có đủ slot_layout để đổi tọa độ map sang world");
      return;
    }
    setGateDraft(emptyGateDraft());
    setGateEditing(true);
    setGateError(null);
    setGateNotice(null);
  };

  const undoGatePoint = (): void => {
    setGateDraft((current) => {
      if (current.exit.length > 0) return { ...current, exit: current.exit.slice(0, -1) };
      return { ...current, entry: current.entry.slice(0, -1) };
    });
    setGateError(null);
  };

  const saveGates = async (): Promise<void> => {
    if (!snapshot || !svgToWorld || gateProgress !== 6) return;
    setGateSaving(true);
    setGateError(null);
    setGateNotice(null);
    try {
      const config: RuntimeGateConfig = {
        schema_version: 1,
        coordinate_space: "world",
        unit: snapshot.coordinate_space.unit,
        source: "frontend_shared_map",
        entry_gate: gateLineFromPoints("Cổng vào", gateDraft.entry.map(svgToWorld)),
        exit_gate: gateLineFromPoints("Cổng ra", gateDraft.exit.map(svgToWorld)),
      };
      const saved = await saveRuntimeGateConfig(config);
      setGateConfig(saved);
      setGateEditing(false);
      setGateNotice("Đã lưu gate_zones.json theo tọa độ world. Có thể khởi động Gate Session Controller.");
    } catch (caught) {
      setGateError(caught instanceof Error ? caught.message : "Không lưu được cấu hình cổng");
    } finally {
      setGateSaving(false);
    }
  };

  return (
    <div className="monitor-shell">
      <header className="monitor-header">
        <div className="monitor-brand">
          <div className="monitor-brand-mark"><Activity size={22} /></div>
          <div>
            <strong>TechGAR Control</strong>
            <span>Giám sát hai camera và Global ID</span>
          </div>
        </div>
        <div className={stale ? "monitor-live monitor-live--stale" : "monitor-live"}>
          <Radio size={15} />
          {stale ? "Dữ liệu gián đoạn" : snapshot?.source_mode === "replay" ? "Replay đồng bộ" : "Đang trực tuyến"}
        </div>
      </header>

      <main className="monitor-main">
        <section className="monitor-status-strip" aria-label="Tổng quan vận hành">
          <div><CarFront size={17} /><span><strong>{vehicles.length}</strong> xe hiện tại</span></div>
          <div><span className="monitor-status-swatch monitor-status-swatch--free" /><span><strong>{free}</strong> ô trống</span></div>
          <div><span className="monitor-status-swatch monitor-status-swatch--occupied" /><span><strong>{occupied}</strong> ô có xe</span></div>
          <div><Clock3 size={17} /><span><strong>{snapshot?.camera_skew_ms.toFixed(1) ?? "—"} ms</strong> lệch camera</span></div>
          <div className="monitor-frame-index">FRAME {snapshot?.frame_index ?? "—"}</div>
        </section>

        {error && <div className="monitor-alert">{error}. Kiểm tra backend Runtime API tại cổng 8001.</div>}

        <div className="monitor-workspace">
          <section className="monitor-map-panel">
            <div className="monitor-section-heading">
              <div>
                <span className="monitor-eyebrow">SHARED MAP</span>
                <h1>Toàn bộ phương tiện trong bãi</h1>
              </div>
              {selectedVehicle && (
                <div className="monitor-selection">
                  <span>Đang chọn</span>
                  <strong>G#{selectedVehicle.global_id}</strong>
                  <small>{selectedVehicle.camera_ids.join(" + ") || selectedVehicle.state}</small>
                </div>
              )}
            </div>
            <div className={gateEditing ? "monitor-gate-config monitor-gate-config--editing" : "monitor-gate-config"} data-testid="gate-editor">
              <div className="monitor-gate-copy">
                <span className="monitor-eyebrow">GATE CALIBRATION · {gateEditing ? `${gateProgress}/6` : gateConfig ? gateConfig.unit : "CHƯA CÓ"}</span>
                <strong>
                  {gateEditing
                    ? nextGateInstruction(gateDraft)
                    : gateConfig
                      ? <><CheckCircle2 size={15} /> ENTRY và EXIT đã được ánh xạ</>
                      : "Chưa cấu hình cổng trên shared map"}
                </strong>
                <small>
                  {gateEditing
                    ? "Bấm 2 đầu vạch, sau đó bấm phía xe sẽ đi tới. Pan/zoom tạm khóa khi đang chọn điểm."
                    : "Điểm chọn trên SVG được đổi về world; luồng camera realtime vẫn tiếp tục chạy."}
                </small>
              </div>
              <div className="monitor-gate-actions">
                {!gateEditing ? (
                  <button type="button" onClick={startGateEditing} disabled={!svgToWorld}>
                    <PenLine size={15} /> {gateConfig ? "Vẽ lại cổng" : "Cấu hình cổng"}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={undoGatePoint} disabled={gateProgress === 0 || gateSaving}>
                      <Undo2 size={15} /> Hoàn tác
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGateEditing(false);
                        setGateDraft(emptyGateDraft());
                        setGateError(null);
                      }}
                      disabled={gateSaving}
                    >
                      <X size={15} /> Hủy
                    </button>
                    <button type="button" className="monitor-gate-save" onClick={() => void saveGates()} disabled={gateProgress !== 6 || gateSaving}>
                      <Save size={15} /> {gateSaving ? "Đang lưu…" : "Lưu cổng"}
                    </button>
                  </>
                )}
              </div>
            </div>
            {gateError && <div className="monitor-gate-message monitor-gate-message--error">{gateError}</div>}
            {gateNotice && <div className="monitor-gate-message monitor-gate-message--success">{gateNotice}</div>}
            {snapshot ? (
              <ParkingMap
                spots={spots}
                cameras={cameras}
                filter="all"
                activeVehicles={vehicles}
                frameSize={{ width: PARKING_GEOMETRY.width, height: PARKING_GEOMETRY.height }}
                selectedVehicleId={selectedVehicleId}
                onVehicleClick={setSelectedVehicleId}
                gateOverlay={gateOverlay}
                onSpotClick={() => undefined}
              />
            ) : (
              <div className="monitor-map-loading">Đang chờ snapshot từ thuật toán…</div>
            )}
            <ParkingLegend />
          </section>

          <aside className="monitor-camera-column">
            <CameraPanel cameraId="cam1" online={runtimeConnected && Boolean(snapshot?.cameras.cam1?.online) && !stale} />
            <CameraPanel cameraId="cam2" online={runtimeConnected && Boolean(snapshot?.cameras.cam2?.online) && !stale} />
          </aside>
        </div>

        <section className="monitor-events">
          <div className="monitor-section-heading">
            <div>
              <span className="monitor-eyebrow">EVENT TRACE</span>
              <h2>Sự kiện gần nhất</h2>
            </div>
          </div>
          <ol>
            {events.length > 0 ? events.map((event, index) => (
              <li key={`${String(event.event ?? event.type)}-${String(event.frame_idx)}-${index}`}>
                <span>{event.frame_idx != null ? `F${event.frame_idx}` : "LIVE"}</span>
                <strong>{eventLabel(event)}</strong>
              </li>
            )) : <li><span>—</span><strong>Chưa có sự kiện tracking</strong></li>}
          </ol>
        </section>
      </main>
    </div>
  );
}
