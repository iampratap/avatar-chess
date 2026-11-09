/**
 * Guided How-to-Play walkthrough — one instruction per step.
 */
import { initHelpDiagrams } from './helpDiagrams.js';
import { $, setTextIfChanged, bumpAnim } from './ui.js';

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome',
    instruct: 'Follow these steps to learn Avatar Chess. Tap Next after each one.',
    detail: 'Four players share one board. You take turns. Last avatar standing wins.',
  },
  {
    id: 'goal',
    title: 'Goal',
    instruct: 'Capture every rival pawn. Keep at least one of yours alive.',
    detail: 'When only one player still has pieces, that player wins the match.',
  },
  {
    id: 'humans',
    title: 'Pick humans',
    instruct: 'On the welcome screen, choose how many humans play (1–3).',
    detail: 'Empty seats are filled by PC. You can change Looks anytime before you start.',
  },
  {
    id: 'setup',
    title: 'Setup',
    instruct: 'Find your two pawns on your home edge of the board.',
    detail:
      'Seats run clockwise: A bottom (blue), B left (red), C top (green), D right (orange).',
  },
  {
    id: 'morph',
    title: 'Avatar morph',
    instruct: 'Wait for your turn — your pawns morph into your current power.',
    detail: 'Other players stay as pawns. After you move, your pieces return to pawns.',
  },
  {
    id: 'powers',
    title: 'Powers',
    instruct: 'Move with the power you morph into this round.',
    detail:
      'Rook: rows & columns. Knight: L-shaped jump. Bishop: diagonals. Check the HUD for your symbol.',
  },
  {
    id: 'turn',
    title: 'Your turn',
    instruct: 'Do this on your turn:',
    bullets: [
      'Watch your pawns morph into the power.',
      'Tap one of your pieces to select it.',
      'Tap a highlighted square to move (or capture).',
    ],
    detail: 'You cannot pass a legal move. Capturing removes the rival piece from the board.',
  },
  {
    id: 'cycle',
    title: 'Power cycle',
    instruct: 'After everyone alive has moved once, the round ends and powers rotate.',
    detail:
      'Round 1: A Rook, B Knight, C Bishop, D Rook — then each shifts to the next power next round.',
  },
  {
    id: 'save',
    title: 'Save & replay',
    instruct: 'Leave anytime — the game autosaves in this browser.',
    detail: 'Resume from the welcome screen. After a win, open Watch Replay to step through the match.',
  },
  {
    id: 'ready',
    title: 'Ready',
    instruct: 'Close this guide and press Play when you are ready.',
    detail: 'Open Help again from the menu anytime. Good luck!',
  },
];

let stepIndex = 0;
let bound = false;


function renderStep() {
  const step = STEPS[stepIndex];
  if (!step) return;

  const title = $('help-step-title');
  const instruct = $('help-step-instruct');
  const detail = $('help-step-detail');
  const bullets = $('help-step-bullets');
  const counter = $('help-step-counter');
  const dots = $('help-step-dots');
  const prev = $('btn-help-prev');
  const next = $('btn-help-next');
  const panels = document.querySelectorAll('[data-help-panel]');

  let changed = false;
  changed = setTextIfChanged(title, step.title, 'ui-fade') || changed;
  changed = setTextIfChanged(instruct, step.instruct, 'ui-fade') || changed;
  if (detail) {
    changed = setTextIfChanged(detail, step.detail || '', 'ui-fade') || changed;
    detail.hidden = !step.detail;
  }
  if (bullets) {
    if (step.bullets?.length) {
      bullets.hidden = false;
      bullets.innerHTML = step.bullets
        .map((b, i) => `<li class="ui-enter" style="--enter-delay:${i * 40}ms">${b}</li>`)
        .join('');
      changed = true;
    } else {
      bullets.hidden = true;
      bullets.innerHTML = '';
    }
  }
  setTextIfChanged(counter, `Step ${stepIndex + 1} of ${STEPS.length}`, 'ui-fade');

  if (dots) {
    dots.innerHTML = STEPS.map(
      (_, i) =>
        `<button type="button" class="help-dot${i === stepIndex ? ' active' : ''}${i < stepIndex ? ' done' : ''}" data-step="${i}" aria-label="Go to step ${i + 1}" aria-current="${i === stepIndex ? 'step' : 'false'}"></button>`
    ).join('');
  }

  panels.forEach((panel) => {
    const show = panel.dataset.helpPanel === step.id;
    const wasHidden = panel.hidden;
    panel.hidden = !show;
    if (show && wasHidden) bumpAnim(panel, 'ui-enter');
  });

  if (prev) prev.disabled = stepIndex === 0;
  if (next) {
    const last = stepIndex >= STEPS.length - 1;
    setTextIfChanged(next, last ? 'Done' : 'Next', 'ui-fade');
    next.dataset.finish = last ? '1' : '0';
  }

  const card = document.querySelector('.help-step-card') || $('help-modal')?.querySelector('.modal-card');
  if (changed && card) bumpAnim(card, 'ui-bump');

  // Setup board tiles when that panel becomes visible
  if (step.id === 'setup') initHelpDiagrams();
}

function goTo(index) {
  stepIndex = Math.max(0, Math.min(STEPS.length - 1, index));
  renderStep();
}

function onPrev() {
  goTo(stepIndex - 1);
}

function onNext(onClose) {
  if (stepIndex >= STEPS.length - 1) {
    onClose?.();
    return;
  }
  goTo(stepIndex + 1);
}

function onDots(e) {
  const btn = e.target.closest?.('.help-dot');
  if (!btn) return;
  goTo(Number(btn.dataset.step));
}

/**
 * Wire walkthrough controls once. Call openWalkthrough() whenever Help opens.
 */
export function initHelpWalkthrough({ onClose } = {}) {
  if (bound) return;
  bound = true;

  $('btn-help-prev')?.addEventListener('click', onPrev);
  $('btn-help-next')?.addEventListener('click', () => onNext(onClose));
  $('help-step-dots')?.addEventListener('click', onDots);
}

export function openWalkthrough() {
  stepIndex = 0;
  renderStep();
}

export function getWalkthroughStepCount() {
  return STEPS.length;
}
