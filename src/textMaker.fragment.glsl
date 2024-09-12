@nomangle texelFetch median textureSize texture
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
// vec4 texture2DAA(sampler2D tex, vec2 uv) {
//     vec2 texsize = vec2(textureSize(tex,0));
//     vec2 uv_texspace = uv*texsize;
//     vec2 seam = floor(uv_texspace+.1);
//     uv_texspace = (uv_texspace-seam)/fwidth(uv_texspace)+seam;
//     uv_texspace = clamp(uv_texspace, seam-.5, seam+.5);
//     return texture(tex, uv_texspace/texsize);
// }

void main() {
// vec2 clampedU = u;
// float ux = clamp(u.x, 0.001, 0.999);
int cp = int(floor(mod(u.x * l, 128.0)));



// Message
vec2 messageUV = vec2(
    float(cp) / float(128.0),
    i  / float(1024.0)
);
float ci = texture2D(m, messageUV).r * 255.0;

float row = floor(ci / 8.0);
float col = mod(ci, 8.0);

// Character
vec2 cu;
float csuY = 64.0 / 512.0; 
highp float csuX = (64.0 / 512.0);

float sx = (u.x * csuX * l) / 1.6;
float sy = (-u.y * 0.11);
float msx = mod(sx, csuX / 1.6);
float msy = mod(sy, csuY);
    cu.x = ((col * csuX) + msx);
    cu.y = (1.0 - row * csuY) - msy;

    vec4 cc = texture2D(t, cu);

    if (cc.a < 0.2 || msx < 0.004 || msx > 0.99 * csuX || msy < 0.01 || msy > 0.99 * csuY) {
        discard;
    } else {
        gl_FragColor = cc * vec4(c, 1.0);
    }
}