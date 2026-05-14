import {
  adjustLightness,
  compressLightness,
  hexToRgba,
  normalizeHex,
} from './color';

/**
 * Default brand color — the "iris violet" the app launched with.
 * Anything the user picks via the brand picker overrides this, but
 * `DEFAULT_BRAND` is what we fall back to on first run / when storage
 * is unreadable / when validation fails.
 */
export const DEFAULT_BRAND = '#ff7a9c';

/**
 * Suggested presets shown in the brand picker. Pick anything from this
 * list and the app re-skins to match — accents, focus rings, ambient
 * background blobs, and the favicon all update in one pass.
 */
export const BRAND_PRESETS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Iris',    hex: '#a698ff' },
  { name: 'Indigo',  hex: '#7c8aff' },
  { name: 'Cyan',    hex: '#5cd0ff' },
  { name: 'Emerald', hex: '#5ce0a8' },
  { name: 'Citrus',  hex: '#ffcc66' },
  { name: 'Rose',    hex: '#ff7a9c' },
  { name: 'Coral',   hex: '#ff8c66' },
];

const STORAGE_KEY = 'dvdrw.brand';

/** Persist + retrieve the brand color across reloads. */
export const readStoredBrand = (): string => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRAND;
    const cleaned = normalizeHex(raw);
    return cleaned === '#000000' && raw.toLowerCase() !== '#000000'
      ? DEFAULT_BRAND
      : cleaned;
  } catch {
    return DEFAULT_BRAND;
  }
};

export const storeBrand = (hex: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeHex(hex));
  } catch {
    /* private mode / disabled storage — ignore */
  }
};

/**
 * Push the brand color into the live document. Sets the existing
 * accent/ambient CSS custom properties on `:root` via inline style so
 * the value beats both the `:root[data-theme=light]` and `dark`
 * declarations from `tokens.scss`, and triggers a favicon refresh so
 * the browser tab icon picks up the new color too.
 */
export const applyBrand = (rawHex: string): void => {
  const hex = normalizeHex(rawHex);
  const root = document.documentElement;

  // Accent ladder — full / hover-up / active-down, plus the alpha
  // variants used for glows, focus rings, and the "soft" tinted fills
  // beneath active buttons / selected tabs.
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-hover', adjustLightness(hex, 6));
  root.style.setProperty('--accent-active', adjustLightness(hex, -6));
  root.style.setProperty('--accent-soft', hexToRgba(hex, 0.16));
  root.style.setProperty('--accent-glow', hexToRgba(hex, 0.42));
  root.style.setProperty('--accent-ring', hexToRgba(hex, 0.55));

  // Legacy aliases kept around tokens.scss — components still reference
  // these in a few places, mirror them so a brand swap is total.
  root.style.setProperty('--brand', hex);
  root.style.setProperty('--brand-hover', adjustLightness(hex, 6));
  root.style.setProperty('--brand-active', adjustLightness(hex, -6));
  root.style.setProperty('--brand-soft', hexToRgba(hex, 0.16));
  root.style.setProperty('--brand-ring', hexToRgba(hex, 0.55));

  // Ambient gradient blobs painted on the body. Use the same hue at
  // different alphas — visually coherent and gives every brand a
  // distinct "feel" without picking custom complementary hues per
  // preset.
  root.style.setProperty('--ambient-1', hexToRgba(hex, 0.34));
  root.style.setProperty('--ambient-2', hexToRgba(hex, 0.22));
  root.style.setProperty('--ambient-3', hexToRgba(hex, 0.18));

  updateFavicon(hex);
};

/**
 * SVG favicon source, parameterised by the brand color. We derive
 * three disc-gradient stops (highlight / mid / shadow) and three
 * background-gradient stops by clamping lightness so the BG tints
 * the brand without ever going light. Returns a data: URL ready to
 * stick on a `<link rel="icon">`.
 */
const buildFaviconDataUrl = (hex: string): string => {
  const discHi = adjustLightness(hex, 22);
  const discMid = hex;
  const discLow = adjustLightness(hex, -28);
  const bgLow = compressLightness(hex, 4);
  const bgMid = compressLightness(hex, 10);
  const bgHi = compressLightness(hex, 22);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgLow}"/>
      <stop offset="45%" stop-color="${bgMid}"/>
      <stop offset="100%" stop-color="${bgHi}"/>
    </linearGradient>
    <radialGradient id="disc" cx="38%" cy="34%" r="72%">
      <stop offset="0%" stop-color="${discHi}"/>
      <stop offset="45%" stop-color="${discMid}"/>
      <stop offset="100%" stop-color="${discLow}"/>
    </radialGradient>
    <radialGradient id="sheen" cx="30%" cy="26%" r="38%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.6)"/>
      <stop offset="55%" stop-color="rgba(255,255,255,0.1)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <radialGradient id="hub" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${bgMid}"/>
      <stop offset="100%" stop-color="${bgLow}"/>
    </radialGradient>
    <path id="labelRing" d="M 27 32 A 5 5 0 1 1 37 32 A 5 5 0 1 1 27 32" fill="none"/>
  </defs>
  <rect x="0" y="0" width="64" height="64" rx="14" fill="url(#bg)"/>
  <circle cx="32" cy="32" r="22" fill="url(#disc)"/>
  <circle cx="32" cy="32" r="20.5" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="0.6"/>
  <circle cx="32" cy="32" r="14.5" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.6"/>
  <circle cx="32" cy="32" r="22" fill="url(#sheen)"/>
  <text font-family="ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif" font-size="1.4" font-weight="600" letter-spacing="0.18" fill="rgba(255,255,255,0.7)">
    <textPath href="#labelRing" startOffset="0">DVDRW · BY TOOL3 · DVDRW · BY TOOL3 ·</textPath>
  </text>
  <circle cx="32" cy="32" r="9" fill="url(#hub)"/>
  <circle cx="32" cy="32" r="9" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="0.3"/>
  <circle cx="32" cy="32" r="2.8" fill="${bgLow}"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const updateFavicon = (hex: string): void => {
  const href = buildFaviconDataUrl(hex);
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  } else {
    link.type = 'image/svg+xml';
  }
  link.href = href;

  // apple-touch-icon stays in sync too so home-screen / pinned tabs
  // pick up the new color without a hard reload.
  let apple = document.querySelector<HTMLLinkElement>(
    'link[rel="apple-touch-icon"]',
  );
  if (!apple) {
    apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    document.head.appendChild(apple);
  }
  apple.href = href;

  // theme-color meta keeps the mobile browser chrome in sync with the
  // brand tint so iOS Safari's status-bar matches the page.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = compressLightness(hex, 10);
};
