@nomangle viewMatrix
varying vec4 vColor;
varying vec4 vPosition;
varying vec4 vVelocity;
varying float vEnemy;
varying vec3 vViewPosition;

void main() {
  vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );

  float depth = clamp(vPosition.z / 10.0, 0.0, 0.9);
  float green = vColor.g * 0.5 + 0.4 * min(length(vVelocity.xz), 1.5) * (1.0-depth);
  float red = vColor.r * 0.5 + 0.4 * min(length(vVelocity.xy), 1.5) * (1.0-depth);
  // vec3 color1 = vec3(red, pow(red, 3.0), pow(red, 6.0)) * 1.4;
  vec3 color1 = vec3(0.0, 0.0, 1.0);
  vec3 color2 = vec3(1.0, 1.0, 1.0);
  // vec3 color2 = vec3(pow(green, 6.0), green, pow(green, 3.0)) * 1.4;
  vec3 baseColor = mix(color2, color1, vEnemy);

  vec3 lightDir = normalize(vec3(0.0, -1.0, 1.0));

	  // In three.js: uniforms.direction.transformDirection( viewMatrix );
    // In glsl:
    
    lightDir = normalize( ( viewMatrix * vec4( lightDir, 0.0 ) ).xyz );


    // Calculate light direction and view direction
    vec3 viewDir = normalize(-vViewPosition);

    // vec3 viewDir = normalize(-vViewPosition);

    // Ambient component
    vec3 ambientColor = vec3(0.7, 0.7, 0.7);
    vec3 ambient = ambientColor * baseColor;

    // Diffuse component
    vec3 lightColor = vec3(1.0, 1.0, 1.0);
    float lightIntensity = 0.5;
    float dotNL = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = lightColor * lightIntensity * dotNL * baseColor;

    // Specular component (BlinnPhong)
    // vec3 halfDir = normalize(lightDir + viewDir);
    // float dotNH = max(dot(normal, halfDir), 0.0);
    // float shininess = 32.0;
    // float specularFactor = pow(dotNH, shininess);
    // float specularStrength = 0.5;
    // vec3 specular = lightColor * lightIntensity * specularStrength * specularFactor;

    // Combine all lighting components
    vec3 finalColor = ambient + diffuse;

    gl_FragColor = vec4(finalColor, 1.0);
}

//     // Calculate the dot product between the light direction and the surface normal
//     float lightIntensity = max(dot(normalize(normal), normalize(-lightDirection)), 0.0);

//     // Add ambient light
//     vec3 ambient = color * 0.8;

//     // Add diffuse light
//     vec3 diffuse = color * lightIntensity;

//     // Combine ambient and diffuse
//     vec3 finalColor = vec3(ambient + diffuse);

//     // finalColor.rgb = vec3(1.0, 0.0, 1.0);
//     gl_FragColor = vec4(finalColor, 1.0);
// }

// vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {

// 	vec3 halfDir = normalize( lightDir + viewDir );

// 	float dotNH = saturate( dot( normal, halfDir ) );
// 	float dotVH = saturate( dot( viewDir, halfDir ) );

// 	vec3 F = F_Schlick( specularColor, 1.0, dotVH );

// 	float G = G_BlinnPhong_Implicit( /* dotNL, dotNV */ );

// 	float D = D_BlinnPhong( shininess, dotNH );

// 	return F * ( G * D );

// } // validated


// void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {

// 	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
// 	vec3 irradiance = dotNL * directLight.color;

// 	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

// 	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;

// }