import { CircleAlert, Map, RefreshCw } from "lucide-react";
import { useRef } from "react";
import { getInvalidSpotWarningText, type InvalidSpotWarning } from "../domain/parking";
import { useFocusTrap } from "./useFocusTrap";

interface InvalidSpotWarningSheetProps {
  warning: InvalidSpotWarning;
  onSwitch: (spotId: InvalidSpotWarning["spotId"]) => void;
  onContinueMap: () => void;
}

export function InvalidSpotWarningSheet({ warning, onSwitch, onContinueMap }: InvalidSpotWarningSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  useFocusTrap(true, sheetRef);
  const alternatives = warning.alternativeSpotIds
    ?? (warning.alternativeSpotId ? [warning.alternativeSpotId] : []);
  return (
    <>
      <div className="sheet-backdrop sheet-backdrop--warning" aria-hidden="true" />
      <section ref={sheetRef} className="driver-sheet warning-sheet" role="alertdialog" aria-modal="true" aria-labelledby="warning-title" tabIndex={-1}>
        <div className="warning-heading">
          <CircleAlert size={26} aria-hidden="true" />
          <div>
            <h2 id="warning-title">Vị trí đã thay đổi</h2>
            <p>{getInvalidSpotWarningText(warning.spotId, warning.status)}</p>
          </div>
        </div>
        {alternatives.length > 0 && (
          <div className="next-alternative">
            <small>Các phương án trống tiếp theo</small>
            <strong>{alternatives.join(" · ")}</strong>
          </div>
        )}
        {alternatives.map((spotId, index) => (
          <button
            key={spotId}
            type="button"
            className="primary-action"
            onClick={() => onSwitch(spotId)}
            data-testid={index === 0 ? "switch-alternative" : `switch-alternative-${spotId}`}
          >
            <RefreshCw size={19} />
            Xác nhận chuyển sang {spotId}
          </button>
        ))}
        <button type="button" className="secondary-action" onClick={onContinueMap} data-testid="continue-map">
          <Map size={19} />
          Tiếp tục xem bản đồ
        </button>
      </section>
    </>
  );
}
