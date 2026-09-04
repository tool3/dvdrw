import { useState } from 'react';
import {
  EFFECTS,
  EFFECT_GROUPS,
  findEffect,
  newEffectUid,
  defaultParams,
  resolveParams,
  type Control,
  type ControlValue,
  type EffectConfig,
} from '../../lib/effects';
import { useOptionsStore } from '../../stores/optionsStore';
import { ColorInput, Field, NumberInput, Select, Switch } from '../primitives/Form';
import styles from './EffectsSection.module.scss';

/**
 * Editor for the post-processing stack.
 *
 * Order is significant — the library composes effects as a pipeline, so
 * blur-then-threshold is a different picture from threshold-then-blur.
 * That's why the stack is a reorderable list rather than a set of
 * checkboxes, and why the same effect can legitimately appear twice.
 */

const UpIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
    <path d="M2 6.5L5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
    <path d="M2 3.5L5 6.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const RemoveIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
    <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/** One parameter, rendered according to its declared control type. */
const EffectControl = ({
  control,
  value,
  onChange,
}: {
  control: Control;
  value: ControlValue;
  onChange: (next: ControlValue) => void;
}) => {
  switch (control.type) {
    case 'number':
      return (
        <Field label={control.label} hint={control.hint}>
          <NumberInput
            value={typeof value === 'number' ? value : control.default}
            onChange={onChange}
            min={control.min}
            max={control.max}
            step={control.step}
            suffix={control.suffix}
          />
        </Field>
      );
    case 'boolean':
      return (
        <Field label={control.label} hint={control.hint} layout="inline">
          <Switch
            checked={typeof value === 'boolean' ? value : control.default}
            onChange={onChange}
            ariaLabel={control.label}
          />
        </Field>
      );
    case 'color':
      return (
        <Field label={control.label} hint={control.hint}>
          <ColorInput
            value={typeof value === 'string' ? value : control.default}
            onChange={onChange}
          />
        </Field>
      );
    case 'optionalColor':
      // `allowEmpty` gives back '' when cleared; the library wants null.
      return (
        <Field label={control.label} hint={control.hint}>
          <ColorInput
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next === '' ? null : next)}
            allowEmpty
          />
        </Field>
      );
    case 'enum':
      return (
        <Field label={control.label} hint={control.hint}>
          <Select
            value={typeof value === 'string' ? value : control.default}
            onChange={(e) => onChange(e.target.value)}
            options={control.options.map((o) => ({ label: o, value: o }))}
          />
        </Field>
      );
  }
};

export const EffectsSection = () => {
  const stack = useOptionsStore((s) => s.options.effects);
  const set = useOptionsStore((s) => s.set);
  // One expanded row at a time — every effect's parameters at once would
  // be a wall of sliders in a 520px popover.
  const [openUid, setOpenUid] = useState<string | null>(null);

  const write = (next: EffectConfig[]) => set('effects', next);

  const add = (id: string) => {
    const descriptor = findEffect(id);
    if (!descriptor) return;
    const entry: EffectConfig = {
      uid: newEffectUid(id),
      id,
      enabled: true,
      params: {},
    };
    write([...stack, entry]);
    // Open it straight away — adding an effect is nearly always followed
    // by wanting to tune it.
    if (descriptor.controls.length > 0) setOpenUid(entry.uid);
  };

  const update = (uid: string, patch: Partial<EffectConfig>) =>
    write(stack.map((e) => (e.uid === uid ? { ...e, ...patch } : e)));

  const remove = (uid: string) => write(stack.filter((e) => e.uid !== uid));

  const move = (uid: string, delta: number) => {
    const index = stack.findIndex((e) => e.uid === uid);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= stack.length) return;
    const next = [...stack];
    [next[index], next[target]] = [next[target], next[index]];
    write(next);
  };

  const setParam = (entry: EffectConfig, key: string, value: ControlValue) =>
    update(entry.uid, { params: { ...entry.params, [key]: value } });

  const resetParams = (entry: EffectConfig) =>
    update(entry.uid, { params: {} });

  return (
    <div className={styles.wrap}>
      <section className={styles.stack}>
        <header className={styles.stackHead}>
          <span className={styles.stackTitle}>
            Stack{stack.length > 0 ? ` · ${stack.length}` : ''}
          </span>
          {stack.length > 0 && (
            <button type="button" className={styles.clear} onClick={() => write([])}>
              Clear all
            </button>
          )}
        </header>

        {stack.length === 0 ? (
          <p className={styles.empty}>
            Nothing applied. Pick an effect below — they stack in order, top
            to bottom.
          </p>
        ) : (
          <ul className={styles.rows}>
            {stack.map((entry, index) => {
              const descriptor = findEffect(entry.id);
              if (!descriptor) return null;
              const open = openUid === entry.uid;
              const params = resolveParams(descriptor, entry.params);
              const tuned = Object.keys(entry.params).length > 0;
              return (
                <li key={entry.uid} className={styles.row}>
                  <div className={styles.rowHead}>
                    <Switch
                      checked={entry.enabled}
                      onChange={(v) => update(entry.uid, { enabled: v })}
                      ariaLabel={`${descriptor.label} enabled`}
                    />
                    <button
                      type="button"
                      className={[styles.rowName, open ? styles.rowNameOpen : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setOpenUid(open ? null : entry.uid)}
                      disabled={descriptor.controls.length === 0}
                      aria-expanded={open}
                    >
                      <span className={styles.rowLabel}>{descriptor.label}</span>
                      {descriptor.controls.length > 0 && (
                        <span className={styles.rowMeta}>
                          {tuned
                            ? 'edited'
                            : `${descriptor.controls.length} setting${
                                descriptor.controls.length === 1 ? '' : 's'
                              }`}
                        </span>
                      )}
                    </button>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => move(entry.uid, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${descriptor.label} earlier`}
                        title="Move earlier"
                      >
                        <UpIcon />
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => move(entry.uid, 1)}
                        disabled={index === stack.length - 1}
                        aria-label={`Move ${descriptor.label} later`}
                        title="Move later"
                      >
                        <DownIcon />
                      </button>
                      <button
                        type="button"
                        className={[styles.iconBtn, styles.iconBtnDanger].join(' ')}
                        onClick={() => remove(entry.uid)}
                        aria-label={`Remove ${descriptor.label}`}
                        title="Remove"
                      >
                        <RemoveIcon />
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className={styles.params}>
                      <p className={styles.paramsDesc}>{descriptor.description}</p>
                      {descriptor.controls.map((control) => (
                        <EffectControl
                          key={control.key}
                          control={control}
                          value={params[control.key]}
                          onChange={(v) => setParam(entry, control.key, v)}
                        />
                      ))}
                      {tuned && (
                        <button
                          type="button"
                          className={styles.reset}
                          onClick={() => resetParams(entry)}
                        >
                          Reset to defaults
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.library}>
        {EFFECT_GROUPS.map((group) => {
          const inGroup = EFFECTS.filter((e) => e.group === group);
          if (inGroup.length === 0) return null;
          return (
            <div key={group} className={styles.group}>
              <span className={styles.groupName}>{group}</span>
              <div className={styles.chips}>
                {inGroup.map((descriptor) => (
                  <button
                    key={descriptor.id}
                    type="button"
                    className={styles.chip}
                    onClick={() => add(descriptor.id)}
                    title={descriptor.description}
                  >
                    {descriptor.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
};

/** Exported for the "reset" affordance elsewhere in the menu. */
export const effectDefaults = defaultParams;
