import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { RENDERER, COLORS, BLOCK, CHUNK_SIZE, WORLD_HEIGHT } from './constants.js';
import { FACE } from './textures.js';

export class Renderer {
  #canvas;
  #scene;
  #camera;
  #renderer;
  #textureAtlas;
  #chunkMeshes = new Map();
  #pendingChunks = new Set();
  #material;
  #waterMaterial;
  #highlightMesh;
  #atlas;

  constructor(canvas, atlas) {
    this.#canvas = canvas;
    
    // Scene
    this.#scene = new THREE.Scene();
    this.#scene.background = new THREE.Color(COLORS.SKY_HORIZON);
    this.#scene.fog = new THREE.Fog(COLORS.FOG_COLOR, RENDERER.FAR * 0.5 * CHUNK_SIZE, RENDERER.FAR * CHUNK_SIZE);
    
    // Camera
    this.#camera = new THREE.PerspectiveCamera(RENDERER.FOV, window.innerWidth / window.innerHeight, RENDERER.NEAR, RENDERER.FAR * CHUNK_SIZE);
    
    // WebGL Renderer
    this.#renderer = new THREE.WebGLRenderer({ canvas: this.#canvas, antialias: false });
    this.#renderer.setSize(window.innerWidth, window.innerHeight);
    this.#renderer.setPixelRatio(window.devicePixelRatio || 1);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.#scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xFFFACD, 0.8);
    dirLight.position.set(50, 100, 20);
    this.#scene.add(dirLight);

    // Textures
    this.#textureAtlas = new THREE.CanvasTexture(atlas.canvas);
    this.#textureAtlas.magFilter = THREE.NearestFilter;
    this.#textureAtlas.minFilter = THREE.NearestFilter;
    this.#textureAtlas.colorSpace = THREE.SRGBColorSpace;
    
    this.#material = new THREE.MeshLambertMaterial({
      map: this.#textureAtlas,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.1, // untuk daun & kaca
      side: THREE.FrontSide
    });
    
    this.#waterMaterial = new THREE.MeshLambertMaterial({
      map: this.#textureAtlas,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      side: THREE.FrontSide
    });

    // Block Highlight Wireframe
    const edgesGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
    this.#highlightMesh = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }));
    this.#highlightMesh.visible = false;
    this.#scene.add(this.#highlightMesh);

    // Resize event
    window.addEventListener('resize', () => {
      this.resize(window.innerWidth, window.innerHeight);
    });
  }

  resize(width, height) {
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height);
  }

  #buildChunkGeometry(world, cx, cz) {
    const key = `${cx},${cz}`;
    if (!world.isChunkLoaded(cx, cz)) return;
    
    const chunk = world.getOrGenerateChunk(cx, cz);
    
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    
    const waterPositions = [];
    const waterNormals = [];
    const waterUvs = [];
    const waterColors = [];
    const waterIndices = [];

    let indexOffset = 0;
    let waterIndexOffset = 0;
    
    const atlasW = this.#textureAtlas.image.width;
    const atlasH = this.#textureAtlas.image.height;

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const idx = (y * CHUNK_SIZE * CHUNK_SIZE) + (z * CHUNK_SIZE) + x;
          const blockId = chunk[idx];
          if (blockId === BLOCK.AIR) continue;
          
          const isWater = blockId === BLOCK.WATER;
          const worldX = cx * CHUNK_SIZE + x;
          const worldY = y;
          const worldZ = cz * CHUNK_SIZE + z;
          
          const checkNeighbor = (nx, ny, nz) => {
            const nId = world.getBlock(worldX + nx, worldY + ny, worldZ + nz);
            if (nId === BLOCK.AIR) return true;
            if (isWater) return nId !== BLOCK.WATER && nId !== BLOCK.BEDROCK && nId !== BLOCK.STONE && nId !== BLOCK.DIRT && nId !== BLOCK.SAND; // optimalisasi air
            // Daun dan Kaca itu transparan, jadi blok di belakangnya harus di render
            return nId === BLOCK.WATER || nId === BLOCK.GLASS || nId === BLOCK.LEAVES;
          };

          const addFace = (dx, dy, dz, faceEnum, shade) => {
            if (checkNeighbor(dx, dy, dz)) {
              // Jika ini batas air bagian atas
              if (isWater && dy === 1 && world.getBlock(worldX, worldY+1, worldZ) === BLOCK.WATER) return;

              const faceUV = this.#atlas.getUV ? this.#atlas.getUV(blockId, faceEnum) : {u:0, v:0}; 
              // u, v direturn oleh textures.js (biasanya berdasarkan offset di kanvas)
              const eps = 0.05; // Bleed reduction
              const u0 = (faceUV.u + eps) / atlasW;
              const v0 = 1 - (faceUV.v + eps) / atlasH;
              const u1 = (faceUV.u + 16 - eps) / atlasW;
              const v1 = 1 - (faceUV.v + 16 - eps) / atlasH;

              const wx = worldX;
              const wy = worldY;
              const wz = worldZ;
              
              let p1, p2, p3, p4;
              if (dy === 1) { // TOP
                p1 = [wx, wy+1, wz+1]; p2 = [wx+1, wy+1, wz+1]; p3 = [wx+1, wy+1, wz]; p4 = [wx, wy+1, wz];
              } else if (dy === -1) { // BOTTOM
                p1 = [wx, wy, wz]; p2 = [wx+1, wy, wz]; p3 = [wx+1, wy, wz+1]; p4 = [wx, wy, wz+1];
              } else if (dx === 1) { // RIGHT
                p1 = [wx+1, wy, wz+1]; p2 = [wx+1, wy, wz]; p3 = [wx+1, wy+1, wz]; p4 = [wx+1, wy+1, wz+1];
              } else if (dx === -1) { // LEFT
                p1 = [wx, wy, wz]; p2 = [wx, wy, wz+1]; p3 = [wx, wy+1, wz+1]; p4 = [wx, wy+1, wz];
              } else if (dz === 1) { // FRONT
                p1 = [wx, wy, wz+1]; p2 = [wx+1, wy, wz+1]; p3 = [wx+1, wy+1, wz+1]; p4 = [wx, wy+1, wz+1];
              } else { // BACK
                p1 = [wx+1, wy, wz]; p2 = [wx, wy, wz]; p3 = [wx, wy+1, wz]; p4 = [wx+1, wy+1, wz];
              }

              const posArr = isWater ? waterPositions : positions;
              const normArr = isWater ? waterNormals : normals;
              const colArr = isWater ? waterColors : colors;
              const uvArr = isWater ? waterUvs : uvs;
              const indArr = isWater ? waterIndices : indices;
              const offset = isWater ? waterIndexOffset : indexOffset;

              posArr.push(...p1, ...p2, ...p3, ...p4);
              for(let i=0; i<4; i++) normArr.push(dx, dy, dz);
              for(let i=0; i<4; i++) colArr.push(shade, shade, shade);
              uvArr.push(u0, v0, u1, v0, u1, v1, u0, v1);
              
              indArr.push(offset, offset+1, offset+2, offset, offset+2, offset+3);
              
              if (isWater) waterIndexOffset += 4;
              else indexOffset += 4;
            }
          };

          addFace(1, 0, 0, FACE.EAST, 0.8);
          addFace(-1, 0, 0, FACE.WEST, 0.8);
          addFace(0, 1, 0, FACE.TOP, 1.0);
          addFace(0, -1, 0, FACE.BOTTOM, 0.5);
          addFace(0, 0, 1, FACE.SOUTH, 0.6);
          addFace(0, 0, -1, FACE.NORTH, 0.6);
        }
      }
    }
    
    // Remove old mesh if exist
    if (this.#chunkMeshes.has(key)) {
      const group = this.#chunkMeshes.get(key);
      this.#scene.remove(group);
      group.children.forEach(c => c.geometry.dispose());
      this.#chunkMeshes.delete(key);
    }

    if (positions.length > 0 || waterPositions.length > 0) {
      const group = new THREE.Group();

      if (positions.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        group.add(new THREE.Mesh(geo, this.#material));
      }

      if (waterPositions.length > 0) {
        const wGeo = new THREE.BufferGeometry();
        wGeo.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
        wGeo.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
        wGeo.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
        wGeo.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs, 2));
        wGeo.setIndex(waterIndices);
        group.add(new THREE.Mesh(wGeo, this.#waterMaterial));
      }

      this.#scene.add(group);
      this.#chunkMeshes.set(key, group);
    }
  }

  // Inject atlas yang dibikin di textures.js untuk referensi fungsi getUV
  setAtlasFunctions(atlas) {
    this.#atlas = atlas;
  }

  render(world, player, deltaTime, timeProgress = 0) {
    // 1. Streaming Meshes (Optimalisasi stuttering)
    const dirty = world.getAndClearDirtyChunks();
    for (const key of dirty) this.#pendingChunks.add(key);
    
    // Batasi rebuild chunk menjadi max 3 per frame agar tidak lag
    let processed = 0;
    for (const key of this.#pendingChunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (world.isChunkLoaded(cx, cz)) {
        this.#buildChunkGeometry(world, cx, cz);
      }
      this.#pendingChunks.delete(key);
      processed++;
      if (processed >= 3) break;
    }

    // Cleanup unloaded chunks
    for (const key of this.#chunkMeshes.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      if (!world.isChunkLoaded(cx, cz)) {
        const group = this.#chunkMeshes.get(key);
        this.#scene.remove(group);
        group.children.forEach(c => c.geometry.dispose());
        this.#chunkMeshes.delete(key);
      }
    }

    // 2. Camera Update
    const cam = player.getCamera();
    this.#camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    this.#camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ');

    // 3. Highlight Raycast Hit
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.#camera.rotation);
    const ray = world.raycast(cam.pos, dir, 5);
    
    if (ray && ray.hit && ray.blockId !== BLOCK.AIR && ray.blockId !== BLOCK.WATER) {
      this.#highlightMesh.visible = true;
      this.#highlightMesh.position.set(ray.pos[0] + 0.5, ray.pos[1] + 0.5, ray.pos[2] + 0.5);
    } else {
      this.#highlightMesh.visible = false;
    }

    // 4. Day / Night Cycle (Sine Wave Interpolation)
    const angle = timeProgress * Math.PI * 2;
    const sunLight = Math.sin(angle - Math.PI / 2); // 1 = Noon, -1 = Midnight
    const intensity = Math.max(0.08, (sunLight + 0.2) / 1.2);

    const skyH = new THREE.Color(COLORS.SKY_HORIZON).multiplyScalar(intensity);
    const fogC = new THREE.Color(COLORS.FOG_COLOR).multiplyScalar(intensity);

    this.#scene.background = skyH;
    
    this.#scene.children.forEach(c => {
      if (c instanceof THREE.AmbientLight) c.intensity = 0.5 * intensity + 0.1;
      if (c instanceof THREE.DirectionalLight) c.intensity = 0.9 * Math.max(0, sunLight);
    });

    // 5. Underwater Fog Effect Overrides Day/Night Fog
    const headBlock = world.getBlock(Math.floor(cam.pos.x), Math.floor(cam.pos.y), Math.floor(cam.pos.z));
    if (headBlock === BLOCK.WATER) {
      this.#scene.fog.color.setHex(0x1a4099).multiplyScalar(Math.max(0.2, intensity));
      this.#scene.fog.near = 0.1;
      this.#scene.fog.far = 15;
    } else {
      this.#scene.fog.color.copy(fogC);
      this.#scene.fog.near = RENDERER.FAR * 0.5 * CHUNK_SIZE;
      this.#scene.fog.far = RENDERER.FAR * CHUNK_SIZE;
    }

    // Render 3D Scene
    this.#renderer.render(this.#scene, this.#camera);
  }
}
