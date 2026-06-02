import { CHUNK_SIZE, WORLD_HEIGHT, BLOCK, RENDER_DIST } from './constants.js';
import { generateChunk, initNoise } from './worldgen.js';

export class World {
  #chunks = new Map();     // key: "cx,cz" → Uint8Array
  #dirtyChunks = new Set(); // Melacak chunk mana yang diubah

  constructor(seed = Date.now()) {
    this.seed = seed;
    initNoise(this.seed);
  }

  getOrGenerateChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (this.#chunks.has(key)) {
      return this.#chunks.get(key);
    }
    
    const chunkData = generateChunk(cx, cz, this.seed);
    this.#chunks.set(key, chunkData);
    this.#dirtyChunks.add(key); // Tandai sebagai dirty untuk renderer pass pertama kali
    
    return chunkData;
  }

  isChunkLoaded(cx, cz) {
    return this.#chunks.has(`${cx},${cz}`);
  }

  loadChunksAround(playerX, playerZ, radius = RENDER_DIST) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        // Lingkaran loading sederhana: x*x + z*z <= radius*radius
        // Tetap kita muat kotak karena memori ringan
        this.getOrGenerateChunk(pcx + x, pcz + z);
      }
    }
  }

  unloadDistantChunks(playerX, playerZ, radius = RENDER_DIST) {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const maxDist = radius + 2; // Buffer jarak ekstra sebelum unload
    
    for (const key of this.#chunks.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > maxDist || Math.abs(cz - pcz) > maxDist) {
        this.#chunks.delete(key);
        this.#dirtyChunks.delete(key);
        // Map delete otomatis dibersihkan oleh Garbage Collector karena tipe datanya unreferenced
      }
    }
  }

  getBlock(x, y, z) {
    // Clamp y untuk mencegah memory out of bound
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.#chunks.get(`${cx},${cz}`);
    
    if (!chunk) return BLOCK.AIR; // Jika blok di-query tapi chunk belum termuat
    
    // Modulo positif untuk array index
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    const idx = (y * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx;
    return chunk[idx];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    
    let chunk = this.#chunks.get(key);
    // Jika tidak load, kita bisa pilih ignore atau auto-generate. Ignore lebih aman untuk setBlock.
    if (!chunk) return;

    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    const idx = (y * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx;
    chunk[idx] = id;
    
    this.#dirtyChunks.add(key);
    
    // Perbarui chunk tetangga jika blok berada di perbatasan chunk
    if (lx === 0) this.#dirtyChunks.add(`${cx - 1},${cz}`);
    if (lx === CHUNK_SIZE - 1) this.#dirtyChunks.add(`${cx + 1},${cz}`);
    if (lz === 0) this.#dirtyChunks.add(`${cx},${cz - 1}`);
    if (lz === CHUNK_SIZE - 1) this.#dirtyChunks.add(`${cx},${cz + 1}`);
  }

  // Algoritma 3D DDA (Amanatides & Woo) untuk mendeteksi hit pada raycast target (misal screen center)
  raycast(origin, direction, maxDist, targetSolid = true) {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : (origin.x - x) * tDeltaX;
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : (origin.y - y) * tDeltaY;
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : (origin.z - z) * tDeltaZ;

    let face = [0, 0, 0];
    let radius = Math.ceil(maxDist);

    while (radius-- > 0) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          tMaxX += tDeltaX;
          face = [-stepX, 0, 0];
        } else {
          z += stepZ;
          tMaxZ += tDeltaZ;
          face = [0, 0, -stepZ];
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          tMaxY += tDeltaY;
          face = [0, -stepY, 0];
        } else {
          z += stepZ;
          tMaxZ += tDeltaZ;
          face = [0, 0, -stepZ];
        }
      }

      if (y < 0 || y >= WORLD_HEIGHT) break;

      const blockId = this.getBlock(x, y, z);
      if (blockId !== BLOCK.AIR) {
        if (!targetSolid && blockId === BLOCK.WATER) continue; 
        if (blockId === BLOCK.WATER) continue; // Skip air untuk click interaction secara default
        return { hit: true, pos: [x, y, z], face, blockId };
      }
    }
    return null;
  }

  // ES2026 Iterator: Kembalikan block sebagai custom Generator object
  // Sangat optimal karena memanfaatkan lazy evaluation
  *blocksInAABB(minX, minY, minZ, maxX, maxY, maxZ) {
    for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
        for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
          const id = this.getBlock(x, y, z);
          yield { x, y, z, id };
        }
      }
    }
  }

  // Method yang bisa digunakan oleh renderer untuk sinkronisasi dirty state
  getAndClearDirtyChunks() {
    const dirty = new Set(this.#dirtyChunks);
    this.#dirtyChunks.clear();
    return dirty;
  }
}

// -------------------------------------------------------------
// HELPER FUNCTIONS (Di-export untuk memenuhi legacy api contract Player.js)
// -------------------------------------------------------------

export function getBlock(world, x, y, z) {
  return world.getBlock(x, y, z);
}

export function setBlock(world, x, y, z, id) {
  world.setBlock(x, y, z, id);
}

export function createWorld(seed) {
  return new World(seed);
}
