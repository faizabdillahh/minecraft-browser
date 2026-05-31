import { PLAYER, BLOCK, BLOCK_DEF } from './constants.js';
import { getBlock, setBlock } from './world.js';

export class Player {
  #pos;
  #velocity;
  #yaw;
  #pitch;
  #onGround;
  #inventory;
  #selectedSlot;
  #bobbingAmount;
  #bobbingTime;

  constructor(spawnX, spawnY, spawnZ) {
    this.#pos = { x: spawnX, y: spawnY, z: spawnZ };
    this.#velocity = { x: 0, y: 0, z: 0 };
    this.#yaw = 0;
    this.#pitch = 0;
    this.#onGround = false;
    this.#selectedSlot = 0;
    this.#bobbingAmount = 0;
    this.#bobbingTime = 0;

    // Hotbar inisialisasi awal (9 slot)
    this.#inventory = [
      { id: BLOCK.DIRT, count: 64 },
      { id: BLOCK.STONE, count: 64 },
      { id: BLOCK.WOOD, count: 64 },
      { id: BLOCK.LEAVES, count: 64 },
      { id: BLOCK.SAND, count: 64 },
      { id: BLOCK.GLASS, count: 64 },
      { id: BLOCK.WATER, count: 64 },
      { id: BLOCK.GRASS, count: 64 },
      { id: BLOCK.AIR, count: 0 }
    ];
  }

  update(dt, input, world) {
    if (!input.isLocked) return;

    // 1. Mouse Look
    const sensitivity = 0.002;
    this.#yaw += input.dx * sensitivity;
    this.#pitch += input.dy * sensitivity; // asumsikan dy positif saat mouse ke bawah, yang berarti pitch bertambah ke bawah

    // Wrapping yaw dan clamping pitch
    this.#yaw = this.#yaw % (Math.PI * 2);
    const maxPitch = Math.PI / 2 - 0.01;
    this.#pitch = Math.max(-maxPitch, Math.min(maxPitch, this.#pitch));

    // 2. Inventory Selection
    if (input.scroll !== 0) {
      this.#selectedSlot = (this.#selectedSlot + input.scroll) % 9;
      if (this.#selectedSlot < 0) this.#selectedSlot += 9;
    }
    for (let i = 1; i <= 9; i++) {
      if (input.keys.has(`digit${i}`)) {
        this.#selectedSlot = i - 1;
      }
    }

    // 3. Movement
    // Konvensi: yaw = 0 melihat ke -Z. 
    const forwardX = -Math.sin(this.#yaw);
    const forwardZ = -Math.cos(this.#yaw);
    const rightX = Math.cos(this.#yaw);
    const rightZ = -Math.sin(this.#yaw);

    let moveX = 0;
    let moveZ = 0;

    if (input.keys.has('keyw')) { moveX += forwardX; moveZ += forwardZ; }
    if (input.keys.has('keys')) { moveX -= forwardX; moveZ -= forwardZ; }
    if (input.keys.has('keya')) { moveX -= rightX; moveZ -= rightZ; }
    if (input.keys.has('keyd')) { moveX += rightX; moveZ += rightZ; }

    const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (length > 0) {
      moveX /= length;
      moveZ /= length;
    }

    const isSprinting = input.keys.has('controlleft') || input.keys.has('controlright');
    const speed = isSprinting ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED;

    this.#velocity.x = moveX * speed;
    this.#velocity.z = moveZ * speed;

    // 4. Head Bobbing
    if (length > 0 && this.#onGround) {
      this.#bobbingTime += dt * speed;
      this.#bobbingAmount = Math.sin(this.#bobbingTime * 2.0) * 0.05;
    } else {
      this.#bobbingAmount *= 0.9; // Smooth damping back to 0
    }

    // 5. Gravity & Jump
    this.#velocity.y += PLAYER.GRAVITY * dt;
    if (input.keys.has('space') && this.#onGround) {
      this.#velocity.y = PLAYER.JUMP_FORCE;
    }

    // 6. Euler Integration with AABB Collision
    this.#pos.x += this.#velocity.x * dt;
    if (this.#checkCollision(world)) {
      this.#pos.x -= this.#velocity.x * dt;
      this.#velocity.x = 0;
    }

    this.#pos.z += this.#velocity.z * dt;
    if (this.#checkCollision(world)) {
      this.#pos.z -= this.#velocity.z * dt;
      this.#velocity.z = 0;
    }

    this.#onGround = false;
    this.#pos.y += this.#velocity.y * dt;
    if (this.#checkCollision(world)) {
      this.#pos.y -= this.#velocity.y * dt;
      if (this.#velocity.y < 0) this.#onGround = true;
      this.#velocity.y = 0;
    }

    // 7. Raycasting untuk interaksi klik
    if (input.clicks.left) {
      this.mine(world);
    }
    if (input.clicks.right) {
      const blockId = this.#inventory[this.#selectedSlot].id;
      if (blockId !== BLOCK.AIR) {
        this.place(world, blockId);
      }
    }
  }

  getCamera() {
    return {
      pos: {
        x: this.#pos.x,
        y: this.#pos.y + PLAYER.EYE_OFFSET + this.#bobbingAmount,
        z: this.#pos.z
      },
      yaw: this.#yaw,
      pitch: this.#pitch
    };
  }

  get selectedBlock() { return this.#inventory[this.#selectedSlot].id; }
  get selectedSlot() { return this.#selectedSlot; }
  get inventory() { return this.#inventory; }

  #checkCollision(world) {
    const minX = Math.floor(this.#pos.x - 0.3);
    const maxX = Math.floor(this.#pos.x + 0.3);
    const minY = Math.floor(this.#pos.y);
    const maxY = Math.floor(this.#pos.y + PLAYER.HEIGHT);
    const minZ = Math.floor(this.#pos.z - 0.3);
    const maxZ = Math.floor(this.#pos.z + 0.3);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const id = getBlock(world, x, y, z);
          if (id !== BLOCK.AIR && BLOCK_DEF[id].solid) {
            return true;
          }
        }
      }
    }
    return false;
  }

  #raycast(world) {
    const cam = this.getCamera();
    // Vektor arah dari kamera
    const dx = -Math.sin(cam.yaw) * Math.cos(cam.pitch);
    const dy = -Math.sin(cam.pitch);
    const dz = -Math.cos(cam.yaw) * Math.cos(cam.pitch);

    let x = Math.floor(cam.pos.x);
    let y = Math.floor(cam.pos.y);
    let z = Math.floor(cam.pos.z);

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

    let tMaxX = stepX > 0 ? (x + 1 - cam.pos.x) * tDeltaX : (cam.pos.x - x) * tDeltaX;
    let tMaxY = stepY > 0 ? (y + 1 - cam.pos.y) * tDeltaY : (cam.pos.y - y) * tDeltaY;
    let tMaxZ = stepZ > 0 ? (z + 1 - cam.pos.z) * tDeltaZ : (cam.pos.z - z) * tDeltaZ;

    let face = { x: 0, y: 0, z: 0 };
    let radius = PLAYER.REACH * 3; // iterasi maksimum grid voxel

    while (radius-- > 0) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          tMaxX += tDeltaX;
          face = { x: -stepX, y: 0, z: 0 };
        } else {
          z += stepZ;
          tMaxZ += tDeltaZ;
          face = { x: 0, y: 0, z: -stepZ };
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          tMaxY += tDeltaY;
          face = { x: 0, y: -stepY, z: 0 };
        } else {
          z += stepZ;
          tMaxZ += tDeltaZ;
          face = { x: 0, y: 0, z: -stepZ };
        }
      }

      if (y < 0 || y > 255) break;

      const blockId = getBlock(world, x, y, z);
      if (blockId !== BLOCK.AIR && blockId !== BLOCK.WATER) {
        return { hit: true, x, y, z, face, blockId };
      }
    }
    return { hit: false };
  }

  mine(world) {
    const ray = this.#raycast(world);
    if (ray.hit && ray.blockId !== BLOCK.BEDROCK) {
      setBlock(world, ray.x, ray.y, ray.z, BLOCK.AIR);
      return ray.blockId;
    }
    return null;
  }

  place(world, blockId) {
    const ray = this.#raycast(world);
    if (ray.hit) {
      const px = ray.x + ray.face.x;
      const py = ray.y + ray.face.y;
      const pz = ray.z + ray.face.z;

      // Anti-clipping: Cegah blok diletakkan di dalam pemain
      const minX = Math.floor(this.#pos.x - 0.3);
      const maxX = Math.floor(this.#pos.x + 0.3);
      const minY = Math.floor(this.#pos.y);
      const maxY = Math.floor(this.#pos.y + PLAYER.HEIGHT);
      const minZ = Math.floor(this.#pos.z - 0.3);
      const maxZ = Math.floor(this.#pos.z + 0.3);

      if (px >= minX && px <= maxX && py >= minY && py <= maxY && pz >= minZ && pz <= maxZ) {
        return false;
      }

      setBlock(world, px, py, pz, blockId);
      return true;
    }
    return false;
  }
}
