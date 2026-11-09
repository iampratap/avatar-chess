/**
 * Board + piece themes for Avatar Chess.
 * Board looks use open-style palettes (wood, B&W, marble, etc.).
 * Piece "models" are geometry kits (open stylized meshes) + materials.
 * Preferences persist in localStorage.
 */

const STORAGE_KEY = 'avatar-chess-themes-v1';

/** App chrome appearance (welcome, sidebar, modals). */
export const UI_THEMES = {
  dark: { id: 'dark', label: 'Dark' },
  light: { id: 'light', label: 'White' },
};

/** 3D scene lighting + backdrop tuned to the app UI theme. */
export const UI_SCENE = {
  dark: {
    id: 'dark',
    // null → use the selected board theme backdrop
    background: null,
    ambient: { color: 0xb0b8d0, intensity: 0.55 },
    key: { color: 0xfff2e0, intensity: 1.05, x: 5, y: 12, z: 4 },
    fill: { color: 0x88aaff, intensity: 0.35, x: -6, y: 6, z: -4 },
    hemi: { sky: 0x9bb4ff, ground: 0x1a1410, intensity: 0.22 },
  },
  light: {
    id: 'light',
    background: 0xe8edf5,
    ambient: { color: 0xfff8f0, intensity: 0.78 },
    key: { color: 0xffffff, intensity: 0.85, x: 4, y: 14, z: 5 },
    fill: { color: 0xb8d4f0, intensity: 0.42, x: -7, y: 5, z: -3 },
    hemi: { sky: 0xdbeafe, ground: 0xcbd5e1, intensity: 0.45 },
  },
};

export const BOARD_THEMES = {
  wooden: {
    id: 'wooden',
    label: 'Wooden',
    light: 0xe2c48a,
    dark: 0x8b5a2b,
    rim: 0x3b2412,
    bg: 0x1a1410,
    metalness: 0.05,
    roughness: 0.85,
  },
  classic: {
    id: 'classic',
    label: 'Black & White',
    light: 0xf5f5f4,
    dark: 0x292524,
    rim: 0x1c1917,
    bg: 0x0c0c0e,
    metalness: 0.08,
    roughness: 0.7,
  },
  marble: {
    id: 'marble',
    label: 'Marble',
    light: 0xe7e5e4,
    dark: 0x78716c,
    rim: 0x44403c,
    bg: 0x161412,
    metalness: 0.15,
    roughness: 0.45,
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    light: 0xd1fae5,
    dark: 0x065f46,
    rim: 0x022c22,
    bg: 0x04140f,
    metalness: 0.12,
    roughness: 0.55,
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    light: 0x334155,
    dark: 0x0f172a,
    rim: 0x020617,
    bg: 0x020617,
    metalness: 0.35,
    roughness: 0.4,
  },
  royal: {
    id: 'royal',
    label: 'Royal Blue',
    light: 0xbfdbfe,
    dark: 0x1e3a8a,
    rim: 0x172554,
    bg: 0x0b1224,
    metalness: 0.2,
    roughness: 0.5,
  },
};

/** Piece model kits — stylized open meshes (not proprietary assets). */
export const PIECE_THEMES = {
  classic: {
    id: 'classic',
    label: 'Classic Sculpt',
    kit: 'classic',
    metalness: 0.22,
    roughness: 0.45,
  },
  lowpoly: {
    id: 'lowpoly',
    label: 'Low-Poly',
    kit: 'lowpoly',
    metalness: 0.1,
    roughness: 0.65,
  },
  crystal: {
    id: 'crystal',
    label: 'Crystal',
    kit: 'crystal',
    metalness: 0.15,
    roughness: 0.12,
    transmissionHint: true,
  },
  totem: {
    id: 'totem',
    label: 'Wooden Totem',
    kit: 'totem',
    metalness: 0.05,
    roughness: 0.9,
  },
  metal: {
    id: 'metal',
    label: 'Polished Metal',
    kit: 'classic',
    metalness: 0.85,
    roughness: 0.22,
  },
};

export function loadThemePrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { board: 'wooden', piece: 'classic', ui: 'dark' };
    const parsed = JSON.parse(raw);
    return {
      board: BOARD_THEMES[parsed.board] ? parsed.board : 'wooden',
      piece: PIECE_THEMES[parsed.piece] ? parsed.piece : 'classic',
      ui: UI_THEMES[parsed.ui] ? parsed.ui : 'dark',
    };
  } catch {
    return { board: 'wooden', piece: 'classic', ui: 'dark' };
  }
}

export function saveThemePrefs(prefs) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      board: prefs.board,
      piece: prefs.piece,
      ui: prefs.ui || 'dark',
    })
  );
}

export function applyUiTheme(uiId) {
  const id = UI_THEMES[uiId] ? uiId : 'dark';
  document.documentElement.dataset.uiTheme = id;
  return id;
}

export function loadAndApplyUiTheme() {
  const prefs = loadThemePrefs();
  return applyUiTheme(prefs.ui);
}
