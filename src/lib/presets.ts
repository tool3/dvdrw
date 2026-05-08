import type { RenderOptions } from '../stores/optionsStore';

export interface Preset {
  id: string;
  name: string;
  description: string;
  swatch: { from: string; to: string };
  patch: Partial<RenderOptions>;
}

export const PRESETS: Preset[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'True-black canvas, dracula terminal, soft glow.',
    swatch: { from: '#0a0a0f', to: '#1a1330' },
    patch: {
      theme: 'dracula',
      template: 'macos',
      background: 'gradient(#0a0a0f, #1a1330:vertical)',
      backgroundPadding: 48,
      backgroundRadius: 18,
      borderRadius: 14,
      padding: 18,
      cursorStyle: 'block',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Cool gradient, github-dark terminal, balanced spacing.',
    swatch: { from: '#1a3a5c', to: '#0f4d6e' },
    patch: {
      theme: 'githubDark',
      template: 'macos',
      background: 'gradient(#1a3a5c, #0f4d6e:diagonal)',
      backgroundPadding: 56,
      backgroundRadius: 20,
      borderRadius: 12,
      padding: 16,
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm gradient, monokai terminal, photo-style framing.',
    swatch: { from: '#ff7a59', to: '#7c2bff' },
    patch: {
      theme: 'monokai',
      template: 'macos',
      background: 'gradient(#ff7a59, #7c2bff:diagonal)',
      backgroundPadding: 64,
      backgroundRadius: 24,
      borderRadius: 16,
      padding: 18,
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Soft light background, github-light terminal.',
    swatch: { from: '#f3eee2', to: '#e8e1cf' },
    patch: {
      theme: 'githubLight',
      template: 'macos',
      background: 'gradient(#f3eee2, #e8e1cf:vertical)',
      backgroundPadding: 48,
      backgroundRadius: 18,
      borderRadius: 12,
      padding: 16,
    },
  },
  {
    id: 'bare',
    name: 'Bare',
    description: 'No frame, no chrome — pure terminal output.',
    swatch: { from: '#101010', to: '#101010' },
    patch: {
      template: 'minimal',
      background: undefined,
      backgroundPadding: 0,
      borderRadius: 0,
      padding: 12,
    },
  },
  {
    id: 'panel',
    name: 'Panel',
    description: 'Plain elevated panel, no gradient noise.',
    swatch: { from: '#161618', to: '#161618' },
    patch: {
      theme: 'tokyoNight',
      template: 'macos',
      background: '#161618',
      backgroundPadding: 40,
      backgroundRadius: 14,
      borderRadius: 10,
      padding: 14,
    },
  },
];
