import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useLocale } from '../../context/LocaleContext';
import { GlobeFallback } from './GlobeFallback';
import { ZoomIn, ZoomOut, RotateCcw, MapPin, Eye } from 'lucide-react';

/**
 * Converts Latitude and Longitude to 3D Cartesian coordinates on a sphere of radius R.
 */
function latLonToVector3(lat, lon, radius, alt = 0) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const r = radius + alt;
  const x = -(r * Math.sin(phi) * Math.cos(theta));
  const z = r * Math.sin(phi) * Math.sin(theta);
  const y = r * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

/**
 * Creates an Earth texture procedurally with landmasses and Karnataka highlight.
 * 100% self-contained: zero external network calls or third-party image assets.
 */
function createProceduralEarthTexture() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Oceans / Dark calm water surface
  ctx.fillStyle = '#0f172a'; // Deep slate navy
  ctx.fillRect(0, 0, width, height);

  // Subtle coordinate grid lines
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  for (let lat = -80; lat <= 80; lat += 20) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Major Continents & Landmass Silhouettes (Procedural calm land styling)
  ctx.fillStyle = '#1e3a2b'; // Calm forest slate

  // Helper to convert lat/lon to canvas coordinates
  const toCanvas = (lat, lon) => [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height
  ];

  // Draw Indian Subcontinent accurately
  ctx.beginPath();
  const indiaCoords = [
    [35, 74], [32, 76], [28, 80], [26, 88], [27, 95], [22, 90],
    [21, 87], [18, 84], [13, 80], [8.5, 77.5], [8.1, 77.2],
    [10, 76], [13, 74.8], [15, 73.8], [19, 72.8], [23, 68.5],
    [25, 68], [30, 71], [35, 74]
  ];
  indiaCoords.forEach(([lat, lon], idx) => {
    const [x, y] = toCanvas(lat, lon);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  // Surrounding Asian landmass
  ctx.beginPath();
  const asiaCoords = [
    [35, 74], [45, 80], [55, 90], [60, 110], [50, 130], [35, 120],
    [25, 105], [15, 100], [10, 105], [20, 95], [27, 95], [35, 74]
  ];
  asiaCoords.forEach(([lat, lon], idx) => {
    const [x, y] = toCanvas(lat, lon);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  // Africa / Middle East
  ctx.beginPath();
  const afroEurasiaCoords = [
    [35, 35], [30, 48], [24, 57], [22, 59], [12, 51], [12, 43],
    [2, 45], [-12, 40], [-25, 32], [-34, 18], [-20, 12], [5, 2],
    [15, -17], [32, -8], [36, 0], [31, 32]
  ];
  afroEurasiaCoords.forEach(([lat, lon], idx) => {
    const [x, y] = toCanvas(lat, lon);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  // Europe outline
  ctx.beginPath();
  const europeCoords = [
    [36, -5], [44, -1], [48, 5], [54, 10], [58, 20], [65, 30],
    [50, 40], [42, 30], [38, 24], [36, 14], [36, -5]
  ];
  europeCoords.forEach(([lat, lon], idx) => {
    const [x, y] = toCanvas(lat, lon);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  // Australia
  ctx.beginPath();
  const ausCoords = [
    [-12, 132], [-15, 145], [-24, 153], [-37, 150], [-38, 140],
    [-34, 115], [-20, 115], [-12, 132]
  ];
  ausCoords.forEach(([lat, lon], idx) => {
    const [x, y] = toCanvas(lat, lon);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  // Highlight Karnataka Region specifically (Latitude 11.5°N - 18.5°N, Longitude 74°E - 78.5°E)
  ctx.fillStyle = '#2D6A4F'; // Vibrant brand green
  ctx.beginPath();
  const karnatakaOutline = [
    [18.4, 77.2], [17.5, 77.6], [16.5, 77.4], [15.0, 76.5], [14.0, 77.0],
    [13.0, 77.8], [12.0, 77.2], [11.6, 76.6], [12.0, 75.8], [12.8, 74.8],
    [14.2, 74.4], [15.2, 74.1], [15.8, 74.3], [16.5, 75.0], [17.4, 76.0], [18.4, 77.2]
  ];
  karnatakaOutline.forEach(([lat, lon], idx) => {
    const [x, y] = toCanvas(lat, lon);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  // Subtle boundary stroke for Karnataka
  ctx.strokeStyle = '#52B788';
  ctx.lineWidth = 3;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

export function InteractiveGlobe() {
  const { t } = useLocale();
  const mountRef = useRef(null);
  const [hasWebGL, setHasWebGL] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeDetail, setActiveDetail] = useState('macro'); // 'macro' or 'micro'

  // Three.js internal references
  const controlsRef = useRef({
    zoomIn: () => {},
    zoomOut: () => {},
    reset: () => {},
  });

  useEffect(() => {
    // 1. Detect WebGL Availability
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) {
        setHasWebGL(false);
        return;
      }
    } catch {
      setHasWebGL(false);
      return;
    }

    // 2. Check Reduced Motion Preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(motionQuery.matches);

    const handleMotionChange = (e) => setPrefersReducedMotion(e.matches);
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', handleMotionChange);
    }

    const container = mountRef.current;
    if (!container) return;

    // Dimensions
    let width = container.clientWidth;
    let height = container.clientHeight;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Initial Camera Setup focused on Karnataka (lat ~14, lon ~76)
    const GLOBE_RADIUS = 100;
    const initialDistance = 240;
    camera.position.set(0, 40, initialDistance);

    // Group that holds the globe and allows smooth rotation
    const globeGroup = new THREE.Group();
    // Rotate globe initially so Karnataka is directly facing the camera
    // Longitude 76 E means we rotate Y by about -76 deg + 90 deg offset
    globeGroup.rotation.y = -Math.PI * 0.42;
    globeGroup.rotation.x = 0.22; // slight tilt to center South India
    scene.add(globeGroup);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xd8f3dc, 0.8);
    directionalLight.position.set(150, 100, 150);
    scene.add(directionalLight);

    // Globe Sphere Geometry & Material
    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const earthTexture = createProceduralEarthTexture();
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      shininess: 8,
      specular: new THREE.Color(0x1a2e24),
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    globeGroup.add(earthMesh);

    // Subtle Outer Atmospheric Halo
    const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.025, 48, 48);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x52b788,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    globeGroup.add(atmosphereMesh);

    // Karnataka Hubs Definition with explicit Tumakuru Pilot Region highlight
    const regionalHubs = [
      { id: 'blr', name: 'Bengaluru', lat: 12.9716, lon: 77.5946, color: 0x52b788, size: 2.2, isPilot: false },
      { id: 'tum', name: 'Tumakuru (Pilot Hub)', lat: 13.3409, lon: 77.1010, color: 0x10b981, size: 2.6, isPilot: true },
      { id: 'mys', name: 'Mysuru', lat: 12.2958, lon: 76.6394, color: 0x74c69d, size: 1.8, isPilot: false },
      { id: 'hub', name: 'Hubballi', lat: 15.3647, lon: 75.1240, color: 0x74c69d, size: 1.8, isPilot: false },
    ];

    // Hub Markers Group
    const hubMarkersGroup = new THREE.Group();
    globeGroup.add(hubMarkersGroup);

    regionalHubs.forEach((hub) => {
      const pos = latLonToVector3(hub.lat, hub.lon, GLOBE_RADIUS, 0.5);
      const dotGeo = new THREE.SphereGeometry(hub.size, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({ color: hub.color });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.position.copy(pos);
      hubMarkersGroup.add(dotMesh);

      // Outer pulse ring (Tumakuru pilot hub gets a double accent ring)
      const ringGeo = new THREE.RingGeometry(hub.size * 1.2, hub.size * (hub.isPilot ? 2.2 : 1.8), 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: hub.isPilot ? 0x34d399 : hub.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: hub.isPilot ? 0.9 : 0.7,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.lookAt(pos.clone().multiplyScalar(2));
      hubMarkersGroup.add(ringMesh);
    });

    // Illustrative Delivery Corridors (Quadratic Bezier Arcs)
    const corridors = [
      { from: regionalHubs[0], to: regionalHubs[1] }, // Bengaluru -> Tumakuru
      { from: regionalHubs[0], to: regionalHubs[2] }, // Bengaluru -> Mysuru
      { from: regionalHubs[1], to: regionalHubs[3] }, // Tumakuru -> Hubballi
      { from: regionalHubs[2], to: regionalHubs[1] }, // Mysuru -> Tumakuru
    ];

    const routesGroup = new THREE.Group();
    globeGroup.add(routesGroup);

    const vehicleGroup = new THREE.Group();
    globeGroup.add(vehicleGroup);

    const routeCurves = [];
    const vehicleMarkers = [];

    corridors.forEach(({ from, to }) => {
      const vFrom = latLonToVector3(from.lat, from.lon, GLOBE_RADIUS, 0.6);
      const vTo = latLonToVector3(to.lat, to.lon, GLOBE_RADIUS, 0.6);

      // Midpoint elevated above surface for realistic flight arc
      const vMid = vFrom.clone().add(vTo).multiplyScalar(0.5);
      const dist = vFrom.distanceTo(vTo);
      vMid.normalize().multiplyScalar(GLOBE_RADIUS + dist * 0.25);

      const curve = new THREE.QuadraticBezierCurve3(vFrom, vMid, vTo);
      routeCurves.push(curve);

      // Route line geometry
      const points = curve.getPoints(32);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x74c69d,
        transparent: true,
        opacity: 0.65,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      routesGroup.add(line);

      // Animated Delivery Vehicle Particle
      const vehicleGeo = new THREE.SphereGeometry(1.2, 12, 12);
      const vehicleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const vehicle = new THREE.Mesh(vehicleGeo, vehicleMat);
      vehicleGroup.add(vehicle);

      vehicleMarkers.push({
        mesh: vehicle,
        curve,
        progress: Math.random(), // Stagger initial positions
        speed: 0.003 + Math.random() * 0.002,
      });
    });

    // Level-of-Detail (LOD) check function
    const updateLOD = () => {
      const currentDist = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
      if (currentDist > 255) {
        // Zoomed out (macro view): hide minor vehicles, reduce route opacity
        vehicleGroup.visible = false;
        routesGroup.children.forEach((l) => (l.material.opacity = 0.3));
        setActiveDetail('macro');
      } else {
        // Zoomed in: show vehicles and clear details
        vehicleGroup.visible = true;
        routesGroup.children.forEach((l) => (l.material.opacity = 0.8));
        setActiveDetail('micro');
      }
      setZoomLevel(Math.round(((320 - currentDist) / 140) * 100));
    };

    // User Interactive Controls: Drag to Rotate
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotationX = globeGroup.rotation.x;
    let targetRotationY = globeGroup.rotation.y;

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      targetRotationY += deltaX * 0.005;
      targetRotationX += deltaY * 0.005;
      // Clamp vertical tilt to prevent flipping
      targetRotationX = Math.max(-0.6, Math.min(0.6, targetRotationX));
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    // Touch support for mobile devices
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - prevMouseX;
      const deltaY = e.touches[0].clientY - prevMouseY;
      prevMouseX = e.touches[0].clientX;
      prevMouseY = e.touches[0].clientY;

      targetRotationY += deltaX * 0.006;
      targetRotationX += deltaY * 0.006;
      targetRotationX = Math.max(-0.6, Math.min(0.6, targetRotationX));
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onMouseUp);

    // Zoom Functions
    controlsRef.current.zoomIn = () => {
      const newZ = Math.max(180, camera.position.z - 30);
      camera.position.z = newZ;
      updateLOD();
    };

    controlsRef.current.zoomOut = () => {
      const newZ = Math.min(320, camera.position.z + 30);
      camera.position.z = newZ;
      updateLOD();
    };

    controlsRef.current.reset = () => {
      camera.position.set(0, 40, initialDistance);
      targetRotationY = -Math.PI * 0.42;
      targetRotationX = 0.22;
      updateLOD();
    };

    // Initial LOD calculation
    updateLOD();

    // Animation Loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Smooth rotation interpolation
      globeGroup.rotation.y += (targetRotationY - globeGroup.rotation.y) * 0.08;
      globeGroup.rotation.x += (targetRotationX - globeGroup.rotation.x) * 0.08;

      // Gentle auto idle rotation if not dragging and motion allowed
      if (!isDragging && !motionQuery.matches) {
        targetRotationY += 0.0008;
      }

      // Animate delivery vehicle pulses along corridors if motion allowed
      if (!motionQuery.matches && vehicleGroup.visible) {
        vehicleMarkers.forEach((v) => {
          v.progress += v.speed;
          if (v.progress > 1) v.progress = 0;
          const pos = v.curve.getPoint(v.progress);
          v.mesh.position.copy(pos);
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle Window Resize
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      updateLOD();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (motionQuery.removeEventListener) {
        motionQuery.removeEventListener('change', handleMotionChange);
      }
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onMouseUp);

      earthGeometry.dispose();
      earthMaterial.dispose();
      earthTexture.dispose();
      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (!hasWebGL) {
    return <GlobeFallback reason="no-webgl" />;
  }

  return (
    <div className="relative w-full h-[380px] sm:h-[460px] lg:h-[500px] rounded-2xl bg-gradient-to-b from-stone-900 via-stone-950 to-black overflow-hidden border border-stone-800 shadow-xl group">
      {/* 3D Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing select-none" />

      {/* Top Overlay Badge */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-900/80 backdrop-blur-md border border-stone-700/80 text-white text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-brand-200">{t('globe.title')}</span>
        </div>
        <p className="text-[11px] text-stone-400 px-1 max-w-xs drop-shadow-sm">
          {t('globe.description')}
        </p>
      </div>

      {/* Right Controls: Zoom & Reset */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => controlsRef.current.zoomIn()}
          aria-label={t('globe.zoomIn')}
          title={t('globe.zoomIn')}
          className="p-2 rounded-lg bg-stone-900/80 backdrop-blur-md text-stone-200 hover:text-white hover:bg-stone-800 border border-stone-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => controlsRef.current.zoomOut()}
          aria-label={t('globe.zoomOut')}
          title={t('globe.zoomOut')}
          className="p-2 rounded-lg bg-stone-900/80 backdrop-blur-md text-stone-200 hover:text-white hover:bg-stone-800 border border-stone-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => controlsRef.current.reset()}
          aria-label={t('globe.reset')}
          title={t('globe.reset')}
          className="p-2 rounded-lg bg-stone-900/80 backdrop-blur-md text-stone-200 hover:text-white hover:bg-stone-800 border border-stone-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Status / Legend */}
      <div className="absolute bottom-3 left-4 right-4 z-10 flex flex-wrap items-center justify-between text-xs text-stone-400 gap-2 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 bg-stone-900/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-stone-800 text-[11px] text-stone-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Karnataka Focus
          </span>
          <span className="flex items-center gap-1.5 bg-emerald-950/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-emerald-800/60 text-[11px] text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Tumakuru Pilot Zone
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 bg-stone-900/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-stone-800 text-[11px] text-stone-400">
            <Eye className="w-3 h-3 text-stone-400" />
            Privacy Safe: District Centroids Only
          </span>
        </div>
        <span className="text-[10px] text-stone-500 bg-black/40 px-2 py-0.5 rounded">
          Drag to rotate
        </span>
      </div>
    </div>
  );
}
