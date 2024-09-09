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

const DEFAULT_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?";
export interface TextInstance {
  setPosition: (x: number, y: number, z: number) => void;
  updateText: (message: string) => void;
  setScale: (scale: number) => void;
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
  _followingCameraRotation: number[];
  _followingCamera: number[];
  _tempQuat: THREE.Quaternion;
  _dummy: THREE.Object3D;
  _tempQuat2: THREE.Quaternion;
  cameraRotation: number;

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
    // this._messagesTexture.magFilter = THREE.NearestFilter;
    // this._messagesTexture.minFilter = THREE.NearestFilter;
    // this._messagesTexture.wrapS = THREE.ClampToEdgeWrapping;
    // this._messagesTexture.wrapT = THREE.ClampToEdgeWrapping;
    // this._messagesTexture.repeat.set(2, 2);
    // this._messagesTexture.offset.set(5.5, 7.5);
    // this._messagesTexture.generateMipmaps = true;
    // this._messagesTexture.needsUpdate = true;

    this._followingCameraRotation = [];
    this._followingCamera = [];
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
      depthWrite: true,
      "depthTest": false,
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
      if (this._followingCameraRotation.length > 0) {
        for (let i = 0; i < this._followingCameraRotation.length; i++) {
          this._dummies[this._followingCameraRotation[i]].quaternion.copy(this._dummy.quaternion);
          this.updateMatrix(this._followingCameraRotation[i]);
        }
      }
    };
  }

  generateTexture() {
    const canvasSize = 64; // You can adjust this for better resolution.
    const canvas = document.createElement("canvas");
    // document.body.appendChild(canvas);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error();

    const size = { x: 8, y: 8 };
    function draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
      // Use the letters array to draw the text atlas. Truthy value is a filled pixel.
      const letter = letters[text as keyof typeof letters];
      if (!letter) return;
      for (let i = 0; i < letter.length; i++) {
        for (let j = 0; j < letter[i].length; j++) {
          if (letter[i][j]) {
            // White pixel
            ctx.fillStyle = "white";
            ctx.fillRect(x + j, y + i, 1, 1);
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
    followCamera?: boolean,
  ): null | TextInstance {
    const instanceId = this._instanceCount;
    // Check if we've reached the max instance count
    if (this._instanceCount >= this._maxInstances) {
      console.warn(">Max");
      return null;
    }
    this._instanceCount++;
    this.instancedMesh.count = this._instanceCount;
    this._dummies[instanceId] = new THREE.Object3D();
    // Update the data texture
    this.updateMessageTexture(instanceId, message);
    this._instanceBuffer.setX(instanceId, instanceId);
    this._instanceBuffer.needsUpdate = true;
    color && this.setColor(instanceId, color);

    if (followCameraRotation) {
      this._followingCameraRotation.push(instanceId);
    }
    if (followCamera) {
      this._followingCamera.push(instanceId);
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
      setScale: (s: number) => {
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

  setRotation(instanceId: number, x: number, y: number, z: number) {
    this._dummies[instanceId].rotation.set(x, y, z);
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
