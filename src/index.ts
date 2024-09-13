import * as THREE from "three";
import XRmanager from "./XRmanager";
import TextMaker, { TextInstance } from "./TextMaker";
import { GPUComputationRenderer, Variable } from "./GPUComputationRenderer";
import computeVelocity from "./shaders/computeVelocity.glsl";
import computePosition from "./shaders/computePosition.glsl";
import computeAggregate from "./shaders/computeAggregate.glsl";
import seedVertex from "./shaders/seed.vertex.glsl";
import seedFragment from "./shaders/seed.fragment.glsl";
// import { OrbitControls } from "./OrbitControls";
import { playSoundAtPosition } from "./sounds";
import Music from "./music";
import { createGrass } from "./grass";

type Unit = {
  pos: THREE.Vector3;
  rot: THREE.Vector3;
  start: THREE.Mesh;
  target: THREE.Mesh;
  owner: "p" | "e";
};

// P is player, E si enemy
const controllers: THREE.Group[] = [];
let lastGenerationTime: number;
const WIDTH = 64;
const PARTICLES = WIDTH * WIDTH;
let seedUniforms: any;
const targets: (THREE.Mesh | null)[] = Array(WIDTH).fill(null);

// Self and hacked self
targets[0] = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
targets[0].position.set(0, 1.5, 0);
targets[1] = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
targets[1].position.set(0, 1.5, 1);

let renderer: THREE.WebGLRenderer;
let gpuCompute: GPUComputationRenderer;
let velocityVariable: Variable;
let positionVariable: any;
let aggregateVariable: any;
let textMaker: TextMaker;
// let isDragging = false;
let gameStarted = false;
let currentTime = 0;
const unitQueue: Unit[] = [];

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const d1 = new THREE.Object3D();
const dtAggregateBuffer = new Float32Array(PARTICLES * 4);
const dtVelocityBuffer = new Float32Array(PARTICLES * 4);
const dtPositionBuffer = new Float32Array(PARTICLES * 4);
const computeCallbacks: { [key: string]: ((buffer: Float32Array) => void)[] } = {};
// const toReset: number[] = [];
// This is a lock to prevent aggregation calculations while async unit launch is in progress
let syncInProgress = false;
const unitsFound = {
  p: 0,
  e: 0,
};

let wave = 0;
let enemiesDead = 19;
const enemiesSpawned = 0;
let lastEnemySpawn = 0;
let wavePause: number | null;
let score = 0;
let lives = 10;

let oldVolume = 0.0;

let frame = 0;
// Blowing mechanic
let analyzer: AnalyserNode;
let mic;
const blowingThreshold = 0.3;

let selectedTarget: THREE.Mesh | null = null;
// let enemies: THREE.Mesh[] = [];
let grassInstances: THREE.InstancedMesh;

let dandelionToRemove: THREE.Object3D | null = null;

// let lastRotationTime = 0;
const cameraDirection = new THREE.Vector3();

let pickedUpDandelion: THREE.Object3D | null = null;
const fftArray: Uint8Array = new Uint8Array(32);
// class CustomGroup extends THREE.Group {
//   u: any = {};
// }

const colors = {
  player: new THREE.Color(0xffffff),
  enemy: new THREE.Color(0xff0000),
};

let dandelions: THREE.Object3D[] = [];

function fillTextures(tP: THREE.DataTexture, tV: THREE.DataTexture) {
  const posArray = tP.image.data;
  const velArray = tV.image.data;

  // velocityTexture.w is target castle

  for (let k = 0, kl = posArray.length; k < kl; k += 4) {
    // First row of the texture (WIDTH), is the castle locations
    if (k < 4 * WIDTH) {
      if (targets[k / 4]) {
        // console.log("place", places[k / 4].position);
        posArray[k + 0] = 0; //places[k / 4].position.x;
        posArray[k + 1] = 0; // places[k / 4].position.y;
        posArray[k + 2] = 0; //places[k / 4].position.z;
        posArray[k + 3] = 0.1; // fixed
        velArray[k + 3] = 1.0; // mass
      } else {
        posArray[k + 0] = 0;
        posArray[k + 1] = 0;
        posArray[k + 2] = 0;
        posArray[k + 3] = 0.1;
        velArray[k + 3] = 1.0;
      }
    } else {
      // units/units
      posArray[k + 0] = 0;
      posArray[k + 1] = 0; //Math.random();
      posArray[k + 2] = 0;
      posArray[k + 3] = 99;

      velArray[k + 0] = 0; //1.0;
      velArray[k + 1] = 0; //0.5 - Math.random();
      velArray[k + 2] = 0; // 0.5 - Math.random();
      velArray[k + 3] = 0; // mass / 1000.0;
    }
  }
}

function initComputeRenderer() {
  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  const dtAggregate = gpuCompute.createTexture();
  fillTextures(dtPosition, dtVelocity);
  velocityVariable = gpuCompute.addVariable("tV", computeVelocity, dtVelocity, dtVelocityBuffer);
  (velocityVariable.material as any).uniforms.d = { value: 3 };

  positionVariable = gpuCompute.addVariable("tP", computePosition, dtPosition, dtPositionBuffer);
  aggregateVariable = gpuCompute.addVariable(
    "tA",
    computeAggregate,
    dtAggregate,
    dtAggregateBuffer,
  );

  gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
  gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
  gpuCompute.setVariableDependencies(aggregateVariable, [positionVariable, velocityVariable]);

  const error = gpuCompute.init();

  if (error !== null) {
    console.error(error);
  }
}

const init = async () => {
  // Create a scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x505050);

  // Create a camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
  camera.position.set(0, 4.0, 10);
  camera.lookAt(0, 0, 0);

  // Set up audio input
  navigator.mediaDevices
    .getUserMedia({ audio: true, video: false })
    .then(function (stream) {
      const audioContext = new window.AudioContext();
      console.log("Audio context", audioContext);
      analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 32;
      analyzer.smoothingTimeConstant = 0.8;
      analyzer.minDecibels = -100;
      analyzer.maxDecibels = -5;
      mic = audioContext.createMediaStreamSource(stream);
      mic.connect(analyzer);
    })
    .catch(function (err) {
      console.error("Microphone access denied:", err);
    });

  scene.add(camera);

  // Create a terrain
  function createTerrain(
    width: number | undefined,
    height: number | undefined,
    widthSegments: number | undefined,
    heightSegments: number | undefined,
  ) {
    const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
    const material = new THREE.MeshBasicMaterial({
      color: 0x3a7d44,
      wireframe: false,
      map: createGrassTexture(),
    });
    if (material.map) {
      material.map.magFilter = THREE.NearestFilter;
    }
    const terrain = new THREE.Mesh(geometry, material);
    terrain.rotation.x = -Math.PI / 2;
    const vertices = terrain.geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      // And then we use the same when scattering grass
      vertices[i + 2] =
        Math.sin(vertices[i] / 10 - Math.PI / 2) * Math.cos(vertices[i + 1] / 10) * 5 + 5.0;
    }
    terrain.updateMatrixWorld(true);
    terrain.geometry.attributes.position.needsUpdate = true;
    terrain.geometry.computeVertexNormals();
    return terrain;
  }

  const terrain = createTerrain(50, 50, 20, 20);
  scene.add(terrain);

  // Add grass
  const grass = createGrass(10000, 50);
  grassInstances = grass.grassInstances;
  scene.add(grassInstances);

  // Generate a random pixelated texture
  function createGrassTexture() {
    const size = 128;
    const data = new Uint8Array(size * size * 4);

    for (let i = 0; i < size * size; i++) {
      const stride = i * 4;
      const shade = Math.random() * 0.5 + 0.5; // Random shade of green
      data[stride] = 34 * shade; // R
      data[stride + 1] = 139 * shade; // G
      data[stride + 2] = 34 * shade; // B
      data[stride + 3] = 255; // A
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  }

  const gradMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    "depthWrite": false,
  });

  gradMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.vertexShader = "varying vec2 vUv;\nvarying vec3 vWorldPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      `,
    );

    shader.fragmentShader =
      "uniform float time;\nvarying vec2 vUv;\nvarying vec3 vWorldPosition;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <logdepthbuf_fragment>",
      `#include <logdepthbuf_fragment>
      vec3 tc = vec3(0.039, 0.141, 0.447);
      vec3 mc = vec3(0.0, 0.467, 0.745);
      vec3 bc = vec3(0.529, 0.807, 0.922);
      float h = normalize(vWorldPosition).y;
      if (h > 0.0) { diffuseColor.rgb = mix(mc, tc, smoothstep(0.0, 1.0, h)); } else {
        diffuseColor.rgb = mix(bc, mc, smoothstep(-1.0, 0.0, h)); }
      `,
    );
  };

  const gradGeometry = new THREE.SphereGeometry(100, 32, 32);
  const gradMesh = new THREE.Mesh(gradGeometry, gradMaterial);
  scene.add(gradMesh);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 3.0);
  directionalLight.position.set(0, 1, 2);
  scene.add(directionalLight);
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  // Create a renderer.
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  // renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  const xrManager = new XRmanager(renderer);
  renderer["setPixelRatio"](window.devicePixelRatio);
  renderer["setSize"](window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer["domElement"]);

  // Add orbit controller
  // const controls = new OrbitControls(camera, renderer["domElement"]);
  // controls["autoRotate"] = true;
  // Resize the canvas on window resize
  const adjustAspect = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera["aspect"] = width / height;
    camera["updateProjectionMatrix"]();
  };
  window.addEventListener("resize", function () {
    adjustAspect();
  });

  initComputeRenderer();

  function createSeedGeometry() {
    const points = [];

    // function createSeedGeometry() {
    //   const seedGeometry = new THREE.CylinderGeometry(0.05, 0.03, 0.14, 3);
    //   return seedGeometry;
    // }
    points.push(new THREE.Vector2(0, 0)); // Bottom of the seed
    points.push(new THREE.Vector2(0.03, 0));
    points.push(new THREE.Vector2(0.05, 0.14)); // Top of the seed
    points.push(new THREE.Vector2(0.0, 0.14)); // Tip of the seed
    // points.push(new THREE.Vector2(0.2, 0.7)); // Top of the tuft

    // Scale points
    points.forEach((point) => {
      // point.multiplyScalar(scale);
    });

    const seedGeometry = new THREE.LatheGeometry(points, 4);
    // seedGeometry.computeVertexNormals();
    return seedGeometry;
  }

  function createDandelion(numberOfSeeds = 0) {
    const dandelionGroup = new THREE.Group();

    // Create the stem
    const stemGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 3);
    const stemMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ff00,
      transparent: true,
      flatShading: true,
    });
    dandelionGroup.userData.stemMaterial = stemMaterial;
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = -0.25;
    dandelionGroup.add(stem);

    // Create the flower head, using a lathe geometry
    const flowerPoints = [];
    flowerPoints.push(new THREE.Vector2(0, 0)); // Bottom of the flower
    flowerPoints.push(new THREE.Vector2(0.1, 0.05)); // Slightly wider bottom
    flowerPoints.push(new THREE.Vector2(0.0, 0.1)); // Top of the flower

    const flowerGeometry = new THREE.LatheGeometry(flowerPoints, 6);
    const flowerMaterial = new THREE.MeshPhongMaterial({
      color: 0xffff00,
      flatShading: true,
      transparent: true,
    });
    dandelionGroup.userData.flowerMaterial = flowerMaterial;
    const flowerHead = new THREE.Mesh(flowerGeometry, flowerMaterial);
    flowerHead.position.y = -0.05;
    dandelionGroup.add(flowerHead);

    const seedGeometry = createSeedGeometry();
    // Create instanced mesh for seeds
    const seedsMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    let rand;
    if (numberOfSeeds) {
      rand = numberOfSeeds;
    } else {
      // Do not generate 13 seeds by chance... it's bad luck. What a cursed line!
      while ((rand = Math.ceil(Math.random() * 30)) === 13) {
        continue;
      }
    }
    dandelionGroup.userData.seeds = rand;
    const instancedSeeds = new THREE.InstancedMesh(seedGeometry, seedsMaterial, rand);
    dandelionGroup.add(instancedSeeds);

    // Position and orient seeds
    const seedPositions = fibonacciSphere(rand, 0.2);
    const dummy = new THREE.Object3D();

    instancedSeeds.userData.orig = [];
    seedPositions.forEach((position, index) => {
      dummy.position.copy(position); // .add(new THREE.Vector3(0, 0.1, 0));
      // Calculate direction from origin to seed position
      const direction = position.clone().normalize();

      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      );

      instancedSeeds.userData.orig.push({
        position: dummy.position.clone(),
        quaternion,
      });

      dummy.setRotationFromQuaternion(quaternion);
      dummy.updateMatrix();
      instancedSeeds.setMatrixAt(index, dummy.matrix);
    });

    instancedSeeds.instanceMatrix.needsUpdate = true;
    dandelionGroup.userData.instancedSeeds = instancedSeeds;
    // Add invisible sphere for raycasting
    const capsuleGeometry = new THREE.CapsuleGeometry(0.5, 0.6, 16, 16);
    const capsuleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      visible: false,
      transparent: true,
      opacity: 0.5,
    });
    const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
    capsule.position.y = -0.25;
    dandelionGroup.add(capsule);

    return dandelionGroup;
  }

  // Function to distribute points evenly on a sphere
  function fibonacciSphere(samples = 200, radius = 0.5) {
    const points = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < samples + 1; i++) {
      const y = 1 - (i / samples) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;
      if (i < samples) {
        points.push(new THREE.Vector3(x * radius, y * radius, z * radius));
      }
    }
    if (points.length !== samples) {
      throw new Error("Fibonacci sphere generation failed");
    }
    return points;
  }

  function scatterDandelions(count: number, innerRadius = 0, outerRadius = 2, ornament = false) {
    let toCurse = 2 - dandelions.filter((d) => d.userData.seeds === 13).length;
    for (let i = 0; i < count; i++) {
      // Always have to be two cursed dandelions
      const dandelion = createDandelion(toCurse ? 13 : 0);
      console.log("needs cursed", toCurse ? "yes" : "no", toCurse);
      toCurse = Math.max(0, toCurse - 1);

      let x: number, z: number, r: number;
      let iters = 0;
      // Generate a position within the ring
      do {
        const angle = Math.random() * 2 * Math.PI;
        r = Math.sqrt(
          Math.random() * (outerRadius * outerRadius - innerRadius * innerRadius) +
            innerRadius * innerRadius,
        );
        x = r * Math.cos(angle);
        z = r * Math.sin(angle);
        iters++;
        if (iters > 100) {
          break;
        }
      } while (dandelions.some((d) => d.position.distanceTo(new THREE.Vector3(x, 0, z)) < 0.2));

      dandelion.position.set(x, 0, z);
      dandelion.position.setY(getTerrainHeight(x, z) - 0.5);
      dandelion.userData.growth = 0;
      dandelion.userData.origHeight = dandelion.position.y;

      if (!ornament) {
        dandelions.push(dandelion);
      } else {
        dandelion.position.y += 1;
      }

      scene.add(dandelion);
    }
  }

  // Helper function to get terrain height at a given point
  function getTerrainHeight(x: number | undefined, z: number | undefined) {
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(terrain);
    return intersects.length > 0 ? intersects[0].point.y : 0;
  }

  scatterDandelions(13, 0, 2);
  scatterDandelions(100, 2, 25, true);
  initSeeds();

  textMaker = new TextMaker();
  scene.add(textMaker.instancedMesh);
  const text1 = textMaker.addText("|".repeat(lives), new THREE.Color(0x0000ff));
  text1?.setPosition(0, -100, 0);
  text1?.setScale(0.2);
  const text2 = textMaker.addText("0", new THREE.Color(0xffffff));
  text2?.setPosition(0, -100, 0);
  text2?.setScale(0.3);
  text2?.updateText("0");
  // We'll update the text in the controller loop, as they reside on the hands

  // Wave text
  const w = textMaker.addText("", new THREE.Color(0xffffff), true, [0, 0, -1]);
  // Positional audio
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const createPositionalAudioPool = (listener: THREE.AudioListener) => {
    const audio = new THREE.PositionalAudio(listener);
    audio["setRefDistance"](2);
    audio["setVolume"](0.4);
    // audio["setRolloffFactor"](0.5);
    scene.add(audio);
    return audio;
  };
  // 8 positional audio sources, to be reused
  const positionalPool = {
    p: [1, 2, 3, 4].map(() => createPositionalAudioPool(listener)),
    e: [1, 2, 3, 4].map(() => createPositionalAudioPool(listener)),
  };

  scene.add(textMaker.instancedMesh);

  const xrSupport = await navigator.xr?.isSessionSupported("immersive-vr");
  const text = xrSupport ? "Engage remote reality" : `Remote reality is required`;

  function intersectsFromController(i: number): THREE.Intersection[] {
    const controller = controllers[i];
    const tempMatrix = new THREE.Matrix4();
    controller["updateMatrixWorld"]();
    tempMatrix.identity()["extractRotation"](controller.matrixWorld);

    const ray = new THREE.Raycaster();
    ray.near = 0.01;
    ray.far = 0.3;
    ray["camera"] = camera;
    ray["ray"].origin["setFromMatrixPosition"](controller.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    return ray.intersectObjects(dandelions);
  }

  function addComputeCallback(name: string, callback: (buffer: Float32Array) => void) {
    if (!computeCallbacks[name]) {
      computeCallbacks[name] = [];
    }
    computeCallbacks[name].push(callback);
  }

  function removeComputeCallback(name: string, callback: (buffer: Float32Array) => void) {
    if (!computeCallbacks[name]) {
      return;
    }
    const index = computeCallbacks[name].indexOf(callback);
    if (index > -1) {
      computeCallbacks[name].splice(index, 1);
    }
  }

  function enemyUnitLaunch(target: THREE.Mesh) {
    const index = targets.indexOf(target);
    if (index === -1) {
      return;
    }
    // Launch as many ships as the target has lives
    for (let i = 0; i < target.userData.lives; i++) {
      const startPos = target.position;
      // startPos.add(
      //   new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
      // );
      const startRot = new THREE.Vector3(Math.random(), Math.random(), Math.random());
      const owner = "e";
      unitQueue.push({ pos: startPos, rot: startRot, start: target, target: targets[0]!, owner });
    }
    target.userData.canLaunch = false;
    target.userData.lives = 0;
    target.userData.text.updateText("");
  }

  function checkForParticleArrivals(dataAgg: Float32Array) {
    if (syncInProgress) {
      // console.log("syncInProgress");
      return;
    }
    unitsFound["e"] = 0;
    unitsFound["p"] = 0;

    for (let i = 0; i < dataAgg.length; i += 4) {
      if (dataAgg[i + 3] <= -1e5) {
        // Hacked/cursed targets fight back
        const index = Math.floor((-dataAgg[i + 3] - 1e5 - 0.5) * WIDTH);
        const target = targets[index];
        if (target && target.userData.lives) {
          target.userData.lives += 1;
          target.userData.text.updateText("|".repeat(target.userData.lives));
          target.userData.canLaunch = true;
          playSoundAtPosition("e", target.position, positionalPool, 15);
        }
      } else if (dataAgg[i + 3] < 0) {
        // Check if the ship has collided

        // The ship has collided

        const index = Math.floor((-dataAgg[i + 3] - 0.5) * WIDTH);
        const target = targets[index];
        // Deduct points from the castle or perform other actions
        const shipOwner = dataAgg[i + 1] < 0.6005 ? "p" : "e"; // 0.6 is player, 0.601 is enemy
        if (index === 0) {
          // Player
          lives -= 1;
          text1?.updateText("|".repeat(Math.max(lives, 0)));
        } else if (target) {
          playSoundAtPosition(shipOwner, target.position, positionalPool, 10);

          target.userData.lives -= 1;
          score += 10 * (wave + 1);
          text2?.updateText(`${score}`);

          target.userData.text.updateText("|".repeat(Math.max(target.userData.lives, 0)));
          if (target.userData.lives <= 0) {
            // Target destroyed
            enemiesDead++;
            targets[index] = null;
            scene.remove(target);
          }
        }
      } else if (dataAgg[i + 3] > 0) {
        if (dataAgg[i + 1] < 0.6005 && dataAgg[i + 1] > 0.5995) {
          unitsFound.p++;
        } else if (dataAgg[i + 1] > 0.6005 && dataAgg[i + 1] < 0.6015) {
          unitsFound.e++;
        }
      }
    }

    // Check if the game is over
    let gameOverText;
    if (wave === 4) {
      gameOverText = "You defeated the aliens!";
    } else if (lives <= 0) {
      gameOverText = "Connection lost.";
    }

    if (gameOverText) {
      gameOverText += ` Wave ${wave} Score ${score}`;
      gameStarted = false;
      if (renderer.xr["isPresenting"]) {
        xrManager.endSession();
        adjustAspect();
      }
      document.getElementById("p")!.innerHTML = gameOverText;
      togglePauseScreen();
    }
  }

  // This we need to do every frame
  addComputeCallback("tA", (buffer) => {
    checkForParticleArrivals(buffer);
    // updateTroops();
  });

  function wiggleDandelions() {
    dandelions.forEach((dandelion, i) => {
      // Time based swaying of the dandelions
      const time = performance.now() * 0.001;
      dandelion.rotation.y = Math.sin(time * (i / 10.0) + i / 3.0) * 0.05;
    });
  }
  function wiggleSeeds(dandelion: THREE.Object3D, windStrength: number) {
    const tCamera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    const time = performance.now() * 0.001; // Convert to seconds for easier tuning
    const instancedSeeds = dandelion.userData.instancedSeeds as THREE.InstancedMesh;
    const originalData = instancedSeeds.userData.orig as {
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
    }[];
    const seedCount = dandelion.userData.instancedSeeds.count;
    const dummy = new THREE.Object3D();

    // Calculate wind direction in world space (from camera to dandelion)
    dandelion.getWorldPosition(v1);
    const windDirection = new THREE.Vector3().subVectors(v1, tCamera.position).normalize();

    // Get dandelion's world rotation
    const dandelionWorldQuaternion = new THREE.Quaternion();
    dandelion.getWorldQuaternion(dandelionWorldQuaternion);

    // Create a matrix to transform from world space to dandelion's local space
    const worldToLocal = new THREE.Matrix4()
      .makeRotationFromQuaternion(dandelionWorldQuaternion)
      .invert();

    // Transform wind direction to dandelion's local space
    const localWindDirection = windDirection.applyMatrix4(worldToLocal).normalize();

    for (let i = 0; i < seedCount; i++) {
      const originalPosition = originalData[i].position;
      const originalQuaternion = originalData[i].quaternion;

      // Base deflection angle based on wind strength (0 to π/4 radians)
      const maxDeflection = Math.PI / 4;
      const baseDeflection = windStrength * maxDeflection;

      // Add time-based waviness (smaller effect when wind is weak)
      const waviness = Math.sin(time * 2 + i * 0.1) * 0.2 * (0.2 + windStrength * 0.8);
      const totalDeflection = baseDeflection + waviness;

      // Create rotation axis perpendicular to local wind direction
      const rotationAxis = new THREE.Vector3()
        .crossVectors(new THREE.Vector3(0, 1, 0), localWindDirection)
        .normalize();

      // Apply rotation
      dummy.position.copy(originalPosition);
      dummy.quaternion.copy(originalQuaternion);
      dummy.rotateOnAxis(rotationAxis, totalDeflection);

      // Calculate arc movement in local space
      const arcOffset = new THREE.Vector3(0, 1 - Math.cos(totalDeflection), 0).multiplyScalar(0.05);
      dummy.position.add(arcOffset);

      // Apply very slight wiggle even when wind strength is 0
      if (windStrength === 0) {
        const microWiggle = Math.sin(time * 3 + i * 0.2) * 0.001;
        dummy.rotateOnAxis(new THREE.Vector3(1, 0, 0), microWiggle);
        dummy.rotateOnAxis(new THREE.Vector3(0, 0, 1), microWiggle);
      }

      // Update the instance matrix
      dummy.updateMatrix();
      instancedSeeds.setMatrixAt(i, dummy.matrix);
    }

    // Update the instance buffer
    instancedSeeds.instanceMatrix.needsUpdate = true;
  }

  function removeDandelion(dandelion: THREE.Object3D) {
    console.log("Removing dandelion", dandelion);
    scene.remove(dandelion);
    dandelions = dandelions.filter((d) => d !== dandelion);
    dandelionToRemove = null;
  }
  // Animation loop
  function render(time: number) {
    frame++;
    // controls["update"]();
    const delta = time - currentTime;
    currentTime = time;

    wiggleDandelions();
    if (dandelionToRemove) {
      if (dandelionToRemove.userData.removeIn) {
        dandelionToRemove.userData.removeIn -= delta;
        // Unparent the dandelion, but keep the position, then slowly move it down
        if (dandelionToRemove.parent?.userData.type === "controller") {
          dandelionToRemove.getWorldPosition(v1);
          dandelionToRemove.removeFromParent();
          dandelionToRemove.position.copy(v1);
          scene.add(dandelionToRemove);
        }

        dandelionToRemove.position.y -=
          (1000 - dandelionToRemove.userData.removeIn) * 0.01 * (delta / 1000);

        // const opacity = Math.max(0, dandelionToRemove.userData.removeIn / 1000);
        // dandelionToRemove.userData.stemMaterial.opacity = opacity;
        // dandelionToRemove.userData.flowerMaterial.opacity = opacity;
        if (dandelionToRemove.userData.removeIn <= 0) {
          removeDandelion(dandelionToRemove);
        }
      } else {
        dandelionToRemove.userData.removeIn = 1000;
      }
    }
    (grassInstances.material as THREE.ShaderMaterial).uniforms.time.value =
      performance.now() / 1000;

    if (analyzer) {
      analyzer.getByteFrequencyData(fftArray);
    }
    // In VR, if user moves outside of the play area, reset the camera
    if (renderer.xr.isPresenting) {
      const camera = renderer.xr.getCamera();
      camera.getWorldPosition(v1);
      // Update targets[0] and targets[1] with the position
      targets[0] && targets[0].position.copy(v1);
      targets[1] && targets[1].position.copy(v1);

      v1.y = 0;
      if (v1.length() > 2.5) {
        const baseReferenceSpace = renderer.xr.getReferenceSpace();
        if (baseReferenceSpace) {
          // Set the reference space with such an offset that the camera is reset
          const transform = new XRRigidTransform(v1, undefined);
          const referenceSpace = baseReferenceSpace.getOffsetReferenceSpace(transform);
          renderer.xr.setReferenceSpace(referenceSpace);
        }
      }
    }
    if (pickedUpDandelion && pickedUpDandelion.userData.seeds > 0) {
      selectedTarget = targeting();
    }
    if (analyzer && pickedUpDandelion) {
      // Only use the higher frequencies
      // console.log(dataArray);
      const higher = fftArray.slice(4, 32);
      const volume = Math.max(...higher) / 255;
      // Smooth very smoothly with oldVolume
      oldVolume = oldVolume * 0.9 + volume * 0.1;
      wiggleSeeds(pickedUpDandelion, oldVolume * 4);
      if (oldVolume > blowingThreshold && selectedTarget) {
        // Blow dandelion
        blowDandelion(pickedUpDandelion, selectedTarget);
        oldVolume = 0;
      }
    }

    if (gameStarted) {
      // Check if any enemy ships want to launch
      if (frame % 10 === 0) {
        targets.forEach((target) => {
          if (target && target.userData.canLaunch && target.userData.lives > 0) {
            enemyUnitLaunch(target);
          }
        });
      }
      syncLivesAndScoreWithControllers();
      checkDandelions();
      moveEnemies();
      if (frame % 10 === 0) {
        syncWithGPU();
        // updateEnemyPositionsInTexture();
      }
      lastGenerationTime = lastGenerationTime || Date.now();
      gpuCompute.compute(computeCallbacks);

      const tP = gpuCompute.getCurrentRenderTarget(positionVariable)["texture"];
      const tV = gpuCompute.getCurrentRenderTarget(velocityVariable)["texture"];

      seedUniforms["tP"].value = tP;
      seedUniforms["tV"].value = tV;
      // updatePointing();
    }
    renderer.render(scene, camera);
  }
  renderer["setAnimationLoop"](render);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function getPointerPosition(event: PointerEvent) {
    return { x: event.clientX, y: event.clientY };
  }

  function onPointerDown(event: PointerEvent) {
    const position = getPointerPosition(event);
    mouse.x = (position.x / window.innerWidth) * 2 - 1;
    mouse.y = -(position.y / window.innerHeight) * 2 + 1;

    raycaster["setFromCamera"](mouse, camera);
    const intersects = raycaster["intersectObjects"](dandelions);

    console.log(event, intersects);
    if (intersects.length > 0) {
      event?.preventDefault();
      const dandelion = intersects[0].object;
      if (pickedUpDandelion?.userData.seeds === 0) {
        // We have a dandelion in hand, but no seeds
        dandelionToRemove = dandelion.parent;
        pickedUpDandelion = null;
      } else if (dandelion.parent && dandelion.parent === pickedUpDandelion && selectedTarget) {
        // Temp targeting logic
        console.log("Firing dandelion");
        blowDandelion(dandelion.parent, selectedTarget);
      } else if (dandelion.parent) {
        console.log("Clicked dandelion", dandelion);
        pickUpDandelion(dandelion);
      }
    }
  }

  function pickUpDandelion(dandelion: THREE.Object3D, controllerIndex?: number) {
    // Add dandelion to the controller
    if (dandelionToRemove) {
      removeDandelion(dandelionToRemove);
    }
    if (dandelion.parent) {
      if (controllerIndex !== undefined) {
        // in VR
        controllers[controllerIndex].add(dandelion.parent);
        dandelion.parent.position.set(0, 0.5, -0.1);
      }
      // With a mouse, we want to move the dandelion to the center of the screen, at a fixed distance
      else {
        const center = new THREE.Vector3(0, 2, 0);
        // center.applyQuaternion(camera.quaternion);
        // center.add(camera.position);
        dandelion.parent.position.copy(center);
        // scene.add(dandelion.parent);
      }
      console.log("Picked up dandelion", dandelion);
      pickedUpDandelion = dandelion.parent;
    }
  }

  function initControllers() {
    // Handle controllers for WebXR
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr["getController"](i);
      controller.addEventListener("connected", (event: any) => {
        controller.userData.handedness = event.data.handedness;
      });
      scene.add(controller);
      controller.userData.type = "controller";
      // Create a visual representation for the controller: a cube
      const geometry = new THREE.BoxGeometry(0.025, 0.025, 0.2);
      const material = new THREE.MeshStandardMaterial({ color: colors.player });

      const cube = new THREE.Mesh(geometry, material);
      controller.add(cube); // Attach the cube to the controller

      controllers.push(controller);
      controller.addEventListener("selectstart", () => onSelectStart(i));
      controller.addEventListener("selectend", () => onSelectEnd(i));
    }
  }

  function syncTextWithC(text: TextInstance | null, c: THREE.Object3D, y = 0) {
    c.add(d1);
    if (text) {
      d1.position.set(0, y, 0);
      d1.rotation.set(0, Math.PI / 2, 0);
      d1.updateMatrixWorld(true);
      d1.getWorldQuaternion(q1);
      d1.getWorldPosition(v1);
      text.setPosition(v1.x, v1.y, v1.z);
      textMaker.setRotation(text.instanceId, q1);
    }
    d1.removeFromParent();
  }
  function syncLivesAndScoreWithControllers() {
    if (renderer.xr.isPresenting) {
      for (let i = 0; i < 2; i++) {
        const controller = renderer.xr["getController"](i);
        if (controller.userData.handedness === "left") {
          syncTextWithC(text1, controller, 0.03);
          syncTextWithC(text2, controller, -0.04);
        }
        d1.removeFromParent();
      }
    }
  }
  function onSelectStart(i: number) {
    console.log("select start");
    const intersects = intersectsFromController(i);
    if (intersects.length > 0) {
      pickUpDandelion(intersects[0].object, i);
    }
  }

  function onSelectEnd(i: number) {
    dandelionToRemove = pickedUpDandelion;
    pickedUpDandelion = null;
    // console.log("select end", startPlace, intersectedPlace);
    // endPlace = intersectedPlace;
    // const intersects = intersectsFromController(i);
    // handleClickOrTriggerEnd(intersects);
    // controllerLock = null;
  }

  async function startGame() {
    console.log("Game started");
    if (xrSupport) {
      await xrManager.startSession();
      renderer.xr.setFoveation(0);
      initControllers();
    }
    const music = new Music();
    music.start();

    document.getElementById("s")?.remove();
    gameStarted = true;

    window.addEventListener("pointerdown", onPointerDown, false);

    (window as any).scene = scene;
  }

  function togglePauseScreen() {
    lastGenerationTime = Date.now();
    const style = gameStarted ? "none" : "block";
    document.getElementById("p")!.style.display = style;
  }

  const button = document.getElementById("b") as HTMLButtonElement;
  if (button) {
    button.innerHTML = text;
    if (xrSupport || window.location.search.includes("force")) {
      button.style.cursor = "pointer";
      // button.disabled = false;
      button.style.color = "#fff";
      button.addEventListener("click", startGame);
    }
    // button.addEventListener("click", startGame);
  }

  function initSeeds() {
    const baseGeometry = createSeedGeometry();
    // baseGeometry.scale(0.3, 0.3, 0.3);
    baseGeometry["rotateX"](-Math.PI / 2);
    const instancedGeometry = new THREE.InstancedBufferGeometry();
    instancedGeometry["index"] = baseGeometry["index"];
    instancedGeometry.attributes.position = baseGeometry.attributes.position;
    instancedGeometry.attributes.uv = baseGeometry.attributes.uv;
    instancedGeometry.attributes.normal = baseGeometry.attributes.normal;
    instancedGeometry["instanceCount"] = PARTICLES;
    const uvs = new Float32Array(PARTICLES * 2);
    let p = 0;

    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        uvs[p++] = i / (WIDTH - 1);
        uvs[p++] = j / (WIDTH - 1);
      }
    }

    instancedGeometry.setAttribute("dtUv", new THREE.InstancedBufferAttribute(uvs, 2));
    seedUniforms = {
      "tP": { value: null },
      "tV": { value: null },
      "eC": { value: colors.enemy },
      "pC": { value: colors.player },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: seedUniforms,
      vertexShader: seedVertex,
      fragmentShader: seedFragment,
      // transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(instancedGeometry, material, PARTICLES);
    mesh["frustumCulled"] = false;
    scene.add(mesh);
  }

  function createEnemy(type = 0) {
    // When type is 0, it's the weakest enemy
    // When type is 1, we can create both 0 and 1 and so on
    type = Math.floor(Math.random() * (type + 1));

    const geometry = new THREE.OctahedronGeometry((type + 1) * 0.2, type);
    const material = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      flatShading: true,
    });
    const enemy = new THREE.Mesh(geometry, material);

    const angle = Math.random() * Math.PI * 2;
    const radius = 25;
    enemy.position.set(
      Math.cos(angle) * radius,
      -5, // Start below the ground
      Math.sin(angle) * radius,
    );

    const text = textMaker.addText("", new THREE.Color(0xff0000), true);
    text?.setPosition(enemy.position.x, enemy.position.y + 1, enemy.position.z);
    text?.setScale(5.0 - type * 1);
    enemy.userData.text = text;
    enemy.userData.type = "enemy";
    enemy.userData.lives = (type + 1) * 4;
    enemy.userData.rising = true;
    text?.updateText("|".repeat(enemy.userData.lives));
    scene.add(enemy);

    // Find a random empty spot in targets array and add the enemy
    const emptySpotsIndexes = targets
      .map((t, i) => (t && i > 1 ? null : i)) // Skip the first two spots, reserved for player
      .filter((i) => i !== null);

    const index = emptySpotsIndexes[Math.floor(Math.random() * emptySpotsIndexes.length)];
    if (index) {
      targets[index] = enemy;
    } else {
      console.log("No empty spots for enemy");
    }
  }

  function checkDandelions() {
    for (let i = 0; i < dandelions.length; i++) {
      const dandelion = dandelions[i];
      if (dandelion.userData.growth < 1) {
        // Grow the dandelion
        dandelion.userData.growth = Math.min(
          1,
          dandelion.userData.growth + 0.001 * dandelion.userData.seeds,
        );
        dandelion.position.y = dandelion.userData.origHeight + dandelion.userData.growth;
      }
    }

    // If there are less than 13 dandelions, add one
    if (dandelions.length < 13) {
      scatterDandelions(1, 0, 2);
    }
  }

  function moveEnemies() {
    // When an enemy canLaunch == false, they've been cursed and have already launched
    const enemies = targets.filter(
      (t) => t && t.userData.type === "enemy" && t.userData.canLaunch !== false,
    ) as THREE.Mesh[];

    if (enemiesDead === 20) {
      wave++;
      wavePause = Date.now();
      enemiesDead = 0;
      w?.updateText(`Wave ${wave}`);
    }

    if (wavePause && Date.now() - wavePause > 10000) {
      wavePause = null;

      w?.updateText("");
    } else if (wavePause) {
      return;
    }
    // Replenish enemies while next wave is getting ready

    if (!lastEnemySpawn || Date.now() - lastEnemySpawn > 3000 - wave * 800) {
      if (enemies.length < 20) createEnemy(wave);
      lastEnemySpawn = Date.now();
    }

    enemies.forEach((sphere, i) => {
      // Update text
      const text = sphere.userData.text as TextInstance;
      // text.updateText(sphere.position.x.toFixed(2) + ", " + sphere.position.z.toFixed(2));
      text.setPosition(sphere.position.x, sphere.position.y + 1, sphere.position.z);

      // Rise first
      if (sphere.position.y < 10 && sphere.userData.rising) {
        sphere.position.y += (10.5 - sphere.position.y) * 0.01 * (wave + 1);
      } else {
        sphere.userData.rising = false;
      }

      // Move towards center
      const directionToCenter = new THREE.Vector3()
        .subVectors(new THREE.Vector3(0, 1.5, 0), sphere.position)
        .normalize();

      sphere.position.add(directionToCenter.multiplyScalar(0.01 * (wave + 1)));

      // Remove if too close to center
      if (sphere.position.length() < 1.7) {
        targets[targets.indexOf(sphere)] = null;
        sphere.userData.text.remove();
        scene.remove(sphere);

        lives -= 1;
        playSoundAtPosition("e", sphere.position, positionalPool, 2);
        text1?.updateText("|".repeat(lives));
        // enemies = enemies.filter((s) => s !== sphere);
        // places = places.filter((p) => p !== sphere);
      }
    });
  }

  // This takes the number of seeds of a picked dandelion, and adds them to the data texture
  function blowDandelion(dandelion: THREE.Object3D, target: THREE.Mesh) {
    const dummy = new THREE.Object3D();
    const dummyVec = new THREE.Vector3();
    const dummyMat4 = new THREE.Matrix4();
    const units: Unit[] = [];
    for (let i = 0; i < dandelion.userData.seeds; i++) {
      dummy.parent = dandelion;
      dandelion.userData.instancedSeeds.getMatrixAt(i, dummyMat4);
      dummyMat4.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.getWorldPosition(dummyVec);
      const unit = {
        pos: dummyVec.clone(),
        rot: dummyVec, // temp
        start: dandelion.userData.seeds === 13 ? targets[1] : targets[0], // If 13 seeds, fire from "hacked" origin
        target,
        owner: "p" as "p" | "e",
      };

      const webglDirection = new THREE.Vector3(dummyVec.x, dummyVec.y, dummyVec.z);
      // Then transform it by a quaternion
      webglDirection.normalize();
      webglDirection.applyQuaternion(dummy.quaternion);

      unit.rot = webglDirection;
      units.push(unit as Unit);
    }
    unitQueue.push(...units);
    console.log(units.length, "units added to queue");

    dandelion.userData.seeds = 0;

    // Restore all targets to normal color
    targets.forEach((t) => {
      if (t) {
        (t.material as THREE.MeshPhongMaterial).color.setRGB(1, 0, 0);
      }
    });
    syncLivesText(target);
  }

  function syncLivesText(target: THREE.Mesh) {
    const text = target.userData.text as TextInstance;
    text.updateText("|".repeat(Math.max(target.userData.lives, 0)));
  }

  function targeting() {
    let target: THREE.Mesh | null = null;
    if (pickedUpDandelion) {
      // Find the target by taking the closest place in the
      // direction from the camera to the dandelion
      let tCamera = camera;

      if (renderer.xr.isPresenting) {
        tCamera = renderer.xr.getCamera() as THREE.PerspectiveCamera;
        tCamera.getWorldPosition(v1);
      } else {
        tCamera.getWorldPosition(v1);
      }

      pickedUpDandelion.getWorldPosition(v2);
      const direction = new THREE.Vector3().subVectors(v2, v1).normalize();

      const raycaster = new THREE.Raycaster(v2, direction);

      let minDist = 1000;
      let maxDist = 0;
      // First find min and max
      targets.forEach((targetCandidate, i) => {
        if (i < 2 || targetCandidate?.userData.lives === 0) return; // Skip targets representing player, or zombies
        if (!targetCandidate) return;
        const distance = raycaster.ray.distanceToPoint(targetCandidate.position);
        if (distance < minDist) {
          minDist = distance;
          target = targetCandidate;
        }
        if (distance > maxDist) {
          maxDist = distance;
        }
        targetCandidate.userData.distance = distance;
      });

      targets.forEach((targetCandidate, i) => {
        if (i < 2 || targetCandidate?.userData.lives === 0) return; // Skip targets representing player, or zombies
        if (!targetCandidate) return;
        targetCandidate.userData.currentTarget = false;
        const normalizedDistance =
          (targetCandidate.userData.distance - minDist) / (maxDist - minDist);
        (targetCandidate.material as THREE.MeshBasicMaterial).color.setRGB(
          1 - normalizedDistance,
          normalizedDistance,
          0,
        );
      });
      if (target) {
        (target as THREE.Mesh).userData.currentTarget = true;
        (target as THREE.Mesh).userData.text.updateText("Target");
      }

      if (target !== null) {
        return target;
      }
    }
    return null;
  }

  // For example:
  // encodeTwoFloatsAsOne(1.23, 2.34) = 12302.340
  function encodeFloats(a: number, b: number) {
    // Multiply first float by 100 and floor it
    const encodedA = Math.floor(a * 1000);
    const bSign = Math.sign(b);
    // Multiply second float by 10 to preserve one decimal place
    const encodedB = Math.abs(b);
    // Combine the two values
    return bSign * (encodedA * 10 + encodedB);
  }
  function decodeFloats(encoded: number) {
    const b = encoded % 10;
    const a = Math.floor(encoded / 10) / 1000;
    return [a, b];
  }

  function syncWithGPU() {
    if (syncInProgress) {
      console.log("Sync in progress");
      return;
    }

    const dtPosition = gpuCompute.createTexture();
    const dtVelocity = gpuCompute.createTexture();
    let slotsFound = 0;
    const slots: number[] = [];

    const positionCallback = (buffer: Float32Array) => {
      // console.log("Position callback");
      dtPosition.image.data.set(buffer);
      const posArray = dtPosition.image.data;

      for (let i = 0; i < targets.length; i++) {
        if (targets[i] === null) continue;
        const index = i * 4;
        posArray[index] = targets[i]!.position.x;
        posArray[index + 1] = targets[i]!.position.y;
        posArray[index + 2] = targets[i]!.position.z;
        posArray[index + 3] = 0.1; // enemy flying "castle"
      }

      for (let i = 0; i < slots.length; i++) {
        const index = slots[i];
        const unit = unitQueue[i];
        // console.log("Adding unit", unit.pos);
        if (unit.owner === "p") {
          posArray[index] = unit.pos.x;
          posArray[index + 1] = unit.pos.y;
          posArray[index + 2] = unit.pos.z;
          posArray[index + 3] = 0.6; // ship type
        } else {
          posArray[index] = unit.pos.x;
          posArray[index + 1] = unit.pos.y;
          posArray[index + 2] = unit.pos.z;
          posArray[index + 3] = 0.601; // ship type
        }
      }
      removeComputeCallback("tP", positionCallback);
      dtPosition.needsUpdate = true;

      const rt = gpuCompute.getCurrentRenderTarget(positionVariable);
      gpuCompute.renderTexture(dtPosition, rt);
      dtVelocity.needsUpdate = true;
      const rtv = gpuCompute.getCurrentRenderTarget(velocityVariable);
      gpuCompute.renderTexture(dtVelocity, rtv);

      syncInProgress = false;

      // startPlace.u.troops -= slots.length / 2;
      if (slots.length > 0) {
        slots.length = 0;
        unitQueue.length = 0;
        console.log("Unit launch done");
      }
      if (pickedUpDandelion && !pickedUpDandelion.userData.seeds) {
        if (pickedUpDandelion.userData.instancedSeeds.count) {
          pickedUpDandelion.userData.instancedSeeds.count = 0;
        }
      }
    };

    const velocityCallback = (buffer: Float32Array) => {
      syncInProgress = true;
      // console.log("Velocity callback");
      dtVelocity.image.data.set(buffer);
      const velArray: Uint8ClampedArray = dtVelocity.image.data;
      const livingTargets = targets.filter((t, i) => t !== null && i > 1); // Skip player targets
      // Sort by distance to 0, 0, 0
      livingTargets.sort((a, b) => {
        const distA = a!.position.length();
        const distB = b!.position.length();
        return distA - distB;
      });

      const closestTarget = livingTargets[0];
      const closestTargetIndex = targets.indexOf(closestTarget);
      for (let i = 0; i < velArray.length; i += 4) {
        const unit = unitQueue[slotsFound];

        if (unit && slotsFound < unitQueue.length + 1) {
          const targetId = targets.indexOf(unit.target);
          const dtTarget = (targetId + 0.5) / WIDTH + 0.5;

          const startId = targets.indexOf(unit.start);
          const dtStart = (startId + 0.5) / WIDTH + 0.5;

          const encoded = encodeFloats(dtStart, dtTarget);

          // // Only allow 1/2 of total units per p
          // if (unitsFound[unit.owner] + slotsFound >= PARTICLES / 2 - 64) {
          //   break;
          // }
          // Check if the slot is empty
          if (velArray[i + 3] === 0) {
            // this is 1.0 or mass for non-units
            // Update the slot
            velArray[i] = unit.rot.x;
            velArray[i + 1] = unit.rot.y;
            velArray[i + 2] = unit.rot.z;
            velArray[i + 3] = encoded; // target castle id
            slotsFound++;
            slots.push(i);
          }
          // if (slotsFound > unitQueue.length - 1) {
          //   break;
          // }
        }
        // See if units are without target
        const [dtStart, dtTarget] = decodeFloats(velArray[i + 3]);

        const targetId = Math.floor((dtTarget - 0.5) * WIDTH);
        if (
          dtTarget > 0 &&
          (!targets[targetId] || targets[targetId]?.userData.lives === 0) &&
          i > WIDTH * 4
        ) {
          const dtTarget = (closestTargetIndex + 0.5) / WIDTH + 0.5;
          const encoded = encodeFloats(dtStart, dtTarget);
          // redirect to another random target
          velArray[i + 3] = encoded;
        }
      }

      if (slotsFound > 0) {
        console.log("Launched", slots.length, "units to", unitQueue[0].target.position);
      }
      if (slotsFound < Math.floor(unitQueue.length)) {
        console.warn(`Only ${slotsFound} slots were found (needed ${unitQueue.length}).`);
      }
      removeComputeCallback("tV", velocityCallback);
      addComputeCallback("tP", positionCallback);
    };

    if (unitQueue.length > 0 || frame % 10 === 0) {
      // console.log("Adding compute callbacks");
      addComputeCallback("tV", velocityCallback);
    }
  }
};

init();
