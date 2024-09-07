import * as THREE from "three";

const radius = 5;

function sphericalToCartesian(radius: number, polar: number, azimuthal: number) {
  const x = radius * Math.sin(polar) * Math.cos(azimuthal);
  const y = radius * Math.sin(polar) * Math.sin(azimuthal);
  const z = radius * Math.cos(polar);
  return new THREE.Vector3(x, y, z);
}

// if (polar > maxPolarAngle) continue; // Skip anything beyond half-circle

const goldenRatio = (1 + Math.sqrt(5)) / 2;

export const level3 = function (i: number, sphereCount: number) {
  // Distribute polar angles relatively evenly by splitting max angle into even segments
  const polar = 3 + Math.acos(1 - (2 * (i + 0.5)) / sphereCount);

  // Distribute azimuthal angles based on golden ratio
  const azimuthal = (2 * Math.PI * (i % goldenRatio)) / goldenRatio;

  return sphericalToCartesian(radius, polar, azimuthal);
};

export const level1 = function (i: number, sphereCount: number) {
  // Player is at the center bottom
  if (i === 0) {
    existingPoints.length = 0;
    const playerPos = new THREE.Vector3(0, 0, -0.5);
    existingPoints.push(playerPos);
    return playerPos;
  } else if (i === sphereCount - 1) {
    // Boss is at the center top
    return new THREE.Vector3(-1, -1, -4);
  }

  // Distribute polar angles relatively evenly by splitting max angle into even segments
  const polar = 3 + Math.acos(1 - (1 * (i + 0.5)) / sphereCount);

  // Distribute azimuthal angles based on golden ratio
  const azimuthal = (2 * Math.PI * (i % goldenRatio)) / goldenRatio;

  return sphericalToCartesian(radius, polar, azimuthal);
};

const existingPoints: THREE.Vector3[] = []; // Stores already generated points

export const level2 = function (i: number, sphereCount: number) {
  // Player is at the center bottom
  if (i === 0) {
    existingPoints.length = 0;
    const playerPos = new THREE.Vector3(0, 0, 0);
    existingPoints.push(playerPos);
    return playerPos;
  }

  const radius = 15;
  let x, z;
  let attempts = 0;
  const maxAttempts = 10; // Adjust based on your requirements
  const minDistance = 3; // Adjust based on your requirements

  do {
    // Generate random polar and azimuthal angles
    const polar = Math.PI - (Math.random() * Math.PI) / 2;
    const azimuthal = Math.random() * 2 * Math.PI;

    // Convert to cartesian coordinates
    x = radius * Math.sin(polar) * Math.cos(azimuthal);
    z = radius * Math.sin(polar) * Math.sin(azimuthal);

    attempts++;
  } while (isTooClose(x, z, existingPoints, minDistance) && attempts < maxAttempts);

  const point = new THREE.Vector3(x, Math.random(), z);
  existingPoints.push(point); // Store this point for future distance checks
  return point;
};

function isTooClose(x: number, z: number, points: THREE.Vector3[], minDist: number) {
  for (const point of points) {
    const dist = Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.z - z, 2));
    if (dist < minDist) return true;
  }
  return false;
}

// export const level2 = function () {};

// export const level3 = function () {};
