varying vec4 vColor;
varying vec4 vPosition;
varying vec4 vVelocity;
varying float vEnemy;
varying vec3 vNormal;

void main() {
  float depth = clamp(vPosition.z / 10.0, 0.0, 0.9);
  float green = vColor.g * 0.5 + 0.4 * min(length(vVelocity.xz), 1.5) * (1.0-depth);
  float red = vColor.r * 0.5 + 0.4 * min(length(vVelocity.xy), 1.5) * (1.0-depth);
  // vec3 color1 = vec3(red, pow(red, 3.0), pow(red, 6.0)) * 1.4;
  vec3 color1 = vec3(0.0, 0.0, 1.0);
  vec3 color2 = vec3(1.0, 1.0, 1.0);
  // vec3 color2 = vec3(pow(green, 6.0), green, pow(green, 3.0)) * 1.4;
  vec3 color = mix(color2, color1, vEnemy);

  vec3 lightDirection = normalize(vec3(0.0, 1.0, 1.0));
    // Calculate the dot product between the light direction and the surface normal
    float lightIntensity = max(dot(normalize(vNormal), normalize(-lightDirection)), 0.0);

    // Add ambient light
    vec3 ambient = color * 0.8;

    // Add diffuse light
    vec3 diffuse = color * lightIntensity;

    // Combine ambient and diffuse
    vec3 finalColor = vec3(ambient + diffuse);

    // finalColor.rgb = vec3(1.0, 0.0, 1.0);
    gl_FragColor = vec4(finalColor, 1.0);
}