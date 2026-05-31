import { CHUNK_SIZE, BLOCK, BLOCK_DEF, COLORS } from './constants.js';

export class HUD {
  #elements = {};
  #lastSelectedSlot = -1;
  #lastBlockIds = new Array(9).fill(-1);
  #lastHp = -1;

  constructor() {
    this.#elements.overlay = document.getElementById('hud-overlay');
    this.#elements.hotbar = document.getElementById('inventory-bar');
    this.#elements.debugMenu = document.getElementById('debug-menu');
    this.#elements.debugFps = document.getElementById('debug-fps');
    this.#elements.debugXyz = document.getElementById('debug-xyz');
    this.#elements.debugChunk = document.getElementById('debug-chunk');
    this.#elements.debugFacing = document.getElementById('debug-facing');
    
    // Inject Health Bar dinamis
    this.#elements.healthBar = document.createElement('div');
    this.#elements.healthBar.id = 'health-bar';
    for (let i = 0; i < 10; i++) {
      const heart = document.createElement('div');
      heart.className = 'heart';
      this.#elements.healthBar.appendChild(heart);
    }
    this.#elements.overlay.appendChild(this.#elements.healthBar);
    
    // Inject Block Label dinamis
    this.#elements.blockLabel = document.createElement('div');
    this.#elements.blockLabel.id = 'hotbar-label';
    this.#elements.overlay.appendChild(this.#elements.blockLabel);
    
    // Inject Flash Damage Overlay
    this.#elements.damageOverlay = document.createElement('div');
    this.#elements.damageOverlay.style.cssText = `
      position: absolute; inset: 0; background: rgba(255, 0, 0, 0.4);
      opacity: 0; pointer-events: none; transition: opacity 0.15s ease-out; z-index: 50;
    `;
    this.#elements.overlay.appendChild(this.#elements.damageOverlay);
    
    // Init 9 Slots via template
    const template = document.getElementById('hud-template');
    this.#elements.slots = [];
    for (let i = 0; i < 9; i++) {
      const clone = template.content.cloneNode(true);
      const slot = clone.querySelector('.hotbar-slot');
      slot.querySelector('.slot-number').textContent = i + 1;
      
      const iconContainer = slot.querySelector('.block-icon');
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      canvas.style.width = '24px'; // upscale via css
      canvas.style.height = '24px';
      iconContainer.appendChild(canvas);
      
      this.#elements.slots.push({
        element: slot,
        ctx: canvas.getContext('2d', { alpha: true }),
        countBadge: slot.querySelector('.slot-number') // reuse slot-number for aesthetics
      });
      this.#elements.hotbar.appendChild(slot);
    }
  }

  #drawBlockIcon(ctx, blockId) {
    ctx.clearRect(0, 0, 16, 16);
    if (blockId === BLOCK.AIR) return;
    
    const def = BLOCK_DEF[blockId];
    // Map texture to color constant
    let colorKey = def.texture.toUpperCase();
    if (blockId === BLOCK.GRASS) colorKey = 'GRASS_TOP';
    
    const hexColor = COLORS[colorKey] || '#FFFFFF';
    
    ctx.fillStyle = hexColor;
    ctx.fillRect(2, 4, 12, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(2, 2, 12, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(10, 4, 4, 10);
  }

  update(player, fps, debugMode) {
    // 1. Update Health Bar
    const hp = player.health ?? 20; 
    if (hp !== this.#lastHp) {
      const hearts = this.#elements.healthBar.children;
      for (let i = 0; i < 10; i++) {
        const heartVal = hp - (i * 2);
        hearts[i].className = 'heart';
        if (heartVal <= 0) hearts[i].classList.add('empty');
        else if (heartVal === 1) hearts[i].classList.add('half');
      }
      this.#lastHp = hp;
    }

    // 2. Update Hotbar Selection & Data
    const selected = player.selectedSlot;
    if (selected !== this.#lastSelectedSlot) {
      if (this.#lastSelectedSlot >= 0) {
        this.#elements.slots[this.#lastSelectedSlot].element.classList.remove('active');
      }
      this.#elements.slots[selected].element.classList.add('active');
      
      const blockId = player.inventory[selected].id;
      if (blockId !== BLOCK.AIR) {
        this.showBlockLabel(BLOCK_DEF[blockId].name.toUpperCase());
      }
      this.#lastSelectedSlot = selected;
    }
    
    for (let i = 0; i < 9; i++) {
      const item = player.inventory[i];
      if (this.#lastBlockIds[i] !== item.id) {
        this.#drawBlockIcon(this.#elements.slots[i].ctx, item.id);
        this.#lastBlockIds[i] = item.id;
      }
      // Opsional: perbarui count jika slot punya count > 0
    }

    // 3. Debug Menu (via requestIdleCallback for non-blocking perf)
    if (debugMode) {
      this.#elements.debugMenu.style.visibility = 'visible';
      if (window.requestIdleCallback) {
        requestIdleCallback(() => this.#updateDebugInfo(player, fps));
      } else {
        this.#updateDebugInfo(player, fps);
      }
    } else {
      this.#elements.debugMenu.style.visibility = 'hidden';
    }
  }
  
  #updateDebugInfo(player, fps) {
    const cam = player.getCamera();
    const cx = Math.floor(cam.pos.x / CHUNK_SIZE);
    const cz = Math.floor(cam.pos.z / CHUNK_SIZE);
    
    this.#elements.debugFps.textContent = fps;
    this.#elements.debugXyz.textContent = `${cam.pos.x.toFixed(1)} / ${cam.pos.y.toFixed(1)} / ${cam.pos.z.toFixed(1)}`;
    this.#elements.debugChunk.textContent = `${cx}, ${cz}`;
    
    // Konversi rotasi yaw ke Arah Mata Angin
    let face = "North";
    const deg = (cam.yaw * 180 / Math.PI) % 360;
    const nDeg = deg < 0 ? deg + 360 : deg;
    if (nDeg >= 315 || nDeg < 45) face = "North (-Z)";
    else if (nDeg >= 45 && nDeg < 135) face = "East (+X)";
    else if (nDeg >= 135 && nDeg < 225) face = "South (+Z)";
    else face = "West (-X)";
    
    this.#elements.debugFacing.textContent = face;
  }

  showBlockLabel(blockName) {
    const label = this.#elements.blockLabel;
    label.textContent = blockName;
    label.classList.remove('show');
    void label.offsetWidth; // Force CSS reflow to restart animation
    label.classList.add('show');
  }

  showDamageEffect() {
    this.#elements.damageOverlay.style.opacity = '1';
    setTimeout(() => {
      this.#elements.damageOverlay.style.opacity = '0';
    }, 150);
  }
}
