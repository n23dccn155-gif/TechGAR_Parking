import { useState, useEffect } from "react";
import { Camera, Play, Square, Video, Laptop, Smartphone, ShieldCheck, X, Check } from "lucide-react";

interface CameraSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CameraSourceType = "video_file" | "webcam" | "phone_cam" | "rtsp_cam";

export function CameraSourceModal({ isOpen, onClose }: CameraSourceModalProps) {
  const [sourceType, setSourceType] = useState<CameraSourceType>("video_file");
  const [videoUrl, setVideoUrl] = useState("backend/main_detect/data/carPark.mp4");
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void fetchStatus();
    }
  }, [isOpen]);

  const fetchStatus = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/detection/status");
      if (res.ok) {
        const data = (await res.json()) as { running: boolean; videoUrl?: string };
        setIsRunning(data.running);
        if (data.videoUrl) setVideoUrl(data.videoUrl);
      }
    } catch {
      /* ignore */
    }
  };

  const handleSelectSourceType = (type: CameraSourceType) => {
    setSourceType(type);
    if (type === "video_file") {
      setVideoUrl("backend/main_detect/data/carPark.mp4");
    } else if (type === "webcam") {
      setVideoUrl("0");
    } else if (type === "phone_cam") {
      setVideoUrl("http://192.168.1.10:4747/video");
    } else if (type === "rtsp_cam") {
      setVideoUrl("rtsp://admin:123456@192.168.1.100:554/stream1");
    }
  };

  const handleStart = async (targetUrl?: string) => {
    const urlToRun = targetUrl || videoUrl;
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("http://localhost:8000/api/detection/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: urlToRun }),
      });

      if (res.ok) {
        setIsRunning(true);
        setMessage(`🚀 Đã kích hoạt AI Engine cho nguồn: ${urlToRun}`);
      } else {
        setMessage("❌ Khởi chạy AI thất bại. Kiểm tra Backend.");
      }
    } catch {
      setMessage("❌ Khởi chạy AI thất bại. Đảm bảo gate_session_controller (Port 8000) đang hoạt động!");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("http://localhost:8000/api/detection/stop", {
        method: "POST",
      });

      if (res.ok) {
        setIsRunning(false);
        setMessage("🛑 Đã dừng luồng xử lý AI Detection.");
      }
    } catch {
      setMessage("❌ Thao tác thất bại.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "540px",
          backgroundColor: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          color: "#f8fafc",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ padding: "8px", backgroundColor: "rgba(2, 132, 199, 0.2)", borderRadius: "10px" }}>
              <Camera size={22} color="#38bdf8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>Cấu hình Nguồn Camera AI</h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Chọn loại Camera & Nhập đường dẫn link để AI xử lý</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 14px",
            backgroundColor: isRunning ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${isRunning ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            borderRadius: "10px",
            marginBottom: "20px",
            fontSize: "13px",
          }}
        >
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: isRunning ? "#22c55e" : "#ef4444",
              boxShadow: isRunning ? "0 0 10px #22c55e" : "none",
            }}
          />
          <span>
            Trạng thái AI Engine: <strong>{isRunning ? "ĐANG XỬ LÝ THỜI GIAN THỰC" : "ĐANG DỪNG"}</strong>
          </span>
        </div>

        {/* ── 3 LỰA CHỌN LOẠI CAMERA (Giống opencv_test_js_2) ── */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#cbd5e1", marginBottom: "8px" }}>
            1. Chọn loại Camera nguồn vào:
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button
              type="button"
              onClick={() => handleSelectSourceType("video_file")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 12px",
                backgroundColor: sourceType === "video_file" ? "rgba(2, 132, 199, 0.25)" : "#1e293b",
                border: `1px solid ${sourceType === "video_file" ? "#38bdf8" : "#334155"}`,
                borderRadius: "10px",
                color: sourceType === "video_file" ? "#38bdf8" : "#cbd5e1",
                fontSize: "12px",
                fontWeight: sourceType === "video_file" ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <Video size={16} /> 🎬 Video File Giả Lập
            </button>

            <button
              type="button"
              onClick={() => handleSelectSourceType("webcam")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 12px",
                backgroundColor: sourceType === "webcam" ? "rgba(34, 197, 94, 0.25)" : "#1e293b",
                border: `1px solid ${sourceType === "webcam" ? "#22c55e" : "#334155"}`,
                borderRadius: "10px",
                color: sourceType === "webcam" ? "#4ade80" : "#cbd5e1",
                fontSize: "12px",
                fontWeight: sourceType === "webcam" ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <Laptop size={16} /> 💻 Camera Máy Tính (Webcam)
            </button>

            <button
              type="button"
              onClick={() => handleSelectSourceType("phone_cam")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 12px",
                backgroundColor: sourceType === "phone_cam" ? "rgba(236, 72, 153, 0.25)" : "#1e293b",
                border: `1px solid ${sourceType === "phone_cam" ? "#ec4899" : "#334155"}`,
                borderRadius: "10px",
                color: sourceType === "phone_cam" ? "#f472b6" : "#cbd5e1",
                fontSize: "12px",
                fontWeight: sourceType === "phone_cam" ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <Smartphone size={16} /> 📱 Cam Điện Thoại (IP Cam)
            </button>

            <button
              type="button"
              onClick={() => handleSelectSourceType("rtsp_cam")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 12px",
                backgroundColor: sourceType === "rtsp_cam" ? "rgba(168, 85, 247, 0.25)" : "#1e293b",
                border: `1px solid ${sourceType === "rtsp_cam" ? "#a855f7" : "#334155"}`,
                borderRadius: "10px",
                color: sourceType === "rtsp_cam" ? "#c084fc" : "#cbd5e1",
                fontSize: "12px",
                fontWeight: sourceType === "rtsp_cam" ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <ShieldCheck size={16} /> 📹 Cam An Ninh (RTSP)
            </button>
          </div>
        </div>

        {/* ── Ô TEXT DÁN LINK / ID BÊN DƯỚI ── */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "#cbd5e1", marginBottom: "8px" }}>
            2. Nhập / Dán link Camera chi tiết:
          </label>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder={
              sourceType === "webcam"
                ? "Nhập ID camera (ví dụ: 0 hoặc 1)"
                : sourceType === "phone_cam"
                ? "Dán link DroidCam (ví dụ: http://192.168.1.10:4747/video)"
                : sourceType === "rtsp_cam"
                ? "Dán link RTSP (ví dụ: rtsp://192.168.1.100:554/stream1)"
                : "Đường dẫn file video (ví dụ: backend/main_detect/data/carPark.mp4)"
            }
            style={{
              width: "100%",
              padding: "12px 14px",
              backgroundColor: "#1e293b",
              border: "1px solid #475569",
              borderRadius: "10px",
              color: "#fff",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Message Feedback */}
        {message && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(30, 41, 59, 0.8)",
              border: "1px solid #334155",
              fontSize: "12px",
              color: "#e2e8f0",
              marginBottom: "20px",
            }}
          >
            {message}
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          {isRunning ? (
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                backgroundColor: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <Square size={16} /> Dừng xử lý AI
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                backgroundColor: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <Play size={16} /> Kích hoạt AI Engine
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 16px",
              backgroundColor: "#334155",
              color: "#f8fafc",
              border: "none",
              borderRadius: "10px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <Check size={16} /> Hoàn tất
          </button>
        </div>
      </div>
    </div>
  );
}
