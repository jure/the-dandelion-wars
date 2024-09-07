  @nomangle resolution tP tV
  #define delta (1.0/60.0)
  uniform float d; // difficulty
  
  const float width = resolution.x;
  const float height = resolution.y;
  
  bool compareFloats(float a, float b) {
    return abs(a - b) < 0.01; // lenient comparison
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
    float mass = tmpVel.w; // also target

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
          float mass2 = velTemp2.w;

          float idParticle2 = secondParticleCoords.y * resolution.x + secondParticleCoords.x;

        //   gl_FragColor = vec4(secondParticleCoords, resolution.x,idParticle);
        //   return; 
          
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
            float nearField = (-0.05) / (distanceSq * distanceSq); // distance to the 4th power
            
            acceleration += nearField * normalize( dPos );
          } else if (compareFloats(ourType, 0.6) && compareFloats(idParticle2, mass)) {
            // Ships are attracted to the destination
            // Gravity towards destination

            float gravityField = gravityConstant * mass2 / distance;
            //gravityField = min( gravityField, 2. );

            acceleration += gravityField * normalize( dPos );
          } else if (compareFloats(ourType, 0.6) && compareFloats(theirType, 0.1)) { 
            // Ships are repelled by other castles too, but only when they are close
            float repulsionField = -0.5*gravityConstant * mass2 / (distanceSq*distanceSq*distanceSq);
            //repulsionField = min( repulsionField, 2. );

            acceleration += repulsionField * normalize( dPos );
          }
        }
      }

      // Dynamics
      vel += delta * acceleration;
      if(length(vel) > 0.) {
        vel = normalize( vel ) * min( length( vel ), 1.0 * (d+1.));
      }
    } else {
      // Dead particle, reset it
      gl_FragColor = vec4( 0 );
      return;
    }

    gl_FragColor = vec4( vel, mass );

  }

