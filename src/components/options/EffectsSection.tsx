import { useState } from 'react';
import {
  EFFECTS,
  EFFECT_GROUPS,
  LOOKS,
  defaultParams,
  expandLook,
  findEffect,
  groupStack,
  isTuned,
  newEffectUid,
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
 *
 * Looks (the library's presets) are added *expanded* into the effects
 * they're composed of, wrapped in a container carrying the Look's name.
 * A preset added as one opaque effect would be a dead end — this way the
 * whole recipe is visible and every knob inside it stays reachable, while
 * the underlying stack stays flat and so cannot render differently.
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

/**
 * One effect in the stack: enable switch, expandable name, reorder and
 * remove, plus its parameters when open. Used both at top level and
 * nested inside a Look, which is the only reason `nested` exists.
 */
const EffectRow = ({
  entry,
  nested = false,
  open,
  onToggleOpen,
  canMoveUp,
  canMoveDown,
  onMove,
  onEnabled,
  onRemove,
  onParam,
  onReset,
}: {
  entry: EffectConfig;
  nested?: boolean;
  open: boolean;
  onToggleOpen: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (delta: number) => void;
  onEnabled: (value: boolean) => void;
  onRemove: () => void;
  onParam: (key: string, value: ControlValue) => void;
  onReset: () => void;
}) => {
  const descriptor = findEffect(entry.id);
  if (!descriptor) return null;
  const params = resolveParams(descriptor, entry.params);
  const tuned = isTuned(entry);
  const settingsCount = descriptor.controls.length;
  const inLook = !!entry.group;

  return (
    <li className={[styles.row, nested ? styles.rowNested : ''].filter(Boolean).join(' ')}>
      <div className={styles.rowHead}>
        <Switch
          checked={entry.enabled}
          onChange={onEnabled}
          ariaLabel={`${descriptor.label} enabled`}
        />
        <button
          type="button"
          className={[styles.rowName, open ? styles.rowNameOpen : '']
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleOpen}
          disabled={settingsCount === 0}
          aria-expanded={open}
        >
          <span className={styles.rowLabel}>{descriptor.label}</span>
          {settingsCount > 0 && (
            <span className={styles.rowMeta}>
              {tuned
                ? 'edited'
                : `${settingsCount} setting${settingsCount === 1 ? '' : 's'}`}
            </span>
          )}
        </button>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            aria-label={`Move ${descriptor.label} earlier`}
            title="Move earlier"
          >
            <UpIcon />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            aria-label={`Move ${descriptor.label} later`}
            title="Move later"
          >
            <DownIcon />
          </button>
          <button
            type="button"
            className={[styles.iconBtn, styles.iconBtnDanger].join(' ')}
            onClick={onRemove}
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
              onChange={(v) => onParam(control.key, v)}
            />
          ))}
          {tuned && (
            <button type="button" className={styles.reset} onClick={onReset}>
              {inLook ? `Reset to ${entry.group?.label} values` : 'Reset to defaults'}
            </button>
          )}
        </div>
      )}
    </li>
  );
};

export const EffectsSection = () => {
  const stack = useOptionsStore((s) => s.options.effects);
  const set = useOptionsStore((s) => s.set);
  // One expanded row at a time — every effect's parameters at once would
  // be a wall of sliders in a 520px popover.
  const [openUid, setOpenUid] = useState<string | null>(null);
  // Groups track their own expansion — a Look's container can be open
  // while none of its children are.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

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

  /** Add a Look as its constituent effects, grouped under its name. */
  const addLook = (lookId: string) => {
    const look = LOOKS.find((l) => l.id === lookId);
    if (!look) return;
    const entries = expandLook(look);
    write([...stack, ...entries]);
    setOpenGroup(entries[0]?.group?.uid ?? null);
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

  /** Reorder a whole Look, keeping its members contiguous. */
  const moveGroup = (groupUid: string, delta: number) => {
    const members = stack.filter((e) => e.group?.uid === groupUid);
    if (members.length === 0) return;
    const rest = stack.filter((e) => e.group?.uid !== groupUid);
    const firstIndex = stack.findIndex((e) => e.group?.uid === groupUid);
    // Insertion point is expressed against the stack minus this group, so
    // stepping past a neighbouring group jumps the whole block rather than
    // burrowing into it.
    const runsBefore = groupStack(rest);
    const at = runsBefore.findIndex((run) =>
      run.kind === 'group'
        ? run.start >= firstIndex
        : run.index >= firstIndex,
    );
    const position = at === -1 ? runsBefore.length : at;
    const target = Math.max(0, Math.min(runsBefore.length, position + delta));
    if (target === position) return;
    const flat: EffectConfig[] = [];
    runsBefore.forEach((run, i) => {
      if (i === target) flat.push(...members);
      flat.push(...(run.kind === 'group' ? run.entries : [run.entry]));
    });
    if (target >= runsBefore.length) flat.push(...members);
    write(flat);
  };

  const setGroupEnabled = (groupUid: string, enabled: boolean) =>
    write(
      stack.map((e) => (e.group?.uid === groupUid ? { ...e, enabled } : e)),
    );

  const removeGroup = (groupUid: string) =>
    write(stack.filter((e) => e.group?.uid !== groupUid));

  const setParam = (entry: EffectConfig, key: string, value: ControlValue) =>
    update(entry.uid, { params: { ...entry.params, [key]: value } });

  /** Back to creation values: the Look's recipe for a Look member, the
   *  effect's own defaults for a standalone entry. */
  const resetParams = (entry: EffectConfig) =>
    update(entry.uid, { params: { ...(entry.baseline ?? {}) } });

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
            Nothing applied. Add a Look for a whole recipe, or a single
            effect — they stack in order, top to bottom.
          </p>
        ) : (
          <ul className={styles.rows}>
            {groupStack(stack).map((run) =>
              run.kind === 'effect' ? (
                <EffectRow
                  key={run.entry.uid}
                  entry={run.entry}
                  open={openUid === run.entry.uid}
                  onToggleOpen={() =>
                    setOpenUid(openUid === run.entry.uid ? null : run.entry.uid)
                  }
                  canMoveUp={run.index > 0}
                  canMoveDown={run.index < stack.length - 1}
                  onMove={(d) => move(run.entry.uid, d)}
                  onEnabled={(v) => update(run.entry.uid, { enabled: v })}
                  onRemove={() => remove(run.entry.uid)}
                  onParam={(k, v) => setParam(run.entry, k, v)}
                  onReset={() => resetParams(run.entry)}
                />
              ) : (
                <li key={run.uid} className={styles.group}>
                  <div className={styles.groupHead}>
                    <Switch
                      checked={run.entries.some((e) => e.enabled)}
                      onChange={(v) => setGroupEnabled(run.uid, v)}
                      ariaLabel={`${run.label} enabled`}
                    />
                    <button
                      type="button"
                      className={[
                        styles.rowName,
                        openGroup === run.uid ? styles.rowNameOpen : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() =>
                        setOpenGroup(openGroup === run.uid ? null : run.uid)
                      }
                      aria-expanded={openGroup === run.uid}
                    >
                      <span className={styles.groupChevron} aria-hidden>
                        {openGroup === run.uid ? '▾' : '▸'}
                      </span>
                      <span className={styles.rowLabel}>{run.label}</span>
                      <span className={styles.rowMeta}>
                        Look · {run.entries.length} effects
                      </span>
                    </button>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => moveGroup(run.uid, -1)}
                        aria-label={`Move ${run.label} earlier`}
                        title="Move earlier"
                      >
                        <UpIcon />
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => moveGroup(run.uid, 1)}
                        aria-label={`Move ${run.label} later`}
                        title="Move later"
                      >
                        <DownIcon />
                      </button>
                      <button
                        type="button"
                        className={[styles.iconBtn, styles.iconBtnDanger].join(' ')}
                        onClick={() => removeGroup(run.uid)}
                        aria-label={`Remove ${run.label}`}
                        title="Remove Look"
                      >
                        <RemoveIcon />
                      </button>
                    </div>
                  </div>

                  {openGroup === run.uid && (
                    <ul className={styles.groupChildren}>
                      {run.entries.map((entry) => {
                        const index = stack.indexOf(entry);
                        return (
                          <EffectRow
                            key={entry.uid}
                            entry={entry}
                            nested
                            open={openUid === entry.uid}
                            onToggleOpen={() =>
                              setOpenUid(openUid === entry.uid ? null : entry.uid)
                            }
                            canMoveUp={index > run.start}
                            canMoveDown={index < run.start + run.entries.length - 1}
                            onMove={(d) => move(entry.uid, d)}
                            onEnabled={(v) => update(entry.uid, { enabled: v })}
                            onRemove={() => remove(entry.uid)}
                            onParam={(k, v) => setParam(entry, k, v)}
                            onReset={() => resetParams(entry)}
                          />
                        );
                      })}
                    </ul>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className={styles.library}>
        <div className={styles.libGroup}>
          <span className={styles.groupName}>
            Looks
            <span className={styles.groupNote}>added as editable effects</span>
          </span>
          <div className={styles.chips}>
            {LOOKS.map((look) => (
              <button
                key={look.id}
                type="button"
                className={[styles.chip, styles.chipLook].join(' ')}
                onClick={() => addLook(look.id)}
                title={`${look.description} — ${look.recipe.length} effects`}
              >
                {look.label}
              </button>
            ))}
          </div>
        </div>
        {EFFECT_GROUPS.map((group) => {
          const inGroup = EFFECTS.filter((e) => e.group === group);
          if (inGroup.length === 0) return null;
          return (
            <div key={group} className={styles.libGroup}>
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
