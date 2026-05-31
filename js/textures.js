import { BLOCK } from './constants.js';

export const FACE = Object.freeze({ 
  TOP: 0, 
  BOTTOM: 1, 
  NORTH: 2, 
  SOUTH: 3, 
  EAST: 4, 
  WEST: 5 
});

// Seedable PRNG khusus untuk texturing deterministik
function seedRandom(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export async function buildTextureAtlas() {
  const TEX_SIZE = 16;
  const numTextures = 11;
  const canvas = new OffscreenCanvas(numTextures * TEX_SIZE, TEX_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  const drawPixel = (tx, ty, texIdx, hexColor) => {
    ctx.fillStyle = hexColor;
    ctx.fillRect(texIdx * TEX_SIZE + tx, ty, 1, 1);
  };

  const drawRect = (tx, ty, tw, th, texIdx, hexColor) => {
    ctx.fillStyle = hexColor;
    ctx.fillRect(texIdx * TEX_SIZE + tx, ty, tw, th);
  };

  const drawNoise = (texIdx, baseHex, noiseColors, count, seed) => {
    drawRect(0, 0, TEX_SIZE, TEX_SIZE, texIdx, baseHex);
    const rng = seedRandom(seed);
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rng() * TEX_SIZE);
      const y = Math.floor(rng() * TEX_SIZE);
      const color = noiseColors[Math.floor(rng() * noiseColors.length)];
      drawPixel(x, y, texIdx, color);
    }
  };

  // Indeks slot di atlas (1 slot = 16x16 px)
  const T_GRASS_TOP = 0;
  const T_GRASS_SIDE = 1;
  const T_DIRT = 2;
  const T_STONE = 3;
  const T_BEDROCK = 4;
  const T_SAND = 5;
  const T_WOOD_SIDE = 6;
  const T_WOOD_TOP = 7;
  const T_LEAVES = 8;
  const T_WATER = 9;
  const T_GLASS = 10;

  // 1. GRASS top
  drawNoise(T_GRASS_TOP, '#5D9E3F', ['#7BC950', '#4A7F32'], 64, 101);
  
  // 2. GRASS side
  drawNoise(T_GRASS_SIDE, '#8B6914', ['#6B4423', '#4A2F18'], 40, 102);
  drawRect(0, 0, TEX_SIZE, 4, T_GRASS_SIDE, '#5D9E3F'); // Top layer green
  
  // 3. DIRT
  drawNoise(T_DIRT, '#6B4423', ['#8B6914', '#4A2F18'], 80, 103);
  
  // 4. STONE
  drawNoise(T_STONE, '#808080', ['#606060', '#9A9A9A'], 100, 104);
  
  // 5. BEDROCK
  drawNoise(T_BEDROCK, '#404040', ['#202020', '#101010', '#606060'], 150, 105);
  
  // 6. SAND
  drawNoise(T_SAND, '#E8C975', ['#D4B85A', '#F0D490'], 50, 106);
  
  // 7. WOOD side
  drawRect(0, 0, TEX_SIZE, TEX_SIZE, T_WOOD_SIDE, '#5C3A1E');
  const rngWood = seedRandom(107);
  for (let x = 0; x < TEX_SIZE; x++) {
    if (rngWood() < 0.3) drawRect(x, 0, 1, TEX_SIZE, T_WOOD_SIDE, '#4A2E15');
  }
  
  // 8. WOOD top
  drawRect(0, 0, TEX_SIZE, TEX_SIZE, T_WOOD_TOP, '#5C3A1E');
  drawRect(4, 4, 8, 8, T_WOOD_TOP, '#4A2E15');
  drawRect(6, 6, 4, 4, T_WOOD_TOP, '#3D2410');
  
  // 9. LEAVES
  drawNoise(T_LEAVES, '#2D6A2D', ['#1E4D1E', '#3D8A3D'], 120, 108);
  const rngLeaves = seedRandom(109);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rngLeaves() * TEX_SIZE);
    const y = Math.floor(rngLeaves() * TEX_SIZE);
    ctx.clearRect(T_LEAVES * TEX_SIZE + x, y, 1, 1); // Transparent pixels
  }
  
  // 10. WATER
  drawRect(0, 0, TEX_SIZE, TEX_SIZE, T_WATER, '#3B6FE8');
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      if (Math.sin((x + y) * 0.5) > 0.5) drawPixel(x, y, T_WATER, '#2A5ED4');
    }
  }
  
  // 11. GLASS
  drawRect(0, 0, TEX_SIZE, TEX_SIZE, T_GLASS, 'rgba(255,255,255,0.1)');
  drawRect(0, 0, TEX_SIZE, 1, T_GLASS, 'rgba(255,255,255,0.8)');
  drawRect(0, 0, 1, TEX_SIZE, T_GLASS, 'rgba(255,255,255,0.8)');
  drawRect(TEX_SIZE-1, 0, 1, TEX_SIZE, T_GLASS, 'rgba(255,255,255,0.8)');
  drawRect(0, TEX_SIZE-1, TEX_SIZE, 1, T_GLASS, 'rgba(255,255,255,0.8)');
  drawRect(2, 2, 4, 2, T_GLASS, 'rgba(255,255,255,0.4)');

  const getUV = (blockId, face) => {
    let texIdx = T_DIRT;
    switch (blockId) {
      case BLOCK.GRASS:
        if (face === FACE.TOP) texIdx = T_GRASS_TOP;
        else if (face === FACE.BOTTOM) texIdx = T_DIRT;
        else texIdx = T_GRASS_SIDE;
        break;
      case BLOCK.DIRT: texIdx = T_DIRT; break;
      case BLOCK.STONE: texIdx = T_STONE; break;
      case BLOCK.BEDROCK: texIdx = T_BEDROCK; break;
      case BLOCK.SAND: texIdx = T_SAND; break;
      case BLOCK.WOOD:
        if (face === FACE.TOP || face === FACE.BOTTOM) texIdx = T_WOOD_TOP;
        else texIdx = T_WOOD_SIDE;
        break;
      case BLOCK.LEAVES: texIdx = T_LEAVES; break;
      case BLOCK.WATER: texIdx = T_WATER; break;
      case BLOCK.GLASS: texIdx = T_GLASS; break;
    }
    return { u: texIdx * TEX_SIZE, v: 0, texIdx };
  };

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return {
    canvas,
    ctx,
    getUV,
    imageData
  };
}
