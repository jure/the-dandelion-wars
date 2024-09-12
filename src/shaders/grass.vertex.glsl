@nomangle uv position modelViewMatrix projectionMatrix modelMatrix viewMatrix
attribute vec2 offset;
attribute float random;
uniform float time;
varying vec2 vUv;

float PI = 3.14159;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

        // Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
            -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
        dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}


void main() {
    vUv = uv;
    vec3 pos = position;
    
    // Use offset for positioning
    vec2 basePosition = offset;
    
    // Get height from the terrain
    float terrainHeight = sin(basePosition.x / 10.0 - PI/2.0) * cos(basePosition.y / 10.0) * 5.0 + 5.0;
    
    // Random rotation
    float angle = hash(offset) * 3.14159 * 2.0;
    mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    
    // Apply rotation to the grass blade, keeping its base at the origin
    pos.xz = rotation * pos.xz;
    
    // Move the rotated grass to its position on the terrain
    pos.xz += basePosition;
    pos.y += terrainHeight + 0.5;

    // Organic wind animation
    float windStrength = 0.3;
    float windFrequency = 1.5;
    float noise = snoise(vec2(offset.x * 0.1 + time * 0.2, offset.y * 0.1)) * 0.5 + 0.5;
    float windEffect = sin(time * windFrequency + noise * 6.28) * windStrength;
    
    // Apply wind effect with smooth falloff towards the bottom
    float windFalloff = smoothstep(0.0, 0.6, position.y);
    pos.x += windEffect * windFalloff;
    
    // Bend the grass blade
    float bendStrength = 0.2;
    pos.z -= bendStrength * pow(position.y, 2.0) * windEffect;
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}