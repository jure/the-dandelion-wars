@nomangle texelFetch
uniform sampler2D t;
uniform sampler2D m;
varying float l; // length  
varying vec3 c; // color
varying vec2 u;
varying float i;
uniform float time;
// t = textTexture, m = messageTexture, l = length, c = color, u = uv, i = instance, vUv = uv
// cp = charPos, ci = charIndex, cu = charUV, csu = charSizeUV, sx = scaleX, sy = scaleY
// cc = charColor
void main() {
// vec2 clampedU = u;
// float ux = clamp(u.x, 0.001, 0.999);
int cp = int(floor(mod(u.x * l, 128.0)));

vec2 messageUV = vec2(
    float(cp) / float(128.0),
    i  / float(1024.0)
);
float ci = texture2D(m, messageUV).r * 255.0;
vec2 cu;
float csuY = 8.0 / 64.0;  // 64 pixels / 512 pixels
highp float csuX = (8.0 / 64.0); // 64 pixels / 512 pixels
float row = floor(ci / 8.0);
float col = mod(ci, 8.0);
float sx = (u.x * csuX * l);
float sy = (-u.y * 0.11);
float msx = mod(sx, csuX);
float msy = mod(sy, csuY);
cu.x = (col * csuX) + msx;
// cu.x = clamp(cu.x, 0.001, 0.999);
cu.y = (1.0 - row * csuY) - msy;
vec4 cc = texture2D(t, cu);
if (cc.a < 0.1 || msx  < 0.011 || msx  > 0.9 * csuX || msy < 0.01 || msy > 0.97 * csuY) {
  // gl_FragColor= vec4(1.0, 0.0, 0.0, 1.0);
  discard;
  // return;
} else {
  gl_FragColor = (cc) * vec4(c, 1.0);
}
}