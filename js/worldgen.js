import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, BLOCK } from './constants.js';

// --- 1. PRNG & Noise Implementation ---

// Mulberry32 PRNG
export function seedRandom(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Perlin Permutation Table
const P = new Uint8Array(512);

export function initNoise(seed) {
  const rng = seedRandom(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = p[i];
    p[i] = p[j];
    p[j] = temp;
  }
  for (let i = 0; i < 512; i++) {
    P[i] = p[i & 255];
  }
}

// Fade, Lerp, Grad
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t, a, b) {
  return a + t * (b - a);
}

function grad2(hash, x, y) {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
}

function grad3(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  let v;
  if (h < 4) v = y;
  else if (h === 12 || h === 14) v = x;
  else v = z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function noise2D(x, y) {
  let X = Math.floor(x) & 255;
  let Y = Math.floor(y) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  const u = fade(x);
  const v = fade(y);
  
  const A = P[X] + Y, B = P[X + 1] + Y;
  
  return lerp(v, 
    lerp(u, grad2(P[A], x, y), grad2(P[B], x - 1, y)),
    lerp(u, grad2(P[A + 1], x, y - 1), grad2(P[B + 1], x - 1, y - 1))
  );
}

export function noise3D(x, y, z) {
  let X = Math.floor(x) & 255;
  let Y = Math.floor(y) & 255;
  let Z = Math.floor(z) & 255;
  
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  
  const u = fade(x);
  const v = fade(y);
  const w = fade(z);
  
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
  const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  
  return lerp(w,
    lerp(v,
      lerp(u, grad3(P[AA], x, y, z), grad3(P[BA], x - 1, y, z)),
      lerp(u, grad3(P[AB], x, y - 1, z), grad3(P[BB], x - 1, y - 1, z))
    ),
    lerp(v,
      lerp(u, grad3(P[AA + 1], x, y, z - 1), grad3(P[BA + 1], x - 1, y, z - 1)),
      lerp(u, grad3(P[AB + 1], x, y - 1, z - 1), grad3(P[BB + 1], x - 1, y - 1, z - 1))
    )
  );
}

export function octaveNoise(x, z, octaves, persistence, lacunarity) {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  let maxValue = 0;
  
  for(let i = 0; i < octaves; i++) {
    total += noise2D(x * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / maxValue;
}


// --- 2. Terrain & Feature Generation ---

export function placeTrees(chunkData, cx, cz, seed) {
  // Jittered random menggunakan posisi absolut dan seed
  const rng = seedRandom(seed + cx * 31337 + cz * 42069);
  
  for (let x = 2; x < CHUNK_SIZE - 2; x++) {
    for (let z = 2; z < CHUNK_SIZE - 2; z++) {
      if (rng() < 0.02) { // Rata-rata 1 pohon setiap 50 tile rumput (approx ~7 block distance)
        let surfaceY = -1;
        // Cari blok teratas
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const idx = (y * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x;
          if (chunkData[idx] === BLOCK.GRASS) {
            surfaceY = y;
            break;
          } else if (chunkData[idx] !== BLOCK.AIR && chunkData[idx] !== BLOCK.LEAVES) {
            break;
          }
        }
        
        if (surfaceY > 0) {
          const trunkHeight = Math.floor(rng() * 3) + 4; // Tinggi batang 4-6
          
          // Generate Batang (Trunk)
          for (let ty = 0; ty < trunkHeight; ty++) {
            if (surfaceY + 1 + ty >= WORLD_HEIGHT) break;
            const trunkIdx = ((surfaceY + 1 + ty) * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x;
            chunkData[trunkIdx] = BLOCK.WOOD;
          }
          
          // Generate Daun (Canopy)
          const canopyY = surfaceY + trunkHeight;
          const radius = 2;
          for (let ly = -radius; ly <= radius; ly++) {
            for (let lz = -radius; lz <= radius; lz++) {
              for (let lx = -radius; lx <= radius; lx++) {
                // Spherical distance check
                if (lx * lx + ly * ly + lz * lz <= radius * radius + 1) {
                  const px = x + lx;
                  const py = canopyY + ly;
                  const pz = z + lz;
                  
                  if (px >= 0 && px < CHUNK_SIZE && pz >= 0 && pz < CHUNK_SIZE && py < WORLD_HEIGHT) {
                    const leafIdx = (py * CHUNK_SIZE * CHUNK_SIZE) + (pz * CHUNK_SIZE) + px;
                    // Hanya override udara
                    if (chunkData[leafIdx] === BLOCK.AIR) {
                      chunkData[leafIdx] = BLOCK.LEAVES;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

export function generateChunk(cx, cz, seed) {
  // P pastikan initialized minimal sekali per run. initNoise sangat cepat, tapi idealnya sekali.
  if (P[0] === 0 && P[1] === 0) {
    initNoise(seed);
  }
  
  // Menggunakan Flat TypedArray untuk memori konstan (65,536 bytes) dan performa cache yang baik
  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldX = cx * CHUNK_SIZE + x;
      const worldZ = cz * CHUNK_SIZE + z;
      
      // Hitung Base Height Map
      const heightNoise = octaveNoise(worldX * 0.01, worldZ * 0.01, 4, 0.5, 2.0);
      const heightOffset = Math.floor(heightNoise * 20);
      const surfaceY = SEA_LEVEL + heightOffset;
      
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const idx = (y * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x;
        
        if (y === 0) {
          data[idx] = BLOCK.BEDROCK;
        } else if (y >= 1 && y <= 3) {
          // Noise-based bedrock holes
          data[idx] = noise3D(worldX, y, worldZ) > 0 ? BLOCK.BEDROCK : BLOCK.STONE;
        } else if (y <= surfaceY) {
          // 3D Cave System di lapisan bawah batu
          if (y >= 5 && y <= 40) {
            const cave = noise3D(worldX * 0.05, y * 0.05, worldZ * 0.05);
            if (cave < -0.3) {
              data[idx] = BLOCK.AIR;
              continue;
            }
          }
          
          if (y === surfaceY) {
            // Pasir disekitar level air (pantai)
            if (y >= SEA_LEVEL - 2 && y <= SEA_LEVEL + 1) {
              data[idx] = BLOCK.SAND;
            } else if (y < SEA_LEVEL - 2) {
              // Dasar laut
              data[idx] = BLOCK.DIRT;
            } else {
              // Bukit dan dataran tinggi
              data[idx] = BLOCK.GRASS;
            }
          } else if (y >= surfaceY - 3) {
            data[idx] = BLOCK.DIRT;
          } else {
            data[idx] = BLOCK.STONE;
          }
        } else if (y <= SEA_LEVEL) {
          // Isi area di bawah sea level yang kosong dengan air
          data[idx] = BLOCK.WATER;
        } else {
          data[idx] = BLOCK.AIR; // Default buffer, tidak wajib karena Uint8Array initialize 0 (AIR)
        }
      }
    }
  }
  
  // Fitur di atas terrain (Pohon, dst)
  placeTrees(data, cx, cz, seed);
  
  return data;
}
