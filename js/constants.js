export const CHUNK_SIZE   = 16;
export const WORLD_HEIGHT = 256;
export const SEA_LEVEL    = 64;
export const RENDER_DIST  = 4; // chunk radius

// Block IDs menggunakan const enum pattern
export const BLOCK = Object.freeze({
  AIR:     0,
  GRASS:   1,
  DIRT:    2,
  STONE:   3,
  BEDROCK: 4,
  SAND:    5,
  WOOD:    6,
  LEAVES:  7,
  WATER:   8,
  GLASS:   9,
});

// Block properties lookup table
export const BLOCK_DEF = Object.freeze([
  /* 0 AIR     */ { name: 'air',     solid: false, transparent: true,  texture: 'air'     },
  /* 1 GRASS   */ { name: 'grass',   solid: true,  transparent: false, texture: 'grass'   },
  /* 2 DIRT    */ { name: 'dirt',    solid: true,  transparent: false, texture: 'dirt'    },
  /* 3 STONE   */ { name: 'stone',   solid: true,  transparent: false, texture: 'stone'   },
  /* 4 BEDROCK */ { name: 'bedrock', solid: true,  transparent: false, texture: 'bedrock' },
  /* 5 SAND    */ { name: 'sand',    solid: true,  transparent: false, texture: 'sand'    },
  /* 6 WOOD    */ { name: 'wood',    solid: true,  transparent: false, texture: 'wood'    },
  /* 7 LEAVES  */ { name: 'leaves',  solid: true,  transparent: true,  texture: 'leaves'  },
  /* 8 WATER   */ { name: 'water',   solid: false, transparent: true,  texture: 'water'   },
  /* 9 GLASS   */ { name: 'glass',   solid: true,  transparent: true,  texture: 'glass'   },
]);

// Player physics & dimensions
export const PLAYER = Object.freeze({
  HEIGHT:       1.8,
  EYE_OFFSET:   1.62,
  WALK_SPEED:   4.3,
  SPRINT_SPEED: 5.6,
  JUMP_FORCE:   8.0,
  GRAVITY:     -25.0,
  REACH:        5.0,
});

// Renderer configuration
export const RENDERER = Object.freeze({
  FOV:          70,
  NEAR:         0.01,
  FAR:          128,
  CANVAS_W:     800,
  CANVAS_H:     500,
});

// Colors mapping (Minecraft-accurate hex)
export const COLORS = Object.freeze({
  SKY_TOP:      '#1A6BA0',
  SKY_HORIZON:  '#87CEEB',
  FOG_COLOR:    '#C4D9E8',
  SUN_COLOR:    '#FFFACD',
  GRASS_TOP:    '#5D9E3F',
  GRASS_SIDE:   '#8B6914',
  DIRT:         '#6B4423',
  STONE:        '#808080',
  SAND:         '#E8C975',
  WOOD:         '#5C3A1E',
  LEAVES:       '#2D6A2D',
  WATER:        '#3B6FE8',
  BEDROCK:      '#404040',
  GLASS:        '#FFFFFF',
});
