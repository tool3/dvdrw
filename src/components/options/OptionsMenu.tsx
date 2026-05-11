import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '../primitives/Button';
import { useOptionsStore } from '../../stores/optionsStore';
import {
  optionsSections,
  presetsSection,
  type OptionsSection,
} from './sections';
import styles from './OptionsMenu.module.scss';

const ResetIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path
      d="M2 6a4 4 0 1 0 1.2-2.85M2 2v2.5h2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PresetsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <rect x="1" y="1" width="4.4" height="4.4" rx="1.1" fill="currentColor" />
    <rect x="6.6" y="1" width="4.4" height="4.4" rx="1.1" fill="currentColor" opacity="0.55" />
    <rect x="1" y="6.6" width="4.4" height="4.4" rx="1.1" fill="currentColor" opacity="0.55" />
    <rect x="6.6" y="6.6" width="4.4" height="4.4" rx="1.1" fill="currentColor" opacity="0.3" />
  </svg>
);

interface ResolvedSection {
  id: string;
  label: string;
  body: ReactNode;
  wide?: boolean;
}

/**
 * The pill menu of customization categories.
 *
 * Renders a horizontal capsule with one button per category — including
 * Presets, which behaves identically to the option categories: a click
 * opens a popover anchored under the button, click again / outside / Esc
 * dismisses. Only one popover is open at a time. Presets gets a wider
 * variant of the popover to fit its 2-column grid; applying a preset
 * dismisses the popover.
 */
/**
 * Mobile-only page-grouping for the pill itself: rather than letting all
 * ten items overflow into a horizontally-scrolled strip (where the last
 * tab visibly clips off the right edge), we split them into pages of
 * 3/3/4 items and let the user swipe between pages. A dot indicator
 * sits beneath the pill so the user knows which page they're on.
 * Pattern adapted from shellfied's Toolbar.
 */
const MOBILE_PAGES: ReadonlyArray<ReadonlyArray<string>> = [
  ['theme', 'style', 'type'],
  ['frame', 'cursor', 'background'],
  ['animation', 'output', 'presets', 'reset'],
];

const useMobileSwipe = (pageCount: number) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / el.offsetWidth);
    setPage((prev) => (prev === next ? prev : next));
  }, []);

  const jumpTo = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ left: index * el.offsetWidth, behavior });
      // Optimistic — onScroll will reconcile after smooth scroll settles.
      setPage(Math.max(0, Math.min(pageCount - 1, index)));
    },
    [pageCount],
  );

  return { scrollRef, page, onScroll, jumpTo };
};

export const OptionsMenu = () => {
  const resetOptions = useOptionsStore((s) => s.reset);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );

  // Live mobile detection — recomputes on viewport changes so toggling
  // between desktop and mobile widths picks the right pill layout
  // without a remount.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 720px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 720px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const swipe = useMobileSwipe(MOBILE_PAGES.length);

  const close = useCallback(() => setActiveId(null), []);

  const positionFor = useCallback((id: string) => {
    const btn = buttonsRef.current[id];
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    return { left: rect.left + rect.width / 2, top: rect.bottom + 10 };
  }, []);

  const open = useCallback(
    (id: string) => {
      const pos = positionFor(id);
      if (!pos) return;
      setAnchor(pos);
      setActiveId(id);
    },
    [positionFor],
  );

  // Reposition while open in case layout shifts (responsive resizes, the
  // user scrolls the page, etc.).
  useLayoutEffect(() => {
    if (!activeId) return;
    const onUpdate = () => {
      const pos = positionFor(activeId);
      if (pos) setAnchor(pos);
    };
    window.addEventListener('resize', onUpdate);
    window.addEventListener('scroll', onUpdate, true);
    return () => {
      window.removeEventListener('resize', onUpdate);
      window.removeEventListener('scroll', onUpdate, true);
    };
  }, [activeId, positionFor]);

  // Click-outside + Esc dismissal.
  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (pillRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [activeId, close]);

  // Resolve the active section. Presets is a special section with a
  // component that needs a callback for closeOnApply, hence its own branch.
  let activeSection: ResolvedSection | undefined;
  if (activeId === presetsSection.id) {
    const Body = presetsSection.Component;
    activeSection = {
      id: presetsSection.id,
      label: presetsSection.label,
      wide: presetsSection.wide,
      body: <Body onApplied={presetsSection.closeOnApply ? close : undefined} />,
    };
  } else if (activeId) {
    const found = optionsSections.find((s) => s.id === activeId);
    if (found) {
      activeSection = {
        id: found.id,
        label: found.label,
        body: found.body,
        wide: found.wide,
      };
    }
  }

  // When a tab in another page is opened (e.g. through Esc-close + re-open),
  // snap the pill to the page that contains that tab so the user sees
  // the active highlight.
  useLayoutEffect(() => {
    if (!isMobile || !activeId) return;
    const pageIdx = MOBILE_PAGES.findIndex((page) => page.includes(activeId));
    if (pageIdx >= 0 && pageIdx !== swipe.page) {
      swipe.jumpTo(pageIdx, 'instant');
    }
    // Only react when activeId or the viewport changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, isMobile]);

  const renderTab = (
    section: { id: string; label: string },
    extraIcon?: ReactNode,
  ) => (
    <button
      key={section.id}
      ref={(el) => {
        buttonsRef.current[section.id] = el;
      }}
      type="button"
      className={[
        styles.tab,
        activeId === section.id ? styles.tabActive : '',
        extraIcon ? styles.tabWithIcon : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-expanded={activeId === section.id}
      onClick={() => {
        if (activeId === section.id) close();
        else open(section.id);
      }}
    >
      {extraIcon && <span className={styles.tabIcon}>{extraIcon}</span>}
      <span>{section.label}</span>
    </button>
  );

  // Look up a section's tab descriptor (id + label) by id, then render
  // it via `renderTab`. Used by the mobile pages, which reference items
  // by id from MOBILE_PAGES.
  const renderById = (id: string): ReactNode => {
    if (id === presetsSection.id) {
      return renderTab(presetsSection, <PresetsIcon />);
    }
    if (id === 'reset') {
      return (
        <Button
          key="reset"
          size="sm"
          variant="ghost"
          iconLeft={<ResetIcon />}
          onClick={resetOptions}
          title="Reset all customization options to defaults"
        >
          Reset
        </Button>
      );
    }
    const section = (optionsSections as OptionsSection[]).find((s) => s.id === id);
    return section ? renderTab(section) : null;
  };

  return (
    <>
      {/* Desktop pill: every tab side-by-side. */}
      {!isMobile && (
        <div className={styles.pill} ref={pillRef}>
          {(optionsSections as OptionsSection[]).map((section) =>
            renderTab(section),
          )}

          <span className={styles.divider} aria-hidden />

          {renderTab(presetsSection, <PresetsIcon />)}

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<ResetIcon />}
            onClick={resetOptions}
            title="Reset all customization options to defaults"
          >
            Reset
          </Button>
        </div>
      )}

      {/* Mobile pill: tabs split into pages of 3 / 3 / 4 items. Native
          scroll-snap handles the swipe; JS tracks which page is in view
          so the dot indicator stays in sync. */}
      {isMobile && (
        <div className={styles.mobilePillColumn}>
          <div className={styles.pill} ref={pillRef}>
            <div
              className={styles.pillScroll}
              ref={swipe.scrollRef}
              onScroll={swipe.onScroll}
            >
              <div className={styles.pillTrack}>
                {MOBILE_PAGES.map((page, pageIdx) => (
                  <div key={pageIdx} className={styles.pillPage}>
                    {page.map((id) => (
                      <span key={id} className={styles.pillSlot}>
                        {renderById(id)}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className={styles.dots}
            role="tablist"
            aria-label="Menu pages"
          >
            {MOBILE_PAGES.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === swipe.page}
                aria-label={`Page ${i + 1}`}
                className={[
                  styles.dot,
                  i === swipe.page ? styles.dotActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => swipe.jumpTo(i)}
              />
            ))}
          </div>
        </div>
      )}

      {activeSection && anchor && (
        <div
          ref={popoverRef}
          className={[
            styles.popover,
            activeSection.wide ? styles.popoverWide : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ left: anchor.left, top: anchor.top }}
          role="dialog"
          aria-label={`${activeSection.label} options`}
        >
          <header className={styles.popoverHeader}>
            <h3 className={styles.popoverTitle}>{activeSection.label}</h3>
          </header>
          <div className={styles.popoverBody}>{activeSection.body}</div>
        </div>
      )}
    </>
  );
};
