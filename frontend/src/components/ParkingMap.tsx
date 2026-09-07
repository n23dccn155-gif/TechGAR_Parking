import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import {
  DESTINATION_LABELS,
  STATUS_LABELS,
  type BrowseFilter,
  type CameraId,
  type CameraState,
  type DestinationNeed,
  type ParkingSpotState,
  type RecommendationResult,
  type SpotId,
} from "../domain/parking";
import { PARKING_GEOMETRY, type Point } from "../geometry/parkingGeometry";
import type { RouteResult } from "../routing/routeEngine";
import { MapControls } from "./MapControls";
import { ParkingSpotShape, type SpotHighlight } from "./ParkingSpotShape";
import type { ActiveVehicle, FrameSize } from "../domain/runtime";

// ── Chuyển tọa độ camera → tọa độ bản đồ SVG (1200×900) ────────────────────
// Kích thước nguồn được truyền động từ frame_size trong vehicle_positions.json
// nên tự điều chỉnh theo mọi camera/video khác nhau.
function camToMap(cx: number, cy: number, fs: FrameSize): Point {
  return {
    x: (cx / fs.width)  * PARKING_GEOMETRY.width,
    y: (cy / fs.height) * PARKING_GEOMETRY.height,
  };
}

interface ViewBoxState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GateMapOverlay {
  editing: boolean;
  entry: readonly Point[];
  exit: readonly Point[];
  onPointClick?: (point: Point) => void;
}

interface ParkingMapProps {
  spots: readonly ParkingSpotState[];
  cameras: Record<CameraId, CameraState>;
  filter: BrowseFilter;
  recommendation?: RecommendationResult;
  inspectedSpotId?: SpotId;
  confirmedSpotId?: SpotId;
  activeNeed?: DestinationNeed;
  route?: RouteResult | null;
  routePaused?: boolean;
  activeVehicles?: ActiveVehicle[];   // ← xe đang di chuyển thời gian thực
  frameSize?: FrameSize;              // ← kích thước frame camera (tự động từ JSON)
  selectedVehicleId?: number;
  onVehicleClick?: (globalId: number) => void;
  gateOverlay?: GateMapOverlay;
  onSpotClick: (spotId: SpotId) => void;
}

const INITIAL_VIEW: ViewBoxState = {
  x: 0,
  y: 0,
  width: PARKING_GEOMETRY.width,
  height: PARKING_GEOMETRY.height,
};

function clampView(view: ViewBoxState): ViewBoxState {
  const width = Math.min(PARKING_GEOMETRY.width, Math.max(360, view.width));
  const height = width * (PARKING_GEOMETRY.height / PARKING_GEOMETRY.width);
  return {
    x: Math.min(PARKING_GEOMETRY.width - width, Math.max(0, view.x)),
    y: Math.min(PARKING_GEOMETRY.height - height, Math.max(0, view.y)),
    width,
    height,
  };
}

function MapPinMarker({ point, small = false }: { point: Point; small?: boolean }) {
  const scale = small ? 0.72 : 1;
  return (
    <g className="map-pin-marker" transform={`translate(${point.x} ${point.y - 12}) scale(${scale})`} aria-hidden="true">
      <path d="M0 0 C-15 -18 -18 -28 -18 -38 A18 18 0 1 1 18 -38 C18 -28 15 -18 0 0Z" />
      <circle cx="0" cy="-38" r="6" />
    </g>
  );
}

interface RouteArrowPoint extends Point {
  angle: number;
}

function simplifyRoutePoints(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const simplified: Point[] = [points[0]!];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified.at(-1)!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const crossProduct = (current.x - previous.x) * (next.y - current.y) - (current.y - previous.y) * (next.x - current.x);
    if (Math.abs(crossProduct) > 0.01) simplified.push(current);
  }

  simplified.push(points.at(-1)!);
  return simplified;
}

function createRouteArrows(points: Point[]): RouteArrowPoint[] {
  const segments = points.slice(1).map((point, index) => {
    const start = points[index]!;
    return { start, end: point, length: Math.hypot(point.x - start.x, point.y - start.y) };
  });
  const totalLength = segments.reduce((total, segment) => total + segment.length, 0);
  if (totalLength < 140) return [];

  const arrows: RouteArrowPoint[] = [];
  for (let targetDistance = 100; targetDistance < totalLength - 45; targetDistance += 190) {
    let traversed = 0;
    const segment = segments.find((candidate) => {
      if (targetDistance <= traversed + candidate.length) return true;
      traversed += candidate.length;
      return false;
    });
    if (!segment || segment.length === 0) continue;
    const ratio = (targetDistance - traversed) / segment.length;
    arrows.push({
      x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
      y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      angle: Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x) * (180 / Math.PI),
    });
  }
  return arrows;
}

export function ParkingMap({
  spots,
  cameras,
  filter,
  recommendation,
  inspectedSpotId,
  confirmedSpotId,
  activeNeed,
  route,
  routePaused = false,
  activeVehicles = [],
  frameSize = { width: 1100, height: 720 },
  selectedVehicleId,
  onVehicleClick,
  gateOverlay,
  onSpotClick,
}: ParkingMapProps) {
  const [view, setView] = useState(INITIAL_VIEW);
  const pointers = useRef(new Map<number, Point>());
  const svgRef = useRef<SVGSVGElement>(null);
  const spotById = new Map(spots.map((spot) => [spot.id, spot]));
  const recommendedIds = new Set(recommendation ? [recommendation.best.spotId, ...recommendation.alternatives.map((spot) => spot.spotId)] : []);

  const zoomAt = (factor: number, ratioX = 0.5, ratioY = 0.5): void => {
    setView((current) => {
      const nextWidth = current.width * factor;
      const nextHeight = current.height * factor;
      return clampView({
        x: current.x + (current.width - nextWidth) * ratioX,
        y: current.y + (current.height - nextHeight) * ratioY,
        width: nextWidth,
        height: nextHeight,
      });
    });
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>): void => {
    if (gateOverlay?.editing) return;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    if (gateOverlay?.editing) return;
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerValues = [...pointers.current.values()];

    if (pointerValues.length === 1) {
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      setView((current) =>
        clampView({
          ...current,
          x: current.x - (dx / rect.width) * current.width,
          y: current.y - (dy / rect.height) * current.height,
        }),
      );
    } else if (pointerValues.length === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const previousDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
        const nextDistance = Math.hypot(event.clientX - other.x, event.clientY - other.y);
        if (previousDistance > 0 && nextDistance > 0) {
          const midX = (event.clientX + other.x) / 2;
          const midY = (event.clientY + other.y) / 2;
          zoomAt(previousDistance / nextDistance, (midX - rect.left) / rect.width, (midY - rect.top) / rect.height);
        }
      }
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const handlePointerEnd = (event: PointerEvent<SVGSVGElement>): void => {
    pointers.current.delete(event.pointerId);
  };

  const handleWheel = (event: WheelEvent<SVGSVGElement>): void => {
    if (gateOverlay?.editing) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAt(event.deltaY > 0 ? 1.12 : 0.88, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };

  const handleMapClick = (event: MouseEvent<SVGSVGElement>): void => {
    if (!gateOverlay?.editing || !gateOverlay.onPointClick) return;
    const svg = event.currentTarget;
    const matrix = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
    if (matrix && typeof svg.createSVGPoint === "function") {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const mapped = point.matrixTransform(matrix.inverse());
      gateOverlay.onPointClick({ x: mapped.x, y: mapped.y });
      return;
    }
    const rect = svg.getBoundingClientRect();
    gateOverlay.onPointClick({
      x: view.x + ((event.clientX - rect.left) / rect.width) * view.width,
      y: view.y + ((event.clientY - rect.top) / rect.height) * view.height,
    });
  };

  const handleSpotKeyDown = (event: KeyboardEvent<SVGRectElement>, spotId: SpotId): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSpotClick(spotId);
    }
  };

  const renderedRoutePoints = simplifyRoutePoints(route?.points ?? []);
  const routePoints = renderedRoutePoints.map((point) => `${point.x},${point.y}`).join(" ");
  const routeArrows = createRouteArrows(renderedRoutePoints);

  return (
    <section className="map-panel" aria-label="Sơ đồ bãi đỗ xe">
      <div className="map-canvas" data-testid="parking-map">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          preserveAspectRatio="xMidYMin meet"
          role="img"
          aria-label={`Bản đồ ${spots.length} ô đỗ xe`}
          className={gateOverlay?.editing ? "gate-map-editing" : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
          onClick={handleMapClick}
        >
          <defs>
            <pattern id="landscape-pattern" width="26" height="26" patternUnits="userSpaceOnUse">
              <rect width="26" height="26" fill="#1e293b" />
              <circle cx="6" cy="8" r="2" fill="#334155" />
              <circle cx="20" cy="18" r="3" fill="#0f172a" />
            </pattern>
            <marker id="gate-entry-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="#38bdf8" />
            </marker>
            <marker id="gate-exit-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8 Z" fill="#e56b65" />
            </marker>
          </defs>

          <rect width={PARKING_GEOMETRY.width} height={PARKING_GEOMETRY.height} rx="26" fill="url(#landscape-pattern)" />
          
          {/* Parking Islands (E+D on left, C+B on right) */}
          <rect
            className="parking-island"
            x={PARKING_GEOMETRY.zones.find(z => z.id === "E")!.bounds.x - 10}
            y={PARKING_GEOMETRY.zones.find(z => z.id === "E")!.bounds.y - 45}
            width={180 + 20}
            height={PARKING_GEOMETRY.zones.find(z => z.id === "E")!.bounds.height + 65}
            rx="15"
            fill="#0f172a"
            stroke="#475569"
            strokeWidth="3"
          />
          <rect
            className="parking-island"
            x={PARKING_GEOMETRY.zones.find(z => z.id === "C")!.bounds.x - 10}
            y={PARKING_GEOMETRY.zones.find(z => z.id === "C")!.bounds.y - 45}
            width={180 + 20}
            height={PARKING_GEOMETRY.zones.find(z => z.id === "C")!.bounds.height + 65}
            rx="15"
            fill="#0f172a"
            stroke="#475569"
            strokeWidth="3"
          />

          {/* Aisles */}
          {PARKING_GEOMETRY.aisles.map(aisle => (
            <g key={aisle.id}>
              <rect className="access-road" {...aisle.bounds} fill="#334155" opacity="0.6" />
              <line
                className="lane-centerline"
                x1={aisle.centerX} x2={aisle.centerX}
                y1={aisle.bounds.y} y2={aisle.bounds.y + aisle.bounds.height}
              />
            </g>
          ))}

          {/* Horizontal Connectors */}
          {PARKING_GEOMETRY.horizontalConnectors.map(conn => (
            <g key={conn.id}>
              <rect className="access-road" {...conn.bounds} fill="#334155" opacity="0.6" />
              <line
                className="lane-centerline"
                x1={conn.centerline.start.x} x2={conn.centerline.end.x}
                y1={conn.centerline.start.y} y2={conn.centerline.end.y}
              />
            </g>
          ))}

          {/* Zone badges */}
          {PARKING_GEOMETRY.zones.map((zone) => (
            <g key={zone.id}>
              <g className="zone-badge" transform={`translate(${zone.bounds.x} ${zone.bounds.y - 30})`}>
                <rect width="90" height="26" rx="13" />
                <text x="45" y="18" textAnchor="middle">KHU {zone.id}</text>
              </g>
            </g>
          ))}

          {/* Cổng Ra */}
          <g transform={`translate(${PARKING_GEOMETRY.exit.x - 20} ${PARKING_GEOMETRY.exit.y}) rotate(90)`}>
            {/* Booth */}
            <rect x="-45" y="-10" width="20" height="20" rx="4" fill="#3b82f6" />
            <rect x="-40" y="-5" width="10" height="10" rx="2" fill="#bfdbfe" />
            {/* Barrier bar */}
            <rect x="-25" y="0" width="70" height="4" rx="2" fill="#ef4444" />
            {/* Striped pattern on barrier */}
            <path d="M-20 0 L-15 4 M-10 0 L-5 4 M0 0 L5 4 M10 0 L15 4 M20 0 L25 4 M30 0 L35 4 M40 0 L45 4" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g className="access-label" transform={`translate(${PARKING_GEOMETRY.exit.x + 15} ${PARKING_GEOMETRY.exit.y})`}>
            <path d="M-15 0 H15 M5 -9 L16 0 L5 9" />
            <text x="50" y="5" textAnchor="middle">LỐI RA</text>
          </g>

          {/* Cổng Vào */}
          <g transform={`translate(${PARKING_GEOMETRY.entrance.x - 20} ${PARKING_GEOMETRY.entrance.y}) rotate(90)`}>
            {/* Booth */}
            <rect x="-45" y="-10" width="20" height="20" rx="4" fill="#3b82f6" />
            <rect x="-40" y="-5" width="10" height="10" rx="2" fill="#bfdbfe" />
            {/* Barrier bar */}
            <rect x="-25" y="0" width="70" height="4" rx="2" fill="#ef4444" />
            {/* Striped pattern on barrier */}
            <path d="M-20 0 L-15 4 M-10 0 L-5 4 M0 0 L5 4 M10 0 L15 4 M20 0 L25 4 M30 0 L35 4 M40 0 L45 4" stroke="#ffffff" strokeWidth="2" />
          </g>
          <g className="access-label" transform={`translate(${PARKING_GEOMETRY.entrance.x + 15} ${PARKING_GEOMETRY.entrance.y})`}>
            <path d="M25 0 H-5 M5 -9 L-6 0 L5 9" />
            <text x="50" y="5" textAnchor="middle">LỐI VÀO</text>
          </g>

          <g aria-hidden="true">
            {PARKING_GEOMETRY.spots.map((geometry) => {
              const spot = spotById.get(geometry.id);
              if (!spot) return null;
              const dimmed = filter === "empty" && spot.status !== "empty";
              let highlight: SpotHighlight | undefined;
              if (confirmedSpotId === spot.id) highlight = "confirmed";
              else if (inspectedSpotId === spot.id) highlight = "inspected";
              else if (recommendation?.best.spotId === spot.id) highlight = "recommended";
              else if (recommendedIds.has(spot.id)) highlight = "alternative";
              return (
                <ParkingSpotShape
                  key={spot.id}
                  geometry={geometry}
                  spot={spot}
                  highlight={highlight}
                  staleCamera={cameras[spot.owner].health === "offline"}
                  dimmed={dimmed}
                />
              );
            })}
          </g>

          {activeNeed && (
            <g className="access-anchor" transform={`translate(${PARKING_GEOMETRY.anchors[activeNeed].x} ${PARKING_GEOMETRY.anchors[activeNeed].y})`}>
              <circle r="13" />
              <path d="M-5 2 L-1 6 L7 -5" />
              <text x="18" y="5">{DESTINATION_LABELS[activeNeed]}</text>
            </g>
          )}

          {routePoints && !routePaused && (
            <g className="active-route" data-testid="active-route" aria-label="Tuyến đường đang hoạt động">
              <polyline className="route-underlay" points={routePoints} />
              <polyline className="route-line" points={routePoints} />
              {routeArrows.map((arrow, index) => (
                <g
                  className="route-direction"
                  key={`${arrow.x}-${arrow.y}-${index}`}
                  transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
                >
                  <path d="M-9 -6 L8 0 L-9 6 Z" />
                </g>
              ))}
            </g>
          )}

          {recommendation && !confirmedSpotId && (() => {
            const geometry = PARKING_GEOMETRY.spots.find((spot) => spot.id === recommendation.best.spotId);
            return geometry ? <MapPinMarker point={{ x: geometry.x + geometry.width / 2, y: geometry.y }} small /> : null;
          })()}
          {confirmedSpotId && (() => {
            const geometry = PARKING_GEOMETRY.spots.find((spot) => spot.id === confirmedSpotId);
            return geometry ? <MapPinMarker point={{ x: geometry.x + geometry.width / 2, y: geometry.y }} /> : null;
          })()}

          {/* ── Icon xe di chuyển thời gian thực (từ tracker của An) ────────── */}
          {activeVehicles.map((vehicle) => {
            const pos = camToMap(vehicle.x, vehicle.y, frameSize);
            const trailPoints = vehicle.trail
              .slice(-25)
              .map((p) => camToMap(p.x, p.y, frameSize))
              .map((p) => `${p.x},${p.y}`)
              .join(" ");
            return (
              <g
                key={vehicle.trackId}
                className={selectedVehicleId === vehicle.trackId ? "runtime-vehicle runtime-vehicle--selected" : "runtime-vehicle"}
                role={onVehicleClick ? "button" : undefined}
                tabIndex={onVehicleClick ? 0 : undefined}
                aria-label={`Xe Global ID ${vehicle.trackId}`}
                pointerEvents={gateOverlay?.editing ? "none" : undefined}
                onPointerDown={(event) => onVehicleClick && event.stopPropagation()}
                onClick={() => onVehicleClick?.(vehicle.trackId)}
                onKeyDown={(event) => {
                  if (onVehicleClick && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onVehicleClick(vehicle.trackId);
                  }
                }}
              >
                {/* Đường trail động – màu vàng đứt nút */}
                {trailPoints && (
                  <polyline
                    points={trailPoints}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.55}
                    strokeDasharray="8 5"
                  />
                )}
                {/* Xe + Nhãn ID - Di chuyển mượt bằng CSS transform transition */}
                <g
                  style={{
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    transition: "transform 0.12s linear",
                    opacity: vehicle.observed === false ? 0.45 : 1,
                    willChange: "transform",
                  }}
                >
                  {/* Halo phát sáng */}
                  <circle cx={0} cy={0} r={35} fill="#ef4444" opacity={0.18}>
                    <animate attributeName="r" values="30;42;30" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.22;0.06;0.22" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                  {/* Nền tròn xe */}
                  <circle
                    className="runtime-vehicle-core"
                    cx={0}
                    cy={0}
                    r={selectedVehicleId === vehicle.trackId ? 29 : 24}
                    fill="#ef4444"
                    stroke={selectedVehicleId === vehicle.trackId ? "#38bdf8" : "#fff"}
                    strokeWidth={selectedVehicleId === vehicle.trackId ? 5 : 3}
                  />
                  {/* Biểu tượng xe */}
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={24}
                    fill="white"
                  >
                    {"\uD83D\uDE97"}
                  </text>
                  {/* Nhãn ID track */}
                  <rect
                    x={14}
                    y={-14}
                    width={28}
                    height={16}
                    rx={4}
                    fill="rgba(0,0,0,0.7)"
                  />
                  <text
                    x={28}
                    y={-6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9}
                    fontWeight="700"
                    fill="#fbbf24"
                  >
                    #{vehicle.trackId}
                  </text>
                </g>
              </g>
            );
          })}

          {gateOverlay && (["entry", "exit"] as const).map((gateName) => {
            const points = gateOverlay[gateName];
            const color = gateName === "entry" ? "#38bdf8" : "#e56b65";
            const label = gateName === "entry" ? "ENTRY" : "EXIT";
            const midpoint = points.length >= 2 ? {
              x: (points[0]!.x + points[1]!.x) / 2,
              y: (points[0]!.y + points[1]!.y) / 2,
            } : null;
            return (
              <g key={gateName} className={`gate-map-overlay gate-map-overlay--${gateName}`} pointerEvents="none" data-testid={`gate-${gateName}`}>
                {points.length >= 2 && (
                  <line
                    x1={points[0]!.x}
                    y1={points[0]!.y}
                    x2={points[1]!.x}
                    y2={points[1]!.y}
                    stroke={color}
                    strokeWidth={gateOverlay.editing ? 7 : 5}
                    strokeLinecap="round"
                  />
                )}
                {midpoint && points[2] && (
                  <line
                    x1={midpoint.x}
                    y1={midpoint.y}
                    x2={points[2].x}
                    y2={points[2].y}
                    stroke={color}
                    strokeWidth="4"
                    strokeDasharray="9 7"
                    markerEnd={`url(#gate-${gateName}-arrow)`}
                  />
                )}
                {points.map((point, index) => (
                  <g key={`${point.x}-${point.y}-${index}`}>
                    <circle cx={point.x} cy={point.y} r={index === 2 ? 9 : 8} fill="#111820" stroke={color} strokeWidth="4" />
                    <text x={point.x} y={point.y - 14} fill={color} textAnchor="middle" fontSize="17" fontWeight="800">
                      {index === 2 ? "→" : index + 1}
                    </text>
                  </g>
                ))}
                {points[0] && (
                  <text x={points[0].x + 13} y={points[0].y + 24} fill={color} fontSize="18" fontWeight="900">
                    {label}
                  </text>
                )}
              </g>
            );
          })}

          {!gateOverlay?.editing && <g className="spot-hit-layer">
            {PARKING_GEOMETRY.spots.map((geometry) => {
              const spot = spotById.get(geometry.id);
              if (!spot) return null;
              const hidden = filter === "empty" && spot.status !== "empty";
              return (
                <rect
                  key={spot.id}
                  x={geometry.x - 2}
                  y={geometry.y - 3}
                  width={geometry.width + 4}
                  height={geometry.height + 6}
                  rx="5"
                  role="button"
                  tabIndex={hidden ? -1 : 0}
                  aria-label={`Ô ${spot.id}, ${STATUS_LABELS[spot.status]}`}
                  aria-current={confirmedSpotId === spot.id ? "location" : undefined}
                  aria-disabled={hidden}
                  data-spot-id={spot.id}
                  data-status={spot.status}
                  data-testid={`spot-${spot.id}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => !hidden && onSpotClick(spot.id)}
                  onKeyDown={(event) => !hidden && handleSpotKeyDown(event, spot.id)}
                />
              );
            })}
          </g>}
        </svg>
        {!gateOverlay?.editing && (
          <MapControls
            onZoomIn={() => zoomAt(0.8)}
            onZoomOut={() => zoomAt(1.25)}
            onReset={() => setView(INITIAL_VIEW)}
          />
        )}
      </div>
    </section>
  );
}
