  @nomangle resolution tP tV
  #define delta (1.0/60.0)

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 tmpPos = texture2D( tP, uv );
    vec3 pos = tmpPos.xyz;
    float type = tmpPos.w;
    vec4 tmpVel = texture2D( tV, uv );
    vec3 vel = tmpVel.xyz;
    float mass = tmpVel.w;

    if ( mass == 0.0 ) {
      vel = vec3( 0.0 );
    }
    // Types above 0.5 are moving
    if(type > 0.5) {
      pos += vel * delta;
    }
    gl_FragColor = vec4( pos, type );
  }