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
let isMiningHeld = false;
let isPlacingHeld = false;

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
      canvasElement.classList.add('pointer-locked');
    } else {
      canvasElement.classList.remove('pointer-locked');
    }
  };

  const handlePointerLockError = (err) => {
    console.error("Pointer lock error:", err);
    InputState.isLocked = false;
  };

  const handleMouseDown = async (e) => {
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

  // --- Advanced Mobile Touch Controls ---
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    document.documentElement.classList.add('mobile-active');
    InputState.isLocked = true;
  }

  // Virtual Joystick variables
  const joystickContainer = document.getElementById('joystick-container');
  const joystickKnob = document.getElementById('joystick-knob');
  const joystickBase = document.getElementById('joystick-base');
  let joystickTouchId = null;
  let joystickStartX = 0;
  let joystickStartY = 0;

  if (joystickContainer) {
    joystickContainer.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (joystickTouchId !== null) return;
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier;
      const rect = joystickBase.getBoundingClientRect();
      joystickStartX = rect.left + rect.width / 2;
      joystickStartY = rect.top + rect.height / 2;

      if (!InputState.isLocked) InputState.isLocked = true;
    }, { signal });

    document.addEventListener('touchmove', (e) => {
      if (joystickTouchId === null) return;
      
      let joystickTouch = null;
      for (const touch of e.touches) {
        if (touch.identifier === joystickTouchId) {
          joystickTouch = touch;
          break;
        }
      }
      
      if (!joystickTouch) return;
      
      const dx = joystickTouch.clientX - joystickStartX;
      const dy = joystickTouch.clientY - joystickStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = 40; // max displacement in pixels
      
      let angle = Math.atan2(dy, dx);
      let moveX = dx;
      let moveY = dy;
      
      if (distance > maxRadius) {
        moveX = Math.cos(angle) * maxRadius;
        moveY = Math.sin(angle) * maxRadius;
      }
      
      // Move knob visually
      joystickKnob.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
      
      // Map to keys
      InputState.keys.delete('keyw');
      InputState.keys.delete('keys');
      InputState.keys.delete('keya');
      InputState.keys.delete('keyd');
      
      const normX = moveX / maxRadius;
      const normY = moveY / maxRadius;
      
      if (normY < -0.3) InputState.keys.add('keyw');
      if (normY > 0.3) InputState.keys.add('keys');
      if (normX < -0.3) InputState.keys.add('keya');
      if (normX > 0.3) InputState.keys.add('keyd');
    }, { signal });

    const handleJoystickEnd = (e) => {
      if (joystickTouchId === null) return;
      
      let ended = false;
      for (const touch of e.changedTouches) {
        if (touch.identifier === joystickTouchId) {
          ended = true;
          break;
        }
      }
      
      if (ended) {
        joystickTouchId = null;
        joystickKnob.style.transform = 'translate(-50%, -50%)';
        InputState.keys.delete('keyw');
        InputState.keys.delete('keys');
        InputState.keys.delete('keya');
        InputState.keys.delete('keyd');
      }
    };
    
    document.addEventListener('touchend', handleJoystickEnd, { signal });
    document.addEventListener('touchcancel', handleJoystickEnd, { signal });
  }

  // Camera rotation look control
  let lookTouchId = null;
  let lastLookX = 0;
  let lastLookY = 0;

  const handleCanvasTouchStart = (e) => {
    if (!InputState.isLocked) InputState.isLocked = true;
    if (lookTouchId !== null) return;
    
    const touch = e.changedTouches[0];
    lookTouchId = touch.identifier;
    lastLookX = touch.clientX;
    lastLookY = touch.clientY;
  };

  const handleCanvasTouchMove = (e) => {
    if (lookTouchId === null) return;
    
    let lookTouch = null;
    for (const touch of e.touches) {
      if (touch.identifier === lookTouchId) {
        lookTouch = touch;
        break;
      }
    }
    
    if (!lookTouch) return;
    
    const dx = lookTouch.clientX - lastLookX;
    const dy = lookTouch.clientY - lastLookY;
    
    // Smooth camera touch drag sensitivity
    const touchLookSensitivity = 0.5;
    InputState.dx += dx * touchLookSensitivity;
    InputState.dy += dy * touchLookSensitivity;
    
    lastLookX = lookTouch.clientX;
    lastLookY = lookTouch.clientY;
  };

  const handleCanvasTouchEnd = (e) => {
    if (lookTouchId === null) return;
    
    let ended = false;
    for (const touch of e.changedTouches) {
      if (touch.identifier === lookTouchId) {
        ended = true;
        break;
      }
    }
    
    if (ended) {
      lookTouchId = null;
    }
  };

  // Button Action listeners
  const btnJump = document.getElementById('btn-jump');
  const btnMine = document.getElementById('btn-mine');
  const btnPlace = document.getElementById('btn-place');

  if (btnJump) {
    btnJump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      InputState.keys.add('space');
    }, { signal });
    btnJump.addEventListener('touchend', (e) => {
      e.preventDefault();
      InputState.keys.delete('space');
    }, { signal });
    btnJump.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      InputState.keys.delete('space');
    }, { signal });
  }

  if (btnMine) {
    btnMine.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isMiningHeld = true;
    }, { signal });
    btnMine.addEventListener('touchend', (e) => {
      e.preventDefault();
      isMiningHeld = false;
    }, { signal });
    btnMine.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      isMiningHeld = false;
    }, { signal });
  }

  if (btnPlace) {
    btnPlace.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isPlacingHeld = true;
    }, { signal });
    btnPlace.addEventListener('touchend', (e) => {
      e.preventDefault();
      isPlacingHeld = false;
    }, { signal });
    btnPlace.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      isPlacingHeld = false;
    }, { signal });
  }

  // Register all listeners passing the abort signal
  document.addEventListener('pointerlockchange', handlePointerLockChange, { signal });
  document.addEventListener('pointerlockerror', handlePointerLockError, { signal });
  document.addEventListener('mousemove', handleMouseMove, { signal });
  document.addEventListener('keydown', handleKeyDown, { signal });
  document.addEventListener('keyup', handleKeyUp, { signal });
  document.addEventListener('wheel', handleWheel, { signal, passive: true });

  canvasElement.addEventListener('mousedown', handleMouseDown, { signal });
  canvasElement.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  canvasElement.addEventListener('touchstart', handleCanvasTouchStart, { signal, passive: false });
  canvasElement.addEventListener('touchmove', handleCanvasTouchMove, { signal, passive: false });
  canvasElement.addEventListener('touchend', handleCanvasTouchEnd, { signal, passive: false });
  canvasElement.addEventListener('touchcancel', handleCanvasTouchEnd, { signal, passive: false });

  // Mengembalikan objek disposer untuk digunakan dengan keyword `using`
  return new InputDisposer(globalAbortController);
}

export function getInputSnapshot() {
  if (isMiningHeld) InputState.clicks.left = true;
  if (isPlacingHeld) InputState.clicks.right = true;

  const snapshot = structuredClone(InputState);
  
  // Consume (reset) impuls satu frame
  InputState.dx = 0;
  InputState.dy = 0;
  InputState.scroll = 0;
  InputState.clicks.left = false;
  InputState.clicks.right = false;

  return snapshot;
}
