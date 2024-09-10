import * as THREE from "three";
import XRmanager from "./XRmanager";
import TextMaker, { TextInstance } from "./TextMaker";
import { GPUComputationRenderer, Variable } from "./GPUComputationRenderer";
import computeVelocity from "./shaders/computeVelocity.glsl";
import computePosition from "./shaders/computePosition.glsl";
import computeAggregate from "./shaders/computeAggregate.glsl";
import knightVertex from "./shaders/knight.vertex.glsl";
import knightFragment from "./shaders/knight.fragment.glsl";
import { OrbitControls } from "./OrbitControls";
import { playRandomSoundAtPosition } from "./sounds";
import Music from "./music";
import { createGrass } from "./grass";

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
let places: THREE.Object3D[] = [];
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

// Blowing mechanic
let analyzer: AnalyserNode;
let mic;
const blowingThreshold = 50;

let selectedTarget: THREE.Mesh | null = null;

// const trees: CustomGroup[] = [];
let spheres: THREE.Mesh[] = [];
let grassInstances: THREE.InstancedMesh;
// const difficulty = 0;
// let controllerLock: null | number = null;
let lastRotationTime = 0;
const cameraDirection = new THREE.Vector3();

// const tempDandelieon: THREE.Object3D | null = null;
let pickedUpDandelion: THREE.Object3D | null = null;

// let debugLine: THREE.Line;
// let debugObject: THREE.Object3D | null = null;

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
      } else {
        posArray[k + 0] = 0;
        posArray[k + 1] = 0;
        posArray[k + 2] = 0;
        posArray[k + 3] = 0.1;
        velArray[k + 3] = 1.0;
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

const init = async () => {
  // Create a scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x505050);

  // Add axes helper
  const axesHelper = new THREE.AxesHelper(5);
  axesHelper.position.y = 1.0;
  scene.add(axesHelper);
  // Add debug line
  // debugLine = new THREE.Line();
  // debugLine.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  // scene.add(debugLine);
  // // New cube
  // debugObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  // scene.add(debugObject);

  // Create a camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
  camera.position.set(0, 1.8, -10);

  // Set up audio input
  navigator.mediaDevices
    .getUserMedia({ audio: true, video: false })
    .then(function (stream) {
      const audioContext = new window.AudioContext();
      analyzer = audioContext.createAnalyser();
      mic = audioContext.createMediaStreamSource(stream);
      mic.connect(analyzer);
      analyzer.fftSize = 32;
    })
    .catch(function (err) {
      console.error("Microphone access denied:", err);
    });

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
      // vertices[i + 2] = 1;
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
      // uniform float time;

      // 0x0a2472
      vec3 topColor = vec3(0.039, 0.141, 0.447);
      // 0x0077be
      vec3 middleColor = vec3(0.0, 0.467, 0.745);
      // 0x87ceeb
      vec3 bottomColor = vec3(0.529, 0.807, 0.922);

      float h = normalize(vWorldPosition).y;
      if (h > 0.0) {
          // Top half: interpolate between middleColor and topColor
          diffuseColor.rgb = mix(middleColor, topColor, smoothstep(0.0, 1.0, h));
      } else {
          // Bottom half: interpolate between bottomColor and middleColor
          diffuseColor.rgb = mix(bottomColor, middleColor, smoothstep(-1.0, 0.0, h));
      }

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
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
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

  initComputeRenderer();

  function createSeedGeometry(scale = 0.3) {
    const points = [];

    points.push(new THREE.Vector2(0, 0)); // Bottom of the seed
    points.push(new THREE.Vector2(0.1, 0));
    points.push(new THREE.Vector2(0.05, 0.2)); // Top of the seed
    points.push(new THREE.Vector2(0.05, 0.6)); // Tip of the seed
    points.push(new THREE.Vector2(0.5, 0.7)); // Top of the tuft

    // Scale points
    points.forEach((point) => {
      point.multiplyScalar(scale);
    });

    const seedGeometry = new THREE.LatheGeometry(points, 4);
    seedGeometry.computeVertexNormals();
    return seedGeometry;
  }

  function createDandelion() {
    const dandelionGroup = new THREE.Group();

    // Create the stem
    const stemGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 3);
    const stemMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = -1.0;
    dandelionGroup.add(stem);

    // Create the flower head, using a lathe geometry
    const flowerPoints = [];
    flowerPoints.push(new THREE.Vector2(0, 0)); // Bottom of the flower
    flowerPoints.push(new THREE.Vector2(0.2, 0.1)); // Slightly wider bottom
    flowerPoints.push(new THREE.Vector2(0.0, 0.2)); // Top of the flower

    const flowerGeometry = new THREE.LatheGeometry(flowerPoints, 6);
    const flowerMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00, flatShading: true });
    const flowerHead = new THREE.Mesh(flowerGeometry, flowerMaterial);
    flowerHead.position.y = 0.0;
    dandelionGroup.add(flowerHead);

    const seedGeometry = createSeedGeometry();
    // Create instanced mesh for seeds
    const seedsMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      emissive: 0xaaaaaa,
      // wireframe: true,
    });
    const rand = 6; // Math.ceil(Math.random() * 30) + 1;
    dandelionGroup.userData.seeds = rand;

    // Add a debug seed with normal mesh
    // const seed = new THREE.Mesh(seedGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    // seed.up = new THREE.Vector3(0, 0, 1);
    // seed.lookAt(0, 0, 200);
    // scene.add(seed);
    const instancedSeeds = new THREE.InstancedMesh(seedGeometry, seedsMaterial, rand);
    dandelionGroup.add(instancedSeeds);

    // Position and orient seeds
    const seedPositions = fibonacciSphere(rand, 0.2);
    const dummy = new THREE.Object3D();

    // const realCenter = new THREE.Vector3()
    //   .add(flowerHead.position)
    //   .add(new THREE.Vector3(0, 0.1, 0));
    seedPositions.forEach((position, index) => {
      dummy.position.copy(position); // .add(realCenter);
      // Calculate direction from origin to seed position
      const direction = position.clone().normalize();

      // Create a quaternion to rotate from (0, 1, 0) to the direction vector
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      );

      dummy.setRotationFromQuaternion(quaternion);

      dummy.updateMatrix();

      instancedSeeds.setMatrixAt(index, dummy.matrix);
    });

    instancedSeeds.instanceMatrix.needsUpdate = true;
    dandelionGroup.userData.instancedSeeds = instancedSeeds;
    // Add invisible sphere for raycasting
    const capsuleGeometry = new THREE.CapsuleGeometry(0.5, 1.5, 16, 16);
    const capsuleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      visible: false,
      transparent: true,
      opacity: 0.5,
    });
    const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
    capsule.position.y = -0.5;
    dandelionGroup.add(capsule);

    // Scale the dandelion
    // dandelionGroup.scale.set(0.3, 0.3, 0.3);
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

  function scatterDandelions(count: number, radius = 5) {
    for (let i = 0; i < count; i++) {
      const dandelion = createDandelion();
      const x = Math.random() * 2 * radius - radius;
      const z = Math.random() * 2 * radius - radius;
      const y = getTerrainHeight(x, z) + 2.0;
      dandelion.position.set(x, y, z);
      console.log("dandelion", dandelion.position);
      dandelions.push(dandelion);
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

  scatterDandelions(20); // Scatter 20 dandelions

  initKnights();

  textMaker = new TextMaker();
  scene.add(textMaker.instancedMesh);
  const text1 = textMaker.addText("Hello1", new THREE.Color(0xffffff), true, true);

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

  textMaker = new TextMaker();
  scene.add(textMaker.instancedMesh);

  const xrSupport = await navigator.xr?.isSessionSupported("immersive-vr");
  const text = xrSupport ? "Play in VR" : `Play`;

  // Update the pointing ray
  // Update function to detect sphere pointing
  // function updatePointing() {
  //   if (!controllers[0]) return [];
  //   let intersects = [];
  //   if (controllerLock === null) {
  //     intersects = [...intersectsFromController(0), ...intersectsFromController(1)];
  //   } else {
  //     intersects = intersectsFromController(controllerLock);
  //   }
  //   handlePointingMoving(intersects);
  // }

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

  // function handlePointingMoving(intersects: THREE.Intersection[], event?: MouseEvent) {
  //   if (intersects.length > 0) {
  //     event?.preventDefault();
  //     const index = placeSpheres.indexOf(intersects[0].object);
  //     console.log("index", index);
  //     const place = places[index] as CustomGroup;
  //     if (place) {
  //       // Select color
  //       setSelected(place, true);
  //     }
  //     if (startPlace && place !== startPlace) {
  //       // End select color
  //       setSelected(place, true);
  //       // stretchLineBetweenPoints(line, startPlace, place);
  //     }
  //     if (endPlace !== place) {
  //       // Reset color
  //       if (endPlace && endPlace !== startPlace) {
  //         setSelected(endPlace, false);
  //       }
  //       endPlace = place;
  //     }
  //   } else {
  //     // hide the line
  //     // line.visible = false;
  //     if (endPlace && endPlace !== startPlace) {
  //       setSelected(endPlace, false);
  //     }
  //     // console.log("no start intersect");
  //   }
  // }

  function handleClickOrTriggerStart(
    intersects: THREE.Intersection[],
    event?: MouseEvent | TouchEvent,
  ) {
    console.log(event, intersects);
    if (intersects.length > 0) {
      event?.preventDefault();
      const dandelion = intersects[0].object;
      if (dandelion.parent && dandelion.parent === pickedUpDandelion && selectedTarget) {
        // Temp targeting logic
        console.log("Firing dandelion");
        blowDandelion(dandelion.parent, selectedTarget);
      } else if (dandelion.parent) {
        console.log("Clicked dandelion", dandelion);
        pickUpDandelion(dandelion);
      }
    }
  }

  function handleClickOrTriggerEnd(
    intersects: THREE.Intersection[],
    event?: MouseEvent | TouchEvent,
  ) {
    if (intersects.length > 0) {
      endPlace = places[placeSpheres.indexOf(intersects[0].object)] as CustomGroup;
      if (startPlace && endPlace !== startPlace) {
        console.log("startPlace attacks:", startPlace, "endPlace", endPlace);
        // sendFleetFromPlaceToPlace(startPlace, endPlace);
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
    // line.visible = false;
  }

  function setSelected(place: CustomGroup, selected: boolean) {
    console.log(place.id, "selected", selected);
    place.u.shader.uniforms.selected.value = selected ? 1 : 0;
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
        // if (place) {
        //   playRandomSoundAtPosition(shipOwner, place.position, positionalPool);
        // }

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
    // const planetOwners = places.map((place) => place.u.owner);
    // const pWon = planetOwners.every((owner) => [null, "p"].includes(owner)) && unitsFound.e === 0;
    // const eWon = planetOwners.every((owner) => [null, "e"].includes(owner)) && unitsFound.p === 0;
    // let gameOverText;
    // if (pWon) {
    //   gameOverText = "Victory!";
    // } else if (eWon) {
    //   gameOverText = "You lose. Darkness has fallen.";
    // }
    // if (gameOverText) {
    // gameStarted = false;
    // if (renderer.xr["isPresenting"]) {
    // xrManager.endSession();
    // adjustAspect();
    // }
    // document.getElementById("p")!.innerHTML = gameOverText;
    // togglePauseScreen();
    // }
  }

  // This we need to do every frame
  addComputeCallback("tA", (buffer) => {
    checkForParticleArrivals(buffer);
    // updateTroops();
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

    (grassInstances.material as THREE.ShaderMaterial).uniforms.time.value =
      performance.now() / 1000;

    if (pickedUpDandelion) {
      selectedTarget = targeting();
    }
    if (analyzer && pickedUpDandelion) {
      const dataArray = new Uint8Array(analyzer.fftSize);
      analyzer.getByteTimeDomainData(dataArray);
      const volume = Math.max(...dataArray) - 128;

      if (volume > blowingThreshold && selectedTarget) {
        text1?.updateText("Blew!");

        // Blow dandelion
        blowDandelion(pickedUpDandelion, selectedTarget);
      }
    }

    moveSpheres();

    handleControllers();
    if (gameStarted) {
      updateEnemyPositionsInTexture();
      lastGenerationTime = lastGenerationTime || Date.now();
      gpuCompute.compute(computeCallbacks);

      const tP = gpuCompute.getCurrentRenderTarget(positionVariable)["texture"];
      const tV = gpuCompute.getCurrentRenderTarget(velocityVariable)["texture"];

      knightUniforms["tP"].value = tP;
      knightUniforms["tV"].value = tV;

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

    handleClickOrTriggerStart(intersects, event);
  }

  function onPointerUp(event: PointerEvent) {
    if (!isDragging) return;

    const position = getPointerPosition(event);
    mouse.x = (position.x / window.innerWidth) * 2 - 1;
    mouse.y = -(position.y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(dandelions);

    handleClickOrTriggerEnd(intersects, event);
  }

  function pickUpDandelion(dandelion: THREE.Object3D, controllerIndex?: number) {
    // Add dandelion to the controller
    if (dandelion.parent) {
      if (controllerIndex !== undefined) {
        // in VR
        controllers[controllerIndex].add(dandelion.parent);
        dandelion.parent.position.set(0, -0.5, -0.1);
      }
      // With a mouse, we want to move the dandelion to the center of the screen, at a fixed distance
      else {
        const center = new THREE.Vector3(0, 2, 0);
        // center.applyQuaternion(camera.quaternion);
        // center.add(camera.position);
        dandelion.parent.position.copy(center);
        // scene.add(dandelion.parent);
      }
      pickedUpDandelion = dandelion.parent;
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
    if (intersects.length > 0) {
      pickUpDandelion(intersects[0].object, i);
    }

    // controllerLock = i;
  }

  function onSelectEnd(i: number) {
    console.log("select end", startPlace, intersectedPlace);
    endPlace = intersectedPlace;
    const intersects = intersectsFromController(i);
    handleClickOrTriggerEnd(intersects);

    // controllerLock = null;
  }

  async function startGame() {
    // difficulty = parseInt((document.getElementById("d")! as HTMLInputElement).value);
    // (velocityVariable.material as any).uniforms.d.value = difficulty;
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
    });
    (window as any).scene = scene;

    // Simple AI sends attacks high priority targets and low resistance targets
    // setTimeout(doAI, Math.random() * 5000 - difficulty * 1000);
  }

  // function doAI() {
  //   // Random e owned castle
  //   const eCastles = places.filter((p) => p.u.owner === "e");
  //   const otherCastles = places.filter((p) => !eCastles.includes(p));
  //   // const pCastles = places.filter((p) => p.u.owner === "p");

  //   // Sort by a combination of size and troops, giving priority to larger places with fewer troops.
  //   const highValueTargets = otherCastles.sort(
  //     (a, b) => b.u.size / (b.u.troops + 1) - a.u.size / (a.u.troops + 1),
  //   );
  //   const startPlace = eCastles[Math.floor(Math.random() * eCastles.length)];
  //   // Prioritize attacking places based priority, but attack random ones based on level
  //   const randomness = Math.random() < difficulty / 3;
  //   const endPlace = randomness
  //     ? highValueTargets[0]
  //     : otherCastles[Math.floor(Math.random() * otherCastles.length)];

  //   if (startPlace && endPlace && startPlace !== endPlace) {
  //     sendFleetFromPlaceToPlace(startPlace, endPlace);
  //   }
  //   setTimeout(doAI, aiDelay());
  // }

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

  function createSphere() {
    const geometry = new THREE.SphereGeometry(0.5, 3, 4);
    const material = new THREE.MeshPhongMaterial({
      color: Math.random() * 0xffffff,
      flatShading: true,
    });
    const sphere = new THREE.Mesh(geometry, material);

    const angle = Math.random() * Math.PI * 2;
    const radius = 25;
    sphere.position.set(
      Math.cos(angle) * radius,
      -5, // Start below the ground
      Math.sin(angle) * radius,
    );

    const text = textMaker.addText("Spheddsdre", new THREE.Color(0x000000ff), true, true);

    sphere.userData.text = text;
    scene.add(sphere);
    spheres.push(sphere);
    places.push(sphere);
  }

  function moveSpheres() {
    if (Math.random() < 0.02 && spheres.length < 20) createSphere();

    spheres.forEach((sphere) => {
      // Update text
      const text = sphere.userData.text as TextInstance;
      // text.updateText(sphere.position.x.toFixed(2) + ", " + sphere.position.z.toFixed(2));
      text.setPosition(sphere.position.x, sphere.position.y + 1, sphere.position.z);

      // Rise slowly
      if (sphere.position.y < 10) {
        sphere.position.y += (10 - sphere.position.y) * 0.01;
      }

      if (Math.random() < 0.01) {
        // addUnitsToTexture(10, sphere, places[0], "e");
      }

      // Move towards center
      const directionToCenter = new THREE.Vector3()
        .subVectors(new THREE.Vector3(0, sphere.position.y, 0), sphere.position)
        .normalize();
      sphere.position.add(directionToCenter.multiplyScalar(0.01));

      // Remove if too close to center
      if (new THREE.Vector2(sphere.position.x, sphere.position.z).length() < 0.5) {
        scene.remove(sphere);
        spheres = spheres.filter((s) => s !== sphere);
        places = places.filter((p) => p !== sphere);
      }
    });
  }
  // function changePlaces() {
  //   const dtPosition = gpuCompute.createTexture();
  //   const dtVelocity = gpuCompute.createTexture();

  //   fillTextures(dtPosition, dtVelocity);
  //   const rt = gpuCompute.getCurrentRenderTarget(positionVariable);
  //   // gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[0]);
  //   gpuCompute.renderTexture(dtPosition, rt);
  //   dtVelocity.needsUpdate = true;
  //   const rtv = gpuCompute.getCurrentRenderTarget(velocityVariable);
  //   gpuCompute.renderTexture(dtVelocity, rtv);
  // }

  type Unit = Record<string, THREE.Vector3>;

  // This takes the number of seeds of a picked dandelion, and adds them to the data texture
  function blowDandelion(dandelion: THREE.Object3D, target: THREE.Object3D) {
    const dummy = new THREE.Object3D();
    const dummyVec = new THREE.Vector3();
    const dummyMat4 = new THREE.Matrix4();
    const positions: Unit[] = [];
    for (let i = 0; i < dandelion.userData.seeds; i++) {
      dummy.parent = dandelion;
      dandelion.userData.instancedSeeds.getMatrixAt(i, dummyMat4);
      dummy.matrix.copy(dummyMat4);
      dummy.matrixAutoUpdate = false;
      // dummy.updateMatrixWorld(true);
      dummy.getWorldPosition(dummyVec);
      dummy.position.setFromMatrixPosition(dummy.matrix);
      const thing = {
        pos: dummyVec.clone(),
        rot: dummyVec, // temp
      };
      dummy.getWorldDirection(dummyVec);
      // const webglDirection = new THREE.Vector3(dummyVec.x, dummyVec.y, dummyVec.z);
      const webglDirection = new THREE.Vector3(
        dummy.position.x,
        dummy.position.y,
        dummy.position.z,
      );
      webglDirection.normalize().multiplyScalar(10.0);
      // But
      // dummyVec.multiplyScalar(0.1);

      thing.rot = webglDirection;
      positions.push(thing);
    }
    addUnitsWithPositionsToTexture(positions, dandelion, target, "p");

    // Move it somewhere far below
    dandelion.position.y = -100;
    dandelion.userData.instancedSeeds.count = 0;
    dandelion.userData.seeds = 0;
  }

  function targeting() {
    let target: THREE.Mesh | null = null;
    if (pickedUpDandelion) {
      // Find the target by taking the closest place in the
      // direction from the camera to the dandelion
      let tCamera = camera;
      if (renderer.xr.isPresenting) {
        tCamera = renderer.xr.getCamera() as THREE.PerspectiveCamera;
        // text1?.updateText(tCamera.position.toArray().join(", "));
      }
      // Debug dummy
      // tCamera = new THREE.PerspectiveCamera();
      // tCamera.position.set(
      //   Math.cos(performance.now() / 200.0),
      //   Math.sin(performance.now() / 100.0),
      //   -2,
      // );
      // debugObject!.position.copy(tCamera.position);

      const direction = new THREE.Vector3()
        .subVectors(pickedUpDandelion.position, tCamera.position)
        .normalize();

      // Add some randomness to the direction
      // direction.x += (Math.random() - 0.5) * 0.2;
      // direction.y += (Math.random() - 0.5) * 0.2;
      // direction.z += (Math.random() - 0.5) * 0.2;

      const raycaster = new THREE.Raycaster(pickedUpDandelion.position, direction);

      let minDist = 1000;
      spheres.forEach((sphere) => {
        // spheres are enemy ships
        const distance = raycaster.ray.distanceToPoint(sphere.position);
        const normalizedDistance = Math.min(distance / 15, 1); // Normalize to [0, 1]

        const text = sphere.userData.text as TextInstance;
        text.updateText(distance.toFixed(2));

        if (distance < minDist) {
          minDist = distance;
          target = sphere;
        }
        (sphere.material as THREE.MeshBasicMaterial).color.setRGB(
          1 - normalizedDistance,
          normalizedDistance,
          0,
        );
      });

      if (target) {
        (target as THREE.Mesh).userData.text.updateText("Target");
      }

      direction.multiplyScalar(1000);
      const vec = pickedUpDandelion.position.clone().add(direction);

      // debugLine.geometry["setFromPoints"]([pickedUpDandelion.position, vec]);

      // debugLine.visible = true;

      if (target !== null) {
        // Draw a line from the dandelion to the target
        // console.log(minDist, target);

        return target;
      }
    }
    return null;
  }

  // function sendFleetFromPlaceToPlace(startPlace: CustomGroup, endPlace: CustomGroup) {
  //   addUnitsToTexture(startPlace.u.troops / 2, startPlace, endPlace, startPlace.u.owner);
  // }

  function updateEnemyPositionsInTexture() {
    const dtPosition = gpuCompute.createTexture();
    const positionCallback = (buffer: Float32Array) => {
      // console.log("Position callback");
      dtPosition.image.data.set(buffer);
      const posArray = dtPosition.image.data;
      for (let i = 0; i < places.length; i++) {
        const index = i * 4;
        posArray[index] = places[i].position.x;
        posArray[index + 1] = places[i].position.y;
        posArray[index + 2] = places[i].position.z;
        posArray[index + 3] = 0.1; // enemy flying "castle"
      }
      removeComputeCallback("tP", positionCallback);
      const rt = gpuCompute.getCurrentRenderTarget(positionVariable);
      gpuCompute.renderTexture(dtPosition, rt);
      dtPosition.needsUpdate = true;
    };
    addComputeCallback("tP", positionCallback);
  }

  function addUnitsWithPositionsToTexture(
    units: Unit[],
    startPlace: THREE.Object3D,
    endPlace: THREE.Object3D,
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
        // console.log("Adding unit", units[i].pos);
        if (owner === "p") {
          posArray[index] = units[i].pos.x;
          posArray[index + 1] = units[i].pos.y;
          posArray[index + 2] = units[i].pos.z;
          posArray[index + 3] = 0.6; // ship type
        } else {
          posArray[index] = units[i].pos.x;
          posArray[index + 1] = units[i].pos.y;
          posArray[index + 2] = units[i].pos.z;
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
      // startPlace.u.troops -= slots.length / 2;
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
          velArray[i] = units[slotsFound].rot.x;
          velArray[i + 1] = units[slotsFound].rot.y;
          velArray[i + 2] = units[slotsFound].rot.z;
          velArray[i + 3] = dtTarget; // target castle id
          slotsFound++;
          slots.push(i);
        }
        if (slotsFound > units.length - 1) {
          break;
        }
      }
      if (slotsFound < Math.floor(units.length)) {
        console.warn(`Only ${slotsFound} slots were found and updated. Requested ${units.length}.`);
      }
      removeComputeCallback("tV", velocityCallback);
      addComputeCallback("tP", positionCallback);
    };

    addComputeCallback("tV", velocityCallback);
  }
};

init();
