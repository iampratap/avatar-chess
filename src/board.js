import { createBoard3D } from './board3d.js';
import { createBoard2D } from './board2d.js';
import { getViewMode } from './themes.js';

/**
 * Create the playable board for the current (or given) view mode.
 * @param {HTMLElement} host
 * @param {'2d'|'3d'} [mode]
 */
export function createBoard(host, mode = getViewMode()) {
  const viewMode = mode === '2d' ? '2d' : '3d';
  host.dataset.viewMode = viewMode;
  const board = viewMode === '2d' ? createBoard2D(host) : createBoard3D(host);
  board.viewMode = viewMode;
  return board;
}
