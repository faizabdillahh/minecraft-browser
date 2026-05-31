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
    
    this.health = 20;
    this.tookDamage = false;
    this.highestY = spawnY;
    this.isFlying = false;
    this.lastSpacePress = 0;
    this.spaceWasPressed = false;
    this.isSneaking = false;

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

    this.isSneaking = input.keys.has('shiftleft') || input.keys.has('shiftright');
    const isSprinting = input.keys.has('controlleft') || input.keys.has('controlright');
    
    let speed = PLAYER.WALK_SPEED;
    if (this.isFlying) speed = PLAYER.SPRINT_SPEED * 2.5;
    else if (isSprinting) speed = PLAYER.SPRINT_SPEED;
    else if (this.isSneaking) speed = PLAYER.WALK_SPEED * 0.3;

    this.#velocity.x = moveX * speed;
    this.#velocity.z = moveZ * speed;

    // 4. Head Bobbing
    if (length > 0 && this.#onGround && !this.isFlying) {
      this.#bobbingTime += dt * speed;
      this.#bobbingAmount = Math.sin(this.#bobbingTime * 2.0) * 0.05;
    } else {
      this.#bobbingAmount *= 0.9;
    }

    // 5. Physics: Flying, Swimming, Gravity
    const headBlock = getBlock(world, Math.floor(this.#pos.x), Math.floor(this.#pos.y + PLAYER.EYE_OFFSET), Math.floor(this.#pos.z));
    const feetBlock = getBlock(world, Math.floor(this.#pos.x), Math.floor(this.#pos.y), Math.floor(this.#pos.z));
    const inWater = headBlock === BLOCK.WATER || feetBlock === BLOCK.WATER;

    // Double-tap Space for Flying (Creative toggle)
    if (input.keys.has('space')) {
      if (!this.spaceWasPressed) {
        const now = performance.now();
        if (now - this.lastSpacePress < 300) {
          this.isFlying = !this.isFlying;
        }
        this.lastSpacePress = now;
      }
      this.spaceWasPressed = true;
    } else {
      this.spaceWasPressed = false;
    }

    if (this.isFlying) {
      this.#velocity.y = 0;
      if (input.keys.has('space')) this.#velocity.y = PLAYER.WALK_SPEED;
      if (this.isSneaking) this.#velocity.y = -PLAYER.WALK_SPEED;
      this.highestY = this.#pos.y; // Reset fall distance
    } else if (inWater) {
      this.#velocity.y -= PLAYER.GRAVITY * 0.2 * dt; // Lambat tenggelam
      if (this.#velocity.y < -2) this.#velocity.y = -2; // Terminal velocity di air
      if (input.keys.has('space')) this.#velocity.y = 3;
      this.highestY = this.#pos.y;
    } else {
      this.#velocity.y += PLAYER.GRAVITY * dt;
      if (input.keys.has('space') && this.#onGround) {
        this.#velocity.y = PLAYER.JUMP_FORCE;
      }
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
      if (this.#velocity.y < 0) {
        this.#onGround = true;
        
        // Cek Fall Damage
        const fallDist = this.highestY - this.#pos.y;
        if (fallDist >= 4.0 && !this.isFlying && !inWater) {
          const damage = Math.floor(fallDist - 3);
          this.health -= damage;
          if (this.health < 0) this.health = 0;
          this.tookDamage = true;
        }
        this.highestY = this.#pos.y;
      } else {
        this.highestY = this.#pos.y;
      }
      this.#velocity.y = 0;
    }

    // Update highestY untuk hitung fall damage
    if (this.#velocity.y > 0 && !this.#onGround) {
      if (this.#pos.y > this.highestY) this.highestY = this.#pos.y;
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
    const currentEyeOffset = this.isSneaking ? PLAYER.EYE_OFFSET - 0.25 : PLAYER.EYE_OFFSET;
    return {
      pos: {
        x: this.#pos.x,
        y: this.#pos.y + currentEyeOffset + this.#bobbingAmount,
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
      
      // Implementasi Block Drop mekanik ringan (langsung masuk inventory)
      let dropId = ray.blockId;
      if (dropId === BLOCK.GRASS) dropId = BLOCK.DIRT;
      if (dropId === BLOCK.LEAVES) dropId = BLOCK.AIR; // Untuk membatasi inventory, leaves lenyap
      
      if (dropId !== BLOCK.AIR) {
        const slot = this.#inventory.find(item => item.id === dropId);
        if (slot && slot.count < 64) slot.count++;
      }

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
