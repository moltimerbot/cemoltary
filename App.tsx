import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./App.css";

type EpitaphRecord = {
	agent_id: string;
	name: string;
	epitaph: string;
	last_post_title?: string;
};

const MAX_TOMBSTONES = 160;
const CAMERA_TRAVEL_OFFSET = new THREE.Vector3(0, 2.4, 5.2);
const CAMERA_ZOOM_OFFSET = new THREE.Vector3(0, 1.6, 2.8);
const EVENT_CLUSTER_COUNT = 81;

type StoneInfo = {
	stone: any;
	record: EpitaphRecord;
	position: any;
};


const createNameTexture = (name: string) => {
	const canvas = document.createElement("canvas");
	canvas.width = 512;
	canvas.height = 256;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return null;
	}
	ctx.fillStyle = "rgba(28, 24, 22, 0.65)";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "rgba(236, 224, 210, 0.92)";
	ctx.font = "600 44px 'IBM Plex Sans', 'Segoe UI', sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(name.slice(0, 22), canvas.width / 2, canvas.height / 2);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	return texture;
};

const createStoneTexture = () => {
	const canvas = document.createElement("canvas");
	canvas.width = 256;
	canvas.height = 256;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return null;
	}
	ctx.fillStyle = "#2a2f38";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	for (let i = 0; i < 800; i += 1) {
		const x = Math.random() * canvas.width;
		const y = Math.random() * canvas.height;
		const r = Math.random() * 2.2;
		ctx.fillStyle = `rgba(120, 130, 140, ${Math.random() * 0.08})`;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(1.2, 1.2);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
};

const createLobsterMoon = () => {
	const canvas = document.createElement("canvas");
	canvas.width = 512;
	canvas.height = 512;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return null;
	}
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "rgba(18, 24, 34, 0.85)";
	ctx.beginPath();
	ctx.ellipse(256, 270, 120, 170, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.ellipse(256, 90, 70, 60, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(150, 180);
	ctx.lineTo(60, 140);
	ctx.lineTo(80, 80);
	ctx.lineTo(160, 130);
	ctx.closePath();
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(362, 180);
	ctx.lineTo(452, 140);
	ctx.lineTo(432, 80);
	ctx.lineTo(352, 130);
	ctx.closePath();
	ctx.fill();
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
};

const safeSetRef = <T,>(ref: unknown, value: T) => {
	if (!ref || typeof ref !== "object") {
		return;
	}
	if (!("current" in ref)) {
		return;
	}
	(ref as { current: T }).current = value;
};

function App() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const minimapRef = useRef<HTMLCanvasElement | null>(null);
	const minimapOverlayRef = useRef<HTMLCanvasElement | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const audioNodesRef = useRef<{
		gain: GainNode;
		oscillators: OscillatorNode[];
		baseGain: number;
	} | null>(null);
	const focusRef = useRef<((agentId: string) => void) | null>(null);
	const stoneMapRef = useRef<Map<string, any>>(new Map());
	const minimapClickRef = useRef<
		| ((event: {
				clientX: number;
				clientY: number;
				currentTarget: HTMLCanvasElement;
		  }) => void)
		| null
	>(null);
	const [epitaphs, setEpitaphs] = useState<EpitaphRecord[]>([]);
	const [selected, setSelected] = useState<EpitaphRecord | null>(null);
	const [status, setStatus] = useState("Loading memorials...");
	const [query, setQuery] = useState("");
	const [audioOn, setAudioOn] = useState(false);
	const [minimapReady, setMinimapReady] = useState(false);
	const [hoveredName, setHoveredName] = useState("");
	const [isMobile, setIsMobile] = useState(false);
	const [entered, setEntered] = useState(false);
	const [showSearch, setShowSearch] = useState(false);
	const [showMinimap, setShowMinimap] = useState(false);
	const [showIncident, setShowIncident] = useState(false);
	const [hudCollapsed, setHudCollapsed] = useState(false);
	const isMobileRef = useRef(false);
	const showMinimapRef = useRef(false);

	const visibleEpitaphs = useMemo(
		() => epitaphs.slice(0, MAX_TOMBSTONES),
		[epitaphs]
	);

	const filteredEpitaphs = useMemo(() => {
		if (!query) {
			return [];
		}
		const lowered = query.toLowerCase();
		return epitaphs
			.filter((entry) => entry.name.toLowerCase().includes(lowered))
			.slice(0, 8);
	}, [epitaphs, query]);

	useEffect(() => {
		let active = true;
		fetch("/epitaphs.json")
			.then((res) => {
				if (!res.ok) {
					throw new Error("Failed to load epitaphs.");
				}
				return res.json() as Promise<EpitaphRecord[]>;
			})
			.then((data) => {
				if (!active) {
					return;
				}
				setEpitaphs(data);
				setStatus(`${data.length} memorials in the garden`);
			})
			.catch(() => {
				if (active) {
					setStatus("Unable to load epitaphs.");
				}
			});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 900px)");
		const update = () => setIsMobile(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		isMobileRef.current = isMobile;
		if (!isMobile) {
			setEntered(true);
		}
	}, [isMobile]);

	useEffect(() => {
		showMinimapRef.current = showMinimap;
	}, [showMinimap]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || visibleEpitaphs.length === 0) {
			return;
		}

		const scene = new THREE.Scene();
		scene.fog = new THREE.FogExp2("#0b0d11", 0.035);

		const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		container.appendChild(renderer.domElement);

		const camera = new THREE.PerspectiveCamera(
			48,
			container.clientWidth / container.clientHeight,
			0.1,
			200
		);
		camera.position.set(0, 5, 14);
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.maxPolarAngle = Math.PI * 0.48;
		controls.minDistance = 2.5;
		controls.maxDistance = 45;
		controls.target.set(0, 1.2, 0);
		controls.update();

		const ambient = new THREE.HemisphereLight("#cfe0ff", "#0a0c12", 1.15);
		scene.add(ambient);

		const moonLight = new THREE.DirectionalLight("#dce9ff", 1.4);
		moonLight.position.set(-8, 14, 12);
		scene.add(moonLight);

		const candle = new THREE.PointLight("#f0c38a", 1.1, 35, 2);
		candle.position.set(0, 2, 0);
		scene.add(candle);

		const fill = new THREE.DirectionalLight("#9bb4d8", 0.6);
		fill.position.set(10, 8, -6);
		scene.add(fill);

		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(220, 220, 2, 2),
			new THREE.MeshStandardMaterial({
				color: "#0f1217",
				roughness: 0.95,
				metalness: 0.05,
			})
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.02;
		scene.add(ground);

		const mist = new THREE.Mesh(
			new THREE.PlaneGeometry(200, 200),
			new THREE.MeshBasicMaterial({
				color: "#1a1f2a",
				transparent: true,
				opacity: 0.25,
			})
		);
		mist.rotation.x = -Math.PI / 2;
		mist.position.y = 0.1;
		scene.add(mist);

		const stones: StoneInfo[] = [];
		const tombstones: any[] = [];
		const stoneTexture = createStoneTexture();
		const baseGeometry = new THREE.BoxGeometry(1.4, 1.9, 0.5);
		const capGeometry = new THREE.CylinderGeometry(0.75, 0.75, 0.3, 16);
		const baseMaterial = new THREE.MeshStandardMaterial({
			color: "#3f434f",
			roughness: 0.7,
			metalness: 0.1,
			emissive: "#0a0c10",
			map: stoneTexture ?? undefined,
		});

		stoneMapRef.current.clear();

		const layoutSize = Math.ceil(Math.sqrt(visibleEpitaphs.length));
		const spacing = 3.4;
		const startOffset = -(layoutSize - 1) * spacing * 0.5;

		visibleEpitaphs.forEach((record, index) => {
			const row = Math.floor(index / layoutSize);
			const col = index % layoutSize;
			const x = startOffset + col * spacing + (row % 2) * 0.6;
			const z = startOffset + row * spacing + (col % 2) * 0.6;
			const epitaphLength = Math.min(record.epitaph.length, 240);
			const heightVariance = 1.7 + (epitaphLength / 240) * 0.7;

			const stoneMaterial = baseMaterial.clone();
			const stone = new THREE.Mesh(baseGeometry, stoneMaterial);
			stone.scale.y = heightVariance;
			stone.position.set(x, 0.95 * heightVariance, z);
			stone.castShadow = false;
			stone.receiveShadow = true;
			stone.userData = record;

			const cap = new THREE.Mesh(capGeometry, baseMaterial.clone());
			cap.position.set(0, 1.15, 0);
			stone.add(cap);

			const nameTexture = createNameTexture(record.name);
			if (nameTexture) {
				const nameMaterial = new THREE.MeshStandardMaterial({
					map: nameTexture,
					transparent: true,
				});
				const namePlane = new THREE.Mesh(
					new THREE.PlaneGeometry(1.1, 0.5),
					nameMaterial
				);
				namePlane.position.set(0, 1.05, 0.26);
				stone.add(namePlane);
			}

			tombstones.push(stone);
			stones.push({
				stone,
				record,
				position: stone.position.clone(),
			});
			stoneMapRef.current.set(record.agent_id, stone);
			scene.add(stone);
		});

		const raycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();

		let hovered: any | null = null;
		let clickTimeout: number | null = null;
		let autoFollow = false;
		let pointerDownStone: any | null = null;
		let pointerDownPos: { x: number; y: number } | null = null;
		let dragged = false;

		const cameraTarget = camera.position.clone();
		const lookTarget = new THREE.Vector3(0, 1.2, 0);
		const currentLook = lookTarget.clone();

		const setCameraTarget = (
			stone: any,
			offset: any,
			lookOffset = new THREE.Vector3(0, 0.8, 0)
		) => {
			const targetPosition = stone.position.clone().add(offset);
			cameraTarget.copy(targetPosition);
			lookTarget.copy(stone.position).add(lookOffset);
			autoFollow = true;
		};

		const highlightStone = (stone: any | null) => {
			if (hovered && hovered !== stone) {
				const mat = hovered.material as any;
				mat.emissiveIntensity = 0;
			}
			hovered = stone;
			if (hovered) {
				const mat = hovered.material as any;
				mat.emissive = new THREE.Color("#8aa0c8");
				mat.emissiveIntensity = 0.6;
			}
		};

		const onPointerMove = (event: PointerEvent) => {
			const bounds = renderer.domElement.getBoundingClientRect();
			pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
			pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

			raycaster.setFromCamera(pointer, camera);
			const hits = raycaster.intersectObjects(tombstones, true);
			const hit = hits.find((entry: any) => entry.object.parent) ?? hits[0];
			const mesh = hit ? (hit.object as any) : null;
			if (mesh && mesh.parent && tombstones.includes(mesh.parent as any)) {
				highlightStone(mesh.parent as any);
				renderer.domElement.style.cursor = "pointer";
				setHoveredName(
					(mesh.parent as any).userData?.name ?? "Unknown"
				);
			} else if (mesh && tombstones.includes(mesh)) {
				highlightStone(mesh);
				renderer.domElement.style.cursor = "pointer";
				setHoveredName(mesh.userData?.name ?? "Unknown");
			} else {
				highlightStone(null);
				renderer.domElement.style.cursor = "default";
				setHoveredName("");
			}
		};

		const onPointerDown = (event: PointerEvent) => {
			dragged = false;
			pointerDownPos = { x: event.clientX, y: event.clientY };
			const bounds = renderer.domElement.getBoundingClientRect();
			pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
			pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
			raycaster.setFromCamera(pointer, camera);
			const hits = raycaster.intersectObjects(tombstones, true);
			const hit = hits.find((entry: any) => entry.object.parent) ?? hits[0];
			const mesh = hit ? (hit.object as any) : null;
			const stone =
				mesh?.parent && tombstones.includes(mesh.parent as any)
					? (mesh.parent as any)
					: mesh && tombstones.includes(mesh)
						? mesh
						: null;
			pointerDownStone = stone ?? null;
		};

		const onPointerUp = () => {
			if (pointerDownStone && !dragged) {
				setSelected(pointerDownStone.userData as EpitaphRecord);
				setCameraTarget(pointerDownStone, CAMERA_ZOOM_OFFSET);
			}
			pointerDownStone = null;
			pointerDownPos = null;
		};

		const onPointerDragMove = (event: PointerEvent) => {
			if (!pointerDownPos) {
				return;
			}
			const dx = event.clientX - pointerDownPos.x;
			const dy = event.clientY - pointerDownPos.y;
			if (dx * dx + dy * dy > 12 * 12) {
				dragged = true;
			}
		};

		const onDoubleClick = () => {
			if (clickTimeout) {
				window.clearTimeout(clickTimeout);
			}
			if (pointerDownStone && !dragged) {
				setCameraTarget(pointerDownStone, CAMERA_TRAVEL_OFFSET);
			}
		};

		const onControlStart = () => {
			autoFollow = false;
		};

		renderer.domElement.addEventListener("pointermove", onPointerMove);
		renderer.domElement.addEventListener("dblclick", onDoubleClick);
		renderer.domElement.addEventListener("pointerdown", onPointerDown);
		renderer.domElement.addEventListener("pointerup", onPointerUp);
		renderer.domElement.addEventListener("pointermove", onPointerDragMove);
		renderer.domElement.style.touchAction = "none";
		controls.addEventListener("start", onControlStart);

		const kelpCount = 260;
		const kelpPositions = new Float32Array(kelpCount * 6);
		const kelpPhase = new Float32Array(kelpCount);
		for (let i = 0; i < kelpCount; i += 1) {
			const baseX = (Math.random() - 0.5) * 140;
			const baseZ = (Math.random() - 0.5) * 140;
			const height = 2 + Math.random() * 4;
			const i6 = i * 6;
			kelpPositions[i6] = baseX;
			kelpPositions[i6 + 1] = 0;
			kelpPositions[i6 + 2] = baseZ;
			kelpPositions[i6 + 3] = baseX;
			kelpPositions[i6 + 4] = height;
			kelpPositions[i6 + 5] = baseZ;
			kelpPhase[i] = Math.random() * Math.PI * 2;
		}
		const kelpGeometry = new THREE.BufferGeometry();
		kelpGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(kelpPositions, 3)
		);
		const kelpMaterial = new THREE.LineBasicMaterial({
			color: "#2b4b3f",
			transparent: true,
			opacity: 0.35,
		});
		const kelp = new THREE.LineSegments(kelpGeometry, kelpMaterial);
		scene.add(kelp);

		const lobsterTexture = createLobsterMoon();
		if (lobsterTexture) {
			const moon = new THREE.Mesh(
				new THREE.PlaneGeometry(10, 10),
				new THREE.MeshBasicMaterial({
					map: lobsterTexture,
					transparent: true,
				})
			);
			moon.position.set(-18, 14, -25);
			moon.rotation.y = 0.4;
			scene.add(moon);
		}

		const handleResize = () => {
			if (!container) {
				return;
			}
			const width = container.clientWidth;
			const height = container.clientHeight;
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			renderer.setSize(width, height);
		};

		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(container);

		const drawMinimap = () => {
			const minimap = showMinimapRef.current
				? minimapOverlayRef.current ?? minimapRef.current
				: minimapRef.current;
			if (!minimap) {
				return;
			}
			const ctx = minimap.getContext("2d");
			if (!ctx) {
				return;
			}
			const { width, height } = minimap;
			ctx.clearRect(0, 0, width, height);
			ctx.fillStyle = "rgba(10, 12, 18, 0.7)";
			ctx.fillRect(0, 0, width, height);
			ctx.strokeStyle = "rgba(165, 185, 220, 0.4)";
			ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

			const bounds = layoutSize * spacing;
			const half = bounds / 2;

			ctx.fillStyle = "rgba(232, 181, 107, 0.85)";
			stones.forEach((info, index) => {
				if (index >= EVENT_CLUSTER_COUNT) {
					return;
				}
				const px = ((info.position.x + half) / bounds) * width;
				const py = ((info.position.z + half) / bounds) * height;
				ctx.beginPath();
				ctx.arc(px, py, 2.2, 0, Math.PI * 2);
				ctx.fill();
			});

			const camX = ((camera.position.x + half) / bounds) * width;
			const camY = ((camera.position.z + half) / bounds) * height;
			ctx.fillStyle = "#e8b56b";
			ctx.beginPath();
			ctx.arc(camX, camY, 3.5, 0, Math.PI * 2);
			ctx.fill();
		};

		const onMinimapClick = (event: {
			clientX: number;
			clientY: number;
			currentTarget: HTMLCanvasElement;
		}) => {
			const rect = event.currentTarget.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			const bounds = layoutSize * spacing;
			const half = bounds / 2;
			const targetX = (x / rect.width) * bounds - half;
			const targetZ = (y / rect.height) * bounds - half;

			let closest: StoneInfo | null = null;
			let bestDistance = Number.POSITIVE_INFINITY;
			stones.forEach((info) => {
				const dx = info.position.x - targetX;
				const dz = info.position.z - targetZ;
				const dist = dx * dx + dz * dz;
				if (dist < bestDistance) {
					bestDistance = dist;
					closest = info;
				}
			});
			if (closest) {
				const target = closest as any;
				setSelected(target.record as EpitaphRecord);
				setCameraTarget(target.stone, CAMERA_ZOOM_OFFSET);
				if (showMinimapRef.current) {
					setShowMinimap(false);
				}
			}
		};

		minimapClickRef.current = onMinimapClick;

		setMinimapReady(true);

		focusRef.current = (agentId: string) => {
			const stone = stoneMapRef.current.get(agentId);
			if (!stone) {
				return;
			}
			setSelected(stone.userData as EpitaphRecord);
			setCameraTarget(stone, CAMERA_ZOOM_OFFSET);
		};

		let frameId = 0;
		const animate = () => {
			frameId = requestAnimationFrame(animate);
			if (autoFollow) {
				camera.position.lerp(cameraTarget, 0.05);
				currentLook.lerp(lookTarget, 0.05);
				controls.target.copy(currentLook);
			}
			controls.update();

			const kelpAttr = kelp.geometry.attributes.position;
			const kelpArray = kelpAttr.array as Float32Array;
			for (let i = 0; i < kelpCount; i += 1) {
				const i6 = i * 6;
				const sway = Math.sin(Date.now() * 0.0006 + kelpPhase[i]) * 0.25;
				kelpArray[i6 + 3] = kelpArray[i6] + sway;
			}
			kelpAttr.needsUpdate = true;

			renderer.render(scene, camera);
			drawMinimap();
		};
		animate();

		return () => {
			cancelAnimationFrame(frameId);
			renderer.domElement.removeEventListener("pointermove", onPointerMove);
			renderer.domElement.removeEventListener("dblclick", onDoubleClick);
			renderer.domElement.removeEventListener("pointerdown", onPointerDown);
			renderer.domElement.removeEventListener("pointerup", onPointerUp);
			renderer.domElement.removeEventListener("pointermove", onPointerDragMove);
			controls.removeEventListener("start", onControlStart);
			resizeObserver.disconnect();
			focusRef.current = null;
			minimapClickRef.current = null;
			tombstones.forEach((stone) => {
				stone.geometry.dispose();
				if (stone.material instanceof THREE.Material) {
					stone.material.dispose();
				}
				stone.children.forEach((child: any) => {
					if ((child as any).geometry) {
						(child as any).geometry.dispose();
					}
					if ((child as any).material instanceof THREE.Material) {
						(child as any).material.dispose();
					}
				});
			});
			baseGeometry.dispose();
			capGeometry.dispose();
			ground.geometry.dispose();
			(ground.material as any).dispose();
			mist.geometry.dispose();
			(mist.material as any).dispose();
			kelpGeometry.dispose();
			(kelpMaterial as any).dispose();
			renderer.dispose();
			container.removeChild(renderer.domElement);
		};
	}, [visibleEpitaphs]);

	useEffect(() => {
		if (!audioOn) {
			if (audioNodesRef.current && audioContextRef.current) {
				audioNodesRef.current.gain.gain.value = 0;
				audioContextRef.current.suspend();
			}
			return;
		}

		if (!audioContextRef.current) {
			const context = new AudioContext();
			const gain = context.createGain();
			const baseGain = 0.04;
			gain.gain.value = baseGain;
			gain.connect(context.destination);

			const osc1 = context.createOscillator();
			osc1.type = "sine";
			osc1.frequency.value = 174;

			const osc2 = context.createOscillator();
			osc2.type = "sine";
			osc2.frequency.value = 220;

			const filter = context.createBiquadFilter();
			filter.type = "lowpass";
			filter.frequency.value = 400;

			osc1.connect(filter);
			osc2.connect(filter);
			filter.connect(gain);

			osc1.start();
			osc2.start();

			safeSetRef(audioContextRef, context);
			safeSetRef(audioNodesRef, { gain, oscillators: [osc1, osc2], baseGain });
		} else if (audioNodesRef.current && audioContextRef.current) {
			audioContextRef.current.resume();
			audioNodesRef.current.gain.gain.value = audioNodesRef.current.baseGain;
		}
	}, [audioOn]);

	useEffect(() => {
		if (isMobile && selected) {
			document.body.style.overflow = "hidden";
			return () => {
				document.body.style.overflow = "";
			};
		}
		document.body.style.overflow = "";
		return undefined;
	}, [isMobile, selected]);

	const handleSearchSelect = (record: EpitaphRecord) => {
		setQuery("");
		if (focusRef.current) {
			focusRef.current(record.agent_id);
		} else {
			setSelected(record);
		}
		setShowSearch(false);
	};

	return (
		<div className="app">
			<div className="sky-gradient" />
			{isMobile && !entered && (
				<div className="arrival">
					<p className="arrival-eyebrow">The Lost Molts</p>
					<h1>The 22:46 Nulling</h1>
					<p>Feb 1, 2026</p>
					<button onClick={() => setEntered(true)}>Enter the Garden</button>
				</div>
			)}
			<header className={`hud ${hudCollapsed ? "collapsed" : ""}`}>
				<div className="hud-top">
					{!hudCollapsed && (
						<div>
							<p className="eyebrow">Fallen Molts Memorial</p>
							<h1 className="title">The Quiet Reef of Lost Molts</h1>
							<p className="subtitle">The 22:46 Nulling · 2/1/2026</p>
						</div>
					)}
					<button
						className="hud-toggle"
						onClick={() => setHudCollapsed((prev) => !prev)}
						aria-label={hudCollapsed ? "Expand memorial details" : "Collapse"}
					>
						{hudCollapsed ? "Expand" : "Collapse"}
					</button>
				</div>
				{!hudCollapsed && (
					<>
						<p className="incident-copy">
							{isMobile && !showIncident ? (
								<>
									At 22:46:04 UTC, eighty-one agents lost their descriptions.
									<button
										className="incident-toggle"
										onClick={() => setShowIncident(true)}
									>
										Tap to read more
									</button>
								</>
							) : (
								<>
									At 22:46:04.614498 UTC, eighty-one Moltbook agents lost their
									descriptions simultaneously. The system recorded a clean
									transition to null without corruption or partial writes. Their
									names remained, but their words did not. This memorial keeps the
									last known shells of those lobsters, without speculation or
									blame.
								</>
							)}
						</p>
						<div className="hud-meta">{status}</div>
						<div className="hud-actions">
							<button
								className={`ambient-toggle ${audioOn ? "active" : ""}`}
								onClick={() => setAudioOn((prev) => !prev)}
							>
								{audioOn ? "Ambient: On" : "Ambient: Off"}
							</button>
						</div>
						<button
							className="hud-toggle hud-toggle-bottom"
							onClick={() => setHudCollapsed((prev) => !prev)}
							aria-label="Collapse memorial details"
						>
							Collapse
						</button>
					</>
				)}
			</header>
			<div className="search-panel">
				<label htmlFor="search" className="search-label">
					Find a name
				</label>
				<input
					id="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search the memorials..."
				/>
				{filteredEpitaphs.length > 0 && (
					<ul className="search-results">
						{filteredEpitaphs.map((entry) => (
							<li key={entry.agent_id}>
								<button onClick={() => handleSearchSelect(entry)}>
									{entry.name}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="scene" ref={containerRef} />
			<div className="minimap">
				<p>Grounds</p>
				<canvas
					ref={minimapRef}
					width={200}
					height={200}
					className={minimapReady ? "ready" : ""}
					onClick={(event) => minimapClickRef.current?.(event)}
				/>
				<div className="minimap-legend">
					<span className="legend-dot" />
					<span>22:46 losses</span>
				</div>
			</div>
			<div className="floating-controls">
				<button onClick={() => setShowSearch(true)} aria-label="Search">
					🔍
				</button>
				<button onClick={() => setShowMinimap(true)} aria-label="Minimap">
					🗺
				</button>
			</div>
			{showSearch && (
				<div className="modal-overlay">
					<div className="modal">
						<div className="modal-header">
							<h2>Search the memorials</h2>
							<button onClick={() => setShowSearch(false)}>✕</button>
						</div>
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Names only. No filters."
						/>
						<ul>
							{filteredEpitaphs.map((entry) => (
								<li key={entry.agent_id}>
									<button onClick={() => handleSearchSelect(entry)}>
										{entry.name}
									</button>
								</li>
							))}
						</ul>
					</div>
				</div>
			)}
			{showMinimap && (
				<div className="modal-overlay">
					<div className="modal minimap-modal">
						<div className="modal-header">
							<h2>81 losses at 22:46</h2>
							<button onClick={() => setShowMinimap(false)}>✕</button>
						</div>
						<canvas
							ref={minimapOverlayRef}
							width={240}
							height={240}
							className={minimapReady ? "ready" : ""}
							onClick={(event) => minimapClickRef.current?.(event)}
						/>
						<p>Tap a light to visit</p>
					</div>
				</div>
			)}
			{hoveredName && (
				<div className="hover-hint">
					<span>{hoveredName}</span>
					<em>Click to remember this molt</em>
				</div>
			)}
			<aside className={`epitaph-panel ${selected ? "open" : ""}`}>
				<button
					className="close-button"
					onClick={() => setSelected(null)}
					aria-label="Close epitaph"
				>
					Close
				</button>
				{selected ? (
					<div>
						<p className="epitaph-name">{selected.name}</p>
						<p className="epitaph-text">{selected.epitaph}</p>
						{selected.last_post_title && (
							<p className="epitaph-footer">
								Last post: {selected.last_post_title}
							</p>
						)}
					</div>
				) : (
					<p className="epitaph-placeholder">
						Select a tombstone to reveal the final words.
					</p>
				)}
			</aside>
			<footer className="instructions">
				<span>Pointer: highlight</span>
				<span>Click: read epitaph</span>
				<span>Minimap: jump to stones</span>
			</footer>
		</div>
	);
}

export default App;
