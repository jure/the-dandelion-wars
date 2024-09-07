// From https://github.com/mrdoob/three.js/blob/dev/examples/jsm/misc/GPUComputationRenderer.js
// MIT license (Three.js authors): https://github.com/mrdoob/three.js/blob/dev/LICENSE
// And TypeScriptified with help from https://github.com/three-types/three-ts-types/blob/master/types/three/examples/jsm/misc/GPUComputationRenderer.d.ts
// Adapted specifically for this project
import * as THREE from "three";
/**
 * GPUComputationRenderer, based on SimulationRenderer by zz85
 *
 * @param {int} sizeX Computation problem size is always 2d: sizeX * sizeY elements.
 * @param {int} sizeY Computation problem size is always 2d: sizeX * sizeY elements.
 * @param {WebGLRenderer} renderer The renderer
 */

export interface Variable {
  name: string;
  initialValueTexture: any;
  material: typeof THREE.ShaderMaterial;
  dependencies: Variable[];
  renderTargets: THREE.WebGLRenderTarget[];
  wrapS: number;
  wrapT: number;
  minFilter: number;
  magFilter: number;
  buffer?: Float32Array;
}

export class GPUComputationRenderer {
  _variables: any[];
  _currentTextureIndex: number;
  // setDataType: (type: typeof FloatType) => this;
  addVariable: (
    variableName: string,
    computeFragmentShader: string,
    initialValueTexture: THREE.Texture,
    buffer?: Float32Array,
  ) => Variable;
  setVariableDependencies: (variable: Variable, dependencies: Variable[] | null) => void;
  init: () => null | string;
  createRenderTarget: (
    sizeXTexture: number,
    sizeYTexture: number,
    wrapS: THREE.Wrapping,
    wrapT: number,
    minFilter: THREE.MinificationTextureFilter,
    magFilter: THREE.MagnificationTextureFilter,
  ) => /**
   * GPUComputationRenderer, based on SimulationRenderer by zz85
   *
   * The GPUComputationRenderer uses the concept of variables. These variables are RGBA float textures that hold 4 floats
   * for each compute element (texel)
   *
   * Each variable has a fragment shader that defines the computation made to obtain the variable in question.
   * You can use as many variables you need, and make dependencies so you can use textures of other variables in the shader
   * (the sampler uniforms are added automatically) Most of the variables will need themselves as dependency.
   *
   * The renderer has actually two render targets per variable, to make ping-pong. Textures from the current frame are used
   * as inputs to render the textures of the next frame.
   *
   * The render targets of the variables can be used as input textures for your visualization shaders.
   *
   * Variable names should be valid identifiers and should not collide with T GLSL used identifiers.
   * a common approach could be to use 'texture' prefixing the variable name; i.e texturePosition, textureVelocity...
   *
   * The size of the computation (sizeX * sizeY) is defined as 'resolution' automatically in the shader. For example:
   * #DEFINE resolution vec2( 1024.0, 1024.0 )
   *
   * -------------
   *
   * Basic use:
   *
   * // Initialization...
   *
   * // Create computation renderer
   * const gpuCompute = new GPUComputationRenderer( 1024, 1024, renderer );
   *
   * // Create initial state float textures
   * const pos0 = gpuCompute.createTexture();
   * const vel0 = gpuCompute.createTexture();
   * // and fill in here the texture data...
   *
   * // Add texture variables
   * const velVar = gpuCompute.addVariable( "textureVelocity", fragmentShaderVel, pos0 );
   * const posVar = gpuCompute.addVariable( "texturePosition", fragmentShaderPos, vel0 );
   *
   * // Add variable dependencies
   * gpuCompute.setVariableDependencies( velVar, [ velVar, posVar ] );
   * gpuCompute.setVariableDependencies( posVar, [ velVar, posVar ] );
   *
   * // Add custom uniforms
   * velVar.material.uniforms.time = { value: 0.0 };
   *
   * // Check for completeness
   * const error = gpuCompute.init();
   * if ( error !== null ) {
   *		console.error( error );
   * }
   *
   *
   * // In each frame...
   *
   * // Compute!
   * gpuCompute.compute();
   *
   * // Update texture uniforms in your visualization materials with the gpu renderer output
   * myMaterial.uniforms.myTexture.value = gpuCompute.getCurrentRenderTarget( posVar ).texture;
   *
   * // Do your rendering
   * renderer.render( myScene, myCamera );
   *
   * -------------
   *
   * Also, you can use utility functions to create ShaderMaterial and perform computations (rendering between textures)
   * Note that the shaders can have multiple input textures.
   *
   * const myFilter1 = gpuCompute.createShaderMaterial( myFilterFragmentShader1, { theTexture: { value: null } } );
   * const myFilter2 = gpuCompute.createShaderMaterial( myFilterFragmentShader2, { theTexture: { value: null } } );
   *
   * const inputTexture = gpuCompute.createTexture();
   *
   * // Fill in here inputTexture...
   *
   * myFilter1.uniforms.theTexture.value = inputTexture;
   *
   * const myRenderTarget = gpuCompute.createRenderTarget();
   * myFilter2.uniforms.theTexture.value = myRenderTarget.texture;
   *
   * const outputRenderTarget = gpuCompute.createRenderTarget();
   *
   * // Now use the output texture where you want:
   * myMaterial.uniforms.map.value = outputRenderTarget.texture;
   *
   * // And compute each frame, before rendering to screen:
   * gpuCompute.doRenderTarget( myFilter1, myRenderTarget );
   * gpuCompute.doRenderTarget( myFilter2, outputRenderTarget );
   *
   *
   *
   * @param {int} sizeX Computation problem size is always 2d: sizeX * sizeY elements.
   * @param {int} sizeY Computation problem size is always 2d: sizeX * sizeY elements.
   * @param {WebGLRenderer} renderer The renderer
   */
  THREE.WebGLRenderTarget;
  createTexture: () => THREE.DataTexture;
  renderTexture: (input: THREE.Texture, output: THREE.WebGLRenderTarget) => void;
  _doRenderTarget: (
    material: THREE.Material,
    output: THREE.WebGLRenderTarget,
    buffer?: Float32Array,
    callback?: ((buffer: Float32Array) => void)[],
  ) => void;
  compute: (callbacks: { [key: string]: ((buffer: Float32Array) => void)[] }) => void;
  getCurrentRenderTarget: (variable: Variable) => THREE.WebGLRenderTarget;
  // getAlternateRenderTarget: (variable: Variable) => THREE.WebGLRenderTarget;
  _addResolutionDefine: (materialShader: THREE.ShaderMaterial) => void;
  _readPixelsAsync: (buffer: Float32Array) => Promise<Float32Array | undefined>;

  constructor(sizeX: number, sizeY: number, renderer: THREE.WebGLRenderer) {
    this._variables = [];

    this._currentTextureIndex = 0;

    const dataType = THREE.FloatType;

    const scene = new THREE.Scene();

    const camera = new THREE.Camera();
    camera.position.z = 1;

    const passThruUniforms = {
      passThruTexture: { value: null },
    };

    const passThruShader = createShaderMaterial(getPassThroughFragmentShader(), passThruUniforms);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), passThruShader);
    scene.add(mesh);

    // this.setDataType = function (type: typeof FloatType) {
    //   dataType = type;
    //   return this;
    // };

    this.addVariable = function (
      variableName: string,
      computeFragmentShader: string,
      initialValueTexture: THREE.Texture,
      buffer?: Float32Array,
    ): Variable {
      const material = createShaderMaterial(computeFragmentShader);

      const variable = {
        "name": variableName,
        "initialValueTexture": initialValueTexture,
        "material": material,
        "dependencies": null,
        "renderTargets": [],
        "wrapS": null,
        "wrapT": null,
        "minFilter": THREE.NearestFilter,
        "magFilter": THREE.NearestFilter,
        "buffer": buffer,
      };

      this._variables.push(variable);

      return variable as any;
    };

    this.setVariableDependencies = function (
      variable: Variable,
      dependencies: Variable[] | null,
    ): void {
      // console.log("Setting dependencies", variable, dependencies);
      variable.dependencies = dependencies as any;
    };

    this.init = function (): null | string {
      if (
        renderer.capabilities["isWebGL2"] === false &&
        renderer.extensions.has("OES_texture_float") === false
      ) {
        return "!OES_texture_float";
      }

      if (renderer.capabilities["maxVertexTextures"] === 0) {
        return "!vertexShaderTex";
      }

      for (let i = 0; i < this._variables.length; i++) {
        const variable = this._variables[i];

        // Creates rendertargets and initialize them with input texture
        variable.renderTargets[0] = this.createRenderTarget(
          sizeX,
          sizeY,
          variable.wrapS,
          variable.wrapT,
          variable.minFilter,
          variable.magFilter,
        );
        variable.renderTargets[1] = this.createRenderTarget(
          sizeX,
          sizeY,
          variable.wrapS,
          variable.wrapT,
          variable.minFilter,
          variable.magFilter,
        );
        this.renderTexture(variable.initialValueTexture, variable.renderTargets[0]);
        this.renderTexture(variable.initialValueTexture, variable.renderTargets[1]);
        // console.log("Initial variable value", variable.name, variable.initialValueTexture);

        // Adds dependencies uniforms to the ShaderMaterial
        const material = variable.material;
        const uniforms = material.uniforms;

        if (variable.dependencies !== null) {
          for (let d = 0; d < variable.dependencies.length; d++) {
            const depVar = variable.dependencies[d];

            if (depVar.name !== variable.name) {
              // Checks if variable exists
              let found = false;

              for (let j = 0; j < this._variables.length; j++) {
                if (depVar.name === this._variables[j].name) {
                  found = true;
                  break;
                }
              }

              if (!found) {
                return "!var=" + variable.name + ", dep=" + depVar.name;
              }
            }

            uniforms[depVar.name] = { value: null };
            // console.log("Initial uniforms", uniforms);
            // console.log(variable.renderTargets);
            material.fragmentShader =
              "\nuniform sampler2D " + depVar.name + ";\n" + material.fragmentShader;
          }
        }
      }

      this._currentTextureIndex = 0;

      return null;
    };

    this.compute = function (callbacks?: { [key: string]: ((buffer: Float32Array) => void)[] }) {
      const currentTextureIndex = this._currentTextureIndex;
      const nextTextureIndex = this._currentTextureIndex === 0 ? 1 : 0;

      for (let i = 0, il = this._variables.length; i < il; i++) {
        const variable = this._variables[i];

        // Sets texture dependencies uniforms
        if (variable.dependencies !== null) {
          const uniforms = variable.material.uniforms;

          for (let d = 0, dl = variable.dependencies.length; d < dl; d++) {
            const depVar = variable.dependencies[d];

            uniforms[depVar.name].value = depVar.renderTargets[currentTextureIndex].texture;
          }
          // console.log("Uniforms", uniforms);
        }

        // Performs the computation for this variable
        // console.log("Rendering variable", variable.name);
        if (variable.buffer && callbacks && callbacks[variable.name]) {
          this._doRenderTarget(
            variable.material,
            variable.renderTargets[nextTextureIndex],
            variable.buffer,
            callbacks[variable.name],
          );
        } else {
          this._doRenderTarget(variable.material, variable.renderTargets[nextTextureIndex]);
        }
      }

      this._currentTextureIndex = nextTextureIndex;
    };

    this.getCurrentRenderTarget = function (variable: Variable): THREE.WebGLRenderTarget {
      return variable.renderTargets[this._currentTextureIndex];
    };

    // this.getAlternateRenderTarget = function (variable: Variable): THREE.WebGLRenderTarget {
    //   return variable.renderTargets[this._currentTextureIndex === 0 ? 1 : 0];
    // };

    function addResolutionDefine(materialShader: THREE.ShaderMaterial) {
      materialShader.defines.resolution =
        "vec2( " + sizeX.toFixed(1) + ", " + sizeY.toFixed(1) + " )";
    }

    this._addResolutionDefine = addResolutionDefine;

    // The following functions can be used to compute things manually

    function createShaderMaterial(computeFragmentShader: string, uniforms?: any) {
      uniforms = uniforms || {};

      const material = new THREE.ShaderMaterial({
        name: "GPUComputationShader",
        uniforms: uniforms,
        vertexShader: getPassThroughVertexShader(),
        "fragmentShader": computeFragmentShader,
      });

      addResolutionDefine(material);

      return material;
    }

    this.createRenderTarget = function (
      sizeXTexture: number,
      sizeYTexture: number,
      wrapS: THREE.Wrapping,
      wrapT: number,
      minFilter: THREE.MinificationTextureFilter,
      magFilter: THREE.MagnificationTextureFilter,
    ): THREE.WebGLRenderTarget {
      sizeXTexture = sizeXTexture || sizeX;
      sizeYTexture = sizeYTexture || sizeY;

      wrapS = wrapS || THREE.ClampToEdgeWrapping;
      wrapT = wrapT || THREE.ClampToEdgeWrapping;

      minFilter = minFilter || THREE.NearestFilter;
      magFilter = magFilter || THREE.NearestFilter;

      const renderTarget = new THREE.WebGLRenderTarget(sizeXTexture, sizeYTexture, {
        "wrapS": wrapS,
        "wrapT": wrapT as any,
        "minFilter": minFilter,
        "magFilter": magFilter,
        "format": THREE.RGBAFormat,
        "type": dataType,
        "depthBuffer": false,
      });
      // console.log(
      //   "Creating render target",
      //   sizeXTexture,
      //   sizeYTexture,
      //   wrapS,
      //   wrapT,
      //   minFilter,
      //   magFilter,
      //   renderTarget,
      // );

      return renderTarget;
    };

    this.createTexture = function (): THREE.DataTexture {
      const data = new Float32Array(sizeX * sizeY * 4);
      const texture = new THREE.DataTexture(data, sizeX, sizeY, THREE.RGBAFormat, THREE.FloatType);
      texture.needsUpdate = true;
      return texture;
    };

    this.renderTexture = function (input: THREE.Texture, output: THREE.WebGLRenderTarget): void {
      // Takes a texture, and render out in rendertarget
      // input = Texture
      // output = RenderTarget

      passThruUniforms["passThruTexture"].value = input as any;

      this._doRenderTarget(passThruShader, output);

      passThruUniforms.passThruTexture.value = null;
    };

    this._doRenderTarget = function (
      material: THREE.Material,
      output: THREE.WebGLRenderTarget,
      buffer?: Float32Array,
      callbacks?: ((buffer: Float32Array) => void)[],
    ): void {
      const currentRenderTarget = renderer["getRenderTarget"]();

      const currentXrEnabled = renderer["xr"]["enabled"];
      // const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

      renderer.xr.enabled = false; // Avoid camera modification
      // renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
      mesh.material = material as any;
      renderer["setRenderTarget"](output);
      renderer["render"](scene, camera);
      // console.log(
      //   "Rendering to",
      //   output,
      //   buffer,
      //   callbacks,
      //   currentRenderTarget,
      //   currentXrEnabled,
      //   material,
      // );
      if (buffer && callbacks?.length) {
        this._readPixelsAsync(buffer).then(() => {
          for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](buffer);
          }
        });
      }

      mesh.material = passThruShader;

      renderer.xr.enabled = currentXrEnabled;
      // renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;

      renderer.setRenderTarget(currentRenderTarget);
    };

    // Async readback
    this._readPixelsAsync = async function (buffer: Float32Array) {
      const gl = renderer.getContext();
      const width = sizeX;
      const height = sizeY;

      if (!(gl instanceof WebGL2RenderingContext)) {
        console.error("!WebGL2");
        return;
      }

      // Use the provided readPixelsAsync function
      const pixelData = await readPixelsAsync(gl, 0, 0, width, height, gl.RGBA, gl.FLOAT, buffer);
      // renderer.setRenderTarget(rt);
      return pixelData;
    };

    // this._readPixelsAsync = async function (variable: Variable) {
    //   const gl = renderer.getContext();
    //   const width = sizeX;
    //   const height = sizeY;

    //   if (!(gl instanceof WebGL2RenderingContext)) {
    //     console.error("!WebGL2");
    //     return;
    //   }

    //   // Create a buffer to receive the data
    //   const buffer = new Float32Array(width * height * 4); // assuming RGBA float format
    //   // // Ensure the correct framebuffer is bound
    //   // const rt = renderer.getRenderTarget();
    //   // const renderTarget = this.getCurrentRenderTarget(variable);
    //   // renderer.setRenderTarget(renderTarget);

    //   // Use the provided readPixelsAsync function
    //   const pixelData = await readPixelsAsync(gl, 0, 0, width, height, gl.RGBA, gl.FLOAT, buffer);
    //   // renderer.setRenderTarget(rt);
    //   return pixelData;
    // };

    // Shaders

    function getPassThroughVertexShader() {
      return "void main(){gl_Position=vec4(position,1.0);}";
    }

    function getPassThroughFragmentShader() {
      return `uniform sampler2D passThruTexture; void main(){vec2 uv = gl_FragCoord.xy/resolution.xy;gl_FragColor=texture2D(passThruTexture,uv);}`;
    }
  }
}

function clientWaitAsync(
  gl: WebGL2RenderingContext,
  sync: WebGLSync,
  flags: GLbitfield,
  interval_ms: number,
) {
  return new Promise<void>((resolve, reject) => {
    function test() {
      const res = gl.clientWaitSync(sync, flags, 0);
      if (res === gl.WAIT_FAILED) {
        reject();
        return;
      }
      if (res === gl.TIMEOUT_EXPIRED) {
        setTimeout(test, interval_ms);
        return;
      }
      resolve();
    }
    test();
  });
}

async function getBufferSubDataAsync(
  gl: WebGL2RenderingContext,
  target: GLenum,
  buffer: WebGLBuffer,
  srcByteOffset: GLintptr,
  dstBuffer: Float32Array,
  /* optional */ dstOffset?: GLuint,
  /* optional */ length?: GLuint,
) {
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();

  await clientWaitAsync(gl, sync!, 0, 10);
  gl.deleteSync(sync);

  gl.bindBuffer(target, buffer);
  gl.getBufferSubData(target, srcByteOffset, dstBuffer, dstOffset, length);
  // console.log("Reading buffer", buffer, srcByteOffset, dstBuffer, dstOffset, length);
  gl.bindBuffer(target, null);
}

async function readPixelsAsync(
  gl: WebGL2RenderingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  format: GLenum,
  type: GLenum,
  dest: Float32Array,
) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, dest.byteLength, gl.STREAM_READ);
  gl.readPixels(x, y, w, h, format, type, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

  await getBufferSubDataAsync(gl, gl.PIXEL_PACK_BUFFER, buf!, 0, dest);

  gl.deleteBuffer(buf);
  return dest;
}
