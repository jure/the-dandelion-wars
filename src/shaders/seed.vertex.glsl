@nomangle uv position modelViewMatrix projectionMatrix modelMatrix viewMatrix normal normalMatrix
uniform sampler2D tP; // texture position
uniform sampler2D tV; // texture velocity
uniform vec3 pC; // player color
uniform vec3 eC; // enemy color
attribute vec2 dtUv;

varying vec4 vColor;
varying vec4 vPosition;
varying vec4 vVelocity;
varying float vEnemy;
varying vec3 vViewPosition;

bool compareFloats(float a, float b, float epsilon) {
  return abs(a - b) < epsilon;
}

vec2 decodeFloats(float encoded) {
    float sign = sign(encoded);
    float absEncoded = abs(encoded);
    float a = floor(absEncoded / 10.0) / 1000.0;
    float b = sign * mod(absEncoded, 10.0);
    return vec2(a, b);
}

mat3 lookAt2(vec3 direction) {
    // Change the up vector to (0, 0, 1) for Z-up system
    vec3 up = vec3(0.0, 0.0, 1.0);
    vec3 right = normalize(cross(direction, up)); // Note: order changed
    vec3 newUp = cross(right, direction);

    return mat3(-right, newUp, -direction);
}

void main() {
  vec4 posTemp = texture2D( tP, dtUv );
  vec3 pos = posTemp.xyz;
  
  vec4 velTemp = texture2D( tV, dtUv );
  vec3 vel = velTemp.xyz;

  vec2 targets = decodeFloats(velTemp.w);
  if(compareFloats(targets.x, 0.52343, 0.01)) {
    vColor = vec4(eC,1.);
  } else if (compareFloats(posTemp.w, 0.600, 0.0001)) {
    vColor = vec4(pC,1.);
    vEnemy = 0.0;
  } else if (compareFloats(posTemp.w,0.601, 0.0001)) {
    vColor = vec4(eC,1.);
    vEnemy = 1.0;
  } else {
    vColor = vec4( 1.0, 1.0, 0.0, 0.0 );
  }

  vVelocity = velTemp;
  vec3 newPos = mat3(modelMatrix) * position;

  // Make enemies bigger
  if(vEnemy > 0.5) {
    newPos *= 2.0;
  }

  // Assuming `vel` is your velocity or direction vector and is normalized
  mat3 orientation = lookAt2(normalize(vel));

  // Transform vertex position
  newPos = orientation * newPos;
  
  newPos += pos; // Translate

  vec4 mvPosition = modelViewMatrix * (vec4( position, 1.0 ) + vec4(pos,1.0));

  gl_Position = projectionMatrix * viewMatrix * vec4(newPos, 1.0);
  vPosition = gl_Position;

  vViewPosition = -mvPosition.xyz;

}