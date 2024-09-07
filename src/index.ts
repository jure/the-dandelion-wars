import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "./LineMaterial";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";

import XRmanager from "./XRmanager";
import TextMaker from "./TextMaker";
import { GPUComputationRenderer, Variable } from "./GPUComputationRenderer";
import computeVelocity from "./shaders/computeVelocity.glsl";
import computePosition from "./shaders/computePosition.glsl";
import computeAggregate from "./shaders/computeAggregate.glsl";
import knightVertex from "./shaders/knight.vertex.glsl";
import knightFragment from "./shaders/knight.fragment.glsl";
import { OrbitControls } from "./OrbitControls";
import { playRandomSoundAtPosition } from "./sounds";
import Music from "./music";
import * as levels from "./levels";

// P is player, E si enemy
// import Stats from "three/addons/libs/stats.module.js";
// let drawCallPanel: Stats.Panel;
const intersectedPlace: CustomGroup | null = null; // The sphere currently being pointed at
let startPlace: CustomGroup | null = null; // The first sphere selected when drawing a line
let endPlace: CustomGroup | null = null; // The second sphere selected when drawing a line
const controllers: THREE.Group[] = [];
let lastGenerationTime: number;
const WIDTH = 64;
const PARTICLES = WIDTH * WIDTH;
let knightUniforms: any;
const places: CustomGroup[] = [];
const placeSpheres: THREE.Object3D[] = []; // Spheres for easier raycasting
let renderer: THREE.WebGLRenderer;
let gpuCompute: GPUComputationRenderer;
let velocityVariable: Variable;
let positionVariable: any;
let aggregateVariable: any;
let textMaker: TextMaker;
let isDragging = false;
let gameStarted = false;
let currentTime = 0;
let rotator: THREE.Object3D;
const dtAggregateBuffer = new Float32Array(PARTICLES * 4);
const dtVelocityBuffer = new Float32Array(PARTICLES * 4);
const dtPositionBuffer = new Float32Array(PARTICLES * 4);
const computeCallbacks: { [key: string]: ((buffer: Float32Array) => void)[] } = {};
const toReset: number[] = [];
// This is a lock to prevent aggregation calculations while async unit launch is in progress
let unitLaunchInProgress = false;
const unitsFound = {
  p: 0,
  e: 0,
};

const trees: CustomGroup[] = [];
let difficulty = 0;
let controllerLock: null | number = null;
let lastRotationTime = 0;
const cameraDirection = new THREE.Vector3();

class CustomGroup extends THREE.Group {
  u: any = {};
}

const colors = {
  player: new THREE.Color(0x00c52f),
  enemy: new THREE.Color(0xc52f34),
  playerUI: new THREE.Color(0x00ff00),
  enemyUI: new THREE.Color(0xff0000),
};

const dandelions: THREE.Object3D[] = [];

function fillTextures(tP: THREE.DataTexture, tV: THREE.DataTexture) {
  const posArray = tP.image.data;
  const velArray = tV.image.data;

  // velocityTexture.w is target castle

  for (let k = 0, kl = posArray.length; k < kl; k += 4) {
    // First row of the texture (WIDTH), is the castle locations
    if (k < 4 * WIDTH) {
      if (places[k / 4]) {
        console.log("place", places[k / 4].position);
        posArray[k + 0] = places[k / 4].position.x;
        posArray[k + 1] = places[k / 4].position.y;
        posArray[k + 2] = places[k / 4].position.z;
        posArray[k + 3] = 0.1; // fixed
        velArray[k + 3] = 1.0; // mass
      }
    } else {
      // units/units
      posArray[k + 0] = -3.0;
      posArray[k + 1] = Math.random();
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

// function gradientTexture(color1: string, color2: string, color3: string) {
//   const canvas = document.createElement("canvas");
//   canvas.width = 1024 * 4;
//   canvas.height = 1024 * 4;

//   const context = canvas.getContext("2d");
//   if (!context) {
//     throw new Error();
//   }

//   const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);

//   gradient.addColorStop(0.5, color1);
//   // gradient.addColorStop(0.51, color2);
//   // gradient.addColorStop(1.0, color3);

//   context.fillStyle = gradient;
//   context.fillRect(0, 0, canvas.width, canvas.height);

//   // Create a stary sky
//   // const stars = 1000;
//   // for (let i = 0; i < stars; i++) {
//   //   const x = Math.random() * canvas.width;
//   //   const y = Math.random() * canvas.height;
//   //   const r = Math.random() * 1;
//   //   context.beginPath();
//   //   context.arc(x, y, r, 0, 2 * Math.PI);
//   //   context.fillStyle = "white";
//   //   context.fill();
//   // }

//   const texture = new THREE.Texture(canvas);
//   texture.needsUpdate = true;
//   return texture;
// }

const init = async () => {
  // Create a scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x505050);

  // Create a camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
  camera.position.set(0, 6, -10);

  rotator = new THREE.Object3D();
  rotator.add(camera);
  scene.add(rotator);

  // Create a terrain
  function createTerrain(
    width: number | undefined,
    height: number | undefined,
    widthSegments: number | undefined,
    heightSegments: number | undefined,
  ) {
    const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
    const material = new THREE.MeshPhongMaterial({ color: 0x3a9e3a, wireframe: false });

    const terrain = new THREE.Mesh(geometry, material);
    terrain.rotation.x = -Math.PI / 2;

    const vertices = terrain.geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i + 2] = Math.random() * 2; // Random height
    }
    terrain.geometry.attributes.position.needsUpdate = true;
    terrain.geometry.computeVertexNormals();

    return terrain;
  }

  const terrain = createTerrain(50, 50, 20, 20);
  scene.add(terrain);

  // const stats = new Stats();
  // drawCallPanel = stats.addPanel(new Stats.Panel("DRAWCALL", "#0ff", "#002"));
  // document.body.appendChild(stats.dom);

  // Gradient background for an icosahedron
  // const gradTexture = gradientTexture("#000833", "#03123B", "#03123B");
  const gradMaterial = new THREE.MeshBasicMaterial({
    // map: gradTexture,
    side: THREE.BackSide,
    "depthWrite": false,
    // wireframe: true,
  });

  gradMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.vertexShader = "varying vec2 vUv;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vUv = uv;
      `,
    );

    shader.fragmentShader = "uniform float time;\nvarying vec2 vUv;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <logdepthbuf_fragment>",
      `#include <logdepthbuf_fragment>
      // uniform float time;
      // Gradient based on vUv.y
      vec3 darkBlue = vec3(0.02, 0.08, 0.16);
      vec3 whiteBlue = vec3(0.27, 0.46, 0.60);
      diffuseColor.rgb = mix(darkBlue, whiteBlue, pow(vUv.y, 3.0));
    
      // Continue with the rest of your shader code, and when you want to use the gradient color:

      `,
    );
  };

  // const gradGeometry = new THREE.IcosahedronGeometry(100, 3);
  const gradGeometry = new THREE.SphereGeometry(100, 32, 32);
  // const gradGeometry = new THREE.CylinderGeometry(100, 100, 100, 32, 32, true);
  const gradMesh = new THREE.Mesh(gradGeometry, gradMaterial);
  scene.add(gradMesh);

  // const helper = new CameraHelper(camera);
  // scene.add(helper);

  // Create a light
  // const light = new PointLight(0xffffff, 10, 100);
  // light.position.set(0, 0, 0);
  // scene.add(light);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
  directionalLight.position.set(0, 1, 1);
  // directionalLight.castShadow = true;
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
  const controls = new OrbitControls(camera, renderer["domElement"]);
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

  function stretchLineBetweenPoints(line: Line2, startPlace: CustomGroup, endPlace: CustomGroup) {
    const geometry = line.geometry.clone() as LineGeometry;
    const start = startPlace.position;
    const end = endPlace.position;
    const startColor = startPlace.u.color;
    const endColor = endPlace.u.color;

    geometry.setPositions([start.x, start.y, start.z, end.x, end.y, end.z]);
    geometry.computeBoundingSphere();
    geometry.setColors([
      startColor.r,
      startColor.g,
      startColor.b,
      endColor.r,
      endColor.g,
      endColor.b,
    ]);
    line.geometry = geometry;
    line.computeLineDistances();
    line.visible = true;
  }

  // Create the indicator line
  const lineGeometry = new LineGeometry();
  lineGeometry.setPositions([0, 0, 0, 1, 1, 1]);

  const lineMaterial = new LineMaterial({
    color: 0xffffff,
    worldUnits: true,
    linewidth: 0.04,
    vertexColors: true,
    dashed: true,
    dashScale: 4,
    gapSize: 0.5,
    alphaToCoverage: true,
  });

  const line = new Line2(lineGeometry, lineMaterial as any);
  line.computeLineDistances();
  line.frustumCulled = false;
  // const line = new THREE.Mesh(lineGeometry, lineMaterial);
  line.visible = false;
  scene.add(line);

  // Create trees

  const canopyGeometry = new THREE.SphereGeometry(1, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  canopyGeometry.translate(0, 0.5, 0);
  const trunkGeometry = new THREE.CylinderGeometry(0, 0.5, 1, 4, 1);
  trunkGeometry.translate(0, 0.5, 0);
  const vertexReplacement = `vec3 transformed = vec3(position);transformed.x += sin(position.y * 10.0 + time + float(gl_InstanceID)) * 0.1;transformed.z += cos(position.y * 10.0 + time + float(gl_InstanceID)) * 0.1;`;
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    "side": THREE.DoubleSide,
  });
  canopyMaterial.onBeforeCompile = (shader) => {
    shader.uniforms["time"] = { value: 0 };
    shader["vertexShader"] = "uniform float time;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", vertexReplacement);
    canopyMaterial["userData"].shader = shader;
  };
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, side: THREE.DoubleSide });
  const rootGeometry = new THREE.BufferGeometry();

  const vertices = new Float32Array([
    -1.0,
    -1.0,
    0.0, // v0
    1.0,
    -1.0,
    0.0, // v1
    1.0,
    1.0,
    0.0, // v2
    -1.0,
    1.0,
    0.0, // v3
  ]);

  const indices = [0, 1, 2, 2, 3, 0];

  rootGeometry["setIndex"](indices);
  rootGeometry["setAttribute"]("position", new THREE.BufferAttribute(vertices, 3));
  rootGeometry["translate"](0, +1, 0);
  // rootGeometry.rotateY(-Math.PI / 2);
  rootGeometry["computeVertexNormals"]();
  rootGeometry["rotateY"](Math.PI);
  const rootMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, side: THREE.DoubleSide });
  rootMaterial["onBeforeCompile"] = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.vertexShader = "uniform float time;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", vertexReplacement);
    rootMaterial.userData.shader = shader;
  };

  const map = levels.level1;
  const sphereCount = 16; // Number of places you want to create
  const mapSelect = document.getElementById("m") as HTMLSelectElement;

  // To be re/used for scaling
  const treeDummy = new THREE.Group();
  const treeScale = 0.3;

  // Create separate instanced meshes
  const canopyInstancedMesh = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, sphereCount);
  const trunkInstancedMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, sphereCount);
  const rootsInstancedMesh = new THREE.InstancedMesh(rootGeometry, rootMaterial, sphereCount * 8);
  // generatePlaces();
  initComputeRenderer();

  function createSeedGeometry(scale = 0.1) {
    const points = [];

    // Create the thicker bottom part
    for (let i = 0; i < 10; i++) {
      // Thicker base section
      points.push(
        new THREE.Vector2(
          Math.sin(i * 0.3) * 0.1, // Slight curve for the thicker base
          i * 0.1, // Height of the thicker base
        ),
      );
    }

    // Create the straight, thin stem
    for (let i = 10; i < 30; i++) {
      points.push(
        new THREE.Vector2(
          0.03, // Thin stem
          i * 0.1, // Height of the stem
        ),
      );
    }

    // Create the wide, open tufts at the top
    for (let i = 30; i < 40; i++) {
      points.push(
        new THREE.Vector2(
          Math.abs(Math.sin(i * 0.2 + 0.18) * 1.2 + 0.1), // Widens out for the tufts
          i * 0.1, // Height of the tufts
        ),
      );
    }

    // Scale points
    points.forEach((point) => {
      point.multiplyScalar(scale);
    });

    const seedGeometry = new THREE.LatheGeometry(points, 5);
    return seedGeometry;
  }

  function createDandelion() {
    const dandelionGroup = new THREE.Group();

    // Create the stem
    const stemGeometry = new THREE.CylinderGeometry(0.05, 0.05, 3, 32);
    const stemMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = 1.5;
    dandelionGroup.add(stem);

    // Create the flower head, using a lathe geometry
    const flowerPoints = [];
    for (let i = 0; i < 6; i++) {
      flowerPoints.push(new THREE.Vector2(Math.abs(Math.sin(i * 0.6 + 0.15) * 0.5), i * 0.1));
    }
    flowerPoints.forEach((point) => {
      point.multiplyScalar(0.6);
    });

    const flowerGeometry = new THREE.LatheGeometry(flowerPoints, 32);
    const flowerMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 });
    const flowerHead = new THREE.Mesh(flowerGeometry, flowerMaterial);
    flowerHead.position.y = 3.0;
    dandelionGroup.add(flowerHead);

    const seedGeometry = createSeedGeometry();
    // Create instanced mesh for seeds
    const seedsMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      wireframe: true,
    });
    const rand = Math.ceil(Math.random() * 100);
    const instancedSeeds = new THREE.InstancedMesh(seedGeometry, seedsMaterial, rand);
    dandelionGroup.add(instancedSeeds);

    // Position and orient seeds

    const seedPositions = fibonacciSphere(rand, 0.2);
    const dummy = new THREE.Object3D();
    const realCenter = new THREE.Vector3()
      .add(flowerHead.position)
      .add(new THREE.Vector3(0, 0.2, 0));
    seedPositions.forEach((position, index) => {
      dummy.position.copy(position).add(realCenter);
      const direction = new THREE.Vector3().subVectors(dummy.position, realCenter).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      );
      dummy.setRotationFromQuaternion(quaternion);
      dummy.updateMatrix();
      instancedSeeds.setMatrixAt(index, dummy.matrix);
    });

    instancedSeeds.instanceMatrix.needsUpdate = true;

    // Add invisible sphere for raycasting
    const sphereGeometry = new THREE.CapsuleGeometry(0.5, 2, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      visible: true,
      transparent: true,
      opacity: 0.5,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.y = 2.3;
    dandelionGroup.add(sphere);

    // Scale the dandelion
    dandelionGroup.scale.set(0.1, 0.1, 0.1);
    return dandelionGroup;
  }

  // Function to distribute points evenly on a sphere
  function fibonacciSphere(samples = 200, radius = 0.5) {
    const points = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < samples; i++) {
      const y = 1 - (i / (samples - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;
      points.push(new THREE.Vector3(x * radius, y * radius, z * radius));
    }
    return points;
  }

  function scatterDandelions(count: number) {
    for (let i = 0; i < count; i++) {
      const dandelion = createDandelion();
      const x = Math.random() * 50 - 25;
      const z = Math.random() * 50 - 25;
      const y = getTerrainHeight(x, z);
      dandelion.position.set(x, y + 1, z);
      dandelions.push(dandelion);
      scene.add(dandelion);
    }
    // Temporarily add one at the origin
    const dandelion = createDandelion();
    dandelion.position.set(0, 2, 0);
    dandelions.push(dandelion);
    scene.add(dandelion);
    // for (let i = 0; i < count; i++) {
    //   const dandelion = createDandelion();
    //   dandelion.position.set(i * 2, 0, 0);
    //   dandelions.push(dandelion);
    //   scene.add(dandelion);
    // }
  }

  // Helper function to get terrain height at a given point
  function getTerrainHeight(x: number | undefined, z: number | undefined) {
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObject(terrain);
    return intersects.length > 0 ? intersects[0].point.y : 0;
  }

  scatterDandelions(100); // Scatter 20 dandelions

  // scene.add(canopyInstancedMesh);
  // scene.add(trunkInstancedMesh);
  // scene.add(rootsInstancedMesh);

  initKnights();

  // mapSelect.onchange = () => {
  //   console.log("map changed");
  //   let newMap;
  //   const selectedMap = mapSelect.value;
  //   if (selectedMap === "1") {
  //     newMap = levels.level1;
  //     sphereCount = 16;
  //   } else if (selectedMap === "2") {
  //     newMap = levels.level2;
  //     sphereCount = 32;
  //   } else if (selectedMap === "3") {
  //     newMap = levels.level3;
  //     sphereCount = 64;
  //   } else {
  //     newMap = levels.level1;
  //   }
  //   if (newMap !== map) {
  //     places.forEach((place) => {
  //       scene.remove(place);
  //     });
  //     places.length = 0;
  //     placeSpheres.forEach((placeSphere) => {
  //       scene.remove(placeSphere);
  //     });
  //     placeSpheres.length = 0;
  //     trees.forEach((tree) => {
  //       scene.remove(tree);
  //     });
  //     trees.length = 0;

  //     // Dispose existing instanced meshes
  //     scene.remove(canopyInstancedMesh);
  //     canopyInstancedMesh["dispose"]();
  //     scene.remove(trunkInstancedMesh);
  //     trunkInstancedMesh["dispose"]();
  //     scene.remove(rootsInstancedMesh);
  //     rootsInstancedMesh["dispose"]();

  //     // Create new instanced meshes
  //     canopyInstancedMesh = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, sphereCount);
  //     trunkInstancedMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, sphereCount);
  //     rootsInstancedMesh = new THREE.InstancedMesh(rootGeometry, rootMaterial, sphereCount * 8);

  //     scene.add(canopyInstancedMesh);
  //     scene.add(trunkInstancedMesh);
  //     scene.add(rootsInstancedMesh);

  //     map = newMap;
  //     generatePlaces();
  //     changePlaces();
  //   }
  // };

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

  // Logic to create random places

  function scaleTreePart(
    type: "c" | "t" | "r",
    index: number,
    scale: number,
    mesh: THREE.InstancedMesh,
    sX: number,
    sY: number,
    sZ: number,
    rotation = 0,
    n = 1,
  ) {
    const part = treeDummy;
    const tree = trees[index];
    const baseOfTrunk = new THREE.Object3D();
    baseOfTrunk.position.set(0, 0.05, 0);

    part.parent = baseOfTrunk;
    baseOfTrunk.parent = tree;

    const t = treeScale;
    for (let i = 0; i < 8; i++) {
      const idx = n === 1 ? index : index * 8 + i;
      if (type === "r") {
        part.matrix.copy(tree.u.r[i]);
      } else {
        part.matrix.copy(tree.u[type]);
      }
      // mesh.getMatrixAt(idx, part.matrix);
      part.matrix.decompose(part.position, part.quaternion, part.scale);
      tree["setRotationFromAxisAngle"](new THREE.Vector3(1, 0, 0), rotation);
      baseOfTrunk.scale.set(scale * t * sX, scale * t * sY, scale * t * sZ);
      part["updateWorldMatrix"](true, true);
      mesh.setMatrixAt(idx, part["matrixWorld"]);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function setTreeScaleAndRotation(index: number, scale: number, rotation?: number) {
    scaleTreePart("c", index, scale, canopyInstancedMesh, 1, 1, 1, rotation);
    scaleTreePart("t", index, scale, trunkInstancedMesh, 1, 1, 1, rotation);
    scaleTreePart("r", index, scale, rootsInstancedMesh, 0.03, 0.3, 1.0, rotation, 8);
  }

  function generatePlaces() {
    for (let i = 0; i < sphereCount; i++) {
      // Random position in the scene
      const position = map(i, sphereCount);
      const place = createPlace(i === 0 ? 0 : i === sphereCount - 1 ? 1 : undefined) as CustomGroup;
      place.position.copy(position);
      place.u.originalPosition = place.position.clone();
      scene.add(place);
      const material = new THREE.MeshBasicMaterial();

      places.push(place);

      const placeSphere = new THREE.Mesh(
        new THREE.SphereGeometry(place.u["size"] / 10.0),
        material,
      );
      placeSphere.position.copy(place.position.clone());
      placeSpheres.push(placeSphere);
      place.u.sphere = placeSphere;
      placeSphere.visible = false;
      scene.add(placeSphere);

      // Add the trees
      const tree = new CustomGroup();
      tree.position.copy(place.position);
      trees.push(tree);
      const dummy = new THREE.Object3D();
      canopyInstancedMesh["setMatrixAt"](i, dummy.matrix);
      tree["u"]["c"] = dummy.matrix.clone();
      trunkInstancedMesh.setMatrixAt(i, dummy.matrix);
      tree.u["t"] = dummy.matrix.clone();

      // Air roots
      const rndScale = 1.5;
      tree.u["r"] = [];
      for (let j = 0; j < 8; j++) {
        dummy["matrix"]["identity"]()["decompose"](dummy.position, dummy.quaternion, dummy.scale);
        dummy.position.x += Math.random() * rndScale * 30 - 0.5 * rndScale * 30;
        dummy.position.z += Math.random() * rndScale - 0.5 * rndScale;
        dummy["updateMatrix"]();
        tree.u.r.push(dummy.matrix.clone());
        rootsInstancedMesh["setMatrixAt"](i * 8 + j, dummy.matrix);
      }
      place.u.i = i;

      if (i === 0) {
        place.u.owner = "p";
        place.u.color = colors.playerUI;
        place.u.troops = 100;
        setTreeScaleAndRotation(i, 0.25);
        place.u.scale = 1;
      } else if (i === sphereCount - 1) {
        place.u.owner = "e";
        place.u.troops = 100;
        place.u.color = colors.enemyUI;
        setTreeScaleAndRotation(i, 0);
      } else {
        place.u.color = new THREE.Color(0xffffff); // White
        setTreeScaleAndRotation(i, 0);
      }
    }
  }

  textMaker = new TextMaker();
  scene.add(textMaker.instancedMesh);

  function createTextSprite(message: string, followCameraRotation = false, followCamera = false) {
    const text = textMaker.addText(
      message,
      new THREE.Color(0xfff),
      followCameraRotation,
      followCamera,
    );
    return text;
  }
  const xrSupport = await navigator.xr?.isSessionSupported("immersive-vr");
  const text = xrSupport ? "Play in VR" : `Play`;

  // Update the pointing ray
  // Update function to detect sphere pointing
  function updatePointing() {
    if (!controllers[0]) return [];
    let intersects = [];
    if (controllerLock === null) {
      intersects = [...intersectsFromController(0), ...intersectsFromController(1)];
    } else {
      intersects = intersectsFromController(controllerLock);
    }
    handlePointingMoving(intersects);
  }

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

  function handlePointingMoving(intersects: THREE.Intersection[], event?: MouseEvent) {
    if (intersects.length > 0) {
      event?.preventDefault();
      const index = placeSpheres.indexOf(intersects[0].object);
      console.log("index", index);
      const place = places[index] as CustomGroup;
      if (place) {
        // Select color
        setSelected(place, true);
      }
      if (startPlace && place !== startPlace) {
        // End select color
        setSelected(place, true);
        stretchLineBetweenPoints(line, startPlace, place);
      }
      if (endPlace !== place) {
        // Reset color
        if (endPlace && endPlace !== startPlace) {
          setSelected(endPlace, false);
        }
        endPlace = place;
      }
    } else {
      // hide the line
      line.visible = false;
      if (endPlace && endPlace !== startPlace) {
        setSelected(endPlace, false);
      }
      // console.log("no start intersect");
    }
  }

  function handleClickOrTriggerStart(
    intersects: THREE.Intersection[],
    event?: MouseEvent | TouchEvent,
  ) {
    console.log(event, intersects);
    if (intersects.length > 0) {
      event?.preventDefault();
      const place = places[placeSpheres.indexOf(intersects[0].object)];
      if (place.u.owner === "p") {
        controls.enabled = false;
        startPlace = place as CustomGroup;
        setSelected(startPlace, true);
        isDragging = true;
      }
    }
    // else {
    //   // console.log("no start intersect");
    // }
  }

  function handleClickOrTriggerEnd(
    intersects: THREE.Intersection[],
    event?: MouseEvent | TouchEvent,
  ) {
    if (intersects.length > 0) {
      endPlace = places[placeSpheres.indexOf(intersects[0].object)] as CustomGroup;
      if (startPlace && endPlace !== startPlace) {
        console.log("startPlace attacks:", startPlace, "endPlace", endPlace);
        sendFleetFromPlaceToPlace(startPlace, endPlace);
      }
    }
    controls.enabled = true;
    // Reset
    if (startPlace) {
      setSelected(startPlace, false);
      // setColorForAllChildren(startPlace, startPlace.u.color);
    }
    if (endPlace) {
      setSelected(endPlace, false);
      // setColorForAllChildren(endPlace, endPlace.u.color);
    }
    startPlace = null;
    endPlace = null;
    isDragging = false;
    line.visible = false;
  }

  function setSelected(place: CustomGroup, selected: boolean) {
    console.log(place.id, "selected", selected);
    place.u.shader.uniforms.selected.value = selected ? 1 : 0;
  }

  function updateTroopsDisplay(place: CustomGroup, troopsCount: number) {
    const intensity = Math.min(1, troopsCount / 100);
    if (place.u.troopsDisplay) {
      // The higher the number of troops, the closer the color should be
      // to the owner's color
      place.u.troopsDisplay["updateText"](
        troopsCount.toString(),
        new THREE.Color(
          place.u.color["r"] * intensity,
          place.u.color["g"] * intensity,
          place.u.color["b"] * intensity,
        ),
      );
      place.u.troopsDisplay.setScale(Math.min(1 + troopsCount / 100, 2));
    } else {
      place.u.troopsDisplay = createTextSprite(troopsCount.toString(), true);
      place.u.troopsDisplay.setPosition(place.position.x, place.position.y + 0.2, place.position.z);
    }
    // Also reflect troop numbers in tree size
    if (place.u.owner === "p") {
      setTreeScaleAndRotation(place.u.i, Math.min(1, troopsCount / 500));
      place.position.setY(place.u.originalPosition.y);
    } else if (place.u.owner === "e") {
      setVolcanoScale(place, 0.1 + 0.2 * (troopsCount / 500));
    }
  }

  function setVolcanoScale(place: CustomGroup, scale: number) {
    const clampedScale = Math.min(Math.max(scale, 0.1), 0.3);
    place.scale.setY(clampedScale);
    place.position.setY(place.u.originalPosition.y + clampedScale * 0.5);
  }
  function generateTroops(castle: CustomGroup, timeDelta: number) {
    const sizeFactor = castle.u.size; // Simple size measure
    if (castle.u.owner === "p") {
      let rate = 0.001;
      if (difficulty === 0) {
        rate = 0.0012;
      }
      castle.u.troops += sizeFactor * timeDelta * rate;
    } else if (castle.u.owner === "e") {
      let rate = 0.001;
      if (difficulty === 0) {
        rate = 0.0008;
      }
      castle.u.troops += sizeFactor * timeDelta * rate;
    }
    updateTroopsDisplay(castle, Math.floor(castle.u.troops));
  }

  function updateTroops() {
    const now = Date.now();

    for (const castle of places) {
      generateTroops(
        castle as CustomGroup,
        (castle as CustomGroup).u.owner ? now - lastGenerationTime : 0,
      );
    }
    lastGenerationTime = now;
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

  function checkForParticleArrivals(dataAgg: Float32Array) {
    if (unitLaunchInProgress) {
      console.log("unitLaunchInProgress");
      return;
    }
    unitsFound["e"] = 0;
    unitsFound["p"] = 0;

    for (let i = 0; i < dataAgg.length; i += 4) {
      // Check if the ship has collided
      if (dataAgg[i + 3] < 0) {
        // The ship has collided
        const place = places[Math.floor((-dataAgg[i + 3] - 0.5) * WIDTH)] as CustomGroup;
        // Deduct points from the castle or perform other actions
        const shipOwner = dataAgg[i + 1] < 0.6005 ? "p" : "e"; // 0.6 is p, 0.601 is e
        if (place) {
          playRandomSoundAtPosition(shipOwner, place.position, positionalPool);
          if (!place.u.owner || place.u.owner !== shipOwner) {
            place.u.troops -= 1;

            if (place.u.troops <= 0) {
              // The castle has been conquered
              place.u.troops = 1;
              place.u.owner = shipOwner;
              place.u.color = shipOwner === "p" ? colors.playerUI : colors.enemyUI;
              // Set target rotation
              // We will lerp towards this each frame, orientation is used for ownership graphics
              // Target rotation is PI left or PI right, depending on who the new owner is
              place.u.targetRotation += shipOwner === "p" ? Math.PI : -Math.PI;
              place.u.targetRotation = place.u.targetRotation % (Math.PI * 2);
            }
          } else {
            // If the end place is owned by the same p, add troops
            place.u.troops += 1;
          }
        }

        toReset.push(i);
      } else if (dataAgg[i + 3] > 0) {
        if (dataAgg[i + 1] < 0.6005 && dataAgg[i + 1] > 0.5995) {
          unitsFound.p++;
        } else if (dataAgg[i + 1] > 0.6005 && dataAgg[i + 1] < 0.6015) {
          unitsFound.e++;
        }
      }
    }

    // Check if the game is over
    const planetOwners = places.map((place) => place.u.owner);
    const pWon = planetOwners.every((owner) => [null, "p"].includes(owner)) && unitsFound.e === 0;
    const eWon = planetOwners.every((owner) => [null, "e"].includes(owner)) && unitsFound.p === 0;
    let gameOverText;
    if (pWon) {
      gameOverText = "Victory!";
    } else if (eWon) {
      gameOverText = "You lose. Darkness has fallen.";
    }
    if (gameOverText) {
      // gameStarted = false;
      // if (renderer.xr["isPresenting"]) {
      // xrManager.endSession();
      // adjustAspect();
      // }
      // document.getElementById("p")!.innerHTML = gameOverText;
      // togglePauseScreen();
    }
  }

  // This we need to do every frame
  addComputeCallback("tA", (buffer) => {
    checkForParticleArrivals(buffer);
    updateTroops();
  });

  function handleControllers() {
    const session = renderer.xr["getSession"]();
    const currentTime = Date.now();
    // If gamepad horizontal is pressed, rotate camera
    if (session) {
      const inputSources = session.inputSources;
      for (let i = 0; i < inputSources.length; i++) {
        const inputSource = inputSources[i];
        const gamepad = inputSource.gamepad;
        if (gamepad) {
          const axes = gamepad.axes;
          if (axes[2] > 0.8 && currentTime - lastRotationTime > 250) {
            rotator.rotateY(-Math.PI / 4);
            lastRotationTime = currentTime;
          } else if (axes[2] < -0.8 && currentTime - lastRotationTime > 250) {
            lastRotationTime = currentTime;
            rotator.rotateY(Math.PI / 4);
          } else if (axes[3] > 0.5) {
            // Move forward
            renderer.xr.getCamera().getWorldDirection(cameraDirection);
            cameraDirection.applyQuaternion(rotator.quaternion);
            // cameraDirection.applyAxisAngle(rotator.up, rotator.rotation.y);
            rotator.position.addScaledVector(cameraDirection, -0.1);
          } else if (axes[3] < -0.5) {
            // Move backward
            renderer.xr.getCamera().getWorldDirection(cameraDirection);
            cameraDirection.applyQuaternion(rotator.quaternion);
            // cameraDirection.applyAxisAngle(rotator.up, rotator.rotation.y);
            rotator.position.addScaledVector(cameraDirection, 0.1);
          }

          textMaker.cameraRotation = rotator.rotation.y;
        }
      }
    }
  }

  // Animation loop
  function render(time: number) {
    controls["update"]();
    const delta = time - currentTime;
    currentTime = time;

    handleControllers();
    if (gameStarted) {
      lastGenerationTime = lastGenerationTime || Date.now();
      gpuCompute.compute(computeCallbacks);

      const tP = gpuCompute.getCurrentRenderTarget(positionVariable)["texture"];
      const tV = gpuCompute.getCurrentRenderTarget(velocityVariable)["texture"];

      knightUniforms["tP"].value = tP;
      knightUniforms["tV"].value = tV;

      updatePointing();
      // cycle between 0 and 1
      line.material.dashOffset = (-time * 0.005) % (2 * 200);

      for (const place of places) {
        const lerpSpeed = delta / 100;
        const distance = place.u.targetRotation - place.rotation.x;
        if (Math.abs(distance) > 0.01) {
          // When rotation is 0, e.g. player takes place then AI takes it back
          // we need to invert the morph target.
          const invert = place.u.targetRotation === 0;
          place.rotation.x += distance * lerpSpeed;

          const desiredMorphState = (place.u.owner === "p" ? 1 : 0) ^ +invert;
          const morphSpeed =
            (desiredMorphState - place.u.shield.morphTargetInfluences[0]) * lerpSpeed;
          place.u.shield.morphTargetInfluences[0] += morphSpeed;
          place.u.shield.morphTargetInfluences[0] = Math.min(
            Math.max(place.u.shield.morphTargetInfluences[0], 0),
            1,
          );

          if (place.u.owner === "p") {
            place.u.scale = ((1 - Math.abs(distance / Math.PI)) * place.u.troops) / 500;
          } else if (place.u.owner === "e") {
            place.u.scale = 0; // place.u.scale - lerpSpeed;
          }
          place.u.scale = Math.min(Math.max(place.u.scale, 0), 1);
          setTreeScaleAndRotation(
            place.u.i,
            place.u.scale,
            place.rotation.x + place.u.targetRotation,
          );
          if (place.u.shader) place.u.shader.uniforms.flipped.value = invert ? 1 : -1;
        }
        let ownership = 0; // unowned
        if (place.u.owner === "p") {
          ownership = 1;
        } else if (place.u.owner === "e") {
          ownership = 2;
        }
        if (place.u.shader) place.u.shader.uniforms.ownership.value = ownership;
        if (place.u.shader) place.u.shader.uniforms.time.value += delta / 1000.0;
      }
    }
    if (canopyMaterial.userData.shader) {
      canopyMaterial.userData.shader.uniforms.time.value += delta / 1000.0;
    }
    if (rootMaterial.userData.shader) {
      rootMaterial.userData.shader.uniforms.time.value += delta / 1000.0;
    }
    renderer.render(scene, camera);
    // drawCallPanel.update(renderer.info.render.calls, 200);
    // stats.update();
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
    const intersects = raycaster["intersectObjects"](placeSpheres);

    handleClickOrTriggerStart(intersects, event);
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging) return;

    const position = getPointerPosition(event);
    mouse.x = (position.x / window.innerWidth) * 2 - 1;
    mouse.y = -(position.y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);
    handlePointingMoving(intersects);
  }

  function onPointerUp(event: PointerEvent) {
    if (!isDragging) return;

    const position = getPointerPosition(event);
    mouse.x = (position.x / window.innerWidth) * 2 - 1;
    mouse.y = -(position.y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);

    handleClickOrTriggerEnd(intersects, event);
  }

  function pickUpDandelion(intersects: THREE.Intersection[], controllerIndex: number) {
    if (intersects.length > 0) {
      const dandelion = intersects[0].object;

      // Add dandelion to the controller
      if (dandelion.parent) {
        controllers[controllerIndex].add(dandelion.parent);
        dandelion.parent.position.set(0, 0, -0.1);
      }
    }
  }

  function initControllers() {
    // Handle controllers for WebXR
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr["getController"](i);
      rotator.add(controller);

      // Create a visual representation for the controller: a cube
      const geometry = new THREE.BoxGeometry(0.025, 0.025, 0.2);
      const material = new THREE.MeshStandardMaterial({ color: colors.player });

      const cube = new THREE.Mesh(geometry, material);
      controller.add(cube); // Attach the cube to the controller

      const line = new THREE.Line();
      line.geometry["setFromPoints"]([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      line.material = new THREE.LineBasicMaterial({ color: colors.player });
      line.scale.z = 5;
      controller.add(line);

      controllers.push(controller);
      controller.addEventListener("selectstart", () => onSelectStart(i));
      controller.addEventListener("selectend", () => onSelectEnd(i));
    }
  }

  function onSelectStart(i: number) {
    console.log("select start");
    const intersects = intersectsFromController(i);
    // handleClickOrTriggerStart(intersects);

    pickUpDandelion(intersects, i);

    controllerLock = i;
  }

  function onSelectEnd(i: number) {
    console.log("select end", startPlace, intersectedPlace);
    endPlace = intersectedPlace;
    const intersects = intersectsFromController(i);
    handleClickOrTriggerEnd(intersects);

    controllerLock = null;
  }

  function createPlace(morphTargetInfluence = 0.5) {
    const place = new CustomGroup();
    // Create shield with random sizes
    // Top width should always be smaller than bottom width
    const topWidth = 1 + Math.random() * 2.0;
    const bottomWidth = 3 + Math.random() * 4.0;
    const shieldGeometry = new THREE.CylinderGeometry(bottomWidth, topWidth, 1.0, 24);
    const shieldGeometry2 = new THREE.CylinderGeometry(topWidth, bottomWidth, 1.0, 24);

    // Add a morph target
    shieldGeometry["morphAttributes"].position = [];
    shieldGeometry["morphAttributes"].normal = [];
    shieldGeometry["morphAttributes"].position[0] = shieldGeometry2.attributes.position;
    shieldGeometry["morphAttributes"].normal[0] = shieldGeometry2.attributes.normal;

    const shieldMaterial = new THREE.MeshStandardMaterial({
      defines: {
        USE_UV: true,
      },
    });

    shieldMaterial["onBeforeCompile"] = (shader) => {
      place.u.shader = shader;
      shader.vertexShader =
        `varying vec3 vNorm;
        uniform vec3 mPos;
        varying vec3 vPos;
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        // vNorm = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
        vNorm = normal;
        vPos = mPos;
        `,
      );
      shader.uniforms.time = { value: 0 };
      shader.uniforms.ownership = {
        value: place.u.owner === "p" ? 1 : place.u.owner === "e" ? 2 : 0,
      };
      shader.uniforms.flipped = { value: 1 };
      shader.uniforms.selected = { value: 0 };
      shader.uniforms.mPos = { value: place.position };

      shader.fragmentShader =
        `uniform float ownership;
        uniform float flipped;
        uniform float time;
        varying vec3 vNorm;
        varying vec3 vPos;
        uniform float selected;
      ` + shader.fragmentShader;
      // console.log(shader.fragmentShader);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <logdepthbuf_fragment>",
        `
        #include <logdepthbuf_fragment>

        // Colors for different ownerships
        vec3 topUnownedColor = vec3(0.7, 0.7, 0.7);  // bland
        vec3 topPlayerColor = vec3(0.0, 1.0, 0.0);  // lush green
        vec3 topEnemyColor = vec3(1.0, 1.0, .3);  // red lava
        vec3 topBaseColor = mix(topUnownedColor, mix(topPlayerColor, topEnemyColor, step(1.5, ownership)), step(0.5, ownership));
    
        vec3 sideUnownedColor = vec3(0.5, 0.5, 0.5);  // bland
        vec3 sidePlayerColor = vec3(0.11, 0.03, 0.01);  // brown
        vec3 sideEnemyColor = vec3(.03, .03, .03);  // red lava
        vec3 sideBaseColor = mix(sideUnownedColor, mix(sidePlayerColor, sideEnemyColor, step(1.5, ownership)), step(0.5, ownership));

        vec3 bottomUnownedColor = vec3(0.5, 0.5, 0.5);  // bland
        vec3 bottomPlayerColor = vec3(0.11, 0.03, 0.01) * 0.4;  // brown
        vec3 bottomEnemyColor = vec3(0.6, 0.0, 0.0);  // red lava
        vec3 bottomBaseColor = mix(bottomUnownedColor, mix(bottomPlayerColor, bottomEnemyColor, step(1.5, ownership)), step(0.5, ownership));

        float vNormy = vNorm.y * flipped;
        float offsetTime = time / 2.0 + vPos.x + vPos.z; // Offset based on position of volcano
        float intensity = 2.*(offsetTime + 0.5+0.5*sin(offsetTime));

        float dist = distance(vUv, vec2(0.5, 0.5));

        if(vNormy <= -0.99) {
            // Bottom circle: Black color
            float adj = mix(1.0, 0.3, step(1.5, ownership));
            diffuseColor.rgb = mix(bottomBaseColor * adj, bottomBaseColor, dist * 1.0);

          } else if (vNormy >= 0.99) {
          // Calculate distance from center of the UV circle (which should be at (0.5, 0.5) for standard UVs).

          vec3 darkerBaseColor = topBaseColor * 0.3;

          if (ownership < 1.5) {
            diffuseColor.rgb = mix(darkerBaseColor, topBaseColor, dist * 1.0);
          } else {
            float color = (1.0 - dist) * sin(intensity + 3.1) + 0.1;
            diffuseColor.rgb =  vec3(color, 0., 0.);
          }
        } else {
          // Get a normalized y-coordinate to have a gradient from top to bottom
          float vUvy = mix(1.0 - vUv.y, vUv.y, min(flipped + 1.0, 1.0));
          float gradient = 1.0 - vUvy;

          if (ownership == 2.0) {
            // // Amplify colors on the top of the cylinder
            float topBoost = smoothstep(0.3, 1.0, vUvy);
        
            // Undulation effect
            float wave = 0.9 * sin(vUvy * 15.0 + intensity) + 0.9;
            // Wave pattern along the height of the cylinder
  
            // Angular factor to make lava flow unevenly
            float angularFactor = 0.5 * sin(vUv.x * 2.* PI + vPos.x + vPos.z) + 0.5;
        
            // Combined undulation and flow control
            float flow = topBoost * wave * angularFactor;
            float color = sideBaseColor.r * flow;

            diffuseColor.rgb = sideBaseColor + vec3(1.,0.,0.)*(flow);
          } else {
            diffuseColor.rgb = mix(sideBaseColor, bottomBaseColor, gradient);
          }
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 2.0, selected * (0.5+0.5*sin(8.0*time)));

        `,
      );
    };

    const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    // shield.receiveShadow = true;
    shield["morphTargetInfluences"]![0] = morphTargetInfluence;

    shield.position.set(0, 0.0, 0);
    // shield.rotation.set(Math.PI / 2, 0, 0);
    place.add(shield);
    shieldGeometry["computeBoundingSphere"]();
    place.u = place["userData"];
    place.u.size = shieldGeometry["boundingSphere"]
      ? shieldGeometry["boundingSphere"]["radius"]
      : 0;
    // Initial troops
    place.u.troops = Math.floor(Math.random() * place.u.size * 10);
    // Initial owner
    place.u.owner = null;
    place.u.scale = 0.0;
    place.u.targetRotation = 0.0;
    place.u.shield = shield;
    place.scale.set(0.1, 0.1, 0.1);
    return place;
  }

  async function startGame() {
    difficulty = parseInt((document.getElementById("d")! as HTMLInputElement).value);
    (velocityVariable.material as any).uniforms.d.value = difficulty;
    // createTextSprite("Game started!", false, true);
    if (xrSupport) {
      await xrManager.startSession();
      renderer.xr.setFoveation(0);
      // const ref = renderer.xr.getReferenceSpace();

      initControllers();
    }
    const music = new Music();
    music.start();

    // document.getElementById("s")?.remove();
    document.getElementById("i")?.remove();
    controls.autoRotate = false;
    gameStarted = true;

    window.addEventListener("pointerdown", onPointerDown, false);
    window.addEventListener("pointermove", onPointerMove, false);
    window.addEventListener("pointerup", onPointerUp, false);
    // window.onblur = () => {
    //   gameStarted = false;
    //   togglePauseScreen();
    // };
    // window.onfocus = () => {
    //   gameStarted = true;
    //   togglePauseScreen();
    // };
    // TODO!! window.onbeforeunload = (e) => (e.returnValue = "Game in progress");
    // P pauses the game
    document.addEventListener("keydown", (e) => {
      if (e.key === "p") {
        gameStarted = !gameStarted;
        togglePauseScreen();
      }
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const right = new THREE.Vector3();
      right.crossVectors(camera.up, forward);
      const moveSpeed = 0.1;
      if (e.key === "w") {
        camera.position.addScaledVector(forward, moveSpeed);
        controls._target.addScaledVector(forward, moveSpeed);
      } else if (e.key === "s") {
        camera.position.addScaledVector(forward, -moveSpeed);
        controls._target.addScaledVector(forward, -moveSpeed);
      } else if (e.key === "d") {
        camera.position.addScaledVector(right, -moveSpeed);
        controls._target.addScaledVector(right, -moveSpeed);
      } else if (e.key === "a") {
        camera.position.addScaledVector(right, moveSpeed);
        controls._target.addScaledVector(right, moveSpeed);
      }
    });
    (window as any).scene = scene;

    // Simple AI sends attacks high priority targets and low resistance targets
    setTimeout(doAI, Math.random() * 5000 - difficulty * 1000);
  }

  function aiDelay() {
    let min, max;

    switch (difficulty) {
      case 0:
        min = 7;
        max = 9;
        break;
      case 1:
        min = 5;
        max = 7;
        break;
      case 2:
        min = 3;
        max = 5;
        break;
      case 3:
        min = 2;
        max = 3;
        break;
      default:
        throw new Error("Invalid difficulty level");
    }

    // Return a random delay between the min and max values
    return (min + Math.random() * (max - min)) * 1000;
  }

  function doAI() {
    // Random e owned castle
    const eCastles = places.filter((p) => p.u.owner === "e");
    const otherCastles = places.filter((p) => !eCastles.includes(p));
    // const pCastles = places.filter((p) => p.u.owner === "p");

    // Sort by a combination of size and troops, giving priority to larger places with fewer troops.
    const highValueTargets = otherCastles.sort(
      (a, b) => b.u.size / (b.u.troops + 1) - a.u.size / (a.u.troops + 1),
    );
    const startPlace = eCastles[Math.floor(Math.random() * eCastles.length)];
    // Prioritize attacking places based priority, but attack random ones based on level
    const randomness = Math.random() < difficulty / 3;
    const endPlace = randomness
      ? highValueTargets[0]
      : otherCastles[Math.floor(Math.random() * otherCastles.length)];

    if (startPlace && endPlace && startPlace !== endPlace) {
      sendFleetFromPlaceToPlace(startPlace, endPlace);
    }
    setTimeout(doAI, aiDelay());
  }

  function togglePauseScreen() {
    lastGenerationTime = Date.now();
    const style = gameStarted ? "none" : "block";
    document.getElementById("p")!.style.display = style;
  }

  const cont = document.getElementById("x");
  cont?.addEventListener("click", () => {
    document.getElementById("s")!.style.display = "none";
    document.getElementById("i")!.style.display = "block";
  });

  const button = document.getElementById("b");
  if (button) {
    button.innerHTML = text;
    button.addEventListener("click", startGame);
  }

  function initKnights() {
    const baseGeometry = createSeedGeometry();
    baseGeometry.scale(0.3, 0.3, 0.3);
    baseGeometry["rotateX"](-Math.PI / 2);
    const instancedGeometry = new THREE.InstancedBufferGeometry();
    instancedGeometry["index"] = baseGeometry["index"];
    instancedGeometry.attributes.position = baseGeometry.attributes.position;
    instancedGeometry.attributes.uv = baseGeometry.attributes.uv;

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
    knightUniforms = {
      "tP": { value: null },
      "tV": { value: null },
      "eC": { value: colors.enemy },
      "pC": { value: colors.player },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: knightUniforms,
      vertexShader: knightVertex,
      fragmentShader: knightFragment,
      // transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(instancedGeometry, material, PARTICLES);
    mesh["frustumCulled"] = false;
    scene.add(mesh);
  }

  function changePlaces() {
    const dtPosition = gpuCompute.createTexture();
    const dtVelocity = gpuCompute.createTexture();

    fillTextures(dtPosition, dtVelocity);
    const rt = gpuCompute.getCurrentRenderTarget(positionVariable);
    // gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[0]);
    gpuCompute.renderTexture(dtPosition, rt);
    dtVelocity.needsUpdate = true;
    const rtv = gpuCompute.getCurrentRenderTarget(velocityVariable);
    gpuCompute.renderTexture(dtVelocity, rtv);
  }

  function sendFleetFromPlaceToPlace(startPlace: CustomGroup, endPlace: CustomGroup) {
    addUnitsToTexture(startPlace.u.troops / 2, startPlace, endPlace, startPlace.u.owner);
  }

  function addUnitsToTexture(
    numberOfShips: number,
    startPlace: CustomGroup,
    endPlace: CustomGroup,
    owner: "p" | "e",
  ) {
    const targetId = places.indexOf(endPlace);
    const dtTarget = (targetId + 0.5) / WIDTH + 0.5;

    const dtPosition = gpuCompute.createTexture();
    const dtVelocity = gpuCompute.createTexture();
    const source = startPlace.position;
    let slotsFound = 0;
    const slots: number[] = [];
    const positionCallback = (buffer: Float32Array) => {
      // console.log("Position callback");
      dtPosition.image.data.set(buffer);
      const posArray = dtPosition.image.data;

      for (let i = 0; i < slots.length; i++) {
        const index = slots[i];
        if (owner === "p") {
          posArray[index] = source.x + (Math.random() - 0.5) * 0.1;
          posArray[index + 1] = source.y - (Math.random() - 0.5) * 0.1;
          posArray[index + 2] = source.z + (Math.random() - 0.5) * 0.1;
          posArray[index + 3] = 0.6; // ship type
        } else {
          posArray[index] = source.x + (Math.random() - 0.5) * 0.01;
          posArray[index + 1] = source.y + Math.random() * 0.5;
          posArray[index + 2] = source.z + (Math.random() - 0.5) * 0.01;
          posArray[index + 3] = 0.601; // ship type
        }
      }
      removeComputeCallback("tP", positionCallback);
      dtPosition.needsUpdate = true;

      const rt = gpuCompute.getCurrentRenderTarget(positionVariable);
      // gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[0]);
      gpuCompute.renderTexture(dtPosition, rt);
      dtVelocity.needsUpdate = true;
      const rtv = gpuCompute.getCurrentRenderTarget(velocityVariable);
      gpuCompute.renderTexture(dtVelocity, rtv);

      console.log(
        "Added units",
        slots.length,
        "to",
        targetId,
        "from",
        source,
        endPlace.position,
        `(${dtTarget})`,
        "for",
        owner,
      );
      startPlace.u.troops -= slots.length / 2;
      slots.length = 0;
      unitLaunchInProgress = false;
    };

    const velocityCallback = (buffer: Float32Array) => {
      unitLaunchInProgress = true;
      // console.log("Velocity callback");
      dtVelocity.image.data.set(buffer);
      const velArray = dtVelocity.image.data;
      for (let i = 0; i < velArray.length; i += 4) {
        // Only allow 1/2 of total units per p
        if (unitsFound[owner] + slotsFound >= PARTICLES / 2 - 64) {
          break;
        }
        // Check if the slot is empty
        if (velArray[i + 3] === 0) {
          // Update the slot
          velArray[i] = 0.0;
          velArray[i + 1] = 0.0;
          velArray[i + 2] = 0.0;
          velArray[i + 3] = dtTarget; // target castle id
          slotsFound++;
          slots.push(i);
        }
        if (slotsFound > numberOfShips - 1) {
          break;
        }
      }
      if (slotsFound < Math.floor(numberOfShips)) {
        console.warn(
          `Only ${slotsFound} slots were found and updated. Requested ${numberOfShips}.`,
        );
      }
      removeComputeCallback("tV", velocityCallback);
      addComputeCallback("tP", positionCallback);
    };

    addComputeCallback("tV", velocityCallback);
  }
};

init();
