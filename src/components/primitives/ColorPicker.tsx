import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './ColorPicker.module.scss';

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  /** Visible trigger size in px (square). Defaults to 22 to match the
   *  inline theme swatch. */
  size?: number;
  /** Optional small set of preset hex values shown as a swatch row. */
  presets?: string[];
  ariaLabel?: string;
}

/**
 * App-styled color picker.
 *
 * The trigger is a swatch button matching the rest of the form family.
 * Clicking opens a fixed-position popover with an HSV saturation/value
 * area, a hue strip, and a hex input — all rendered with the glass
 * tokens so it belongs to the same visual family as the rest of the app.
 *
 * The native `<input type="color">` was the previous trigger; the OS
 * picker that opens out of it is jarring on a frosted-glass design and
 * isn't theme-aware.
 */
export const ColorPicker = ({
  value,
  onChange,
  size = 22,
  presets,
  ariaLabel,
}: ColorPickerProps) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  /* ----------------------------- Positioning ---------------------------- */

  const reposition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Anchor below the swatch by default; flip above if it would clip the
    // bottom of the viewport. Width is fixed in CSS (~232px), so we just
    // compensate horizontally if it would clip the right edge.
    const popWidth = 232;
    const popHeight = 232;
    let left = rect.left;
    if (left + popWidth > window.innerWidth - 8) {
      left = window.innerWidth - popWidth - 8;
    }
    let top = rect.bottom + 6;
    if (top + popHeight > window.innerHeight - 8) {
      top = rect.top - popHeight - 6;
    }
    setPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScrollOrResize = () => reposition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, reposition]);

  /* --------------------------- Outside / Esc ---------------------------- */

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* ------------------------------- HSV math ----------------------------- */

  const safe = normalizeHex(value) ?? '#000000';
  const hsv = hexToHsv(safe);

  const setHsv = (next: HSV) => onChange(hsvToHex(next));

  /* ------------------------- SV pad pointer drag ------------------------ */

  const svRef = useRef<HTMLDivElement | null>(null);
  const svDragging = useRef(false);

  const updateSvFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = svRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = clamp01((clientX - rect.left) / rect.width);
      const y = clamp01((clientY - rect.top) / rect.height);
      setHsv({ h: hsv.h, s: x, v: 1 - y });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hsv.h],
  );

  const onSvPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    svDragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    updateSvFromPointer(e.clientX, e.clientY);
  };
  const onSvPointerMove = (e: React.PointerEvent) => {
    if (!svDragging.current) return;
    updateSvFromPointer(e.clientX, e.clientY);
  };
  const onSvPointerUp = (e: React.PointerEvent) => {
    svDragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  /* -------------------------------- Render ------------------------------ */

  const popoverStyle: CSSProperties | undefined = pos
    ? { left: pos.left, top: pos.top }
    : { visibility: 'hidden' };

  // The SV background composes two gradients on top of the pure-hue base
  // color: a horizontal white→transparent (low → high saturation), and a
  // vertical transparent→black (high → low value).
  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const svBackground = `
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent),
    ${pureHue}
  `;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        style={{ background: safe, width: size, height: size }}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? 'Open color picker'}
      />

      {open &&
        createPortal(
          <div
            // Marks this element (and everything inside it) as a
            // descendant popover that lives in a portal. Parent
            // popovers — most importantly OptionsMenu — read this with
            // `closest('[data-popover-portal]')` in their outside-click
            // handler so clicking inside the color picker doesn't
            // dismiss the settings panel that opened it. Without this,
            // every drag on the saturation pad or edit on the hex
            // input nukes the menu.
            data-popover-portal="true"
            ref={popoverRef}
            className={styles.popover}
            style={popoverStyle}
            role="dialog"
            aria-label="Color picker"
          >
            <div
              ref={svRef}
              className={styles.svPad}
              style={{ background: svBackground }}
              onPointerDown={onSvPointerDown}
              onPointerMove={onSvPointerMove}
              onPointerUp={onSvPointerUp}
              onPointerCancel={onSvPointerUp}
            >
              <span
                className={styles.svThumb}
                style={{
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                  background: safe,
                }}
              />
            </div>

            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={Math.round(hsv.h)}
              onChange={(e) =>
                setHsv({ h: Number(e.target.value), s: hsv.s, v: hsv.v })
              }
              className={styles.hueRange}
              aria-label="Hue"
            />

            <div className={styles.row}>
              <span
                className={styles.swatchPreview}
                style={{ background: safe }}
                aria-hidden
              />
              <input
                type="text"
                className={styles.hexInput}
                value={safe}
                spellCheck={false}
                onChange={(e) => {
                  const next = normalizeHex(e.target.value);
                  if (next) onChange(next);
                  else onChange(e.target.value);
                }}
                aria-label="Hex color"
              />
            </div>

            {presets && presets.length > 0 && (
              <div className={styles.presets}>
                {presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={styles.presetSwatch}
                    style={{ background: p }}
                    onClick={() => onChange(p)}
                    aria-label={`Set color to ${p}`}
                  />
                ))}
              </div>
            )}
          </div>,
          // Portal to document.body so the popover escapes any ancestor
          // with `backdrop-filter`/`transform`/`filter`, which would
          // otherwise become its containing block (Chrome behaviour) and
          // pin the "fixed" popover to the wrong origin.
          document.body,
        )}
    </>
  );
};

/* ============================ Color helpers =============================== */

interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const normalizeHex = (raw: string): string | null => {
  if (!raw) return null;
  let s = raw.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  // Expand #abc → #aabbcc.
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (short) {
    s = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  }
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

const rgbToHex = (r: number, g: number, b: number): string => {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
};

const hexToHsv = (hex: string): HSV => {
  const [r, g, b] = hexToRgb(hex).map((n) => n / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
};

const hsvToHex = ({ h, s, v }: HSV): string => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
};
