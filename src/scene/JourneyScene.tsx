import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Route, Variant } from '../types';
import { projectRoute, routeStations, sampleRoutePosition, seeded, type ProjectedRoute, type RoutePosition } from './geometry';

export { projectRoute, sampleRoutePosition } from './geometry';

interface Props { route: Route; variant: Variant; progress: number; onReady?: () => void; className?: string }
interface Runtime { draw: (progress: number) => void; dispose: () => void }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function palette(variant: Variant) {
  const night = variant.timeOfDay === 'night';
  const twilight = variant.timeOfDay === 'dawn' || variant.timeOfDay === 'dusk';
  const snow = variant.season === 'winter' || variant.weather === 'snow';
  const overcast = variant.weather !== 'clear';
  return {
    sky: night ? '#192a40' : twilight ? '#e7bcac' : overcast ? '#b0c3c8' : '#a8d1df',
    ground: snow ? '#e4e9e6' : variant.season === 'autumn' ? '#a3a675' : '#89aa7a',
    foliage: snow ? ['#5e7d71', '#718c7d', '#c8d8ce'] : variant.season === 'autumn' ? ['#bd8d50', '#b6a36b', '#8e9b65'] : variant.season === 'spring' ? ['#82aa77', '#9fbc87', '#6e986e'] : ['#577f65', '#749467', '#426f60'],
    sun: night ? '#a8c3e0' : twilight ? '#ffd3a7' : '#fff6dc',
    ambient: night ? 1.05 : overcast ? 2.3 : 2,
    sunlight: night ? 0.4 : overcast ? 1.5 : 2.7,
    night, snow,
  };
}

function terrainHeight(point: RoutePosition, offset: number) {
  const edge = Math.max(0, Math.abs(offset) - 12);
  const wave = Math.sin(point.x * 0.0034 + offset * 0.006) * 0.5 + Math.cos(point.z * 0.0048 - offset * 0.004) * 0.5;
  return point.y - 0.28 + Math.min(1, edge / 160) * (4 + wave * 20) + Math.max(0, edge - 100) * (0.12 + 0.11 * Math.sin(point.distance * 0.0015 + offset * 0.003) ** 2);
}

// Extend only the illustrative ground past the recording endpoints, never the route.
function landscapePosition(path: ProjectedRoute, distance: number): RoutePosition {
  const position = sampleRoutePosition(path, distance);
  const extra = distance - position.distance;
  return { ...position, x: position.x + position.tangentX * extra, z: position.z + position.tangentZ * extra, distance };
}

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

function ribbon(stations: RoutePosition[], width: number, y: number, material: THREE.Material, lateral = 0) {
  const vertices: number[] = [];
  const indices: number[] = [];
  stations.forEach((point, index) => {
    const before = stations[Math.max(0, index - 1)];
    const after = stations[Math.min(stations.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    for (const side of [-1, 1]) {
      const offset = lateral + side * width / 2;
      vertices.push(point.x + nx * offset, point.y + y, point.z + nz * offset);
    }
    if (index) {
      const current = index * 2;
      indices.push(current - 2, current, current - 1, current - 1, current, current + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function distanceFromRoute(x: number, z: number, points: RoutePosition[]) {
  let nearest = Infinity;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const ratio = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    nearest = Math.min(nearest, (x - a.x - dx * ratio) ** 2 + (z - a.z - dz * ratio) ** 2);
  }
  return Math.sqrt(nearest);
}

function buildCorridor(path: ProjectedRoute, distance: number, route: Route, variant: Variant) {
  const group = new THREE.Group();
  const colors = palette(variant);
  const from = Math.max(0, distance - 220);
  const to = Math.min(path.length, distance + 2_000);
  const stations = routeStations(path, from, to, 24);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: colors.ground, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  // Terrain stays bounded in size even for dense GPX data; the road above keeps every bend.
  const terrainFrom = distance - 220;
  const terrainTo = distance + 2_000;
  const terrainSamples = [landscapePosition(path, terrainFrom)];
  for (let distance = Math.ceil(terrainFrom / 60) * 60; distance < terrainTo; distance += 60) {
    if (distance > terrainFrom) terrainSamples.push(landscapePosition(path, distance));
  }
  terrainSamples.push(landscapePosition(path, terrainTo));
  const offsets = [-1_200, -800, -460, -220, -100, -40, -12, 0, 12, 40, 100, 220, 460, 800, 1_200];
  const positions: number[] = [];
  const indices: number[] = [];
  terrainSamples.forEach((point, row) => {
    const before = landscapePosition(path, point.distance - 10);
    const after = landscapePosition(path, point.distance + 10);
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
    const nx = -(after.z - before.z) / length;
    const nz = (after.x - before.x) / length;
    offsets.forEach((offset, col) => {
      positions.push(point.x + nx * offset, terrainHeight(point, offset), point.z + nz * offset);
      if (row && col) {
        const current = row * offsets.length + col;
        indices.push(current - offsets.length - 1, current - 1, current - offsets.length, current - offsets.length, current - 1, current);
      }
    });
  });
  const terrain = new THREE.BufferGeometry();
  terrain.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  terrain.setIndex(indices);
  terrain.computeVertexNormals();
  group.add(new THREE.Mesh(terrain, groundMaterial));

  const train = route.transport === 'train';
  const width = train ? 4.8 : route.transport === 'car' ? 7.2 : 3.2;
  const roadMaterial = new THREE.MeshStandardMaterial({ color: train ? '#8c9189' : route.transport === 'car' ? '#606a69' : '#b8b099', roughness: 1, side: THREE.DoubleSide });
  group.add(ribbon(stations, width, 0.02, roadMaterial));
  if (train) {
    const railMaterial = new THREE.MeshStandardMaterial({ color: '#acb7b9', roughness: 0.42, metalness: 0.65, side: THREE.DoubleSide });
    group.add(ribbon(stations, 0.105, 0.2, railMaterial, -0.7175));
    group.add(ribbon(stations, 0.105, 0.2, railMaterial, 0.7175));
    const first = Math.ceil(from / 2.8) * 2.8;
    const count = Math.max(0, Math.floor((to - first) / 2.8) + 1);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: '#6b6c5d', roughness: 1 }), count);
    const transform = new THREE.Object3D();
    for (let index = 0; index < count; index++) {
      const point = sampleRoutePosition(path, first + index * 2.8);
      transform.position.set(point.x, point.y + 0.09, point.z);
      transform.rotation.set(0, Math.atan2(-point.tangentZ, point.tangentX) - Math.PI / 2, 0);
      transform.updateMatrix();
      sleepers.setMatrixAt(index, transform.matrix);
    }
    group.add(sleepers);
  } else if (route.transport === 'car') {
    const marks = Math.max(0, Math.ceil((to - from) / 12));
    const material = new THREE.MeshStandardMaterial({ color: '#e9e4ca', roughness: 1, side: THREE.DoubleSide });
    for (let index = 0; index < marks; index++) {
      const start = Math.ceil(from / 12) * 12 + index * 12;
      if (start >= to) break;
      group.add(ribbon(routeStations(path, start, Math.min(start + 4, to), 2), 0.12, 0.05, material));
    }
    group.add(ribbon(stations, 0.1, 0.05, material, -3.2));
    group.add(ribbon(stations, 0.1, 0.05, material, 3.2));
  }

  const treeData: { point: THREE.Vector3; height: number; variant: number; rotation: number }[] = [];
  for (let section = Math.floor(from / 45); section <= Math.ceil(to / 45); section++) {
    const random = seeded(section * 739 + 94);
    const point = sampleRoutePosition(path, clamp(section * 45 + random() * 30, from, to));
    for (let tree = 0; tree < 8; tree++) {
      const offset = (tree % 2 ? 1 : -1) * (20 + random() ** 1.8 * 720);
      const x = point.x - point.tangentZ * offset;
      const z = point.z + point.tangentX * offset;
      if (distanceFromRoute(x, z, stations) < 14) continue;
      treeData.push({ point: new THREE.Vector3(x, terrainHeight(point, offset), z), height: 5 + random() * 14, variant: Math.floor(random() * 3), rotation: random() * Math.PI });
    }
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.24, 1, 5), new THREE.MeshStandardMaterial({ color: '#736e59', roughness: 1 }), treeData.length);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), treeData.length);
  const lowerLeaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), treeData.length);
  const transform = new THREE.Object3D();
  treeData.forEach((tree, index) => {
    transform.position.copy(tree.point).add(new THREE.Vector3(0, tree.height * 0.24, 0));
    transform.scale.set(1, tree.height * 0.48, 1);
    transform.rotation.set(0, tree.rotation, 0);
    transform.updateMatrix();
    trunks.setMatrixAt(index, transform.matrix);
    transform.position.copy(tree.point).add(new THREE.Vector3(0, tree.height * 0.62, 0));
    transform.scale.set(tree.height * 0.28, tree.height * 0.85, tree.height * 0.28);
    transform.updateMatrix();
    leaves.setMatrixAt(index, transform.matrix);
    leaves.setColorAt(index, new THREE.Color(colors.foliage[tree.variant]));
    transform.position.copy(tree.point).add(new THREE.Vector3(0, tree.height * 0.42, 0));
    transform.scale.set(tree.height * 0.33, tree.height * 0.56, tree.height * 0.33);
    transform.updateMatrix();
    lowerLeaves.setMatrixAt(index, transform.matrix);
    lowerLeaves.setColorAt(index, new THREE.Color(colors.foliage[tree.variant]).multiplyScalar(0.92));
  });
  group.add(trunks, leaves, lowerLeaves);
  return group;
}

function buildRuntime(host: HTMLDivElement, route: Route, variant: Variant): Runtime {
  const path = projectRoute(route.points);
  const colors = palette(variant);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = colors.night ? 0.9 : 1.05;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;position:absolute;inset:0';
  renderer.domElement.setAttribute('aria-label', 'Prévia 3D ilustrativa do percurso');
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.sky);
  scene.fog = new THREE.Fog(colors.sky, variant.weather === 'rain' || variant.weather === 'snow' ? 120 : 500, variant.weather === 'rain' || variant.weather === 'snow' ? 1_100 : 1_850);
  const camera = new THREE.PerspectiveCamera(61, 1, 0.1, 3_000);
  scene.add(new THREE.HemisphereLight(colors.night ? '#9cb2d1' : '#f2f0df', '#76866e', colors.ambient));
  const sun = new THREE.DirectionalLight(colors.sun, colors.sunlight);
  sun.position.set(-500, variant.timeOfDay === 'day' ? 800 : 140, -500);
  scene.add(sun);
  let corridor: THREE.Group | undefined;
  let corridorDistance = -Infinity;
  let currentProgress = 0;

  const particles = variant.weather === 'rain' || variant.weather === 'snow';
  const precipitationPositions = new Float32Array(500 * 3);
  const random = seeded(841);
  const precipitationSeeds = Array.from({ length: 500 }, () => ({ x: (random() - 0.5) * 110, y: random() * 45, z: (random() - 0.5) * 110 }));
  const precipitationGeometry = new THREE.BufferGeometry();
  precipitationGeometry.setAttribute('position', new THREE.BufferAttribute(precipitationPositions, 3));
  const precipitationMaterial = new THREE.PointsMaterial({ color: colors.night ? '#b7cadc' : '#f5f8f7', size: variant.weather === 'snow' ? 0.19 : 0.065, transparent: true, opacity: variant.weather === 'snow' ? 0.8 : 0.5, depthWrite: false });
  const precipitation = new THREE.Points(precipitationGeometry, precipitationMaterial);
  precipitation.frustumCulled = false;
  if (particles) scene.add(precipitation);

  const draw = (requestedProgress: number) => {
    currentProgress = clamp(Number.isFinite(requestedProgress) ? requestedProgress : 0, 0, 1);
    const distance = currentProgress * path.length;
    // A fixed bucket makes a frame reproducible when seeking or exporting out of order.
    const corridorAnchor = Math.floor(distance / 100) * 100;
    if (!corridor || corridorAnchor !== corridorDistance) {
      if (corridor) { scene.remove(corridor); disposeObject(corridor); }
      corridor = buildCorridor(path, corridorAnchor, route, variant);
      scene.add(corridor);
      corridorDistance = corridorAnchor;
    }
    const position = sampleRoutePosition(path, distance);
    const forward = sampleRoutePosition(path, distance + 22);
    const behind = sampleRoutePosition(path, distance - 6);
    let direction = new THREE.Vector3(forward.x - behind.x, 0, forward.z - behind.z);
    if (direction.lengthSq() < 0.0001) direction = new THREE.Vector3(position.tangentX, 0, position.tangentZ);
    direction.normalize();
    const height = route.transport === 'train' ? 2.7 : route.transport === 'car' ? 1.85 : 1.7;
    camera.position.set(position.x, position.y + height, position.z);
    const lookHeight = position.y + height + clamp((forward.y - behind.y) / 28, -0.25, 0.25) * 25 - 0.5;
    camera.lookAt(position.x + direction.x * 25, lookHeight, position.z + direction.z * 25);
    if (particles) {
      const animationTime = currentProgress * variant.durationMinutes * 60;
      precipitationSeeds.forEach((seed, index) => {
        precipitationPositions[index * 3] = position.x + seed.x + (variant.weather === 'snow' ? Math.sin(animationTime * 0.3 + index) * 0.9 : 0);
        precipitationPositions[index * 3 + 1] = position.y - 2 + ((seed.y - animationTime * (variant.weather === 'snow' ? 1.3 : 14)) % 45 + 45) % 45;
        precipitationPositions[index * 3 + 2] = position.z + seed.z;
      });
      precipitationGeometry.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
  };
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    renderer.setSize(Math.round(width), Math.round(height), false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw(currentProgress);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  return {
    draw,
    dispose: () => {
      observer.disconnect();
      disposeObject(scene);
      if (!particles) { precipitationGeometry.dispose(); precipitationMaterial.dispose(); }
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

export function JourneyScene({ route, variant, progress, onReady, className = '' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const readyRef = useRef(onReady);
  const progressRef = useRef(progress);
  const [error, setError] = useState<string | null>(null);
  readyRef.current = onReady;
  progressRef.current = progress;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setError(null);
    try {
      const runtime = buildRuntime(host, route, variant);
      runtimeRef.current = runtime;
      runtime.draw(progressRef.current);
      readyRef.current?.();
      return () => { runtime.dispose(); runtimeRef.current = null; };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar a prévia 3D.');
    }
  }, [route, variant.season, variant.timeOfDay, variant.weather, variant.durationMinutes]);

  useEffect(() => { runtimeRef.current?.draw(progress); }, [progress]);

  return <div ref={hostRef} className={`scene-root ${className}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#b0c3c8' }}>
    {error && <div role="status" style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'grid', placeContent: 'center', textAlign: 'center', padding: '2rem', color: '#223b39', background: '#e8efea', gap: '.5rem' }}>
      <strong>A prévia 3D precisa de WebGL.</strong><span>{error}</span><span>Se estiver disponível, ative a aceleração gráfica do navegador e recarregue.</span>
    </div>}
  </div>;
}
