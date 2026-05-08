import { useMemo, type ReactNode } from 'react';
import { themes as builtinThemes } from 'dvdrw';
import { useOptionsStore } from '../../stores/optionsStore';
import { PRESETS } from '../../lib/presets';
import {
  ColorInput,
  Field,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  TextInput,
} from '../primitives/Form';
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
  const themeOptions = useMemo(
    () =>
      Object.keys(builtinThemes as object)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ label: name, value: name })),
    [],
  );
  return (
    <>
      <Field label="Theme">
        <Select
          value={options.theme}
          onChange={(e) => set('theme', e.target.value)}
          options={themeOptions}
        />
      </Field>
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
      <Field label="Padding">
        <NumberInput
          value={options.padding}
          onChange={(v) => set('padding', v)}
          min={0}
          suffix="px"
        />
      </Field>
      <Field label="Corner radius">
        <NumberInput
          value={options.borderRadius}
          onChange={(v) => set('borderRadius', v)}
          min={0}
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

const BackgroundSection = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  return (
    <>
      <Field
        label="Fill"
        hint='Solid hex (e.g. "#161618") or gradient(#a, #b:vertical|horizontal|diagonal)'
      >
        <TextInput
          value={options.background ?? ''}
          onChange={(v) => set('background', v || undefined)}
          placeholder="(none)"
        />
      </Field>
      <Field label="Padding">
        <NumberInput
          value={options.backgroundPadding}
          onChange={(v) => set('backgroundPadding', v)}
          min={0}
          suffix="px"
        />
      </Field>
      <Field label="Corner radius">
        <NumberInput
          value={options.backgroundRadius}
          onChange={(v) => set('backgroundRadius', v)}
          min={0}
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
        <Select
          value={options.loopStyle}
          onChange={(e) => set('loopStyle', e.target.value as typeof options.loopStyle)}
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
          step={50}
          suffix="ms"
        />
      </Field>
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
    </>
  );
};

/* Presets section — visually distinct from the form sections. Lives in the
   same popover infrastructure but renders a 2-col grid of preset cards.
   Closes the popover after the user applies one (closeOnApply). */
const PresetsSection = ({ onApplied }: { onApplied?: () => void }) => {
  const apply = useOptionsStore((s) => s.applyPartial);
  return (
    <div className={sectionStyles.presetGrid}>
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={sectionStyles.presetCard}
          onClick={() => {
            apply(preset.patch);
            onApplied?.();
          }}
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
  { id: 'style', label: 'Style', body: <StyleSection /> },
  { id: 'type', label: 'Type', body: <TypeSection /> },
  { id: 'frame', label: 'Frame', body: <FrameSection /> },
  { id: 'cursor', label: 'Cursor', body: <CursorSection /> },
  { id: 'background', label: 'Background', body: <BackgroundSection /> },
  { id: 'animation', label: 'Animation', body: <AnimationSection /> },
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
