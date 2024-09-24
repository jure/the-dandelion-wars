# The Dandelion Wars

![Screenshot](/public/screenshot-dandelion-wars.png)
This project is a WebXR game where players defend against alien invaders using dandelions. 

# Game Mechanics
Players pick up dandelions and blow their seeds to launch attacks. Enemies approach in waves, increasing in difficulty.
Players must defend their position against incoming enemies.
Blowing special "cursed" dandelions with 13 seeds results in a hack with disastrous consequences.

## Key Features
- Interactive dandelion picking and blowing mechanics
- Particle system for dandelion seeds and enemy units
- Procedurally generated terrain with grass
- Dynamic sound positioning
- GPU-accelerated computations for game logic
- Wave-based enemy spawning system

## Libraries Used
[Three.js](https://threejs.org/)

## Technical Highlights
GPU Computation Renderer for handling large numbers of particles, which also handles game logic using async compute callbacks. Custom shaders for grass, particle systems, and visual effects. Use of instanced geometry for performance. Dynamic audio positioning for immersive sound experience.

## Getting Started

`HTTPS=true npm run start` 
HTTPS is used to enable testing on device.