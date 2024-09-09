@nomangle uv position modelViewMatrix projectionMatrix modelMatrix viewMatrix
uniform sampler2D tP; // texture position
uniform sampler2D tV; // texture velocity
uniform vec3 pC; // player color
uniform vec3 eC; // enemy color
attribute vec2 dtUv;

varying vec4 vColor;
varying vec4 vPosition;
varying vec4 vVelocity;
varying float vEnemy;
bool compareFloats(float a, float b, float epsilon) {
  return abs(a - b) < epsilon;
}

mat3 lookAt(vec3 direction) {
    vec3 up = vec3(0.0, -1.0, 0.0);
    vec3 right = normalize(cross(up, direction));
    vec3 newUp = cross(direction, right);

    return mat3(right, newUp, direction);
}

void main() {
  vec4 posTemp = texture2D( tP, dtUv );
  vec3 pos = posTemp.xyz;
  
  vec4 velTemp = texture2D( tV, dtUv );
  vec3 vel = velTemp.xyz;
  float mass = velTemp.w;

  if(compareFloats(posTemp.w, 0.600, 0.0001)) {
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

  // Assuming `vel` is your velocity or direction vector and is normalized
  mat3 orientation = lookAt(normalize(vel));
  // But we need to flip it the other way around
  orientation = orientation * mat3(
    -1, 0, 0,
    0, 1, 0,
    0, 0, -1
  );

  // Transform vertex position
  newPos = orientation * newPos;
  
  newPos += pos; // Translate

  vec4 mvPosition = modelViewMatrix * (vec4( position, 1.0 ) + vec4(pos,1.0));

  gl_Position = projectionMatrix * viewMatrix * vec4(newPos, 1.0);
  vPosition = gl_Position;

}