# API Contract & Module Interfaces

Dokumen ini mendefinisikan kontrak interface, spesifikasi tipe data, dan dependensi antar modul untuk memastikan proyek tetap modular, mudah di-_maintain_, serta mencegah _circular dependencies_.

---

## Aturan Dependensi (Dependency Graph)
Untuk mencegah _circular imports_, modul diurutkan secara hierarkis. Modul hanya boleh mengimpor modul yang berada di tingkat bawah atau sejajar (jika tidak menyebabkan dependensi bolak-balik):

1. **Level 0 (Tanpa dependensi):** `constants.js`
2. **Level 1:** `input.js`, `audio.js`, `textures.js`, `worldgen.js`
3. **Level 2:** `world.js` (butuh `worldgen`), `hud.js`
4. **Level 3:** `player.js` (butuh `input`)
5. **Level 4:** `renderer.js` (butuh `textures`)
6. **Level 5 (Entry):** `main.js` (menggabungkan semua)

---

## Tipe Data Utama (JSDoc/TypeScript-like)

```typescript
type BlockId = number; // 0-255 (0 = Air)

type Vector3 = { x: number, y: number, z: number };

type RayResult = {
  hit: boolean;
  x: number; y: number; z: number; // Koordinat blok yang terpukul
  side: number;                    // Sisi blok yang terpukul (0-5)
  distance: number;
};

type Chunk = {
  cx: number;
  cz: number;
  data: Uint8Array; // Size: 16 * 256 * 16 (65536 bytes)
  isDirty: boolean; // Flag untuk render optimization jika ada
};

type WorldState = {
  seed: number;
  chunks: Map<string, Chunk>;
};

type PlayerState = {
  pos: Vector3;
  velocity: Vector3;
  pitch: number;    // Rotasi vertikal (kamera)
  yaw: number;      // Rotasi horizontal (arah pandang)
  onGround: boolean;
  selectedBlock: BlockId;
};
```

---

## 1. constants.js
### Exports
- `CHUNK_WIDTH`: 16
- `CHUNK_HEIGHT`: 256
- `CHUNK_DEPTH`: 16
- `BLOCKS`: Object mapping (misal `BLOCKS.AIR = 0`, `BLOCKS.DIRT = 1`)
- `RENDER_DISTANCE`: number (dalam radius chunk)
- `GRAVITY`: number
- `CANVAS_WIDTH` / `CANVAS_HEIGHT`: Resolusi internal raycaster
### Imports
- _(Tidak ada)_

---

## 2. input.js
### Exports
- `initInput(canvasElement: HTMLCanvasElement): void`
- `getKeys(): Set<string>`
- `getMouseDelta(): { dx: number, dy: number }`
- `getMouseClicks(): { left: boolean, right: boolean }`
- `consumeClicks(): void`
- `isPointerLocked(): boolean`
### Imports
- `constants.js`

---

## 3. textures.js
### Exports
- `initTextures(): Promise<void>` (memuat aset atau membuat warna di memori)
- `getBlockColor(blockId: BlockId, side: number): {r: number, g: number, b: number}`
### Imports
- `constants.js`

---

## 4. worldgen.js
### Exports
- `generateChunkData(cx: number, cz: number, seed: number): Uint8Array`
### Imports
- `constants.js`

---

## 5. world.js
### Exports
- `createWorld(seed: number): WorldState`
- `getChunkKey(cx: number, cz: number): string`
- `getBlock(world: WorldState, x: number, y: number, z: number): BlockId`
- `setBlock(world: WorldState, x: number, y: number, z: number, id: BlockId): void`
- `getChunk(world: WorldState, cx: number, cz: number): Chunk`
- `checkCollision(world: WorldState, box: {x, y, z, width, height, depth}): boolean`
### Imports
- `constants.js`
- `worldgen.js`

---

## 6. player.js
### Exports
- `createPlayer(spawnPos: Vector3): PlayerState`
- `updatePlayer(player: PlayerState, world: WorldState, dt: number): void`
- `castRay(player: PlayerState, world: WorldState, maxDist: number): RayResult`
### Imports
- `constants.js`
- `input.js`
- `world.js` (Hanya untuk keperluan raycasting murni dan physics collision logic dari luar)

---

## 7. renderer.js
### Exports
- `initRenderer(canvas: HTMLCanvasElement): CanvasRenderingContext2D`
- `renderFrame(ctx: CanvasRenderingContext2D, world: WorldState, player: PlayerState): void`
### Imports
- `constants.js`
- `textures.js`

---

## 8. hud.js
### Exports
- `initHUD(): void`
- `updateHUD(player: PlayerState, fps: number, world: WorldState): void`
- `toggleDebugInfo(): void`
### Imports
- `constants.js`

---

## 9. audio.js
### Exports
- `initAudio(): Promise<void>`
- `playSound(soundName: string, volume?: number): void`
### Imports
- `constants.js`

---

## 10. main.js (Entry Point)
### Tugas Utama:
- Inisialisasi DOM (Canvas, UI HUD).
- Memanggil `initInput()`, `initTextures()`, `initAudio()`, `initHUD()`.
- Menginstansiasi `world` dan `player`.
- Menjalankan Game Loop menggunakan `requestAnimationFrame`.
- Menghitung Delta Time (`dt`) dan FPS.
- Mengatur _event handler_ untuk interaksi pemain (menghancurkan/meletakkan blok) dengan menggabungkan respons dari `player.castRay` dan `world.setBlock`.
### Imports
- Semua modul di atas.
