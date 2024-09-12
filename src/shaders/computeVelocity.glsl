  @nomangle resolution tP tV
  float delta = 1.0/60.0;
  uniform float d; // difficulty
  
  const float width = resolution.x;
  const float height = resolution.y;
  
  bool compareFloats(float a, float b) {
    return abs(a - b) < 0.01; // lenient comparison
  }

vec2 decodeFloats(float encoded) {
    float sign = sign(encoded);
    float absEncoded = abs(encoded);
    float a = floor(absEncoded / 10.0) / 1000.0;
    float b = sign * mod(absEncoded, 10.0);
    return vec2(a, b);
}

float encodeFloats(float a, float b) {
    return sign(b) * (floor(a * 1000.0) * 10.0 + abs(b));
}

  void main()	{
    float gravityConstant = 100. * (d+1.);
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float idParticle = uv.y * resolution.x + uv.x;
 
    vec4 tmpPos = texture2D( tP, uv );
    vec3 pos = tmpPos.xyz;
    float ourType = tmpPos.w;
    vec4 tmpVel = texture2D( tV, uv );
    vec3 vel = tmpVel.xyz;

    float forceMultiplier = 1.0;

    vec2 targets = decodeFloats(tmpVel.w);
    float mass = targets.y;
    float start = targets.x;

    float speedF = 4.0;
    // float mass = tmpVel.w; // also target
    // if target is player, target id = 
    if (compareFloats(mass, 0.5078)) {
      // Cursed seed, moves sloooow
      delta = 0.1/60.0;
      speedF = 0.5;
    }

    if ( mass > 0.0 ) {
      vec3 acceleration = vec3( 0.0 );
      // Gravity interaction
      for ( float y = 0.0; y < height; y++ ) {

        for ( float x = 0.0; x < width; x++ ) {

          vec2 secondParticleCoords = vec2( x + 0.5, y + 0.5 ) / resolution.xy;

          vec4 pos2Temp = texture2D( tP, secondParticleCoords );
          vec3 pos2 = pos2Temp.xyz;
          vec4 velTemp2 = texture2D( tV, secondParticleCoords );
          vec3 vel2 = velTemp2.xyz;
          vec2 targets = decodeFloats(velTemp2.w);
          // float mass2 = velTemp2.w;
          float mass2 = targets.y;
          float start2 = targets.x;

          float idParticle2 = secondParticleCoords.y * resolution.x + secondParticleCoords.x;
          
          if ( idParticle == idParticle2 ) {
            continue;
          }

          if ( mass2 == 0.0 ) {
            continue;
          }

          vec3 dPos = pos2 - pos;
          float distance = length( dPos );

          if ( distance == 0.0 ) {
            continue;
          }

          // Checks collision
          float theirType = pos2Temp.w;
          // 0.6 is our ship
          // 0.601 is the enemy ship?

          float distanceSq = distance * distance;
          // float distanceSq = max(distance * distance, 0.0001);

          if (compareFloats(ourType, 0.6) && compareFloats(idParticle2, start)) {
            // Gradually increase force multiplier the further we are from start,
            // up to 1.0
            forceMultiplier = min(1.0, distanceSq / 100.0);
          }

          // "hacked"/cursed seeds have a different effect, launched from 0.5234
          if (distance < .5 && compareFloats(ourType, 0.6) && compareFloats(idParticle2, mass) && compareFloats(start, 0.5234)) {
            vel = vec3(0);
            gl_FragColor = vec4( vel, -mass - 1e5); // negative mass times minus a million is a cursed target indicator
            return;
          }
          // Collide with target, the only way to kill a particle
          // 0.6 type is ships, in that case mass is target id
          if ( distance < .5 && compareFloats(ourType, 0.6) && compareFloats(idParticle2, mass)) {
            // This particle dies
            vel = vec3(0); 
            gl_FragColor = vec4( vel, -mass ); // negative mass is a dead target indicator
            return;
          }

          if ( compareFloats(ourType, 0.6) && compareFloats(theirType, 0.6)) {
            // Ship interactions (all avoid each other)
            float nearField = (-0.4) / (distanceSq); // distance to the 4th power
            
            acceleration += nearField * normalize( dPos );
          } else if (compareFloats(ourType, 0.6) && compareFloats(idParticle2, mass)) {
            // Ships are attracted to the destination
            // Gravity towards destination

            float gravityField = gravityConstant * mass2 / distance;
            //gravityField = min( gravityField, 2. );

            acceleration += gravityField * normalize( dPos );
          } else if (compareFloats(ourType, 0.6) && compareFloats(theirType, 0.1)) { 
            // Ships are repelled by other castles too, but only when they are close
            float repulsionField = -0.2*gravityConstant * mass2 / (distanceSq*distanceSq);
            //repulsionField = min( repulsionField, 2. );

            // acceleration += repulsionField * normalize( dPos );
          }
        }
      }

      // Dynamics
      vel += delta * acceleration * forceMultiplier;
      if(length(vel) > 0.) {
        vel = normalize( vel ) * min( length( vel ), speedF);
      }
    } else {
      // Dead particle, reset it
      gl_FragColor = vec4(0);
      return;
    }

    gl_FragColor = vec4(vel, encodeFloats(start, mass));

  }

