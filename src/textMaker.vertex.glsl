@nomangle uv instanceColor projectionMatrix modelViewMatrix instanceMatrix position
attribute float length;
attribute float instance;
varying vec2 u;
varying vec3 c;
varying float l;
varying float i;

void main() {
    u = uv;
    l = length;
    #ifdef USE_INSTANCING_COLOR
      c = instanceColor;
    #endif
    i = instance;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}