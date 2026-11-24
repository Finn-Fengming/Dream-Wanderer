// Resilient keyboard, mouse, pointer-lock, and virtual touch input manager.
// Incorporates anti-stuck-key safeguards (opposite direction cancel, modifier flush, Shift preserved).

export const keys = new Set<string>();
export const pressed = new Set<string>();
export const released = new Set<string>();

export const mouse = {
  ndcX: 0,
  ndcY: 0,
  deltaX: 0,
  deltaY: 0,
  wheelDelta: 0,
  locked: false,
  draggingLook: false,
  lmbDownTime: 0,
  lmbChargedTriggered: false,
};

export const touchInput = {
  active: false,
  moveX: 0,
  moveY: 0,
  lookDeltaX: 0,
  lookDeltaY: 0,
};

const OPPOSITE_KEYS: Record<string, string> = {
  KeyW: 'KeyS',
  KeyS: 'KeyW',
  KeyA: 'KeyD',
  KeyD: 'KeyA',
};

let recentLog: string[] = [];
function logEvent(tag: string) {
  recentLog.push(tag);
  if (recentLog.length > 10) recentLog = recentLog.slice(-10);
}

let initialized = false;
let pointerLockTarget: HTMLElement | null = null;
let pointerLockAllowed = false;

export function setPointerLockAllowed(allowed: boolean) {
  pointerLockAllowed = allowed;
  if (!allowed && document.pointerLockElement) {
    document.exitPointerLock?.();
  }
}

export function requestGamePointerLock() {
  if (!pointerLockAllowed || !pointerLockTarget) return;
  if (touchInput.active) return;
  if (document.pointerLockElement !== pointerLockTarget) {
    try {
      const p = pointerLockTarget.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // Fallback drag-look automatically handles environments blocking PointerLock
    }
  }
}

export function initInput(canvasContainer: HTMLElement) {
  if (initialized) return;
  initialized = true;
  pointerLockTarget = canvasContainer;

  window.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (/^(Meta|Alt|Control)/.test(e.code)) {
      keys.clear();
      return;
    }
    if (e.metaKey || e.altKey || e.ctrlKey) return;

    if (!e.repeat) {
      logEvent('↓' + e.code);
      const opp = OPPOSITE_KEYS[e.code];
      if (opp) keys.delete(opp);
    }
    if (!keys.has(e.code)) {
      pressed.add(e.code);
    }
    keys.add(e.code);

    if (e.code === 'Space' || e.code === 'Tab') {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    logEvent('↑' + e.code);
    if (keys.has(e.code)) {
      keys.delete(e.code);
      released.add(e.code);
    }
    if (/^(Meta|Alt|Control)/.test(e.code)) {
      keys.clear();
    }
  });

  for (const ev of ['blur', 'focus', 'pagehide'] as const) {
    window.addEventListener(ev, () => {
      logEvent('[' + ev + ']');
      keys.clear();
      mouse.draggingLook = false;
    });
  }

  document.addEventListener('visibilitychange', () => {
    keys.clear();
    mouse.draggingLook = false;
  });

  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === pointerLockTarget;
  });

  window.addEventListener('mousemove', (e) => {
    if (!(e.buttons & 2)) keys.delete('RMB');
    if (!(e.buttons & 1)) {
      if (keys.has('LMB')) {
        keys.delete('LMB');
        released.add('LMB');
      }
      mouse.draggingLook = false;
    }
    mouse.ndcX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    mouse.ndcY = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;

    if (mouse.locked || mouse.draggingLook) {
      mouse.deltaX += e.movementX;
      mouse.deltaY += e.movementY;
    }
  });

  canvasContainer.addEventListener('mousedown', (e) => {
    if (pointerLockAllowed && !mouse.locked && e.button === 0) {
      requestGamePointerLock();
    }
    if (e.button === 0) {
      if (!keys.has('LMB')) pressed.add('LMB');
      keys.add('LMB');
      mouse.lmbDownTime = performance.now();
      mouse.lmbChargedTriggered = false;
      if (!mouse.locked && pointerLockAllowed) {
        mouse.draggingLook = true;
      }
    } else if (e.button === 1) {
      e.preventDefault();
      pressed.add('MMB');
    } else if (e.button === 2) {
      if (!keys.has('RMB')) pressed.add('RMB');
      keys.add('RMB');
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      if (keys.has('LMB')) {
        keys.delete('LMB');
        released.add('LMB');
      }
      mouse.draggingLook = false;
    } else if (e.button === 2) {
      if (keys.has('RMB')) {
        keys.delete('RMB');
        released.add('RMB');
      }
    }
  });

  window.addEventListener(
    'wheel',
    (e) => {
      mouse.wheelDelta += Math.sign(e.deltaY);
    },
    { passive: true }
  );

  window.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener(
    'touchstart',
    () => {
      touchInput.active = true;
    },
    { passive: true, once: true }
  );
}

export function simulatePress(...codes: string[]) {
  for (const c of codes) {
    pressed.add(c);
    keys.add(c);
  }
}

export function simulateRelease(...codes: string[]) {
  for (const c of codes) {
    keys.delete(c);
    released.add(c);
  }
}

export function endInputFrame() {
  pressed.clear();
  released.clear();
  mouse.deltaX = 0;
  mouse.deltaY = 0;
  mouse.wheelDelta = 0;
  touchInput.lookDeltaX = 0;
  touchInput.lookDeltaY = 0;
}

export function getMoveAxes(): { x: number; z: number } {
  let x = 0;
  let z = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;

  if (Math.abs(touchInput.moveX) > 0.05 || Math.abs(touchInput.moveY) > 0.05) {
    x += touchInput.moveX;
    z += touchInput.moveY;
  }

  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  return { x, z };
}

export function createF3DebugOverlay(extraProvider: () => string): () => void {
  const el = document.createElement('div');
  el.id = 'f3-debug-panel';
  el.style.cssText = [
    'position:fixed',
    'left:12px',
    'top:86px',
    'z-index:150',
    'font:11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
    'color:#a8f0d8',
    'background:rgba(5,10,18,0.78)',
    'border:1px solid rgba(120,210,190,0.35)',
    'padding:8px 10px',
    'white-space:pre',
    'display:none',
    'pointer-events:none',
    'backdrop-filter:blur(4px)',
  ].join(';');
  document.body.appendChild(el);

  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === '1') {
    el.style.display = 'block';
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
    },
    true
  );

  return () => {
    if (el.style.display === 'none') return;
    el.textContent = [
      `[回梦游仙 · F3 诊断面板]`,
      `keys   : ${[...keys].join(' ') || '-'}`,
      `lock   : ${mouse.locked ? 'PointerLock' : mouse.draggingLook ? 'DragLook' : 'Free'} | focus: ${document.hasFocus()}`,
      extraProvider(),
      `recent : ${recentLog.join(' ')}`,
    ].join('\n');
  };
}
