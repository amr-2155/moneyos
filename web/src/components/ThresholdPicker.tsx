import { useId } from "react";

interface ThresholdOption {
  value: number;
  /** Short Arabic/English label describing the urgency at this point. */
  labelKey: string;
  tone: "calm" | "warn" | "high";
}

interface ThresholdPickerProps {
  value: number;
  onChange: (value: number) => void;
  /** Preset percentages offered as one-tap chips. */
  presets?: number[];
  /** Translated copy, passed in so the component stays locale-agnostic. */
  labels: {
    early: string;
    soon: string;
    late: string;
    now: string;
    custom: string;
    /** Slider end captions, kept distinct from the urgency labels above. */
    low: string;
    high: string;
  };
  disabled?: boolean;
}

const TONE_BY_VALUE = (value: number): ThresholdOption["tone"] => {
  if (value < 65) return "calm";
  if (value < 85) return "warn";
  return "high";
};

/**
 * Threshold selector for budget alerts.
 *
 * Replaces a plain `<select>` with a preview bar that shows where the warning
 * will fire, plus one-tap presets and a slider for any value in between. The
 * bar is the point: "50%" alone means nothing until you see that half the
 * budget is already gone when the warning arrives.
 */
export function ThresholdPicker({
  value,
  onChange,
  presets = [50, 60, 70, 75, 80, 90],
  labels,
  disabled = false,
}: ThresholdPickerProps) {
  const sliderId = useId();
  const tone = TONE_BY_VALUE(value);
  const description = value >= 85 ? labels.late : value >= 65 ? labels.soon : labels.early;

  return (
    <div className={`threshold tone-${tone}${disabled ? " is-disabled" : ""}`}>
      <div className="threshold-head">
        <span className="threshold-value">{value}%</span>
        <span className="threshold-tone">{description}</span>
      </div>

      <div
        className="threshold-preview"
        role="img"
        aria-label={`${value}% ${labels.now}`}
      >
        <div className="threshold-fill" style={{ width: `${value}%` }}>
          <span className="threshold-marker" />
        </div>
      </div>

      <div className="threshold-presets" role="group" aria-label={labels.now}>
        {presets.map((preset) => {
          const active = preset === value;
          return (
            <button
              key={preset}
              type="button"
              className={`threshold-chip tone-${TONE_BY_VALUE(preset)}${active ? " is-active" : ""}`}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(preset)}
            >
              {preset}%
            </button>
          );
        })}
      </div>

      <div className="threshold-slider-row">
        <span className="threshold-slider-cap">{labels.low}</span>
        <input
          id={sliderId}
          className="threshold-slider"
          type="range"
          min={10}
          max={100}
          step={5}
          value={value}
          disabled={disabled}
          aria-label={labels.custom}
          aria-valuetext={`${value}%`}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ ["--fill" as string]: `${value}%` }}
        />
        <span className="threshold-slider-cap">{labels.high}</span>
      </div>
    </div>
  );
}