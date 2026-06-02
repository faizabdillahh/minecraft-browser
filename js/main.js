import { RENDER_DIST, WORLD_HEIGHT, BLOCK } from './constants.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Renderer } from './renderer.js';
import { buildTextureAtlas } from './textures.js';
import { initInput, getInputSnapshot, InputState } from './input.js';
import { HUD } from './hud.js';
import { AudioManager } from './audio.js';

let world, player, renderer, hud, audio, inputDisposer;
let debugMode = false;
let isAudioInitialized = false;
let wasInWater = false;
let lastCamPos = { x: 0, z: 0 };

async function init() {
  const loadingScreen = document.getElementById('loading-screen');
  const canvas = document.getElementById('game-canvas');
  
  try {
    // 1. Setup deterministic seed dari URL Hash untuk world sharing
    const hashSeed = parseInt(location.hash.slice(1));
    const seed = isNaN(hashSeed) ? (Math.random() * 2**32 | 0) : hashSeed;
    location.hash = String(seed);
    
    // 2. Build Programmatic Texture Atlas (Top-Level Await ES2026 pattern support)
    const atlas = await buildTextureAtlas();
    
    // 3. Create Procedural World
    world = new World(seed);
    
    // 4. Create Player & temukan blok solid teratas sebagai titik Drop Spawn
    world.getOrGenerateChunk(0, 0); 
    let spawnY = WORLD_HEIGHT - 1;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (world.getBlock(8, y, 8) !== BLOCK.AIR) {
        spawnY = y + 1;
        break;
      }
    }
    player = new Player(8.5, spawnY, 8.5);
    player.health = 20; // Default Health stat
    
    // 5. Inisialisasi Renderer, HUD, dan Audio Engine
    renderer = new Renderer(canvas, atlas);
    renderer.setAtlasFunctions(atlas);
    hud = new HUD();
    audio = new AudioManager();
    
    // Monkey-patching Player untuk hook event Audio tanpa merusak enkapsulasi class
    const oldMine = player.mine.bind(player);
    player.mine = (w) => {
      const id = oldMine(w);
      if (id) audio.playBlockBreak(id);
      return id;
    };
    const oldPlace = player.place.bind(player);
    player.place = (w, id) => {
      const success = oldPlace(w, id);
      if (success) audio.playBlockPlace(id);
      return success;
    };

    // 6. Bind Input via Disposer
    inputDisposer = initInput(canvas);
    
    // Global Event Listeners
    document.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        debugMode = !debugMode;
        if (debugMode) document.documentElement.classList.add('debug-active');
        else document.documentElement.classList.remove('debug-active');
      }
    });

    window.addEventListener('resize', () => {
      // Scale canvas CSS di-handle di layout.css. Kita bisa maintain resolusi fix.
    });

    // 7. Splash / Pointer Lock Overlay Click Handler
    const clickToPlay = document.getElementById('click-to-play');
    clickToPlay.addEventListener('click', () => {
      // Harus ditaruh di dalam user gesture scope
      if (!isAudioInitialized) {
        audio.init();
        audio.playAmbient();
        isAudioInitialized = true;
      }
      // Mulai pointer lock
      canvas.requestPointerLock({ unadjustedMovement: true }).catch(err => {
        canvas.requestPointerLock().catch(console.error);
      });
    });

    // 8. Sembunyikan loading screen dan mulai render loop
    loadingScreen.classList.add('hidden');
    lastCamPos = player.getCamera().pos;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    // [Pattern Explicit Resource Management ES2026] 
    // Mendemonstrasikan kapabilitas await using block untuk cleanup
    const audioResourceWrapper = {
      [Symbol.asyncDispose]: async () => {
        if (audio.context) await audio.context.close();
      }
    };
    // Implementasi runtime sesungguhnya tetap membiarkan context terbuka saat game jalan

  } catch (err) {
    console.error("Gagal melakukan inisiasi engine:", err);
    if (loadingScreen) {
      loadingScreen.innerHTML = `<p style="color:red; font-family:monospace;">Gagal memuat permainan:<br/>${err.message}</p>`;
    }
  }
}

let lastTime = 0;
let dayTime = 6000; // Mulai dari Noon (Minecraft scale: 24000 ticks = 20 mins)

function gameLoop(timestamp) {
  // Cap delta time maksimum 50ms agar game tidak break jika tab ditinggalkan
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  // Update Waktu Dunia
  dayTime += dt * 20; 
  if (dayTime > 24000) dayTime -= 24000;
  const timeProgress = dayTime / 24000;

  const input = getInputSnapshot();
  
  // Update Fisika Pemain
  player.update(dt, input, world);
  
  // Cek Kematian Pemain
  if (player.health <= 0) {
    player.respawn(world);
    hud.showBlockLabel("ANDA MATI! RESPAWN...");
  }
  
  // Cek Interaksi Hit / Fall Damage
  if (player.tookDamage) {
    hud.showDamageEffect();
    audio.playPlayerHurt();
    player.tookDamage = false;
  }
  
  // Audio Procedural Triggers (Movement & Env)
  const camPos = player.getCamera().pos;
  const speed = Math.sqrt((camPos.x - lastCamPos.x)**2 + (camPos.z - lastCamPos.z)**2) / dt;
  
  if (speed > 1.5 && InputState.isLocked) { // Player is walking on ground
    const blockBelow = world.getBlock(Math.floor(camPos.x), Math.floor(camPos.y - 2.0), Math.floor(camPos.z));
    if (blockBelow !== BLOCK.AIR && blockBelow !== BLOCK.WATER) {
      audio.playFootstep(blockBelow);
    }
  }
  
  const headBlock = world.getBlock(Math.floor(camPos.x), Math.floor(camPos.y), Math.floor(camPos.z));
  if (headBlock === BLOCK.WATER && !wasInWater) {
    audio.playPlayerSplash();
    wasInWater = true;
  } else if (headBlock !== BLOCK.WATER) {
    wasInWater = false;
  }
  lastCamPos = camPos;

  // Streaming World Load & Unload berdasarkan radius (ESM Iterator optimasi ada di World class)
  world.loadChunksAround(camPos.x, camPos.z, RENDER_DIST);
  
  // Render Grafis dan UI HUD
  renderer.render(world, player, dt, timeProgress);
  hud.update(player, Math.round(1/dt), debugMode);

  requestAnimationFrame(gameLoop);
}

// Bootstrapper menggunakan Top-Level Await native ESM
await init();
