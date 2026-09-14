import { useEffect, useRef, type ReactNode } from 'react';
import { useOptionsStore } from '../../stores/optionsStore';
import {
  PRESETS,
  PRESET_BASELINE,
  matchPreset,
  presetPaletteId,
  type Preset,
} from '../../lib/presets';
import {
  ColorInput,
  Field,
  NumberInput,
  SegmentedControl,
  Switch,
  TextInput,
} from '../primitives/Form';
import { ColorPicker } from '../primitives/ColorPicker';
import {
  parseBackgroundValue,
  serializeBackgroundValue,
  withColorAt,
  withDirection,
  withKind,
  type BackgroundDirection,
  type BackgroundKind,
  type BackgroundValue,
} from '../../lib/background';
import { useCustomThemesStore } from '../../stores/customThemesStore';
import { EffectsSection } from './EffectsSection';
import { ThemePicker } from './ThemePicker';
import sectionStyles from './sections.module.scss';

/**
 * Per-category option sections.
 *
 * Each entry is a category button on the pill menu plus the body that
 * renders inside the popover when that button is active. Splitting this
 * out of OptionsPanel lets the new PillMenu render any one section in
 * isolation without re-mounting the whole panel.
 */

export interface OptionsSection {
  id: string;
  label: string;
  body: ReactNode;
  /** Render the popover at the wide preset (~480px) instead of the
   *  default narrow ~320px. Used for content with multi-column layouts. */
  wide?: boolean;
  /** Close the popover after the user interacts inside it. Used for
   *  presets — applying one should dismiss the popover. */
  closeOnApply?: boolean;
}

const StyleSection = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  return (
    <>
      <Field label="Window">
        <SegmentedControl
          value={options.template}
          onChange={(v) => set('template', v)}
          options={[
            { label: 'macOS', value: 'macos' },
            { label: 'Windows', value: 'windows' },
            { label: 'Minimal', value: 'minimal' },
          ]}
        />
      </Field>
      <Field label="Title">
        <TextInput
          value={options.title ?? ''}
          onChange={(v) => set('title', v || undefined)}
          placeholder="Window title"
        />
      </Field>
      <Field label="Watermark">
        <TextInput
          value={options.watermark ?? ''}
          onChange={(v) => set('watermark', v || undefined)}
          placeholder="(none)"
        />
      </Field>
    </>
  );
};

const TypeSection = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  return (
    <>
      <Field label="Font size">
        <NumberInput
          value={options.fontSize}
          onChange={(v) => set('fontSize', v)}
          min={8}
          max={48}
          suffix="px"
        />
      </Field>
      <Field label="Line height">
        <NumberInput
          value={options.lineHeight}
          onChange={(v) => set('lineHeight', v)}
          min={1}
          max={2.5}
          step={0.05}
        />
      </Field>
      <Field label="Letter spacing">
        <NumberInput
          value={options.letterSpacing}
          onChange={(v) => set('letterSpacing', v)}
          min={-2}
          max={6}
          step={0.1}
          suffix="px"
        />
      </Field>
    </>
  );
};

const FrameSection = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  return (
    <>
      <Field label="Width" hint="0 = auto-fit content">
        <NumberInput
          value={options.width ?? 0}
          onChange={(v) => set('width', v > 0 ? v : undefined)}
          min={0}
          max={4000}
          suffix="px"
        />
      </Field>
      <Field label="Height" hint="0 = auto-fit content">
        <NumberInput
          value={options.height ?? 0}
          onChange={(v) => set('height', v > 0 ? v : undefined)}
          min={0}
          max={4000}
          suffix="px"
        />
      </Field>
      <Field label="Padding">
        <NumberInput
          value={options.padding}
          onChange={(v) => set('padding', v)}
          min={0}
          max={64}
          suffix="px"
        />
      </Field>
      <Field label="Corner radius">
        <NumberInput
          value={options.borderRadius}
          onChange={(v) => set('borderRadius', v)}
          min={0}
          max={32}
          suffix="px"
        />
      </Field>
      <Field label="Border width">
        <NumberInput
          value={options.borderWidth}
          onChange={(v) => set('borderWidth', v)}
          min={0}
          max={8}
          suffix="px"
        />
      </Field>
      {options.borderWidth > 0 && (
        <Field label="Border color">
          <ColorInput
            value={options.borderColor ?? ''}
            onChange={(v) => set('borderColor', v || undefined)}
          />
        </Field>
      )}
    </>
  );
};

const CursorSection = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  return (
    <>
      <Field label="Style">
        <SegmentedControl
          value={options.cursorStyle}
          onChange={(v) => set('cursorStyle', v)}
          options={[
            { label: 'Block', value: 'block' },
            { label: 'Bar', value: 'bar' },
            { label: 'Underline', value: 'underline' },
          ]}
        />
      </Field>
      <Field label="Show" layout="inline">
        <Switch
          checked={options.cursorVisible}
          onChange={(v) => set('cursorVisible', v)}
          ariaLabel="Show cursor"
        />
      </Field>
      <Field label="Blink" layout="inline">
        <Switch
          checked={options.cursorBlink}
          onChange={(v) => set('cursorBlink', v)}
          ariaLabel="Cursor blink"
        />
      </Field>
      <Field label="Color">
        <ColorInput
          value={options.cursorColor ?? ''}
          onChange={(v) => set('cursorColor', v || undefined)}
          allowEmpty
        />
      </Field>
    </>
  );
};

/* Arrows point along the gradient's forward run; the button rotates 180°
   when the direction is reversed, so the icon always shows the real flow. */
const ArrowRightIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2.5 8h11M9.5 4l4 4-4 4" />
  </svg>
);
const ArrowDownIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 2.5v11M4 9.5l4 4 4-4" />
  </svg>
);
const ArrowDiagonalIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 3l10 10M13 7.5V13H7.5" />
  </svg>
);

const DIRECTIONS: Array<{
  value: BackgroundDirection;
  label: string;
  reversedLabel: string;
  Icon: () => ReactNode;
}> = [
  { value: 'horizontal', label: 'Left to right', reversedLabel: 'Right to left', Icon: ArrowRightIcon },
  { value: 'vertical', label: 'Top to bottom', reversedLabel: 'Bottom to top', Icon: ArrowDownIcon },
  { value: 'diagonal', label: 'Top-left to bottom-right', reversedLabel: 'Bottom-right to top-left', Icon: ArrowDiagonalIcon },
];

const GRADIENT_PRESETS: Array<[string, string]> = [
  ['#0a0a0f', '#1a1330'],
  ['#ff7a59', '#7c2bff'],
  ['#1a3a5c', '#0f4d6e'],
  ['#2b1055', '#ff2e97'],
  ['#f3eee2', '#e8e1cf'],
  ['#3a2c1c', '#17110a'],
];

const previewCss = (value: BackgroundValue): string => {
  const stops = value.reverse ? [...value.colors].reverse() : value.colors;
  if (value.kind === 'solid') return stops[0];
  const angle =
    value.direction === 'horizontal' ? '90deg'
    : value.direction === 'diagonal' ? '135deg'
    : '180deg';
  return `linear-gradient(${angle}, ${stops.join(', ')})`;
};

const BackgroundSection = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  const value = parseBackgroundValue(options.background);
  const apply = (next: BackgroundValue) =>
    set('background', serializeBackgroundValue(next));

  return (
    <>
      <Field label="Fill">
        <SegmentedControl<BackgroundKind>
          value={value.kind}
          onChange={(kind) => apply(withKind(value, kind))}
          options={[
            { label: 'None', value: 'none' },
            { label: 'Solid', value: 'solid' },
            { label: 'Gradient', value: 'gradient' },
          ]}
        />
      </Field>

      {value.kind !== 'none' && (
        <div
          className={sectionStyles.bgPreview}
          style={{ background: previewCss(value) }}
          aria-hidden
        />
      )}

      {value.kind === 'solid' && (
        <Field label="Color" layout="inline">
          <ColorPicker
            value={value.colors[0]}
            onChange={(hex) => apply(withColorAt(value, 0, hex))}
            ariaLabel="Background color"
          />
        </Field>
      )}

      {value.kind === 'gradient' && (
        <>
          <div className={sectionStyles.gradientPresets}>
            {GRADIENT_PRESETS.map(([from, to]) => (
              <button
                key={`${from}${to}`}
                type="button"
                className={sectionStyles.gradientPreset}
                style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                onClick={() => apply({ ...value, colors: [from, to] })}
                title={`${from} → ${to}`}
                aria-label={`Gradient ${from} to ${to}`}
              />
            ))}
          </div>

          {/* One picker per stop: the vaporwave preset ships three, and a
              fixed pair of pickers would silently drop the third. */}
          {value.colors.map((color, i) => (
            <Field
              key={i}
              label={i === 0 ? 'From' : i === value.colors.length - 1 ? 'To' : `Stop ${i + 1}`}
              layout="inline"
            >
              <ColorPicker
                value={color}
                onChange={(hex) => apply(withColorAt(value, i, hex))}
                ariaLabel={`Gradient stop ${i + 1}`}
              />
            </Field>
          ))}

          <Field label="Direction" hint="Click the active direction to reverse it.">
            <div className={sectionStyles.directionButtons}>
              {DIRECTIONS.map(({ value: dir, label, reversedLabel, Icon }) => {
                const active = value.direction === dir;
                const reversed = active && value.reverse;
                return (
                  <button
                    key={dir}
                    type="button"
                    className={[
                      sectionStyles.directionButton,
                      active ? sectionStyles.directionButtonActive : '',
                      reversed ? sectionStyles.directionButtonReversed : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => apply(withDirection(value, dir))}
                    title={reversed ? reversedLabel : label}
                    aria-label={reversed ? reversedLabel : label}
                    aria-pressed={active}
                  >
                    <Icon />
                  </button>
                );
              })}
            </div>
          </Field>
        </>
      )}
      <Field label="Padding">
        <NumberInput
          value={options.backgroundPadding}
          onChange={(v) => set('backgroundPadding', v)}
          min={0}
          max={128}
          suffix="px"
        />
      </Field>
      <Field label="Corner radius">
        <NumberInput
          value={options.backgroundRadius}
          onChange={(v) => set('backgroundRadius', v)}
          min={0}
          max={64}
          suffix="px"
        />
      </Field>
    </>
  );
};

const AnimationSection = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  return (
    <>
      <Field label="Playback speed" hint="1× is the script / cast's natural pace.">
        <NumberInput
          value={options.playbackSpeed}
          onChange={(v) => set('playbackSpeed', v)}
          min={0.25}
          max={4}
          step={0.25}
          suffix="×"
        />
      </Field>
      <Field label="FPS">
        <NumberInput
          value={options.fps}
          onChange={(v) => set('fps', v)}
          min={1}
          max={120}
        />
      </Field>
      <Field label="Loop" layout="inline">
        <Switch
          checked={options.loop}
          onChange={(v) => set('loop', v)}
          ariaLabel="Loop animation"
        />
      </Field>
      <Field label="Loop style">
        <SegmentedControl
          value={options.loopStyle}
          onChange={(v) => set('loopStyle', v)}
          options={[
            { label: 'Loop', value: 'loop' },
            { label: 'Reverse', value: 'reverse' },
            { label: 'Rewind', value: 'rewind' },
            { label: 'Fade', value: 'fade' },
          ]}
        />
      </Field>
      <Field label="Pause at end">
        <NumberInput
          value={options.pauseAtEnd}
          onChange={(v) => set('pauseAtEnd', v)}
          min={0}
          max={5000}
          step={50}
          suffix="ms"
        />
      </Field>
      <Field label="Loop pause" hint="Wait between loop iterations.">
        <NumberInput
          value={options.loopPause}
          onChange={(v) => set('loopPause', v)}
          min={0}
          max={5000}
          step={50}
          suffix="ms"
        />
      </Field>
      {options.loopStyle === 'fade' && (
        <Field label="Fade duration">
          <NumberInput
            value={options.fadeDuration}
            onChange={(v) => set('fadeDuration', v)}
            min={100}
            max={5000}
            step={100}
            suffix="ms"
          />
        </Field>
      )}
      {options.loopStyle === 'rewind' && (
        <Field label="Rewind speed">
          <NumberInput
            value={options.rewindSpeed}
            onChange={(v) => set('rewindSpeed', v)}
            min={1}
            max={20}
            step={0.5}
            suffix="×"
          />
        </Field>
      )}
    </>
  );
};

const OutputSection = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  return (
    <>
      <Field
        label="Engine"
        hint="Filmstrip is smaller and animates a single layer; SMIL emits one element per frame and matches the legacy renderer."
      >
        <SegmentedControl
          value={options.engine}
          onChange={(v) => set('engine', v)}
          options={[
            { label: 'Filmstrip', value: 'filmstrip' },
            { label: 'SMIL', value: 'smil' },
          ]}
        />
      </Field>
      <Field label="Optimize SVG" layout="inline">
        <Switch
          checked={options.optimize}
          onChange={(v) => set('optimize', v)}
          ariaLabel="Optimize SVG"
        />
      </Field>
      <Field
        label="Custom glyphs"
        hint="Render block-drawing chars (▀▄█) as SVG shapes — crisper across fonts."
        layout="inline"
      >
        <Switch
          checked={options.customGlyphs}
          onChange={(v) => set('customGlyphs', v)}
          ariaLabel="Custom block glyphs"
        />
      </Field>
    </>
  );
};

/* Presets section — visually distinct from the form sections. Lives in the
   same popover infrastructure but renders a 2-col grid of preset cards.
   Closes the popover after the user applies one (closeOnApply). */
const PresetsSection = ({ onApplied }: { onApplied?: () => void }) => {
  const apply = useOptionsStore((s) => s.applyPartial);
  const options = useOptionsStore((s) => s.options);
  const activeId = matchPreset(options);

  // The list scrolls, so the applied preset can easily open below the
  // fold — showing a selected state the user can't see is worse than
  // showing none. `block: 'nearest'` leaves the scroll alone when it's
  // already visible, so opening the popover doesn't jump for no reason.
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
    // Only on open — re-running as the user clicks around would yank the
    // list under the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Presets whose look needs a palette no built-in provides register it in
   * the custom-theme library under a stable id, upserting rather than
   * appending so applying one twice doesn't stack duplicate cards. The
   * script round-trip is safe too: the options→script writer serialises
   * the palette inline, and `extractSettings` matches it straight back to
   * this same entry by colour.
   */
  const applyPreset = (preset: Preset) => {
    if (preset.palette) {
      const id = presetPaletteId(preset.id);
      const store = useCustomThemesStore.getState();
      const entry = { ...preset.palette, id };
      if (store.themes.some((t) => t.id === id)) {
        store.updateTheme(id, entry);
      } else {
        store.addTheme(entry);
      }
    }
    apply({ ...PRESET_BASELINE, ...preset.patch });
    onApplied?.();
  };

  return (
    <div className={sectionStyles.presetGrid}>
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={[
            sectionStyles.presetCard,
            preset.id === activeId ? sectionStyles.presetCardActive : '',
          ]
            .filter(Boolean)
            .join(' ')}
          ref={preset.id === activeId ? activeRef : undefined}
          aria-pressed={preset.id === activeId}
          onClick={() => applyPreset(preset)}
        >
          <span
            className={sectionStyles.presetSwatch}
            style={{
              background: `linear-gradient(135deg, ${preset.swatch.from}, ${preset.swatch.to})`,
            }}
          >
            <span className={sectionStyles.presetSwatchInner} />
          </span>
          <span className={sectionStyles.presetMeta}>
            <span className={sectionStyles.presetName}>{preset.name}</span>
            <span className={sectionStyles.presetDesc}>{preset.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
};

export const optionsSections: OptionsSection[] = [
  { id: 'theme', label: 'Theme', body: <ThemePicker />, wide: true },
  { id: 'style', label: 'Style', body: <StyleSection /> },
  { id: 'type', label: 'Type', body: <TypeSection /> },
  { id: 'frame', label: 'Frame', body: <FrameSection /> },
  { id: 'cursor', label: 'Cursor', body: <CursorSection /> },
  { id: 'background', label: 'Background', body: <BackgroundSection /> },
  { id: 'animation', label: 'Animation', body: <AnimationSection /> },
  // Wide: the stack editor plus a grouped library of 27 effects doesn't
  // fit the 320px column the simple field sections use.
  { id: 'effects', label: 'Effects', body: <EffectsSection />, wide: true },
  { id: 'output', label: 'Output', body: <OutputSection /> },
];

/* Presets is exported separately because OptionsMenu renders it after a
   visual divider and may pass an onApplied callback. */
export const presetsSection = {
  id: 'presets',
  label: 'Presets',
  wide: true,
  closeOnApply: true,
  Component: PresetsSection,
} as const;
