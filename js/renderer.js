import { RENDERER, COLORS, BLOCK } from './constants.js';
import { FACE } from './textures.js';

export class Renderer {
  #canvas;
  #ctx;
  #atlas;
  #imageData;
  #pixels;
  #zBuffer;
  #width;
  #height;

  constructor(canvas, atlas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d', { alpha: false });
    this.#atlas = atlas;
    this.#width = RENDERER.CANVAS_W;
    this.#height = RENDERER.CANVAS_H;
    
    this.#canvas.width = this.#width;
    this.#canvas.height = this.#height;
    
    this.#imageData = this.#ctx.createImageData(this.#width, this.#height);
    this.#pixels = new Uint32Array(this.#imageData.data.buffer);
    this.#zBuffer = new Float32Array(this.#width);
  }

  resize(width, height) {
    this.#width = width;
    this.#height = height;
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#imageData = this.#ctx.createImageData(width, height);
    this.#pixels = new Uint32Array(this.#imageData.data.buffer);
    this.#zBuffer = new Float32Array(width);
  }

  #parseHexColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  render(world, player, deltaTime) {
    const cam = player.getCamera();
    const w = this.#width;
    const h = this.#height;
    
    // 1. SKY RENDER (Gradient background)
    const topCol = this.#parseHexColor(COLORS.SKY_TOP);
    const horCol = this.#parseHexColor(COLORS.SKY_HORIZON);
    
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const r = topCol.r + t * (horCol.r - topCol.r);
      const g = topCol.g + t * (horCol.g - topCol.g);
      const b = topCol.b + t * (horCol.b - topCol.b);
      // Little-endian Uint32: A B G R
      const color = (255 << 24) | (b << 16) | (g << 8) | r;
      for (let x = 0; x < w; x++) {
        this.#pixels[y * w + x] = color;
      }
    }

    // 2. TERRAIN RAYCASTING (Column-based 2.5D DDA)
    const dirX = -Math.sin(cam.yaw);
    const dirZ = -Math.cos(cam.yaw);
    const fovScale = Math.tan((RENDERER.FOV * Math.PI / 180) / 2);
    const planeX = Math.cos(cam.yaw) * fovScale;
    const planeZ = -Math.sin(cam.yaw) * fovScale;
    
    // Pitch memiringkan kamera (Y-shearing pada layar)
    const pitchOffset = cam.pitch * h;
    const screenCenter = h / 2 + pitchOffset;

    for (let x = 0; x < w; x++) {
      const cameraX = 2 * x / w - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirZ = dirZ + planeZ * cameraX;
      
      let mapX = Math.floor(cam.pos.x);
      let mapZ = Math.floor(cam.pos.z);
      
      const deltaDistX = Math.abs(1 / rayDirX);
      const deltaDistZ = Math.abs(1 / rayDirZ);
      
      let stepX, stepZ, sideDistX, sideDistZ;
      
      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (cam.pos.x - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - cam.pos.x) * deltaDistX;
      }
      
      if (rayDirZ < 0) {
        stepZ = -1;
        sideDistZ = (cam.pos.z - mapZ) * deltaDistZ;
      } else {
        stepZ = 1;
        sideDistZ = (mapZ + 1.0 - cam.pos.z) * deltaDistZ;
      }
      
      let perpWallDist = 0;
      let side = 0;
      
      // y-buffer untuk oklusi pixel dalam satu kolom vertikal
      const yDrawn = new Uint8Array(h);
      let drawnCount = 0;
      
      // Rentang blok Y yang dirender (sekitar level mata pemain untuk performa)
      const scanStartY = Math.floor(cam.pos.y) - 2;
      const scanEndY = Math.floor(cam.pos.y) + 3;
      
      // 2D DDA grid traversal
      while (drawnCount < h && perpWallDist < RENDERER.FAR) {
        if (sideDistX < sideDistZ) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistZ += deltaDistZ;
          mapZ += stepZ;
          side = 1;
        }
        
        if (side === 0) perpWallDist = (mapX - cam.pos.x + (1 - stepX) / 2) / rayDirX;
        else perpWallDist = (mapZ - cam.pos.z + (1 - stepZ) / 2) / rayDirZ;
        
        if (perpWallDist > RENDERER.FAR) break;
        if (perpWallDist < 0.01) continue; // Mencegah glitch jarak sangat dekat
        
        const heightOnScreen = h / perpWallDist;
        
        // Render blok dalam rentang vertikal di koordinat mapX, mapZ ini
        for (let y = scanEndY; y >= scanStartY; y--) {
          const blockId = world.getBlock(mapX, y, mapZ);
          
          if (blockId !== BLOCK.AIR) {
            // Proyeksikan batas atas dan bawah blok ke layar
            const blockBottomY = y;
            const blockTopY = y + 1;
            
            let screenBottom = screenCenter + (cam.pos.y - blockBottomY) * heightOnScreen;
            let screenTop = screenCenter + (cam.pos.y - blockTopY) * heightOnScreen;
            
            let drawTop = Math.floor(screenTop);
            let drawBottom = Math.floor(screenBottom);
            
            if (drawTop < 0) drawTop = 0;
            if (drawBottom >= h) drawBottom = h - 1;
            
            if (drawTop <= drawBottom) {
              // Kalkulasi posisi tekstur (X)
              let wallX;
              if (side === 0) wallX = cam.pos.z + perpWallDist * rayDirZ;
              else wallX = cam.pos.x + perpWallDist * rayDirX;
              wallX -= Math.floor(wallX);
              
              let texX = Math.floor(wallX * 16);
              if (side === 0 && rayDirX > 0) texX = 16 - texX - 1;
              if (side === 1 && rayDirZ < 0) texX = 16 - texX - 1;
              
              const face = side === 0 ? (stepX > 0 ? FACE.WEST : FACE.EAST) : (stepZ > 0 ? FACE.NORTH : FACE.SOUTH);
              const uv = this.#atlas.getUV(blockId, face);
              
              // Shadow mapping pseudo
              let shade = side === 1 ? 0.75 : 1.0;
              
              // Draw Vertical Strip (Pixel per Pixel)
              for (let py = drawTop; py <= drawBottom; py++) {
                if (!yDrawn[py]) {
                  // Y-coordinate texture calculation
                  const d = py - screenCenter + heightOnScreen * (y + 1 - cam.pos.y);
                  const texY = Math.floor((d * 16) / heightOnScreen);
                  const ty = Math.max(0, Math.min(15, texY));
                  
                  const texIdx = (ty * this.#atlas.imageData.width + uv.u + texX) * 4;
                  const tr = this.#atlas.imageData.data[texIdx] * shade;
                  const tg = this.#atlas.imageData.data[texIdx + 1] * shade;
                  const tb = this.#atlas.imageData.data[texIdx + 2] * shade;
                  const ta = this.#atlas.imageData.data[texIdx + 3];
                  
                  // Alpha test untuk transparansi daun/kaca
                  if (ta > 10) {
                    yDrawn[py] = 1;
                    drawnCount++;
                    // Fog blending (lerp ke horizon color)
                    const fogFactor = Math.min(1.0, perpWallDist / RENDERER.FAR);
                    const finalR = tr + fogFactor * (horCol.r - tr);
                    const finalG = tg + fogFactor * (horCol.g - tg);
                    const finalB = tb + fogFactor * (horCol.b - tb);
                    
                    this.#pixels[py * w + x] = (255 << 24) | (finalB << 16) | (finalG << 8) | finalR;
                  }
                }
              }
            }
          }
        }
      }
      this.#zBuffer[x] = perpWallDist;
    }

    // 3. WATER OVERLAY
    const headBlock = world.getBlock(Math.floor(cam.pos.x), Math.floor(cam.pos.y), Math.floor(cam.pos.z));
    if (headBlock === BLOCK.WATER) {
      for (let i = 0; i < this.#pixels.length; i++) {
        const c = this.#pixels[i];
        const r = c & 0xFF;
        const g = (c >> 8) & 0xFF;
        const b = (c >> 16) & 0xFF;
        // Blend blue tint
        const outR = r * 0.6 + 30 * 0.4;
        const outG = g * 0.6 + 80 * 0.4;
        const outB = b * 0.6 + 200 * 0.4;
        this.#pixels[i] = (255 << 24) | (outB << 16) | (outG << 8) | outR;
      }
    }

    // Eksekusi manipulasi raw pixel (Hanya 1x per frame)
    this.#ctx.putImageData(this.#imageData, 0, 0);

    // 4. BLOCK HIGHLIGHT
    const ray = player.raycast ? player.raycast(world) : world.raycast(cam.pos, {
      x: -Math.sin(cam.yaw) * Math.cos(cam.pitch),
      y: Math.sin(cam.pitch),
      z: -Math.cos(cam.yaw) * Math.cos(cam.pitch)
    }, 5);

    // Diimplementasikan secara sederhana sebagai center cross dot highlight via canvas API
    // Pada pendekatan raycaster 2.5D, overlay crosshair/wireframe sulit diproyeksi sempurna
    // Jadi cukup HUD crosshair standar (via hud.js) ditambah indikator hit di tengah.
    if (ray && ray.hit) {
      this.#ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      this.#ctx.fillRect(w/2 - 2, h/2 - 2, 4, 4);
    }
  }
}
