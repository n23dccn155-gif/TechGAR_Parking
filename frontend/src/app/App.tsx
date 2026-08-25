import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowseToolbar } from "../components/BrowseToolbar";
import { EntryChoiceSheet } from "../components/EntryChoiceSheet";
import { InvalidSpotWarningSheet } from "../components/InvalidSpotWarningSheet";
import { MockControlPanel } from "../components/MockControlPanel";
import { NavigationStatusBar } from "../components/NavigationStatusBar";
import { ParkingLegend } from "../components/ParkingLegend";
import { ParkingMap } from "../components/ParkingMap";
import { RecommendationPanel } from "../components/RecommendationPanel";
import { SmartParkingHeader } from "../components/SmartParkingHeader";
import { SpotDetailSheet } from "../components/SpotDetailSheet";
import { SummaryCards } from "../components/SummaryCards";
import { classifySpotOccupancy, type DestinationNeed, type ParkingSpotState, type ParkingStatus, type RankedSpot, type SpotId } from "../domain/parking";
import { mockParkingDataSource } from "../mocks/MockParkingDataSource";
import { recommendParkingSpots } from "../recommendation/recommendationEngine";
import { LANE_GRAPH, updateGateNodesInGraph } from "../routing/laneGraph";
import { type RouteResult, findVehicleRoute, findExitRoute, findExitRouteFromPos, findInboundRouteFromPos } from "../routing/routeEngine";
import { voiceManager, checkIsOffRoute, getNavigationInstruction } from "../routing/voiceGuidance";
import { SPOT_GEOMETRY_BY_ID } from "../geometry/parkingGeometry";
import { useDriverFlowStore } from "../stores/driverFlowStore";
import { deriveParkingCounts, useParkingStore } from "../stores/parkingStore";
import { getRuntimeGateConfig, getRuntimeSnapshot } from "../api/runtimeApi";
import { runtimeCameraStates, runtimeParkingSpots } from "../adapters/runtimeAdapter";
import { createWorldToSvg, runtimeVehiclesOnSvg } from "../calibration/worldToSvg";
import { PARKING_GEOMETRY } from "../geometry/parkingGeometry";
import type { ActiveVehicle, FrameSize } from "../domain/runtime";
import type { VehicleSession } from "../domain/session";
import { buildSessionCompletionKey } from "../domain/session";
import { BackendApiError, claimSession, getSession, selectSpot, SessionNotFoundError, startExit } from "../api/backendApi";

const NON_EMPTY_STATUSES: ReadonlySet<ParkingStatus> = new Set(["transitioning", "occupied", "unknown"]);
const PARKING_DWELL_MS = 2000;

interface AppProps {
  sessionId?: string | null;
}

export function App({ sessionId }: AppProps = {}) {
  const [activeVehicles, setActiveVehicles] = useState<ActiveVehicle[]>([]);
  const [frameSize, setFrameSize]           = useState<FrameSize>({ width: 1200, height: 900 });
  const [sessionInfo, setSessionInfo]       = useState<VehicleSession | null>(null);
  const [sessionEnded, setSessionEnded]     = useState(false);
  const [runtimeState, setRuntimeState]     = useState<"connecting" | "live" | "error">("connecting");
  const [runtimeError, setRuntimeError]     = useState<string | null>(null);

  const sessionTrackIdRef = useRef<number | null>(null);
  const loadedSessionRef = useRef(false);
  const activeVehiclesRef = useRef<ActiveVehicle[]>([]);

  useEffect(() => {
    activeVehiclesRef.current = activeVehicles;
  }, [activeVehicles]);

  const spotsById = useParkingStore((state) => state.spots);
  const cameras = useParkingStore((state) => state.cameras);
  const lastEventTime = useParkingStore((state) => state.lastEventTime);
  const applySnapshot = useParkingStore((state) => state.applySnapshot);
  const applyEvent = useParkingStore((state) => state.applyEvent);
  const trackingSource = useParkingStore((state) => state.trackingSource);
  const setTrackingSource = useParkingStore((state) => state.setTrackingSource);

  const mode = useDriverFlowStore((state) => state.mode);
  const browseFilter = useDriverFlowStore((state) => state.browseFilter);
  const activeNeed = useDriverFlowStore((state) => state.activeNeed);
  const recommendation = useDriverFlowStore((state) => state.recommendation);
  const inspectedSpotId = useDriverFlowStore((state) => state.inspectedSpotId);
  const confirmedSpotId = useDriverFlowStore((state) => state.confirmedSpotId);
  const warning = useDriverFlowStore((state) => state.warning);
  const enterBrowse = useDriverFlowStore((state) => state.enterBrowse);
  const startRecommendation = useDriverFlowStore((state) => state.startRecommendation);
  const chooseNeed = useDriverFlowStore((state) => state.chooseNeed);
  const setRecommendation = useDriverFlowStore((state) => state.setRecommendation);
  const chooseRecommendedSpot = useDriverFlowStore((state) => state.chooseRecommendedSpot);
  const inspectSpot = useDriverFlowStore((state) => state.inspectSpot);
  const confirmSpot = useDriverFlowStore((state) => state.confirmSpot);
  const setBrowseFilter = useDriverFlowStore((state) => state.setBrowseFilter);
  const showInvalidSpotWarning = useDriverFlowStore((state) => state.showInvalidSpotWarning);
  const clearWarning = useDriverFlowStore((state) => state.clearWarning);
  const cancelNavigation = useDriverFlowStore((state) => state.cancelNavigation);

  const spots = useMemo(
    () => Object.values(spotsById).filter((spot): spot is ParkingSpotState => spot !== undefined),
    [spotsById],
  );
  const counts = useMemo(() => deriveParkingCounts(spots), [spots]);
  const inspectedSpot = inspectedSpotId ? spotsById[inspectedSpotId] : undefined;
  const confirmedSpot = confirmedSpotId ? spotsById[confirmedSpotId] : undefined;

  // ── Session values ──
  const sessionState = sessionInfo?.state ?? null;
  const sessionTargetSpot = sessionInfo?.targetSpotId ?? null;
  const sessionParkedSpot = sessionInfo?.parkedSpotId ?? null;
  const targetVehicleId = sessionInfo?.globalVehicleId ?? sessionInfo?.activeTrackId ?? sessionInfo?.vehicleTrackId ?? null;
  const runtimeParkedSpot = targetVehicleId === null
    ? null
    : activeVehicles.find((vehicle) => vehicle.trackId === targetVehicleId)?.parkedSlotId ?? null;

  useEffect(() => {
    if (sessionId) setTrackingSource("opencv");
  }, [sessionId, setTrackingSource]);

  useEffect(() => {
    if (trackingSource !== "sample") return;
    const unsubscribe = mockParkingDataSource.subscribe(applyEvent);
    mockParkingDataSource.start();
    return () => {
      unsubscribe();
      mockParkingDataSource.stop();
    };
  }, [applyEvent, trackingSource]);

  // ── Auto-claim session khi mở trang cá nhân lần đầu ──
  const claimedRef = useRef(false);
  useEffect(() => {
    if (!sessionId || claimedRef.current) return;
    const doClaim = async () => {
      claimedRef.current = true;
      try {
        setSessionInfo(await claimSession(sessionId));
      } catch (error) {
        console.warn("Không thể nhận phiên xe", error);
      }
    };
    void doClaim();
  }, [sessionId]);

  // ── Fetch dữ liệu ô đỗ & tracking feed ──
  useEffect(() => {
    let active = true;
    const sourceIsCurrent = () => useParkingStore.getState().trackingSource === trackingSource;

    if (trackingSource === "sample") {
      setRuntimeError(null);
      void mockParkingDataSource.getSnapshot().then((snapshot) => {
        if (active && sourceIsCurrent()) applySnapshot(snapshot);
      });
    } else {
      setRuntimeState("connecting");
      setRuntimeError(null);
      setActiveVehicles([]);
    }

    const requireLiveRuntime = (runtime: Awaited<ReturnType<typeof getRuntimeSnapshot>>) => {
      if (runtime.source_mode !== "live") {
        throw new Error("Runtime OpenCV đang chạy dữ liệu replay, không phải camera realtime");
      }
      const dataAge = Date.now() - new Date(runtime.published_at).getTime();
      if (!Number.isFinite(dataAge) || dataAge > 5000) {
        throw new Error("Dữ liệu camera realtime đã quá hạn 5 giây");
      }
      return runtime;
    };

    const fetchRealtimeStatus = async () => {
      try {
        if (trackingSource !== "opencv") return;
        const runtime = requireLiveRuntime(await getRuntimeSnapshot());
        const runtimeSpots = runtimeParkingSpots(runtime);
        if (!active || !sourceIsCurrent()) return;
        applySnapshot({
          spots: runtimeSpots,
          cameras: runtimeCameraStates(runtime),
          capturedAt: runtime.published_at,
        });
        if (active) {
          setRuntimeState("live");
          setRuntimeError(null);
        }
      } catch (error) {
        if (trackingSource === "opencv" && active && sourceIsCurrent()) {
          setRuntimeState("error");
          setRuntimeError(error instanceof Error ? error.message : "Không kết nối được Runtime API realtime");
        }
      }
    };

    void fetchRealtimeStatus();
    const interval = setInterval(fetchRealtimeStatus, 1000);

    // ── Đồng bộ CỔNG VÀO / CỔNG RA cho đồ thị dẫn đường ──
    const fetchGateRoi = async () => {
      try {
        if (trackingSource === "opencv") {
          const [gateConfig, runtime] = await Promise.all([
            getRuntimeGateConfig(),
            getRuntimeSnapshot(),
          ]);
          if (!gateConfig || !active || !sourceIsCurrent()) return;
          const project = createWorldToSvg(runtime.slot_layout);
          updateGateNodesInGraph(LANE_GRAPH, {
            entry_gate: {
              p1: project(gateConfig.entry_gate.p1),
              p2: project(gateConfig.entry_gate.p2),
            },
            exit_gate: {
              p1: project(gateConfig.exit_gate.p1),
              p2: project(gateConfig.exit_gate.p2),
            },
          });
          return;
        }
        const res = await fetch(`/gate_roi.json?t=${Date.now()}`);
        if (!res.ok || !active) return;
        const data = await res.json();
        if (data.entry_gate && data.exit_gate) {
          updateGateNodesInGraph(LANE_GRAPH, data);
        }
      } catch {
        /* fetch failed */
      }
    };
    void fetchGateRoi();
    const gateRoiInterval = setInterval(fetchGateRoi, 1000);

    // ── Polling session info (500ms) ──
    const fetchSessionInfo = async () => {
      if (!sessionId || !active) return;

      try {
        const session = await getSession(sessionId);
        if (!active || !sourceIsCurrent()) return;
        loadedSessionRef.current = true;
        setSessionEnded(false);
        setSessionInfo(session);
        sessionTrackIdRef.current = session.globalVehicleId ?? session.activeTrackId ?? session.vehicleTrackId;
      } catch (error) {
        if (error instanceof SessionNotFoundError && active) {
          setSessionEnded(true);
          setSessionInfo(null);
          setActiveVehicles([]);
          sessionTrackIdRef.current = null;
        } else if (loadedSessionRef.current) {
          console.warn("Tạm thời không đọc được phiên xe", error);
        }
      }
    };

    if (sessionId) {
      void fetchSessionInfo();
    }
    const sessionInterval = sessionId ? setInterval(fetchSessionInfo, 500) : null;

    // ── Polling vehicle positions ──
    const STALE_THRESHOLD_MS = 5000;

    const fetchVehiclePositions = async () => {
      try {
        if (trackingSource === "opencv") {
          const runtime = requireLiveRuntime(await getRuntimeSnapshot());
          const targetId = sessionId ? sessionTrackIdRef.current : null;
          const vehicles = runtimeVehiclesOnSvg(runtime, targetId);
          setFrameSize({ width: PARKING_GEOMETRY.width, height: PARKING_GEOMETRY.height });
          if (active && sourceIsCurrent()) {
            setActiveVehicles(vehicles);
            setRuntimeState("live");
            setRuntimeError(null);
          }
          return;
        }
        const file = "vehicle_positions_sample.json";
        const res = await fetch(`/${file}?t=${Date.now()}`);
        if (!res.ok || !active || !sourceIsCurrent()) return;
        const data = await res.json();

        if (data?.timestamp) {
          const dataAge = Date.now() - new Date(data.timestamp).getTime();
          if (dataAge > STALE_THRESHOLD_MS) {
            if (active && sourceIsCurrent()) setActiveVehicles([]);
            return;
          }
        }

        let vehicles: ActiveVehicle[] = Object.entries(
          (data?.active_vehicles ?? {}) as Record<string, { position: { x: number; y: number }; trail?: Array<{ x: number; y: number }> }>
        ).map(([idStr, v]) => ({
          trackId: Number(idStr),
          x: v.position?.x ?? 0,
          y: v.position?.y ?? 0,
          trail: v.trail ?? [],
        }));

        // 🎯 NẾU TRANG CÁ NHÂN (có sessionId) → CHỈ GIỮ LẠI DUY NHẤT XE CỦA SESSION ĐÓ
        if (sessionId) {
          const targetId = sessionTrackIdRef.current;
          vehicles = targetId === null ? [] : vehicles.filter((v) => v.trackId === targetId);

          // 💡 Nếu xe đang đỗ/lái ra mà tắt máy (không có trong active_vehicles), lấy tọa độ tâm ô đỗ thực tế
          if (vehicles.length === 0 && targetId !== null) {
            const currentSpotId = (sessionInfo?.parkedSpotId || sessionInfo?.targetSpotId) as SpotId | null;
            if (currentSpotId) {
              const spotGeo = SPOT_GEOMETRY_BY_ID.get(currentSpotId);
              if (spotGeo) {
                vehicles = [{
                  trackId: targetId,
                  x: spotGeo.x + spotGeo.width / 2,
                  y: spotGeo.y + spotGeo.height / 2,
                  trail: [],
                }];
              }
            }
          }
        }

        if (data?.frame_size?.width && data?.frame_size?.height) {
          setFrameSize({ width: data.frame_size.width, height: data.frame_size.height });
        }
        if (active && sourceIsCurrent()) setActiveVehicles(vehicles);
      } catch (error) {
        if (trackingSource === "opencv" && active && sourceIsCurrent()) {
          setActiveVehicles([]);
          setRuntimeState("error");
          setRuntimeError(error instanceof Error ? error.message : "Không kết nối được Runtime API realtime");
        }
      }
    };

    void fetchVehiclePositions();
    const vehicleInterval = setInterval(fetchVehiclePositions, 300);

    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(gateRoiInterval);
      clearInterval(vehicleInterval);
      if (sessionInterval) clearInterval(sessionInterval);
    };
  }, [applyEvent, applySnapshot, trackingSource, sessionId, sessionInfo?.parkedSpotId, sessionInfo?.targetSpotId]);

  useEffect(() => {
    if (mode !== "recommendation" || !activeNeed || spots.length === 0) return;
    const result = recommendParkingSpots(spots, activeNeed, {
      calculatedAt: lastEventTime ?? "2026-07-25T08:00:00.000Z",
    });
    setRecommendation(result ?? undefined);
  }, [activeNeed, lastEventTime, mode, setRecommendation, spots]);

  useEffect(() => {
    const activeTargetId = sessionId ? sessionTargetSpot : (mode === "navigation" ? confirmedSpotId : null);
    if (!activeTargetId) {
      if (warning) clearWarning();
      return;
    }

    const targetSpot = spotsById[activeTargetId as SpotId];
    if (!targetSpot) return;

    if (sessionState === "EXIT_NAVIGATION" || sessionState === "PARKED") {
      if (warning?.spotId === targetSpot.id) clearWarning();
      return;
    }

    const relation = sessionId
      ? classifySpotOccupancy(targetSpot, targetVehicleId, sessionParkedSpot ?? runtimeParkedSpot)
      : NON_EMPTY_STATUSES.has(targetSpot.status) ? "other" : "empty";

    if (relation === "empty" || relation === "own") {
      if (warning?.spotId === targetSpot.id) clearWarning();
      return;
    }

    if (!sessionId) {
      if (
        warning?.spotId === targetSpot.id
        && warning.status === targetSpot.status
      ) return;
      const need: DestinationNeed = activeNeed ?? "services";
      const alternatives = recommendParkingSpots(spots, need, {
        calculatedAt: lastEventTime ?? "2026-07-25T08:00:00.000Z",
      });
      const alternativeSpotIds = [alternatives?.best, ...(alternatives?.alternatives ?? [])]
        .filter((candidate): candidate is RankedSpot => Boolean(candidate) && candidate?.spotId !== targetSpot.id)
        .map((candidate) => candidate.spotId)
        .slice(0, 3);
      const alternativeSpotId = alternativeSpotIds[0];
      showInvalidSpotWarning({
        spotId: targetSpot.id,
        status: targetSpot.status as Exclude<ParkingStatus, "empty">,
        alternativeSpotId,
        alternativeSpotIds,
      });
      return;
    }

    if (relation === "unknown" && targetSpot.status === "occupied") {
      if (warning?.spotId === targetSpot.id) clearWarning();
      return;
    }

    if (relation === "unknown" && targetSpot.status !== "occupied") {
      if (
        warning?.spotId === targetSpot.id
        && warning.status === targetSpot.status
      ) return;
      const need: DestinationNeed = activeNeed ?? "services";
      const currentVehicle = targetVehicleId === null
        ? undefined
        : activeVehicles.find((vehicle) => vehicle.trackId === targetVehicleId);
      const alternatives = recommendParkingSpots(spots, need, {
        calculatedAt: lastEventTime ?? "2026-07-25T08:00:00.000Z",
        startPosition: currentVehicle ? { x: currentVehicle.x, y: currentVehicle.y } : undefined,
      });
      const alternativeSpotIds = [alternatives?.best, ...(alternatives?.alternatives ?? [])]
        .filter((candidate): candidate is RankedSpot => Boolean(candidate) && candidate?.spotId !== targetSpot.id)
        .map((candidate) => candidate.spotId)
        .slice(0, 3);
      const alternativeSpotId = alternativeSpotIds[0];
      showInvalidSpotWarning({
        spotId: targetSpot.id,
        status: targetSpot.status as Exclude<ParkingStatus, "empty">,
        alternativeSpotId,
        alternativeSpotIds,
      });
      return;
    }

    if (targetSpot.vehicleId === targetVehicleId) {
      if (warning?.spotId === targetSpot.id) clearWarning();
      return;
    }

    if (
      targetSpot.trackingState !== "parked"
      || (targetSpot.stoppedForMs ?? 0) < PARKING_DWELL_MS
    ) {
      if (warning?.spotId === targetSpot.id) clearWarning();
      return;
    }

    if (
      warning?.spotId === targetSpot.id
      && warning.status === "occupied"
    ) return;

    const need: DestinationNeed = activeNeed ?? "services";
    const currentVehicle = targetVehicleId === null
      ? undefined
      : activeVehicles.find((vehicle) => vehicle.trackId === targetVehicleId);
    const alternatives = recommendParkingSpots(spots, need, {
      calculatedAt: lastEventTime ?? "2026-07-25T08:00:00.000Z",
      startPosition: currentVehicle ? { x: currentVehicle.x, y: currentVehicle.y } : undefined,
    });
    const alternativeSpotIds = [alternatives?.best, ...(alternatives?.alternatives ?? [])]
      .filter((candidate): candidate is RankedSpot => Boolean(candidate) && candidate?.spotId !== targetSpot.id)
      .map((candidate) => candidate.spotId)
      .slice(0, 3);
    const alternativeSpotId = alternativeSpotIds[0];

    voiceManager.speak(`Cảnh báo, ô đỗ ${targetSpot.id} đã có xe khác đỗ. Vui lòng xác nhận để đổi hướng sang ô ${alternativeSpotId || "khác"}.`, 6000, true);

    showInvalidSpotWarning({
      spotId: targetSpot.id,
      status: "occupied",
      alternativeSpotId,
      alternativeSpotIds,
    });
  }, [sessionId, sessionTargetSpot, confirmedSpotId, mode, warning, spotsById, sessionParkedSpot, runtimeParkedSpot, sessionState, activeNeed, spots, lastEventTime, targetVehicleId, activeVehicles, showInvalidSpotWarning, clearWarning]);

  const [isRouteDismissed, setIsRouteDismissed] = useState<boolean>(false);
  // isExitGuideActive: true = đang bật "Chỉ lối ra", false = ẩn đường lối ra khi PARKED
  const [isExitGuideActive, setIsExitGuideActive] = useState<boolean>(false);
  // Completion keys that have already been shown (session-scoped + sessionStorage for reload safety).
  const consumedCompletionKeysRef = useRef<Set<string>>(new Set());
  const [showParkedSuccess, setShowParkedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!sessionId) return;
    if (sessionState === "NAVIGATING_TO_SPOT" && sessionTargetSpot) {
      setIsRouteDismissed(false);
      if (confirmedSpotId !== sessionTargetSpot) {
        confirmSpot(sessionTargetSpot as SpotId);
      }
      return;
    }
    if (sessionState === "SELECTING_SPOT" && mode === "entry") {
      enterBrowse("all");
      return;
    }
    if (sessionState === "PARKED") {
      setIsRouteDismissed(true);
      setIsExitGuideActive(false);
      voiceManager.stop();
      if (mode === "navigation" || confirmedSpotId || warning) cancelNavigation();
    }
  }, [sessionId, sessionState, sessionTargetSpot, confirmedSpotId, mode, warning, confirmSpot, enterBrowse, cancelNavigation]);

  useEffect(() => {
    if (!sessionId || sessionState !== "PARKED" || !sessionInfo) {
      setShowParkedSuccess(false);
      return;
    }
    const completionKey = buildSessionCompletionKey(sessionInfo);
    if (!completionKey) {
      setShowParkedSuccess(false);
      return;
    }
    if (consumedCompletionKeysRef.current.has(completionKey)) {
      return;
    }
    const storageKey = `techgar:parkedSuccess:${sessionId}`;
    try {
      const stored = window.sessionStorage.getItem(storageKey);
      if (stored === completionKey) {
        consumedCompletionKeysRef.current.add(completionKey);
        return;
      }
    } catch {
      // sessionStorage may be unavailable
    }
    consumedCompletionKeysRef.current.add(completionKey);
    try {
      window.sessionStorage.setItem(storageKey, completionKey);
    } catch {
      // ignore
    }
    setShowParkedSuccess(true);
    if (sessionInfo.parkedSpotId) {
      voiceManager.speak(`Đã đỗ xe thành công tại ô ${sessionInfo.parkedSpotId}`, 6000, true);
    }
    const timer = setTimeout(() => setShowParkedSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [sessionId, sessionState, sessionInfo]);

  // Xác định mục tiêu và chế độ dẫn đường
  const { goalSpot, isExitMode } = useMemo(() => {
    let isExit = false;
    let goal: SpotId | null = null;
    if (sessionState === "PARKED" || sessionState === "EXIT_NAVIGATION") {
      if (isExitGuideActive) {
        isExit = true;
        goal = (sessionParkedSpot || confirmedSpotId) as SpotId | null;
      }
    } else {
      goal = (sessionId && sessionTargetSpot) ? (sessionTargetSpot as SpotId) : (confirmedSpotId || inspectedSpotId) as SpotId | null;
    }
    if (isRouteDismissed || sessionEnded) {
      goal = null;
    }
    return { goalSpot: goal, isExitMode: isExit };
  }, [sessionState, isExitGuideActive, sessionParkedSpot, confirmedSpotId, sessionId, sessionTargetSpot, inspectedSpotId, isRouteDismissed, sessionEnded]);

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isOffRoute, setIsOffRoute] = useState<boolean>(false);
  const [navInstruction, setNavInstruction] = useState<string | null>(null);

  const currentGoalRef = useRef<{ spot: SpotId | null, exitMode: boolean }>({ spot: null, exitMode: false });
  const routeRef = useRef<RouteResult | null>(null);

  // ── Effect 1: Tính đường đi — CHỈ khi đích/mode thay đổi ──
  useEffect(() => {
    if (!goalSpot) {
      setRoute(null);
      setIsOffRoute(false);
      setNavInstruction(null);
      voiceManager.stop();
      currentGoalRef.current = { spot: null, exitMode: false };
      routeRef.current = null;
      return;
    }

    const targetVehicleId = sessionTrackIdRef.current;
    const targetVehicle = activeVehiclesRef.current.find((v) => v.trackId === targetVehicleId);

    let newRoute: RouteResult | null;
    if (isExitMode) {
      newRoute = targetVehicle
        ? findExitRouteFromPos(LANE_GRAPH, targetVehicle.x, targetVehicle.y, goalSpot)
        : findExitRoute(LANE_GRAPH, goalSpot);
    } else {
      newRoute = targetVehicle
        ? findInboundRouteFromPos(LANE_GRAPH, targetVehicle.x, targetVehicle.y, goalSpot)
        : findVehicleRoute(LANE_GRAPH, goalSpot);
    }

    routeRef.current = newRoute;
    setRoute(newRoute);
    currentGoalRef.current = { spot: goalSpot, exitMode: isExitMode };

  }, [goalSpot, isExitMode, sessionId]); // Chỉ phụ thuộc đích — KHÔNG phụ thuộc activeVehicles

  // ── Effect 2: Cập nhật hướng dẫn & giọng nói — theo vị trí xe (300ms) ──
  useEffect(() => {
    const activeRoute = routeRef.current;
    if (!goalSpot || !activeRoute || activeRoute.points.length < 2) {
      return;
    }

    const targetVehicleId = sessionTrackIdRef.current;
    const targetVehicle = activeVehicles.find((v) => v.trackId === targetVehicleId);

    if (!targetVehicle) return;

    const currentOffRoute = checkIsOffRoute(
      { x: targetVehicle.x, y: targetVehicle.y },
      activeRoute.points,
      80
    );
    setIsOffRoute(currentOffRoute);

    // Tính toán route mới nhất từ toạ độ hiện tại của xe
    let freshRoute: RouteResult | null = null;
    if (isExitMode) {
      freshRoute = findExitRouteFromPos(LANE_GRAPH, targetVehicle.x, targetVehicle.y, goalSpot);
    } else {
      freshRoute = findInboundRouteFromPos(LANE_GRAPH, targetVehicle.x, targetVehicle.y, goalSpot);
    }

    if (currentOffRoute) {
      voiceManager.speak("Cảnh báo: Bạn đang đi sai tuyến đường chỉ dẫn!", 7000, true);
      setNavInstruction("⚠️ BẠN ĐANG ĐI SAI TUYẾN ĐƯỜNG CHỈ DẪN!");
      // Tự động re-route đường mới nếu xe đi sai
      if (freshRoute) {
        setRoute(freshRoute);
        routeRef.current = freshRoute;
      }
    } else {
      // Xe đi đúng đường: Cập nhật đường vẽ co ngắn dần theo xe
      if (freshRoute) {
        setRoute(freshRoute);
        routeRef.current = freshRoute;
      }
      const instruction = getNavigationInstruction(
        { x: targetVehicle.x, y: targetVehicle.y },
        freshRoute ? freshRoute.points : activeRoute.points,
        isExitMode,
        goalSpot
      );
      setNavInstruction(instruction);
      if (instruction) {
        voiceManager.speak(instruction, 6000, false);
      }
    }
  }, [goalSpot, isExitMode, activeVehicles, sessionId, isMuted]); // Theo vị trí xe

  // ── Xử lý khi bấm vào ô đỗ ──
  const handleConfirmSpot = useCallback(async (spotId: SpotId): Promise<boolean> => {
    const currentSpot = useParkingStore.getState().spots[spotId];
    if (currentSpot?.status !== "empty") return false;

    if (sessionId) {
      try {
        setSessionInfo(await selectSpot(sessionId, spotId));
      } catch (error) {
        console.warn("Không thể cập nhật ô đỗ cho phiên xe", error);
        if (error instanceof BackendApiError && error.code === "SPOT_NOT_AVAILABLE") {
          const need: DestinationNeed = activeNeed ?? "services";
          const alternatives = recommendParkingSpots(spots, need, {
            calculatedAt: lastEventTime ?? new Date().toISOString(),
          });
          const alternativeSpotIds = [alternatives?.best, ...(alternatives?.alternatives ?? [])]
            .filter((candidate): candidate is RankedSpot => Boolean(candidate) && candidate?.spotId !== spotId)
            .map((candidate) => candidate.spotId)
            .slice(0, 3);
          showInvalidSpotWarning({
            spotId,
            status: "occupied",
            alternativeSpotId: alternativeSpotIds[0],
            alternativeSpotIds,
          });
        }
        return false;
      }
    }
    setIsRouteDismissed(false);
    confirmSpot(spotId);
    return true;
  }, [confirmSpot, sessionId, activeNeed, spots, lastEventTime, showInvalidSpotWarning]);

  const handleSpotClick = (spotId: SpotId): void => {
    const clickedSpot = spotsById[spotId];
    if (sessionId && clickedSpot?.status === "empty") {
      void handleConfirmSpot(spotId);
      return;
    }
    if (mode === "browse") {
      inspectSpot(spotId);
      return;
    }
    if (mode === "recommendation" && recommendation) {
      const isCandidate = [recommendation.best, ...recommendation.alternatives].some((spot) => spot.spotId === spotId);
      if (isCandidate) chooseRecommendedSpot(spotId);
    }
  };

  const handleNeedChange = (need: DestinationNeed): void => chooseNeed(need);

  const switchAlternative = async (spotId: SpotId): Promise<void> => {
    const allowed = warning?.alternativeSpotIds ?? (warning?.alternativeSpotId ? [warning.alternativeSpotId] : []);
    if (!allowed.includes(spotId)) return;
    const alternative = spotsById[spotId];
    if (alternative?.status === "empty") await handleConfirmSpot(alternative.id);
  };

  const handleDismissRoute = useCallback(async () => {
    setIsRouteDismissed(false);
    cancelNavigation();
    voiceManager.stop();
    if (sessionId) {
      setSessionInfo((prev) => prev ? { ...prev, targetSpotId: null, state: "SELECTING_SPOT" } : null);
      try {
        setSessionInfo(await selectSpot(sessionId, null));
      } catch (error) {
        console.warn("Không thể hủy ô đỗ đã chọn", error);
      }
    }
  }, [sessionId, cancelNavigation]);

  const handleStartExit = useCallback(async () => {
    if (!sessionId) return;
    setIsRouteDismissed(false);
    setShowParkedSuccess(false);
    voiceManager.stop();
    cancelNavigation();
    setSessionInfo((prev) => prev ? { ...prev, state: "EXIT_NAVIGATION", targetSpotId: null } : null);
    try {
      setSessionInfo(await startExit(sessionId));
    } catch (error) {
      console.warn("Không thể bắt đầu chỉ đường ra cổng", error);
      setSessionInfo((prev) => prev ? { ...prev, state: "PARKED" } : null);
    }
  }, [sessionId, cancelNavigation]);

  const getSessionStatusLabel = () => {
    switch (sessionState) {
      case "WAITING_FOR_SCAN": return "ĐANG KẾT NỐI";
      case "SELECTING_SPOT":   return "ĐANG CHỌN Ô ĐỖ";
      case "NAVIGATING_TO_SPOT": return "ĐANG DẪN ĐƯỜNG";
      case "PARKED":           return "ĐÃ ĐỖ";
      case "EXIT_NAVIGATION":  return "ĐANG RA CỔNG";
      default:                 return "ĐANG TẢI...";
    }
  };

  const getSessionStatusColor = () => {
    switch (sessionState) {
      case "WAITING_FOR_SCAN": return "#64748b";
      case "SELECTING_SPOT":   return "#f59e0b";
      case "NAVIGATING_TO_SPOT": return "#3b82f6";
      case "PARKED":           return "#22c55e";
      case "EXIT_NAVIGATION":  return "#eab308";
      default:                 return "#64748b";
    }
  };

  const displayedVehicles = useMemo(() => {
    if (sessionState !== "PARKED" || !sessionParkedSpot || targetVehicleId === null) {
      return activeVehicles;
    }
    const geometry = SPOT_GEOMETRY_BY_ID.get(sessionParkedSpot as SpotId);
    if (!geometry) return activeVehicles;
    return [{
      trackId: targetVehicleId,
      x: geometry.x + geometry.width / 2,
      y: geometry.y + geometry.height / 2,
      trail: [],
      state: "parked" as const,
      parkedSlotId: sessionParkedSpot,
    }];
  }, [activeVehicles, sessionParkedSpot, sessionState, targetVehicleId]);

  return (
    <div className="app-shell">
      <SmartParkingHeader mode={mode} cameras={cameras} lastUpdated={lastEventTime} runtimeState={runtimeState} />

      <main className="app-main">
        <SummaryCards counts={counts} cameras={cameras} />
        {trackingSource === "opencv" && runtimeError && (
          <div className="runtime-source-alert" role="alert">
            {runtimeError}. Hãy kiểm tra Runtime API tại cổng 8001 và URL camera thật.
          </div>
        )}
        {sessionEnded && (
          <section className="session-ended" role="status">
            <h2>Phiên xe đã kết thúc</h2>
            <p>Xe đã đi qua cổng ra. Liên kết QR này không còn hiệu lực.</p>
          </section>
        )}
        {mode === "browse" && (
          <BrowseToolbar filter={browseFilter} onFilterChange={setBrowseFilter} onFindSpot={startRecommendation} />
        )}
        {mode === "navigation" && confirmedSpot && (
          <NavigationStatusBar spotId={confirmedSpot.id} zone={confirmedSpot.zone} paused={Boolean(warning)} onCancel={cancelNavigation} />
        )}

        {/* ── Bảng trạng thái phiên làm việc (Session Status Banner) ── */}
        {sessionId && !sessionEnded && (
          <div style={{
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            padding: "16px 24px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            backdropFilter: "blur(8px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{
                background: getSessionStatusColor(),
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                fontWeight: "bold",
                color: "#fff",
                flexShrink: 0,
              }}>
                {sessionState === "PARKED" ? "✓" : "🚗"}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc" }}>
                    Phiên xe #{targetVehicleId}
                  </h3>
                  <span style={{ fontSize: "12px", color: "#94a3b8", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: "4px" }}>
                    Mã session: {sessionId}
                  </span>
                </div>
                
                {sessionState === "EXIT_NAVIGATION" && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#fbbf24" }}>
                    Đang hướng dẫn Xe #{targetVehicleId} rời bãi từ ô <strong>{sessionParkedSpot}</strong> ra CỔNG EXIT.
                  </p>
                )}

                {sessionState === "NAVIGATING_TO_SPOT" && sessionTargetSpot && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#38bdf8" }}>
                    Tuyến đường chỉ dẫn đang hướng Xe #{targetVehicleId} tới ô <strong>{sessionTargetSpot}</strong>.
                  </p>
                )}

                {sessionState === "SELECTING_SPOT" && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#f59e0b" }}>
                    Bản đồ đang định vị Xe #{targetVehicleId}. Bạn có thể chọn ô đỗ mong muốn trên bản đồ.
                  </p>
                )}

                {sessionState === "PARKED" && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#4ade80" }}>
                    Xe #{targetVehicleId} đang được đỗ an toàn tại ô <strong>{sessionParkedSpot}</strong>.
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                onClick={() => {
                  const newMute = !isMuted;
                  setIsMuted(newMute);
                  voiceManager.setMuted(newMute);
                }}
                style={{
                  background: isMuted ? "rgba(100, 116, 139, 0.2)" : "rgba(34, 197, 94, 0.2)",
                  border: `1px solid ${isMuted ? "#64748b" : "#22c55e"}`,
                  color: isMuted ? "#94a3b8" : "#4ade80",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {isMuted ? "🔇 Tắt giọng nói" : "🔊 Giọng nói Bật"}
              </button>

              {/* Nút Hủy chọn ô đỗ khi đang dẫn đường vào */}
              {(sessionState === "NAVIGATING_TO_SPOT" || (sessionTargetSpot && sessionState !== "EXIT_NAVIGATION" && sessionState !== "PARKED")) && (
                <button
                  onClick={handleDismissRoute}
                  style={{
                    background: "rgba(239, 68, 68, 0.2)",
                    border: "1px solid #ef4444",
                    color: "#fca5a5",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "13px"
                  }}
                >
                  ❌ Hủy chọn ô đỗ
                </button>
              )}

              {/* Nút "Chỉ lối ra" / "Thoát chỉ dẫn" — hiện khi PARKED hoặc EXIT_NAVIGATION */}
              {(sessionState === "PARKED" || sessionState === "EXIT_NAVIGATION") && (
                isExitGuideActive ? (
                  <button
                    onClick={() => {
                      setIsExitGuideActive(false);
                      voiceManager.stop();
                    }}
                    style={{
                      background: "rgba(239, 68, 68, 0.2)",
                      border: "1px solid #ef4444",
                      color: "#fca5a5",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    ❌ Thoát chỉ dẫn
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsExitGuideActive(true);
                      setIsRouteDismissed(false);
                      if (sessionState === "PARKED") {
                        void handleStartExit();
                      }
                    }}
                    style={{
                      background: "#38bdf8",
                      color: "#0f172a",
                      border: "none",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontSize: "14px",
                      boxShadow: "0 4px 12px rgba(56, 189, 248, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    🧭 Chỉ lối ra
                  </button>
                )
              )}

              {sessionState !== "PARKED" && (
                <span style={{
                  background: getSessionStatusColor(),
                  color: "#fff",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}>
                  {getSessionStatusLabel()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Bảng Cảnh báo đi sai đường (Off-Route Warning) ── */}
        {sessionId && isOffRoute && (
          <div style={{
            background: "rgba(220, 38, 38, 0.95)",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: "10px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontWeight: "bold",
            fontSize: "14px",
            boxShadow: "0 0 20px rgba(220, 38, 38, 0.5)",
            border: "1px solid #ef4444"
          }}>
            <span style={{ fontSize: "24px" }}>⚠️</span>
            <span>CẢNH BÁO: BẠN ĐANG ĐI SAI TUYẾN ĐƯỜNG CHỈ DẪN! VUI LÒNG QUAN SÁT SƠ ĐỒ BÃI ĐỖ.</span>
          </div>
        )}

        {/* ── Bảng Chỉ dẫn giọng nói realtime (Voice Instruction Status) ── */}
        {sessionId && !isOffRoute && navInstruction && !isRouteDismissed && (
          <div style={{
            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: "10px",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontWeight: 600,
            fontSize: "14px",
            boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)"
          }}>
            <span style={{ fontSize: "20px" }}>🗣</span>
            <span>{navInstruction}</span>
          </div>
        )}

        <div className={`parking-workspace parking-workspace--${mode}`}>
          <div className="map-column">
            <ParkingMap
              spots={spots}
              cameras={cameras}
              filter={mode === "browse" ? browseFilter : "all"}
              recommendation={mode === "recommendation" ? recommendation : undefined}
              inspectedSpotId={inspectedSpotId}
              confirmedSpotId={confirmedSpotId ?? (sessionTargetSpot as SpotId | undefined)}
              activeNeed={activeNeed}
              route={route}
              routePaused={Boolean(warning)}
              activeVehicles={displayedVehicles}
              frameSize={frameSize}
              onSpotClick={handleSpotClick}
            />
            <ParkingLegend />
          </div>

          {mode === "recommendation" && (
            <RecommendationPanel
              need={activeNeed}
              result={recommendation}
              onNeedChange={handleNeedChange}
              onChooseAlternative={chooseRecommendedSpot}
              onConfirm={handleConfirmSpot}
              onAbandon={() => enterBrowse("all")}
            />
          )}
          {mode === "browse" && inspectedSpot && (
            <SpotDetailSheet
              spot={inspectedSpot}
              onClose={() => inspectSpot(undefined)}
              onNavigate={() => confirmedSpotId !== inspectedSpot.id && handleConfirmSpot(inspectedSpot.id)}
            />
          )}
        </div>
      </main>

      {/* ── Sheet lựa chọn nhu cầu "Bạn muốn tìm chỗ đỗ theo cách nào?" ── */}
      {mode === "entry" && (
        <EntryChoiceSheet
          onRecommend={startRecommendation}
          onEmptyOnly={() => enterBrowse("empty")}
          onSkip={() => enterBrowse("all")}
        />
      )}
      {warning && (
        <InvalidSpotWarningSheet
          warning={warning}
          onSwitch={(spotId) => void switchAlternative(spotId)}
          onContinueMap={clearWarning}
        />
      )}
      {import.meta.env.DEV && (
        <MockControlPanel
          source={mockParkingDataSource}
          recommendedSpotId={recommendation?.best.spotId}
          selectedSpotId={confirmedSpotId}
        />
      )}

      {/* ── Thông báo đỗ xe thành công (5s) ── */}
      {showParkedSuccess && (
        <div data-testid="parked-success" style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          padding: "32px 48px",
          borderRadius: "24px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 9999,
          animation: "popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards"
        }}>
          <div style={{
            width: "80px",
            height: "80px",
            background: "#22c55e",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "20px",
            boxShadow: "0 8px 16px rgba(34, 197, 94, 0.3)"
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 style={{ margin: "0 0 8px 0", color: "#0f172a", fontSize: "28px" }}>Hoàn tất!</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>Xe đã được đỗ an toàn tại ô {sessionParkedSpot}</p>
        </div>
      )}
      <style>{`
        @keyframes popIn {
          0% { opacity: 0; transform: translate(-50%, -40%) scale(0.8); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>

    </div>
  );
}
