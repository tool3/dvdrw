import { useState, type DragEvent, type ReactNode } from 'react';
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
  reorderInGroup,
  reorderRuns,
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

const GripIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
    <circle cx="3.5" cy="2" r="0.9" fill="currentColor" />
    <circle cx="6.5" cy="2" r="0.9" fill="currentColor" />
    <circle cx="3.5" cy="5" r="0.9" fill="currentColor" />
    <circle cx="6.5" cy="5" r="0.9" fill="currentColor" />
    <circle cx="3.5" cy="8" r="0.9" fill="currentColor" />
    <circle cx="6.5" cy="8" r="0.9" fill="currentColor" />
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

interface DragState {
  list: string;
  from: number;
  over: number;
}

interface DragList {
  itemProps: (list: string, index: number) => {
    onDragStart: (e: DragEvent<HTMLElement>) => void;
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
  };
  isDragging: (list: string, index: number) => boolean;
  isOver: (list: string, index: number) => boolean;
}

/**
 * Drag-to-reorder across every list in the editor at once, each identified
 * by a `list` key — 'root' for the top level, the Look's uid for its
 * children. One hook rather than one per list because a Look's child list
 * only exists while it is expanded, and hooks can't be created per item.
 *
 * Drops are refused across lists on purpose: dragging an effect out of a
 * Look would break the contiguity `groupStack` relies on to rebuild the
 * container, so a Look moves as a whole from its own row instead.
 */
const useDragLists = (
  onReorder: (list: string, from: number, to: number) => void,
): DragList => {
  const [state, setState] = useState<DragState | null>(null);

  return {
    itemProps: (list, index) => ({
      onDragStart: (e) => {
        // dragstart bubbles, and a Look's children sit inside the Look's own
        // draggable row — without this the ancestor overwrites the child's
        // drag state and every nested drag is read as moving the whole Look.
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        // Firefox refuses to start a drag without payload on the transfer.
        e.dataTransfer.setData('text/plain', String(index));
        setState({ list, from: index, over: index });
      },
      onDragOver: (e) => {
        // A mismatched list falls through to the ancestor on purpose: that
        // is how hovering a Look's child while dragging a top-level run
        // targets the Look itself.
        if (!state || state.list !== list) return;
        e.stopPropagation();
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (state.over !== index) setState({ ...state, over: index });
      },
      onDrop: (e) => {
        if (!state || state.list !== list) return;
        e.preventDefault();
        e.stopPropagation();
        if (state.from !== index) onReorder(list, state.from, index);
        setState(null);
      },
      onDragEnd: () => setState(null),
    }),
    isDragging: (list, index) =>
      state?.list === list && state.from === index,
    isOver: (list, index) =>
      state?.list === list && state.over === index && state.from !== index,
  };
};

/**
 * The grip. `draggable` sits on the row, not here, so the drag image is the
 * whole row — but it is only armed while the pointer is down on the grip,
 * otherwise dragging a slider inside an expanded row would drag the row.
 */
const DragHandle = ({
  label,
  onArm,
  onDisarm,
}: {
  label: string;
  onArm: () => void;
  onDisarm: () => void;
}) => (
  <span
    className={styles.dragHandle}
    onPointerDown={onArm}
    onPointerUp={onDisarm}
    role="button"
    tabIndex={-1}
    aria-label={`Drag to reorder ${label}`}
    title="Drag to reorder"
  >
    <GripIcon />
  </span>
);

/**
 * One effect in the stack: enable switch, expandable name, drag handle and
 * remove, plus its parameters when open. Used both at top level and
 * nested inside a Look, which is the only reason `nested` exists.
 */
const EffectRow = ({
  entry,
  nested = false,
  open,
  onToggleOpen,
  drag,
  dragList,
  dragIndex,
  onEnabled,
  onRemove,
  onParam,
  onReset,
}: {
  entry: EffectConfig;
  nested?: boolean;
  open: boolean;
  onToggleOpen: () => void;
  drag: DragList;
  dragList: string;
  dragIndex: number;
  onEnabled: (value: boolean) => void;
  onRemove: () => void;
  onParam: (key: string, value: ControlValue) => void;
  onReset: () => void;
}) => {
  const [armed, setArmed] = useState(false);
  const descriptor = findEffect(entry.id);
  if (!descriptor) return null;
  const params = resolveParams(descriptor, entry.params);
  const tuned = isTuned(entry);
  const settingsCount = descriptor.controls.length;
  const inLook = !!entry.group;

  return (
    <li
      className={[
        styles.row,
        nested ? styles.rowNested : '',
        drag.isDragging(dragList, dragIndex) ? styles.rowDragging : '',
        drag.isOver(dragList, dragIndex) ? styles.rowDropTarget : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={armed}
      {...drag.itemProps(dragList, dragIndex)}
      onDragEnd={() => {
        setArmed(false);
        drag.itemProps(dragList, dragIndex).onDragEnd();
      }}
    >
      <div className={styles.rowHead}>
        <DragHandle
          label={descriptor.label}
          onArm={() => setArmed(true)}
          onDisarm={() => setArmed(false)}
        />
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

/** A Look's container row. Drags as one unit at the top level. */
const LookRow = ({
  label,
  count,
  enabled,
  open,
  onToggleOpen,
  onEnabled,
  onRemove,
  drag,
  dragIndex,
  children,
}: {
  label: string;
  count: number;
  enabled: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onEnabled: (value: boolean) => void;
  onRemove: () => void;
  drag: DragList;
  dragIndex: number;
  children: ReactNode;
}) => {
  const [armed, setArmed] = useState(false);

  return (
    <li
      className={[
        styles.group,
        drag.isDragging('root', dragIndex) ? styles.rowDragging : '',
        drag.isOver('root', dragIndex) ? styles.rowDropTarget : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={armed}
      {...drag.itemProps('root', dragIndex)}
      onDragEnd={() => {
        setArmed(false);
        drag.itemProps('root', dragIndex).onDragEnd();
      }}
    >
      <div className={styles.groupHead}>
        <DragHandle
          label={label}
          onArm={() => setArmed(true)}
          onDisarm={() => setArmed(false)}
        />
        <Switch checked={enabled} onChange={onEnabled} ariaLabel={`${label} enabled`} />
        <button
          type="button"
          className={[styles.rowName, open ? styles.rowNameOpen : '']
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleOpen}
          aria-expanded={open}
        >
          <span className={styles.groupChevron} aria-hidden>
            {open ? '▾' : '▸'}
          </span>
          <span className={styles.rowLabel}>{label}</span>
          <span className={styles.rowMeta}>Look · {count} effects</span>
        </button>
        <div className={styles.rowActions}>
          <button
            type="button"
            className={[styles.iconBtn, styles.iconBtnDanger].join(' ')}
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            title="Remove Look"
          >
            <RemoveIcon />
          </button>
        </div>
      </div>

      {open && <ul className={styles.groupChildren}>{children}</ul>}
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

  // 'root' reorders top-level runs (a lone effect, or a whole Look);
  // any other key is a Look's uid and reorders inside that Look.
  const drag = useDragLists((list, from, to) =>
    write(
      list === 'root'
        ? reorderRuns(stack, from, to)
        : reorderInGroup(stack, list, from, to),
    ),
  );

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
            {groupStack(stack).map((run, runIndex) =>
              run.kind === 'effect' ? (
                <EffectRow
                  key={run.entry.uid}
                  entry={run.entry}
                  open={openUid === run.entry.uid}
                  onToggleOpen={() =>
                    setOpenUid(openUid === run.entry.uid ? null : run.entry.uid)
                  }
                  drag={drag}
                  dragList="root"
                  dragIndex={runIndex}
                  onEnabled={(v) => update(run.entry.uid, { enabled: v })}
                  onRemove={() => remove(run.entry.uid)}
                  onParam={(k, v) => setParam(run.entry, k, v)}
                  onReset={() => resetParams(run.entry)}
                />
              ) : (
                <LookRow
                  key={run.uid}
                  label={run.label}
                  count={run.entries.length}
                  enabled={run.entries.some((e) => e.enabled)}
                  open={openGroup === run.uid}
                  onToggleOpen={() =>
                    setOpenGroup(openGroup === run.uid ? null : run.uid)
                  }
                  onEnabled={(v) => setGroupEnabled(run.uid, v)}
                  onRemove={() => removeGroup(run.uid)}
                  drag={drag}
                  dragIndex={runIndex}
                >
                  {run.entries.map((entry, childIndex) => (
                    <EffectRow
                      key={entry.uid}
                      entry={entry}
                      nested
                      open={openUid === entry.uid}
                      onToggleOpen={() =>
                        setOpenUid(openUid === entry.uid ? null : entry.uid)
                      }
                      drag={drag}
                      dragList={run.uid}
                      dragIndex={childIndex}
                      onEnabled={(v) => update(entry.uid, { enabled: v })}
                      onRemove={() => remove(entry.uid)}
                      onParam={(k, v) => setParam(entry, k, v)}
                      onReset={() => resetParams(entry)}
                    />
                  ))}
                </LookRow>
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
