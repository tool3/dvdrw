import { useMemo } from 'react';
import { themes as builtinThemes } from 'dvdrw';
import { useOptionsStore } from '../../stores/optionsStore';
import {
  ColorInput,
  Field,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  TextInput,
} from '../primitives/Form';
import { Button } from '../primitives/Button';
import styles from './OptionsPanel.module.scss';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className={styles.section}>
    <h3 className={styles.sectionTitle}>{title}</h3>
    <div className={styles.sectionBody}>{children}</div>
  </section>
);

export const OptionsPanel = () => {
  const options = useOptionsStore((s) => s.options);
  const set = useOptionsStore((s) => s.set);
  const reset = useOptionsStore((s) => s.reset);

  const themeOptions = useMemo(
    () =>
      Object.keys(builtinThemes as object)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ label: name, value: name })),
    [],
  );

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Customize</h2>
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
      </header>

      <div className={styles.scroll}>
        <Section title="Style">
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
        </Section>

        <Section title="Type">
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
        </Section>

        <Section title="Frame">
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
        </Section>

        <Section title="Cursor">
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
        </Section>

        <Section title="Background">
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
        </Section>

        <Section title="Animation">
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
              onChange={(e) =>
                set('loopStyle', e.target.value as typeof options.loopStyle)
              }
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
        </Section>

        <Section title="Output">
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
        </Section>
      </div>
    </div>
  );
};
