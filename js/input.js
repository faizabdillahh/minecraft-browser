import { CHUNK_SIZE } from './constants.js';

export const InputState = {
  keys: new Set(),
  mouseX: 0,
  mouseY: 0,
  dx: 0,
  dy: 0,
  scroll: 0,
  clicks: { left: false, right: false },
  isLocked: false
};

let globalAbortController = null;

/**
 * Cleanup resource object for ES2026 explicit resource management via `using`
 */
class InputDisposer {
  constructor(controller) {
    this.controller = controller;
  }

  [Symbol.dispose]() {
    this.controller.abort();
    InputState.keys.clear();
    InputState.isLocked = false;
  }
}

export function initInput(canvasElement) {
  if (globalAbortController) {
    globalAbortController.abort();
  }
  
  globalAbortController = new AbortController();
  const { signal } = globalAbortController;

  // Pointer Lock Handlers
  const handlePointerLockChange = () => {
    InputState.isLocked = document.pointerLockElement === canvasElement;
    if (InputState.isLocked) {
      document.documentElement.classList.add('debug-active'); // Placeholder jika dibutuhkan
    }
  };

  const handlePointerLockError = (err) => {
    console.error("Pointer lock error:", err);
    InputState.isLocked = false;
  };

  const handleClick = async (e) => {
    if (!InputState.isLocked) {
      try {
        // Request unadjustedMovement for raw mouse input in ES2026/modern browser
        await canvasElement.requestPointerLock({ unadjustedMovement: true });
      } catch (err) {
        console.warn("unadjustedMovement failed, falling back to standard pointer lock");
        canvasElement.requestPointerLock().catch(console.error);
      }
    } else {
      if (e.button === 0) InputState.clicks.left = true;
      if (e.button === 2) InputState.clicks.right = true;
    }
  };

  // Mouse move handler
  const handleMouseMove = (e) => {
    if (!InputState.isLocked) return;
    InputState.dx += e.movementX;
    InputState.dy += e.movementY;
    InputState.mouseX += e.movementX;
    InputState.mouseY += e.movementY;
  };

  // Keyboard handlers
  const handleKeyDown = (e) => {
    InputState.keys.add(e.code.toLowerCase());
  };

  const handleKeyUp = (e) => {
    InputState.keys.delete(e.code.toLowerCase());
  };

  // Scroll wheel for hotbar
  const handleWheel = (e) => {
    InputState.scroll += Math.sign(e.deltaY);
  };

  // Simple Touch Support (Virtual Joystick/Look Mapping)
  const activeTouches = new Map();

  const handleTouchStart = (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      activeTouches.set(touch.identifier, { 
        x: touch.clientX, 
        y: touch.clientY, 
        startX: touch.clientX, 
        startY: touch.clientY 
      });
    }
    if (!InputState.isLocked) {
      InputState.isLocked = true;
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const prev = activeTouches.get(touch.identifier);
      if (!prev) continue;

      const dx = touch.clientX - prev.x;
      const dy = touch.clientY - prev.y;

      if (touch.clientX > window.innerWidth / 2) {
        // Kanan layar: Look (Yaw/Pitch)
        InputState.dx += dx * 2.0;
        InputState.dy += dy * 2.0;
      } else {
        // Kiri layar: Virtual Joystick (WASD)
        const totalDx = touch.clientX - prev.startX;
        const totalDy = touch.clientY - prev.startY;

        // Reset arah virtual joystick
        InputState.keys.delete('keyw');
        InputState.keys.delete('keys');
        InputState.keys.delete('keya');
        InputState.keys.delete('keyd');

        if (totalDy < -20) InputState.keys.add('keyw');
        if (totalDy > 20) InputState.keys.add('keys');
        if (totalDx < -20) InputState.keys.add('keya');
        if (totalDx > 20) InputState.keys.add('keyd');
      }

      prev.x = touch.clientX;
      prev.y = touch.clientY;
    }
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const prev = activeTouches.get(touch.identifier);
      if (prev && touch.clientX < window.innerWidth / 2) {
        // Lepas virtual joystick
        InputState.keys.delete('keyw');
        InputState.keys.delete('keys');
        InputState.keys.delete('keya');
        InputState.keys.delete('keyd');
      } else if (prev && Math.abs(touch.clientX - prev.startX) < 10 && Math.abs(touch.clientY - prev.startY) < 10) {
        // Deteksi tap cepat untuk meletakkan/menghancurkan blok
        InputState.clicks.left = true;
      }
      activeTouches.delete(touch.identifier);
    }
  };

  // Register all listeners passing the abort signal
  document.addEventListener('pointerlockchange', handlePointerLockChange, { signal });
  document.addEventListener('pointerlockerror', handlePointerLockError, { signal });
  document.addEventListener('mousemove', handleMouseMove, { signal });
  document.addEventListener('keydown', handleKeyDown, { signal });
  document.addEventListener('keyup', handleKeyUp, { signal });
  document.addEventListener('wheel', handleWheel, { signal, passive: true });

  canvasElement.addEventListener('click', handleClick, { signal });
  canvasElement.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  canvasElement.addEventListener('touchstart', handleTouchStart, { signal, passive: false });
  canvasElement.addEventListener('touchmove', handleTouchMove, { signal, passive: false });
  canvasElement.addEventListener('touchend', handleTouchEnd, { signal, passive: false });

  // Mengembalikan objek disposer untuk digunakan dengan keyword `using`
  return new InputDisposer(globalAbortController);
}

export function getInputSnapshot() {
  const snapshot = structuredClone(InputState);
  
  // Consume (reset) impuls satu frame
  InputState.dx = 0;
  InputState.dy = 0;
  InputState.scroll = 0;
  InputState.clicks.left = false;
  InputState.clicks.right = false;

  return snapshot;
}
