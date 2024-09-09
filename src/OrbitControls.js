/* global THREE */
// From https://github.com/mrdoob/three.js/blob/dev/examples/jsm/misc/GPUComputationRenderer.js
// MIT license (Three.js authors): https://github.com/mrdoob/three.js/blob/dev/LICENSE
// Adapted for use in this._project

// const {
//   EventDispatcher,
//   MOUSE,
//   Quaternion,
//   Spherical,
//   TOUCH,
//   Vector2,
//   Vector3,
//   Plane,
//   Ray,
//   MathUtils,
//   // eslint-disable-next-line no-undef
// } = THREE;
// eslint-disable-next-line no-undef
// const EventDispatcher = THREE.EventDispatcher;
// eslint-disable-next-line no-undef
// const MOUSE = THREE.MOUSE;
// eslint-disable-next-line no-undef
// const Quaternion = THREE.Quaternion;
// eslint-disable-next-line no-undef
// const Spherical = THREE.Spherical;
// eslint-disable-next-line no-undef
// const TOUCH = THREE.TOUCH;
// eslint-disable-next-line no-undef
// const Vector2 = THREE.Vector2;
// eslint-disable-next-line no-undef
// const Vector3 = THREE.Vector3;
// eslint-disable-next-line no-undef
// const Plane = THREE.Plane;
// eslint-disable-next-line no-undef
// const Ray = THREE.Ray;
// eslint-disable-next-line no-undef
// const MathUtils = THREE.MathUtils;

// OrbitControls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
import * as THREE from "three";
const _changeEvent = new Event({ type: "change" });
const _startEvent = new Event({ type: "start" });
const _endEvent = { type: "end" };
const _ray = new THREE.Ray();
const _plane = new THREE.Plane();
const TILT_LIMIT = Math.cos(70 * THREE.MathUtils.DEG2RAD);

const offset = new THREE.Vector3();

// so camera.up is the orbit axis
// eslint-disable-next-line no-undef
const quat = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 1, 0),
);
const quatInverse = quat["clone"]()["invert"]();

const lastPosition = new THREE.Vector3();
const lastQuaternion = new THREE.Quaternion();
const lastTargetPosition = new THREE.Vector3();

const twoPI = 2 * Math.PI;

let t;

const STATE = {
  _NONE: -1,
  _ROTATE: 0,
  _DOLLY: 1,
  _TOUCH_ROTATE: 3,
  _TOUCH_PAN: 4,
  _TOUCH_DOLLY_PAN: 5,
  _TOUCH_DOLLY_ROTATE: 6,
};

let state = STATE._NONE;

const EPS = 0.000001;

// current position in spherical coordinates
const spherical = new THREE.Spherical();
const sphericalDelta = new THREE.Spherical();

let scale = 1;

const rotateStart = new THREE.Vector2();
const rotateEnd = new THREE.Vector2();
const rotateDelta = new THREE.Vector2();

const dollyStart = new THREE.Vector2();
const dollyEnd = new THREE.Vector2();
const dollyDelta = new THREE.Vector2();

const dollyDirection = new THREE.Vector3();
const mouse = new THREE.Vector2();
let performCursorZoom = false;

const pointers = [];
const pointerPositions = {};

class OrbitControls extends THREE.EventDispatcher {
  constructor(object, domElement) {
    super();

    this._object = object;
    this._domElement = domElement;
    this._domElement.style.touchAction = "none"; // disable touch scroll

    // Set to false to disable this._control
    this.enabled = true;

    // "target" sets the location of focus, where the object orbits around
    this._target = new THREE.Vector3(0, 2, 0);

    // How far you can dolly in and out ( PerspectiveCamera only )
    this._minDistance = 0;
    this._maxDistance = 100;

    // How far you can orbit vertically, upper and lower limits.
    // Range is 0 to Math.PI radians.
    this._minPolarAngle = 0; // radians
    this._maxPolarAngle = Math.PI; // radians

    // How far you can orbit horizontally, upper and lower limits.
    // If set, the interval [ min, max ] must be a sub-interval of [ - 2 PI, 2 PI ], with ( max - min < 2 PI )
    this._minAzimuthAngle = -Infinity; // radians
    this._maxAzimuthAngle = Infinity; // radians

    // Set to true to enable damping (inertia)
    // If damping is enabled, you must call controls.update() in your animation loop
    this._enableDamping = false;
    this._dampingFactor = 0.05;

    // This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
    // Set to false to disable zooming
    this._enableZoom = true;
    this._zoomSpeed = 1.0;

    // Set to false to disable rotating
    this._enableRotate = true;
    this._rotateSpeed = 1.0;

    // Set to false to disable panning
    this._zoomToCursor = false;

    // Set to true to automatically rotate around the target
    // If auto-rotate is enabled, you must call controls.update() in your animation loop
    this.autoRotate = false;
    this._autoRotateSpeed = 1.5; // 30 seconds per orbit when fps is 60

    // Mouse buttons
    this._mouseButtons = { _LEFT: THREE.MOUSE.ROTATE };

    // Touch fingers
    this._touches = { _ONE: THREE.TOUCH.ROTATE, _TWO: THREE.TOUCH.DOLLY_PAN };

    // for reset
    this._target0 = this._target.clone();
    this._position0 = this._object.position.clone();
    // this._zoom0 = this._object.zoom;

    // the target DOM element for key events
    this.__domElementKeyEvents = null;

    this._domElement.addEventListener("contextmenu", onContextMenu);

    this._domElement.addEventListener("pointerdown", onPointerDown);
    this._domElement.addEventListener("pointercancel", onPointerUp);
    this._domElement.addEventListener("wheel", onMouseWheel, { passive: false });

    // eslint-disable-next-line
    t = this;
    this.update();

    // force an update at start
  }

  // _getPolarAngle() {
  //   return spherical.phi;
  // }

  // _getAzimuthalAngle() {
  //   return spherical.theta;
  // }

  // _getDistance() {
  //   return this._object.position.distanceTo(this._target);
  // }

  // _saveState() {
  //   this._target0.copy(this._target);
  //   this._position0.copy(this._object.position);
  //   this._zoom0 = this._object.zoom;
  // }

  // _reset() {
  //   this._target.copy(this._target0);
  //   this._object.position.copy(this._position0);
  //   this._object.zoom = this._zoom0;

  //   this._object.updateProjectionMatrix();
  //   this.dispatchEvent(_changeEvent);

  //   this.update();

  //   state = STATE._NONE;
  // }

  // this._method is exposed, but perhaps it would be better if we can make it private...
  update(deltaTime = null) {
    const position = this._object.position;

    offset["copy"](position)["sub"](this._target);

    // rotate offset to "y-axis-is-up" space
    offset["applyQuaternion"](quat);

    // angle from z-axis around y-axis
    spherical["setFromVector3"](offset);

    if (this["autoRotate"] && state === STATE._NONE) {
      rotateLeft(getAutoRotationAngle(deltaTime));
    }

    if (this._enableDamping) {
      spherical["theta"] += sphericalDelta["theta"] * this._dampingFactor;
      spherical["phi"] += sphericalDelta["phi"] * this._dampingFactor;
    } else {
      spherical["theta"] += sphericalDelta["theta"];
      spherical["phi"] += sphericalDelta["phi"];
    }

    // restrict theta to be between desired limits

    let min = this._minAzimuthAngle;
    let max = this._maxAzimuthAngle;

    if (isFinite(min) && isFinite(max)) {
      if (min < -Math.PI) min += twoPI;
      else if (min > Math.PI) min -= twoPI;

      if (max < -Math.PI) max += twoPI;
      else if (max > Math.PI) max -= twoPI;

      if (min <= max) {
        spherical.theta = Math.max(min, Math.min(max, spherical.theta));
      } else {
        spherical.theta =
          spherical.theta > (min + max) / 2
            ? Math.max(min, spherical.theta)
            : Math.min(max, spherical.theta);
      }
    }

    // restrict phi to be between desired limits
    spherical.phi = Math.max(this._minPolarAngle, Math.min(this._maxPolarAngle, spherical.phi));

    spherical["makeSafe"]();

    // adjust the camera position based on zoom only if we're not zooming to the cursor or if it's an ortho camera
    // we adjust zoom later in these cases
    if (this._zoomToCursor && performCursorZoom) {
      spherical.radius = clampDistance(spherical.radius);
    } else {
      spherical.radius = clampDistance(spherical.radius * scale);
    }

    offset["setFromSpherical"](spherical);

    // rotate offset back to "camera-up-vector-is-up" space
    offset["applyQuaternion"](quatInverse);

    position["copy"](this._target)["add"](offset);

    this._object["lookAt"](this._target);

    sphericalDelta.set(0, 0, 0);

    // adjust camera position
    let zoomChanged = false;
    if (this._zoomToCursor && performCursorZoom) {
      let newRadius = null;
      if (this._object["isPerspectiveCamera"]) {
        // move the camera down the pointer ray
        // this._method avoids floating point error
        const prevRadius = offset.length();
        newRadius = clampDistance(prevRadius * scale);

        const radiusDelta = prevRadius - newRadius;
        this._object.position.addScaledVector(dollyDirection, radiusDelta);
        this._object.updateMatrixWorld();
      } else {
        console.warn(
          "WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.",
        );
        this._zoomToCursor = false;
      }

      // handle the placement of the target
      if (newRadius !== null) {
        _ray.origin.copy(this._object.position);
        _ray.direction.set(0, 0, -1).transformDirection(this._object.matrix);

        // if the camera is 20 degrees above the horizon then don't adjust the focus target to avoid
        // extremely large values
        if (Math.abs(this._object.up.dot(_ray.direction)) < TILT_LIMIT) {
          this._object.lookAt(this._target);
        } else {
          _plane.setFromNormalAndCoplanarPoint(this._object.up, this._target);
          _ray.intersectPlane(_plane, this._target);
        }
        // }
      }
    }

    scale = 1;
    performCursorZoom = false;

    // update condition is:
    // min(camera displacement, camera rotation in radians)^2 > EPS
    // using small-angle approximation cos(x/2) = 1 - x^2 / 8

    if (
      zoomChanged ||
      lastPosition["distanceToSquared"](this._object.position) > EPS ||
      8 * (1 - lastQuaternion["dot"](this._object.quaternion)) > EPS ||
      lastTargetPosition["distanceToSquared"](this._target) > 0
    ) {
      this.dispatchEvent(_changeEvent);

      lastPosition.copy(this._object.position);
      lastQuaternion.copy(this._object.quaternion);
      lastTargetPosition.copy(this._target);

      zoomChanged = false;

      return true;
    }
  }

  // _dispose() {
  //   this._domElement.removeEventListener("contextmenu", onContextMenu);

  //   this._domElement.removeEventListener("pointerdown", onPointerDown);
  //   this._domElement.removeEventListener("pointercancel", onPointerUp);
  //   this._domElement.removeEventListener("wheel", onMouseWheel);

  //   this._domElement.removeEventListener("pointermove", onPointerMove);
  //   this._domElement.removeEventListener("pointerup", onPointerUp);
  //   //this.dispatchEvent( { type: 'dispose' } ); // should this._be added here?
  // }
  //
}

function getAutoRotationAngle(deltaTime) {
  if (deltaTime !== null) {
    return ((2 * Math.PI) / 60) * t._autoRotateSpeed * deltaTime;
  } else {
    return ((2 * Math.PI) / 60 / 60) * t._autoRotateSpeed;
  }
}

function getZoomScale() {
  return Math.pow(0.95, t._zoomSpeed);
}

function rotateLeft(angle) {
  sphericalDelta.theta -= angle;
}

function rotateUp(angle) {
  sphericalDelta.phi -= angle;
}

function dollyOut(dollyScale) {
  if (t._object["isPerspectiveCamera"]) {
    scale /= dollyScale;
  } else {
    console.warn(
      "WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.",
    );
    t._enableZoom = false;
  }
}

function dollyIn(dollyScale) {
  if (t._object["isPerspectiveCamera"]) {
    scale *= dollyScale;
  } else {
    console.warn(
      "WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.",
    );
    t._enableZoom = false;
  }
}

function updateMouseParameters(event) {
  if (!t._zoomToCursor) {
    return;
  }

  performCursorZoom = true;

  const rect = t._domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const w = rect.width;
  const h = rect.height;

  mouse.x = (x / w) * 2 - 1;
  mouse.y = -(y / h) * 2 + 1;
}

function clampDistance(dist) {
  return Math.max(t._minDistance, Math.min(t._maxDistance, dist));
}

//
// event callbacks - update the object state
//

function handleMouseDownRotate(event) {
  rotateStart.set(event.clientX, event.clientY);
}

function handleMouseMoveRotate(event) {
  rotateEnd.set(event.clientX, event.clientY);

  rotateDelta["subVectors"](rotateEnd, rotateStart)["multiplyScalar"](t._rotateSpeed);

  const element = t._domElement;

  rotateLeft((2 * Math.PI * rotateDelta.x) / element.clientHeight); // yes, height

  rotateUp((2 * Math.PI * rotateDelta.y) / element.clientHeight);

  rotateStart.copy(rotateEnd);

  // t._update();
}

function handleMouseWheel(event) {
  updateMouseParameters(event);

  if (event.deltaY < 0) {
    dollyIn(getZoomScale());
  } else if (event.deltaY > 0) {
    dollyOut(getZoomScale());
  }

  // t._update();
}

function handleTouchStartRotate() {
  if (pointers.length === 1) {
    rotateStart.set(pointers[0].pageX, pointers[0].pageY);
  } else {
    const x = 0.5 * (pointers[0].pageX + pointers[1].pageX);
    const y = 0.5 * (pointers[0].pageY + pointers[1].pageY);

    rotateStart.set(x, y);
  }
}

function handleTouchStartDolly() {
  const dx = pointers[0].pageX - pointers[1].pageX;
  const dy = pointers[0].pageY - pointers[1].pageY;

  const distance = Math.sqrt(dx * dx + dy * dy);

  dollyStart.set(0, distance);
}

function handleTouchStartDollyPan() {
  if (t._enableZoom) handleTouchStartDolly();
}

function handleTouchStartDollyRotate() {
  if (t._enableZoom) handleTouchStartDolly();

  if (t._enableRotate) handleTouchStartRotate();
}

function handleTouchMoveRotate(event) {
  if (pointers.length == 1) {
    rotateEnd.set(event.pageX, event.pageY);
  } else {
    const position = getSecondPointerPosition(event);

    const x = 0.5 * (event.pageX + position.x);
    const y = 0.5 * (event.pageY + position.y);

    rotateEnd.set(x, y);
  }

  rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(t._rotateSpeed);

  const element = t._domElement;

  rotateLeft((2 * Math.PI * rotateDelta.x) / element.clientHeight); // yes, height

  rotateUp((2 * Math.PI * rotateDelta.y) / element.clientHeight);

  rotateStart.copy(rotateEnd);
}

function handleTouchMoveDolly(event) {
  const position = getSecondPointerPosition(event);

  const dx = event.pageX - position.x;
  const dy = event.pageY - position.y;

  const distance = Math.sqrt(dx * dx + dy * dy);

  dollyEnd.set(0, distance);

  dollyDelta.set(0, Math.pow(dollyEnd.y / dollyStart.y, t._zoomSpeed));

  dollyOut(dollyDelta.y);

  dollyStart.copy(dollyEnd);
}

function handleTouchMoveDollyPan(event) {
  if (t._enableZoom) handleTouchMoveDolly(event);
}

function handleTouchMoveDollyRotate(event) {
  if (t._enableZoom) handleTouchMoveDolly(event);

  if (t._enableRotate) handleTouchMoveRotate(event);
}

//
// event handlers - FSM: listen for events and reset state
//

function onPointerDown(event) {
  console.log("onpointerdown");
  if (t.enabled === false) return;

  if (pointers.length === 0) {
    t._domElement.setPointerCapture(event.pointerId);

    t._domElement.addEventListener("pointermove", onPointerMove);
    t._domElement.addEventListener("pointerup", onPointerUp);
  }

  //

  addPointer(event);

  if (event.pointerType === "touch") {
    onTouchStart(event);
  } else {
    onMouseDown(event);
  }
}

function onPointerMove(event) {
  if (t.enabled === false) return;

  if (event.pointerType === "touch") {
    onTouchMove(event);
  } else {
    onMouseMove(event);
  }
}

function onPointerUp(event) {
  removePointer(event);

  if (pointers.length === 0) {
    t._domElement.releasePointerCapture(event.pointerId);

    t._domElement.removeEventListener("pointermove", onPointerMove);
    t._domElement.removeEventListener("pointerup", onPointerUp);
  }

  t.dispatchEvent(_endEvent);

  state = STATE._NONE;
}

function onMouseDown(event) {
  let mouseAction;

  switch (event.button) {
    case 0:
      mouseAction = t._mouseButtons._LEFT;
      break;
    default:
      mouseAction = -1;
  }

  switch (mouseAction) {
    case THREE.MOUSE.ROTATE:
      if (t._enableRotate === false) return;

      handleMouseDownRotate(event);

      state = STATE._ROTATE;

      break;

    case THREE.MOUSE.PAN:
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        if (t._enableRotate === false) return;

        handleMouseDownRotate(event);

        state = STATE._ROTATE;
      }

      break;

    default:
      state = STATE._NONE;
  }

  if (state !== STATE._NONE) {
    t.dispatchEvent(_startEvent);
  }
}

function onMouseMove(event) {
  switch (state) {
    case STATE._ROTATE:
      if (t._enableRotate === false) return;

      handleMouseMoveRotate(event);

      break;
  }
}

function onMouseWheel(event) {
  if (t.enabled === false || t._enableZoom === false || state !== STATE._NONE) return;

  event.preventDefault();

  t.dispatchEvent(_startEvent);

  handleMouseWheel(event);

  t.dispatchEvent(_endEvent);
}

function onTouchStart(event) {
  trackPointer(event);

  switch (pointers.length) {
    case 1:
      switch (t._touches._ONE) {
        case THREE.TOUCH.ROTATE:
          if (t._enableRotate === false) return;

          handleTouchStartRotate();

          state = STATE._TOUCH_ROTATE;

          break;
        default:
          state = STATE._NONE;
      }

      break;

    case 2:
      switch (t._touches._TWO) {
        case THREE.TOUCH.DOLLY_PAN:
          if (t._enableZoom === false) return;

          handleTouchStartDollyPan();

          state = STATE._TOUCH_DOLLY_PAN;

          break;

        case THREE.TOUCH.DOLLY_ROTATE:
          if (t._enableZoom === false && t._enableRotate === false) return;

          handleTouchStartDollyRotate();

          state = STATE._TOUCH_DOLLY_ROTATE;

          break;

        default:
          state = STATE._NONE;
      }

      break;

    default:
      state = STATE._NONE;
  }

  if (state !== STATE._NONE) {
    t.dispatchEvent(_startEvent);
  }
}

function onTouchMove(event) {
  trackPointer(event);

  switch (state) {
    case STATE._TOUCH_ROTATE:
      if (t._enableRotate === false) return;

      handleTouchMoveRotate(event);

      // t._update();

      break;
    case STATE._TOUCH_DOLLY_PAN:
      if (t._enableZoom === false) return;

      handleTouchMoveDollyPan(event);

      // t._update();

      break;

    case STATE._TOUCH_DOLLY_ROTATE:
      if (t._enableZoom === false && t._enableRotate === false) return;

      handleTouchMoveDollyRotate(event);

      // t._update();

      break;

    default:
      state = STATE._NONE;
  }
}

function onContextMenu(event) {
  if (t.enabled === false) return;

  event.preventDefault();
}

function addPointer(event) {
  pointers.push(event);
}

function removePointer(event) {
  delete pointerPositions[event.pointerId];

  for (let i = 0; i < pointers.length; i++) {
    if (pointers[i].pointerId == event.pointerId) {
      pointers.splice(i, 1);
      return;
    }
  }
}

function trackPointer(event) {
  let position = pointerPositions[event.pointerId];

  if (position === undefined) {
    position = new THREE.Vector2();
    pointerPositions[event.pointerId] = position;
  }

  position.set(event.pageX, event.pageY);
}

function getSecondPointerPosition(event) {
  const pointer = event.pointerId === pointers[0].pointerId ? pointers[1] : pointers[0];

  return pointerPositions[pointer.pointerId];
}

export { OrbitControls };
