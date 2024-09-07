varying vec4 vColor;
varying vec4 vPosition;
varying vec4 vVelocity;
varying float vEnemy;
void main() {
  float depth = clamp(vPosition.z / 10.0, 0.0, 0.9);
  float green = vColor.g * 0.5 + 0.4 * min(length(vVelocity.xz), 1.5) * (1.0-depth);
  float red = vColor.r * 0.5 + 0.4 * min(length(vVelocity.xy), 1.5) * (1.0-depth);
  vec3 color1 = vec3(red, pow(red, 3.0), pow(red, 6.0)) * 1.4;
  vec3 color2 = vec3(pow(green, 6.0), green, pow(green, 3.0)) * 1.4;
  vec3 color = mix(color2, color1, vEnemy);
  gl_FragColor = vec4(color, 1.0);
}