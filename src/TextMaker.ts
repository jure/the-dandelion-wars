import * as THREE from "three";
import vertexShader from "./textMaker.vertex.glsl";
import fragmentShader from "./textMaker.fragment.glsl";

const letters = {
  "A": [
    [, 1],
    [1, , 1],
    [1, , 1],
    [1, 1, 1],
    [1, , 1],
  ],
  "B": [
    [1, 1],
    [1, , 1],
    [1, 1],
    [1, , 1],
    [1, 1],
  ],
  "C": [[, 1, 1], [1], [1], [1], [, 1, 1]],
  "D": [
    [1, 1],
    [1, , 1],
    [1, , 1],
    [1, , 1],
    [1, 1],
  ],
  "E": [[1, 1, 1], [1], [1, 1], [1], [1, 1, 1]],
  "F": [[1, 1, 1], [1], [1, 1], [1], [1]],
  "G": [[, 1, 1], [1], [1, , 1, 1], [1, , , 1], [, 1, 1]],
  "H": [
    [1, , 1],
    [1, , 1],
    [1, 1, 1],
    [1, , 1],
    [1, , 1],
  ],
  "I": [
    [1, 1, 1],
    [, 1],
    [, 1],
    [, 1],
    [1, 1, 1],
  ],
  "J": [
    [, , 1],
    [, , 1],
    [, , 1],
    [1, , 1],
    [, 1],
  ],
  "K": [
    [1, , 1],
    [1, , 1],
    [1, 1],
    [1, , 1],
    [1, , 1],
  ],
  "L": [[1], [1], [1], [1], [1, 1, 1]],
  "M": [
    [1, , , 1],
    [1, 1, 1, 1],
    [1, , , 1],
    [1, , , 1],
    [1, , , 1],
  ],
  "N": [
    [1, , , 1],
    [1, 1, , 1],
    [1, , 1, 1],
    [1, , , 1],
    [1, , , 1],
  ],
  "O": [
    [, 1],
    [1, , 1],
    [1, , 1],
    [1, , 1],
    [, 1],
  ],
  "P": [[1, 1], [1, , 1], [1, 1], [1], [1]],
  "Q": [
    [, 1],
    [1, , 1],
    [1, , 1],
    [1, , 1],
    [, 1, , 1],
  ],
  "R": [
    [1, 1],
    [1, , 1],
    [1, 1],
    [1, , 1],
    [1, , 1],
  ],
  "S": [[, 1, 1], [1], [, 1], [, , 1], [1, 1]],
  "T": [
    [1, 1, 1],
    [, 1],
    [, 1],
    [, 1],
    [, 1],
  ],
  "U": [
    [1, , 1],
    [1, , 1],
    [1, , 1],
    [1, , 1],
    [, 1],
  ],
  "V": [
    [1, , 1],
    [1, , 1],
    [1, , 1],
    [1, , 1],
    [, 1],
  ],
  "W": [
    [1, , , 1],
    [1, , , 1],
    [1, , , 1],
    [1, 1, 1, 1],
    [, 1, 1],
  ],
  "X": [
    [1, , 1],
    [1, , 1],
    [, 1],
    [1, , 1],
    [1, , 1],
  ],
  "Y": [
    [1, , 1],
    [1, , 1],
    [, 1],
    [, 1],
    [, 1],
  ],
  "Z": [[1, 1, 1], [, , 1], [, 1], [1], [1, 1, 1]],
  "0": [
    [, 1],
    [1, , 1],
    [1, , 1],
    [1, , 1],
    [, 1],
  ],
  "|": [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ],
  "1": [
    [, 1],
    [1, 1],
    [, 1],
    [, 1],
    [1, 1, 1],
  ],
  "2": [
    [, 1],
    [1, , 1],
    [, , 1],
    [, 1],
    [1, 1, 1],
  ],
  "3": [
    [1, 1],
    [, , 1],
    [, 1, 1],
    [, , 1],
    [1, 1],
  ],
  "4": [
    [1, , 1],
    [1, , 1],
    [1, 1, 1],
    [, , 1],
    [, , 1],
  ],
  "5": [[1, 1, 1], [1], [1, 1], [, , 1], [1, 1]],
  "6": [[, 1, 1], [1], [1, 1, 1], [1, , 1], [, 1]],
  "7": [
    [1, 1, 1],
    [, , 1],
    [, 1],
    [, 1],
    [, 1],
  ],
  "8": [
    [, 1],
    [1, , 1],
    [, 1],
    [1, , 1],
    [, 1],
  ],
  "9": [
    [, 1],
    [1, , 1],
    [, 1, 1],
    [, , 1],
    [, 1],
  ],
};

const DEFAULT_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0|123456789";
export interface TextInstance {
  setPosition: (x: number, y: number, z: number) => void;
  updateText: (message: string) => void;
  setScale: (scale: number) => void;
  remove: () => void;
  instancedMesh: THREE.InstancedMesh;
  instanceId: number;
}

// const {
//   InstancedBufferAttribute,
//   DataTexture,
//   ShaderMaterial,
//   InstancedMesh,
//   PlaneGeometry,
//   RedFormat,
//   Texture,
//   Object3D,
// } = THREE;

export default class TextMaker {
  _texture: THREE.Texture;
  _instanceCount: number;
  _maxInstances: number;
  _maxCharsPerInstance: number;
  _lengthsBuffer: THREE.InstancedBufferAttribute;
  _instanceBuffer: THREE.InstancedBufferAttribute;
  instancedMesh: THREE.InstancedMesh;
  _characters: string;
  _messagesTexture: THREE.DataTexture;
  _data: Uint8Array;
  _dummies: THREE.Object3D[];
  _scales: number[];
  _folCamRot: number[];
  // Array of { instanceId, x, y, z }
  _folCam: Record<string, number>[];
  _tempQuat: THREE.Quaternion;
  _dummy: THREE.Object3D;
  _tempQuat2: THREE.Quaternion;
  cameraRotation: number;
  _pool: number[] = [];

  constructor(characters?: string, maxCharsPerInstance?: number, maxInstances?: number) {
    this._characters = characters || DEFAULT_CHARS;
    this._maxCharsPerInstance = maxCharsPerInstance || 128;
    this._maxInstances = maxInstances || 1024;
    this._texture = this.generateTexture();
    this._dummies = [];
    this._scales = []; // This is an additional uniform scaling factor
    this._instanceCount = 0;
    this._lengthsBuffer = new THREE.InstancedBufferAttribute(
      new Float32Array(this._maxInstances),
      1,
    );
    this._instanceBuffer = new THREE.InstancedBufferAttribute(
      new Float32Array(this._maxInstances),
      1,
    );
    this._maxCharsPerInstance = 128;
    this._data = new Uint8Array(this._maxCharsPerInstance * this._maxInstances);
    this._messagesTexture = new THREE.DataTexture(
      this._data,
      this._maxCharsPerInstance, // width
      this._maxInstances, // height
      THREE.RedFormat,
    );

    this._folCamRot = [];
    this._folCam = [];
    this._dummy = new THREE.Object3D();
    this._tempQuat = new THREE.Quaternion();
    this._tempQuat2 = new THREE.Quaternion();
    this.cameraRotation = 0;

    const textShaderMaterial: THREE.ShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        "t": { value: this._texture },
        "m": { value: this._messagesTexture },
        time: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      // blending: THREE.AdditiveBlending,
      depthWrite: true,
      // alphaTest: 1.0,
      // depthWrite: true,
      // "depthTest": true,
    });

    textShaderMaterial["transparent"] = true;
    textShaderMaterial.side = THREE.DoubleSide;
    textShaderMaterial["vertexColors"] = true;

    // Init the base mesh
    const planeGeometry = new THREE.PlaneGeometry(1, 0.1); // Adjust size as needed.
    // Adding instanced attributes
    planeGeometry.setAttribute("length", this._lengthsBuffer);
    planeGeometry.setAttribute("instance", this._instanceBuffer);

    this.instancedMesh = new THREE.InstancedMesh(
      planeGeometry,
      textShaderMaterial,
      this._maxInstances,
    );
    this.instancedMesh.frustumCulled = false;
    // this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.instancedMesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      camera.matrixWorld.decompose(this._dummy.position, this._dummy.quaternion, this._dummy.scale);
      if (this._folCamRot.length > 0) {
        for (let i = 0; i < this._folCamRot.length; i++) {
          this._dummies[this._folCamRot[i]].quaternion.copy(this._dummy.quaternion);
          this.updateMatrix(this._folCamRot[i]);
        }
      }
      if (this._folCam.length > 0) {
        for (let i = 0; i < this._folCam.length; i++) {
          const offset = new THREE.Vector3(this._folCam[i].x, this._folCam[i].y, this._folCam[i].z);
          offset.applyQuaternion(this._dummy.quaternion);
          // Update position: camera position + offset
          this._dummies[this._folCam[i].instanceId].position.copy(this._dummy.position).add(offset);

          // Update rotation to match the camera
          this._dummies[this._folCam[i].instanceId].quaternion.copy(this._dummy.quaternion);

          // Update the instance matrix
          this.updateMatrix(this._folCam[i].instanceId);
        }
      }
    };
  }

  generateTexture() {
    const canvasSize = 512; // You can adjust this for better resolution.
    const canvas = document.createElement("canvas");
    // document.body.appendChild(canvas);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error();

    const size = { x: 64, y: 64 };
    function draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
      // Use the letters array to draw the text atlas. Truthy value is a filled pixel.
      const letter = letters[text as keyof typeof letters];
      if (!letter) return;
      for (let i = 0; i < letter.length; i++) {
        for (let j = 0; j < letter[i].length; j++) {
          if (letter[i][j]) {
            // We're scaling the letter up 4x

            ctx.fillStyle = "white";
            ctx.fillRect(x + j * 8, y + i * 8 + 5, 8, 8);
          }
        }
      }
    }

    ctx.textAlign = "center";
    for (let i = 0; i < this._characters.length; i++) {
      const x = size.x * (i % 8) + 1;
      const y = size.y * Math.floor(i / 8) + 1;
      draw(ctx, this._characters[i], x, y);
    }

    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
  }

  updateMessageTexture(instanceId: number, message: string) {
    for (let i = 0; i < message.length; i++) {
      const charIndex = this._characters.indexOf(message[i].toUpperCase());
      if (charIndex !== -1) {
        this._data[instanceId * this._maxCharsPerInstance + i] = charIndex;
      }
    }

    this._lengthsBuffer["setX"](instanceId, message.length);
    this._lengthsBuffer.needsUpdate = true;
    // Update scales
    const s = this._scales[instanceId] || 1;
    this.setScale(instanceId, (message.length * s) / 10 / (6 / 6), s, 1);
    // Mark the texture for update on the next render
    this._messagesTexture.needsUpdate = true;
    (this.instancedMesh.material as THREE.ShaderMaterial).uniforms.time.value =
      performance.now() / 1000.0;
    (this.instancedMesh.material as THREE.ShaderMaterial).needsUpdate = true;
  }

  addText(
    message: string,
    color?: THREE.Color,
    followCameraRotation?: boolean,
    followCamera?: [number, number, number],
  ): null | TextInstance {
    let instanceId = this._instanceCount;
    const poolInstance = this._pool.pop();
    if (poolInstance !== undefined) {
      instanceId = poolInstance;
    } else {
      this._instanceCount++;
    }

    // Check if we've reached the max instance count
    if (this._instanceCount >= this._maxInstances) {
      console.warn(">Max");
      return null;
    }

    this.instancedMesh.count = this._instanceCount;
    this._dummies[instanceId] = new THREE.Object3D();
    // Update the data texture
    this.updateMessageTexture(instanceId, message);
    this._instanceBuffer.setX(instanceId, instanceId);
    this._instanceBuffer.needsUpdate = true;
    color && this.setColor(instanceId, color);

    if (followCameraRotation) {
      this._folCamRot.push(instanceId);
    }
    if (followCamera) {
      this._folCam.push({
        instanceId,
        x: followCamera[0],
        y: followCamera[1],
        z: followCamera[2],
      });
    }

    // Return the instanceId for future updates and increment for the next use
    return {
      setPosition: (x: number, y: number, z: number) => {
        this.setPosition(instanceId, x, y, z);
      },
      updateText: (message: string, color?: THREE.Color) => {
        this.updateMessageTexture(instanceId, message);
        color && this.setColor(instanceId, color);
      },
      remove: () => {
        this.updateMessageTexture(instanceId, "");
        this._pool.push(instanceId);
      },
      setScale: (s: number) => {
        this.setScale(instanceId, s, s, s);
        this._scales[instanceId] = s;
      },
      instancedMesh: this.instancedMesh,
      instanceId,
    };
  }
  setColor(instanceId: number, color: THREE.Color) {
    this.instancedMesh["setColorAt"](instanceId, color);
    if (this.instancedMesh["instanceColor"]) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  setScale(instanceId: number, x: number, y: number, z: number) {
    this._dummies[instanceId].scale.set(x, y, z);
    this.updateMatrix(instanceId);
  }

  setPosition(instanceId: number, x: number, y: number, z: number) {
    this._dummies[instanceId].position.set(x, y, z);
    this.updateMatrix(instanceId);
  }

  setRotation(instanceId: number, q: THREE.Quaternion) {
    this._dummies[instanceId].setRotationFromQuaternion(q);
    this.updateMatrix(instanceId);
  }

  private updateMatrix(instanceId: number, matrix?: THREE.Matrix4) {
    if (matrix) {
      this._dummies[instanceId].matrix.copy(matrix);
    } else {
      this._dummies[instanceId].updateMatrix();
    }
    this.instancedMesh.setMatrixAt(instanceId, this._dummies[instanceId].matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
