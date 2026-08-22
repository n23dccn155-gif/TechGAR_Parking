import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntryQRKiosk } from "../components/EntryQRKiosk";
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
import { getSpotOwner, type DestinationNeed, type ParkingSpotState, type ParkingStatus, type SpotId } from "../domain/parking";
import { mockParkingDataSource } from "../mocks/MockParkingDataSource";
import { recommendParkingSpots } from "../recommendation/recommendationEngine";
import { LANE_GRAPH, updateGateNodesInGraph } from "../routing/laneGraph";
import { findVehicleRoute, findExitRoute, findExitRouteFromPos, findInboundRouteFromPos } from "../routing/routeEngine";
import { voiceManager, checkIsOffRoute, getNavigationInstruction } from "../routing/voiceGuidance";
import { SPOT_GEOMETRY_BY_ID } from "../geometry/parkingGeometry";
import { useDriverFlowStore } from "../stores/driverFlowStore";
import { deriveParkingCounts, useParkingStore } from "../stores/parkingStore";

const NON_EMPTY_STATUSES: ReadonlySet<ParkingStatus> = new Set(["transitioning", "occupied", "unknown"]);

// 鈹€鈹€ Ki峄僽 d峄?li峄噓 v峄?tr铆 xe t峄?tracker 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
export interface ActiveVehicle {
  trackId: number;
  x: number;
  y: number;
  trail: Array<{ x: number; y: number }>;
}

export interface FrameSize {
  width: number;
  height: number;
}

interface SessionInfo {
  sessionId: string;
  state: string;
  targetSpotId: string | null;
  parkedSpotId: string | null;
  vehicleTrackId: number | null;
  activeTrackId: number | null;
  claimed: boolean;
}

interface AppProps {
  sessionId?: string | null;
}

export function App({ sessionId }: AppProps = {}) {
  const [activeVehicles, setActiveVehicles] = useState<ActiveVehicle[]>([]);
  const [frameSize, setFrameSize]           = useState<FrameSize>({ width: 1200, height: 900 });
  const [sessionInfo, setSessionInfo]       = useState<SessionInfo | null>(null);

  const sessionTrackIdRef = useRef<number | null>(sessionId ? Number(sessionId) : null);

  const spotsById = useParkingStore((state) => state.spots);
  const cameras = useParkingStore((state) => state.cameras);
  const lastEventTime = useParkingStore((state) => state.lastEventTime);
  const applySnapshot = useParkingStore((state) => state.applySnapshot);
  const applyEvent = useParkingStore((state) => state.applyEvent);
  const trackingSource = useParkingStore((state) => state.trackingSource);

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
  const cancelNavigation = useDriverFlowStore((state) => state.cancelNavigation);

  const spots = useMemo(
    () => Object.values(spotsById).filter((spot): spot is ParkingSpotState => spot !== undefined),
    [spotsById],
  );
  const counts = useMemo(() => deriveParkingCounts(spots), [spots]);
  const inspectedSpot = inspectedSpotId ? spotsById[inspectedSpotId] : undefined;
  const confirmedSpot = confirmedSpotId ? spotsById[confirmedSpotId] : undefined;

  // 鈹€鈹€ Session values 鈹€鈹€
  const sessionState = sessionInfo?.state ?? null;
  const sessionTargetSpot = sessionInfo?.targetSpotId ?? null;
  const sessionParkedSpot = sessionInfo?.parkedSpotId ?? null;
  const targetVehicleId = sessionInfo?.activeTrackId ?? sessionInfo?.vehicleTrackId ?? (sessionId ? Number(sessionId) : null);

  // 鈹€鈹€ Helper API call 鈹€鈹€
  const callSessionApi = useCallback(async (endpoint: string, payload: object) => {
    try {
      const res = await fetch(`/api/session/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return true;
    } catch {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/session/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) return true;
      } catch (e) {
        console.warn("Session API call failed:", e);
      }
    }
    return false;
  }, []);

  // 鈹€鈹€ Auto-claim session khi m峄?trang c谩 nh芒n l岷 膽岷 鈹€鈹€
  const claimedRef = useRef(false);
  useEffect(() => {
    if (!sessionId || claimedRef.current) return;
    const doClaim = async () => {
      claimedRef.current = true;
      await callSessionApi("claim", { sessionId });
    };
    void doClaim();
  }, [sessionId, callSessionApi]);

  // 鈹€鈹€ C岷璸 nh岷璽 target spot khi user confirm 鈹€鈹€
  const updateSessionTarget = useCallback(async (spotId: SpotId) => {
    if (!sessionId) return;
    await callSessionApi("select", { sessionId, spotId });
  }, [sessionId, callSessionApi]);

  // 鈹€鈹€ Fetch d峄?li峄噓 么 膽峄?& tracking feed 鈹€鈹€
  useEffect(() => {
    let active = true;

    void mockParkingDataSource.getSnapshot().then((snapshot) => {
      if (active) applySnapshot(snapshot);
    });

    const fetchRealtimeStatus = async () => {
      try {
        const statusFile = trackingSource === "sample"
          ? "parking_status_sample.json"
          : "parking_status.json";
        
        const res = await fetch(`/${statusFile}?t=${Date.now()}`);
        if (!res.ok) {
          if (trackingSource === "sample") {
            const fallback = await fetch(`/parking_status.json?t=${Date.now()}`);
            if (!fallback.ok || !active) return;
            const data = await fallback.json();
            applyParkingData(data);
          }
          return;
        }
        if (!active) return;
        const data = await res.json();
        applyParkingData(data);
      } catch {
        /* fetch failed */
      }
    };

    const applyParkingData = (data: { timestamp?: string; slots?: Record<string, { status: ParkingStatus }> }) => {
      if (!data) return;
      applyEvent({
        type: "camera.health.changed",
        cameraId: "cam-left",
        health: "online",
        updatedAt: data.timestamp || new Date().toISOString(),
      });
      applyEvent({
        type: "camera.health.changed",
        cameraId: "cam-right",
        health: "online",
        updatedAt: data.timestamp || new Date().toISOString(),
      });

      if (data.slots) {
        Object.keys(data.slots).forEach((spotId) => {
          const slotData = data.slots![spotId];
          if (!slotData) return;
          applyEvent({
            type: "spot.status.changed",
            cameraId: getSpotOwner(spotId as SpotId),
            spotId: spotId as SpotId,
            status: slotData.status,
            confidence: 0.99,
            revision: Date.now(),
            updatedAt: data.timestamp || new Date().toISOString(),
          });
        });
      }
    };

    void fetchRealtimeStatus();
    const interval = setInterval(fetchRealtimeStatus, 1000);

    // 鈹€鈹€ C岷璸 nh岷璽 t峄峚 膽峄?C峄擭G V脌O / C峄擭G RA cho 膼峄?th峄?D岷玭 膽瓢峄漬g t峄?gate_roi.json 鈹€鈹€
    const fetchGateRoi = async () => {
      try {
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

    // 鈹€鈹€ Polling session info (500ms) 鈹€鈹€
    const fetchSessionInfo = async () => {
      if (!sessionId || !active) return;
      try {
        const res = await fetch(`/navigation_sessions.json?t=${Date.now()}`);
        if (!res.ok || !active) return;
        const sessions = await res.json();
        const s = sessions?.[sessionId];
        if (s && active) {
          setSessionInfo({
            sessionId: s.sessionId ?? sessionId,
            state: s.state ?? "WAITING_FOR_SCAN",
            targetSpotId: s.targetSpotId ?? null,
            parkedSpotId: s.parkedSpotId ?? null,
            vehicleTrackId: s.vehicleTrackId ?? null,
            activeTrackId: s.activeTrackId ?? null,
            claimed: s.claimed ?? false,
          });
          sessionTrackIdRef.current = s.activeTrackId ?? s.vehicleTrackId ?? Number(sessionId);
        }
      } catch {
        /* fetch failed */
      }
    };

    if (sessionId) {
      void fetchSessionInfo();
    }
    const sessionInterval = sessionId ? setInterval(fetchSessionInfo, 500) : null;

    // 鈹€鈹€ Polling vehicle positions 鈹€鈹€
    const STALE_THRESHOLD_MS = 5000;

    const fetchVehiclePositions = async () => {
      try {
        const file = trackingSource === "opencv" ? "vehicle_positions.json" : "vehicle_positions_sample.json";
        const res = await fetch(`/${file}?t=${Date.now()}`);
        if (!res.ok || !active) return;
        const data = await res.json();

        if (data?.timestamp) {
          const dataAge = Date.now() - new Date(data.timestamp).getTime();
          if (dataAge > STALE_THRESHOLD_MS) {
            if (active) setActiveVehicles([]);
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

        // 馃幆 N岷綰 TRANG C脕 NH脗N (c贸 sessionId) 鈫?CH峄?GI峄?L岷營 DUY NH岷 XE C峄 SESSION 膼脫
        if (sessionId) {
          const targetId = sessionTrackIdRef.current ?? Number(sessionId);
          vehicles = vehicles.filter((v) => v.trackId === targetId);

          // 馃挕 N岷縰 xe 膽ang 膽峄?l谩i ra m脿 t岷痶 m谩y (kh么ng c贸 trong active_vehicles), l岷 t峄峚 膽峄?t芒m 么 膽峄?th峄眂 t岷?          if (vehicles.length === 0) {
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
        if (active) setActiveVehicles(vehicles);
      } catch {
        /* fetch failed */
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
    if (mode !== "navigation" || !confirmedSpot || warning) return;
    if (!NON_EMPTY_STATUSES.has(confirmedSpot.status)) return;

    // 鈹€鈹€ B峄?qua c岷h b谩o n岷縰 ch铆nh xe c峄 ng瓢峄漣 d霉ng 膽ang 膽峄?峄?么 膽贸 鈹€鈹€
    // Tr瓢峄漬g h峄 1: Session 膽茫 ghi nh岷璶 parkedSpotId = 么 n脿y
    if (sessionParkedSpot && sessionParkedSpot === confirmedSpot.id) return;
    // Tr瓢峄漬g h峄 2: Session 膽ang 峄?tr岷g th谩i PARKED ho岷穋 EXIT_NAVIGATION
    //   v脿 targetSpot/confirmedSpot kh峄沺 鈫?xe m矛nh v峄玜 膽峄?xong
    if ((sessionState === "PARKED" || sessionState === "EXIT_NAVIGATION") &&
        sessionTargetSpot === confirmedSpot.id) return;

    const need: DestinationNeed = activeNeed ?? "services";
    const alternatives = recommendParkingSpots(spots, need, {
      calculatedAt: lastEventTime ?? "2026-07-25T08:00:00.000Z",
    });
    const alternativeSpotId = [alternatives?.best, ...(alternatives?.alternatives ?? [])]
      .find((candidate) => candidate && candidate.spotId !== confirmedSpot.id)?.spotId;
    showInvalidSpotWarning({
      spotId: confirmedSpot.id,
      status: confirmedSpot.status as Exclude<ParkingStatus, "empty">,
      alternativeSpotId,
    });
  }, [activeNeed, confirmedSpot, lastEventTime, mode, sessionParkedSpot, sessionState, sessionTargetSpot, showInvalidSpotWarning, spots, warning]);

  const [isRouteDismissed, setIsRouteDismissed] = useState<boolean>(false);
  // isExitGuideActive: true = 膽ang b岷璽 "Ch峄?l峄慽 ra", false = 岷﹏ 膽瓢峄漬g l峄慽 ra khi PARKED
  const [isExitGuideActive, setIsExitGuideActive] = useState<boolean>(false);
  // Hi峄僴 th峄?th么ng b谩o "膼峄?xe th脿nh c么ng" trong 5s
  const [showParkedSuccess, setShowParkedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (sessionState === "PARKED") {
      setShowParkedSuccess(true);
      const timer = setTimeout(() => setShowParkedSuccess(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowParkedSuccess(false);
    }
  }, [sessionState]);

  // 鈹€鈹€ T铆nh 膽瓢峄漬g 膽i 膽峄檔g (Dynamic Route - Google Maps style) 鈹€鈹€
  const route = useMemo(() => {
    if (isRouteDismissed || sessionState === "CLOSED" || sessionState === "WAITING_FOR_SCAN") return null;

    // A. Ch岷?膽峄?PARKED: Ch峄?v岷?膽瓢峄漬g l峄慽 ra khi ng瓢峄漣 d霉ng ch峄?膽峄檔g b岷 "Ch峄?l峄慽 ra"
    if (sessionState === "PARKED") {
      if (!isExitGuideActive) return null; // 岷╪ m岷穋 膽峄媙h khi 膽峄?      const exitSpot = (sessionParkedSpot || confirmedSpotId) as SpotId | null;
      if (!exitSpot) return null;
      // N岷縰 xe 膽ang di chuy峄僴 -> T铆nh t峄?v峄?tr铆 th峄眂 t岷?c峄 xe (Re-routing)
      const targetVehicle = activeVehicles.find((v) => v.trackId === targetVehicleId);
      if (targetVehicle) {
        return findExitRouteFromPos(LANE_GRAPH, targetVehicle.x, targetVehicle.y, exitSpot);
      }
      return findExitRoute(LANE_GRAPH, exitSpot);
    }

    // B. Ch岷?膽峄?EXIT_NAVIGATION: Lu么n v岷?膽瓢峄漬g l峄慽 ra, t峄?膽峄檔g c岷璸 nh岷璽 theo xe
    if (sessionState === "EXIT_NAVIGATION") {
      if (!isExitGuideActive) return null;
      const exitSpot = (sessionParkedSpot || confirmedSpotId) as SpotId | null;
      const targetVehicle = activeVehicles.find((v) => v.trackId === targetVehicleId);
      if (targetVehicle) {
        return findExitRouteFromPos(LANE_GRAPH, targetVehicle.x, targetVehicle.y, exitSpot ?? undefined);
      }
      if (exitSpot) return findExitRoute(LANE_GRAPH, exitSpot);
      return null;
    }

    // C. D岷玭 膽瓢峄漬g v脿o 么 膽峄?(Inbound) - T峄?膽峄檔g c岷璸 nh岷璽 theo xe (Re-routing)
    const targetForRoute = (sessionId && sessionTargetSpot) ? sessionTargetSpot : (confirmedSpotId || inspectedSpotId);
    if (targetForRoute) {
      const spotState = spotsById[targetForRoute as SpotId];
      if (spotState && spotState.status === "occupied") {
        return findExitRoute(LANE_GRAPH, targetForRoute as SpotId);
      }
      // N岷縰 xe 膽ang di chuy峄僴 -> T铆nh t峄?v峄?tr铆 th峄眂 t岷?(Re-routing gi峄憂g Google Maps)
      const targetVehicle = activeVehicles.find((v) => v.trackId === targetVehicleId);
      if (targetVehicle) {
        return findInboundRouteFromPos(LANE_GRAPH, targetVehicle.x, targetVehicle.y, targetForRoute as SpotId);
      }
      return findVehicleRoute(LANE_GRAPH, targetForRoute as SpotId);
    }

    return null;
  }, [isRouteDismissed, isExitGuideActive, sessionId, sessionState, sessionParkedSpot, sessionTargetSpot, confirmedSpotId, inspectedSpotId, spotsById, activeVehicles, targetVehicleId]);

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isOffRoute, setIsOffRoute] = useState<boolean>(false);
  const [navInstruction, setNavInstruction] = useState<string | null>(null);

  // 鈹€鈹€ Theo d玫i Gi峄峮g n贸i D岷玭 膽瓢峄漬g & C岷h b谩o 膼i sai 膽瓢峄漬g 鈹€鈹€
  useEffect(() => {
    if (!route || route.points.length < 2 || isRouteDismissed) {
      setIsOffRoute(false);
      setNavInstruction(null);
      voiceManager.stop();
      return;
    }

    const targetVehicleId = sessionTrackIdRef.current ?? Number(sessionId);
    const targetVehicle = activeVehicles.find((v) => v.trackId === targetVehicleId);
    const isExit = sessionState === "EXIT_NAVIGATION";

    if (targetVehicle) {
      // 1. Ki峄僲 tra xe 膽i sai 膽瓢峄漬g (ng瓢峄g 80px)
      const offRoute = checkIsOffRoute({ x: targetVehicle.x, y: targetVehicle.y }, route.points, 80);
      setIsOffRoute(offRoute);

      if (offRoute) {
        voiceManager.speak("C岷h b谩o: B岷 膽ang 膽i sai tuy岷縩 膽瓢峄漬g ch峄?d岷玭!", 7000);
        setNavInstruction("鈿狅笍 B岷燦 膼ANG 膼I SAI TUY岷綨 膼漂峄淣G CH峄?D岷狽!");
      } else {
        const instruction = getNavigationInstruction(
          { x: targetVehicle.x, y: targetVehicle.y },
          route.points,
          isExit,
          sessionTargetSpot
        );
        setNavInstruction(instruction);
        if (instruction) {
          voiceManager.speak(instruction, 6000);
        }
      }
    } else {
      // 2. Khi xe ch瓢a di chuy峄僴 / ng瓢峄漣 d霉ng xem tr瓢峄沜 tuy岷縩 膽瓢峄漬g
      setIsOffRoute(false);
      const destName = (sessionTargetSpot || sessionParkedSpot || confirmedSpotId || "么 膽峄?);
      const instruction = isExit
        ? `Tuy岷縩 膽瓢峄漬g xu岷 b茫i t峄?么 ${destName} ra C峄擭G RA`
        : `Tuy岷縩 膽瓢峄漬g ch峄?d岷玭 t峄?C峄昻g V脿o 膽岷縩 么 ${destName}`;
      setNavInstruction(instruction);
    }
  }, [route, activeVehicles, sessionId, isRouteDismissed, sessionState, sessionTargetSpot, sessionParkedSpot, confirmedSpotId, isMuted]);

  // 鈹€鈹€ X峄?l媒 khi b岷 v脿o 么 膽峄?鈹€鈹€
  const handleConfirmSpot = useCallback((spotId: SpotId): void => {
    setIsRouteDismissed(false);
    confirmSpot(spotId);
    if (sessionId) {
      void updateSessionTarget(spotId);
    }
  }, [confirmSpot, sessionId, updateSessionTarget]);

  const handleSpotClick = (spotId: SpotId): void => {
    const clickedSpot = spotsById[spotId];
    if (sessionId && clickedSpot?.status === "empty") {
      handleConfirmSpot(spotId);
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

  const switchAlternative = (): void => {
    if (!warning?.alternativeSpotId) return;
    const alternative = spotsById[warning.alternativeSpotId];
    if (alternative?.status === "empty") handleConfirmSpot(alternative.id);
  };

  const handleDismissRoute = useCallback(async () => {
    setIsRouteDismissed(false);
    cancelNavigation();
    voiceManager.stop();
    if (sessionId) {
      setSessionInfo((prev) => prev ? { ...prev, targetSpotId: null, state: "SELECTING_SPOT" } : null);
      await callSessionApi("select", { sessionId, spotId: null });
    }
  }, [sessionId, cancelNavigation, callSessionApi]);

  const handleStartExit = useCallback(async () => {
    if (!sessionId) return;
    setIsRouteDismissed(false);
    cancelNavigation();
    setSessionInfo((prev) => prev ? { ...prev, state: "EXIT_NAVIGATION", targetSpotId: null } : null);
    await callSessionApi("exit", { sessionId });
  }, [sessionId, cancelNavigation, callSessionApi]);

  const getSessionStatusLabel = () => {
    switch (sessionState) {
      case "WAITING_FOR_SCAN": return "膼ANG K岷綯 N峄怚";
      case "SELECTING_SPOT":   return "膼ANG CH峄孨 脭 膼峄?;
      case "NAVIGATING_TO_SPOT": return "膼ANG D岷狽 膼漂峄淣G";
      case "PARKED":           return "膼脙 膼峄?;
      case "EXIT_NAVIGATION":  return "膼ANG RA C峄擭G";
      case "CLOSED":           return "膼脙 HO脌N TH脌NH";
      default:                 return "膼ANG T岷...";
    }
  };

  const getSessionStatusColor = () => {
    switch (sessionState) {
      case "WAITING_FOR_SCAN": return "#64748b";
      case "SELECTING_SPOT":   return "#f59e0b";
      case "NAVIGATING_TO_SPOT": return "#3b82f6";
      case "PARKED":           return "#22c55e";
      case "EXIT_NAVIGATION":  return "#eab308";
      case "CLOSED":           return "#64748b";
    }
  };

  return (
    <div className="app-shell">
      <SmartParkingHeader mode={mode} cameras={cameras} lastUpdated={lastEventTime} />

      <main className="app-main">
        <SummaryCards counts={counts} cameras={cameras} />
        {mode === "browse" && (
          <BrowseToolbar filter={browseFilter} onFilterChange={setBrowseFilter} onFindSpot={startRecommendation} />
        )}
        {mode === "navigation" && confirmedSpot && (
          <NavigationStatusBar spotId={confirmedSpot.id} zone={confirmedSpot.zone} paused={Boolean(warning)} onCancel={cancelNavigation} />
        )}

        {/* 鈹€鈹€ B岷g tr岷g th谩i phi锚n l脿m vi峄嘽 (Session Status Banner) 鈹€鈹€ */}
        {sessionId && (
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
                {sessionState === "PARKED" ? "鉁? : "馃殫"}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#f8fafc" }}>
                    Phi锚n xe #{targetVehicleId}
                  </h3>
                  <span style={{ fontSize: "12px", color: "#94a3b8", background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: "4px" }}>
                    M茫 session: {sessionId}
                  </span>
                </div>
                
                {sessionState === "EXIT_NAVIGATION" && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#fbbf24" }}>
                    膼ang h瓢峄沶g d岷玭 Xe #{targetVehicleId} r峄漣 b茫i t峄?么 <strong>{sessionParkedSpot}</strong> ra C峄擭G EXIT.
                  </p>
                )}

                {sessionState === "NAVIGATING_TO_SPOT" && sessionTargetSpot && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#38bdf8" }}>
                    Tuy岷縩 膽瓢峄漬g ch峄?d岷玭 膽ang h瓢峄沶g Xe #{targetVehicleId} t峄沬 么 <strong>{sessionTargetSpot}</strong>.
                  </p>
                )}

                {sessionState === "SELECTING_SPOT" && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#f59e0b" }}>
                    B岷 膽峄?膽ang 膽峄媙h v峄?Xe #{targetVehicleId}. B岷 c贸 th峄?ch峄峮 么 膽峄?mong mu峄憂 tr锚n b岷 膽峄?
                  </p>
                )}

                {sessionState === "PARKED" && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#4ade80" }}>
                    Xe #{targetVehicleId} 膽ang 膽瓢峄 膽峄?an to脿n t岷 么 <strong>{sessionParkedSpot}</strong>.
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
                {isMuted ? "馃攪 T岷痶 gi峄峮g n贸i" : "馃攰 Gi峄峮g n贸i B岷璽"}
              </button>

              {/* N煤t H峄 ch峄峮 么 膽峄?khi 膽ang d岷玭 膽瓢峄漬g v脿o */}
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
                  鉂?H峄 ch峄峮 么 膽峄?                </button>
              )}

              {/* N煤t "Ch峄?l峄慽 ra" / "Tho谩t ch峄?d岷玭" 鈥?hi峄噉 khi PARKED ho岷穋 EXIT_NAVIGATION */}
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
                    鉂?Tho谩t ch峄?d岷玭
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
                    馃Л Ch峄?l峄慽 ra
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

        {/* 鈹€鈹€ B岷g C岷h b谩o 膽i sai 膽瓢峄漬g (Off-Route Warning) 鈹€鈹€ */}
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
            <span style={{ fontSize: "24px" }}>鈿狅笍</span>
            <span>C岷H B脕O: B岷燦 膼ANG 膼I SAI TUY岷綨 膼漂峄淣G CH峄?D岷狽! VUI L脪NG QUAN S脕T S茽 膼峄?B脙I 膼峄?</span>
          </div>
        )}

        {/* 鈹€鈹€ B岷g Ch峄?d岷玭 gi峄峮g n贸i realtime (Voice Instruction Status) 鈹€鈹€ */}
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
            <span style={{ fontSize: "20px" }}>馃棧</span>
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
              activeVehicles={activeVehicles}
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

      {/* 鈹€鈹€ Sheet l峄盿 ch峄峮 nhu c岷 "B岷 mu峄憂 t矛m ch峄?膽峄?theo c谩ch n脿o?" 鈹€鈹€ */}
      {mode === "entry" && (
        <EntryChoiceSheet
          onRecommend={startRecommendation}
          onEmptyOnly={() => enterBrowse("empty")}
          onSkip={() => enterBrowse("all")}
        />
      )}
      {warning && (
        <InvalidSpotWarningSheet warning={warning} onSwitch={switchAlternative} onContinueMap={cancelNavigation} />
      )}
      {import.meta.env.DEV && (
        <MockControlPanel
          source={mockParkingDataSource}
          recommendedSpotId={recommendation?.best.spotId}
          selectedSpotId={confirmedSpotId}
        />
      )}

      {/* 鈹€鈹€ Th么ng b谩o 膽峄?xe th脿nh c么ng (5s) 鈹€鈹€ */}
      {showParkedSuccess && (
        <div style={{
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
          <h2 style={{ margin: "0 0 8px 0", color: "#0f172a", fontSize: "28px" }}>Ho脿n t岷!</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "16px" }}>Xe 膽茫 膽瓢峄 膽峄?an to脿n t岷 么 {sessionParkedSpot}</p>
        </div>
      )}
      <style>{`
        @keyframes popIn {
          0% { opacity: 0; transform: translate(-50%, -40%) scale(0.8); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>

      {/* 鈹€鈹€ QR Kiosk ch峄?hi峄僴 th峄?tr锚n Trang Chung (kh么ng c贸 sessionId) 鈹€鈹€ */}
      {!sessionId && <EntryQRKiosk />}
    </div>
  );
}
