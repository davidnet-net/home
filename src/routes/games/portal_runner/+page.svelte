<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		Icon,
		identityState
	} from "@davidnet-net/svelte-ui";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	// Strict TypeScript Interfaces
	interface Wall {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface Portal {
		x: number;
		y: number;
		nx: number;
		ny: number;
		width: number;
		active: boolean;
		color: string;
		glowColor: string;
	}

	interface Coin {
		x: number;
		y: number;
		radius: number;
		collected: boolean;
	}

	interface Goal {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface ButtonObj {
		x: number;
		y: number;
		width: number;
		height: number;
		pressed: boolean;
		targetDoorId: number;
	}

	interface Hazard {
		x: number;
		y: number;
		width: number;
		height: number;
		active: boolean;
	}

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		radius: number;
		color: string;
		alpha: number;
		life: number;
		maxLife: number;
	}

	interface LevelData {
		spawn: { x: number; y: number };
		walls: Wall[];
		doors: Wall[];
		coins: Coin[];
		buttons: ButtonObj[];
		hazards: Hazard[];
		goal: Goal;
	}

	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();
	let score = $state(0);
	let level = $state(1);
	let resetSignal = $state(0);

	// Canvas Constants
	const VIEW_WIDTH = 800;
	const VIEW_HEIGHT = 500;

	const COLORS = {
		bg: "#0f172a",
		wall: "#1e293b",
		wallBorder: "#38bdf8",
		portalBlue: "#3b82f6",
		portalBlueGlow: "#60a5fa",
		portalOrange: "#f97316",
		portalOrangeGlow: "#fb923c",
		goal: "#22c55e",
		coin: "#facc15",
		player: "#e11d48",
		button: "#eab308",
		buttonPressed: "#ca8a04",
		door: "#06b6d4",
		hazard: "#ef4444"
	};

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	// Raycast Line Intersect Helper
	function raySegmentIntersect(
		px: number,
		py: number,
		dx: number,
		dy: number,
		ax: number,
		ay: number,
		bx: number,
		by: number
	): { t: number; x: number; y: number } | null {
		const sx = bx - ax;
		const sy = by - ay;
		const denom = dx * sy - dy * sx;
		if (Math.abs(denom) < 0.0001) return null;

		const t = ((ax - px) * sy - (ay - py) * sx) / denom;
		const u = ((ax - px) * dy - (ay - py) * dx) / denom;

		if (t > 0 && u >= 0 && u <= 1) {
			return {
				t,
				x: px + t * dx,
				y: py + t * dy
			};
		}
		return null;
	}

	// Main Game Effect
	$effect(() => {
		if (!canvasRef) return;
		const ctx = canvasRef.getContext("2d");
		if (!ctx) return;

		const _trigger = resetSignal;

		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}

		let animationFrameId: number;

		// Avatar Image Loading
		let avatarImg: HTMLImageElement | null = null;
		let avatarLoaded = false;
		const avatarURL = identityState?.user?.avatarURL;
		if (avatarURL) {
			const img = new Image();
			img.crossOrigin = "anonymous";
			img.src = avatarURL;
			img.onload = () => {
				avatarImg = img;
				avatarLoaded = true;
			};
		}

		const keys = { left: false, right: false, up: false };
		let mouseX = VIEW_WIDTH / 2;
		let mouseY = VIEW_HEIGHT / 2;

		// Player Attributes
		const player = {
			x: 100,
			y: 350,
			radius: 14,
			vx: 0,
			vy: 0,
			speed: 0.6,
			maxSpeed: 8.0,
			jumpStrength: -10.5,
			gravity: 0.45,
			friction: 0.92,
			grounded: false,
			rotation: 0
		};

		let portalA: Portal = {
			x: 0,
			y: 0,
			nx: 0,
			ny: 0,
			width: 40,
			active: false,
			color: COLORS.portalBlue,
			glowColor: COLORS.portalBlueGlow
		};

		let portalB: Portal = {
			x: 0,
			y: 0,
			nx: 0,
			ny: 0,
			width: 40,
			active: false,
			color: COLORS.portalOrange,
			glowColor: COLORS.portalOrangeGlow
		};

		let particles: Particle[] = [];
		let screenShake = 0;
		let teleportCooldown = 0;

		function triggerShake(intensity = 4) {
			screenShake = Math.max(screenShake, intensity);
		}

		function spawnParticles(x: number, y: number, color: string, count = 10) {
			for (let i = 0; i < count; i++) {
				const angle = Math.random() * Math.PI * 2;
				const speed = 1 + Math.random() * 4;
				particles.push({
					x,
					y,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					radius: 2 + Math.random() * 3,
					color,
					alpha: 1,
					life: 0,
					maxLife: 15 + Math.random() * 15
				});
			}
		}

		// --- GEAVANCEERDE GEÜNIFORMEERDE WILLEKEURIGE KAMERSYSTEMEN ---
		function getLevelData(lvl: number): LevelData {
			const walls: Wall[] = [
				// Buitenste randen van het speelveld
				{ x: 0, y: 0, width: VIEW_WIDTH, height: 20 },
				{ x: 0, y: VIEW_HEIGHT - 20, width: VIEW_WIDTH, height: 20 },
				{ x: 0, y: 0, width: 20, height: VIEW_HEIGHT },
				{ x: VIEW_WIDTH - 20, y: 0, width: 20, height: VIEW_HEIGHT }
			];

			const doors: Wall[] = [];
			const buttons: ButtonObj[] = [];
			const hazards: Hazard[] = [];
			const coins: Coin[] = [];

			// Bepaal het aantal kamers (willekeurig tussen 2 en 4 kolommen afhankelijk van level)
			const numRooms = Math.min(2 + Math.floor(Math.random() * 2) + Math.floor(lvl * 0.2), 4);
			const roomWidth = (VIEW_WIDTH - 40) / numRooms;

			// Genereer muren tussen kamers met doorgangen en optionele deuren
			for (let c = 1; c < numRooms; c++) {
				const wallX = 20 + c * roomWidth - 10;
				const wallThickness = 20;

				// Willekeurige hoogte voor de doorgang
				const doorSize = 130;
				const doorY = 40 + Math.random() * (VIEW_HEIGHT - 180 - doorSize);

				// Bovenste muurdeel
				if (doorY > 30) {
					walls.push({ x: wallX, y: 20, width: wallThickness, height: doorY - 20 });
				}

				// Soms is dit een dichte deur die met een knop opengaat, soms een vrije opening
				const isLockedDoor = Math.random() > 0.4;
				if (isLockedDoor) {
					doors.push({ x: wallX, y: doorY, width: wallThickness, height: doorSize });

					// Plaats een knop in een eerdere kamer of vlakbij
					buttons.push({
						x: (c - 1) * roomWidth + 40 + Math.random() * (roomWidth - 80),
						y: VIEW_HEIGHT - 40,
						width: 30,
						height: 20,
						pressed: false,
						targetDoorId: doors.length - 1
					});
				} else {
					// Vrije doorgang
					const bottomY = doorY + doorSize;
					if (bottomY < VIEW_HEIGHT - 20) {
						walls.push({
							x: wallX,
							y: bottomY,
							width: wallThickness,
							height: VIEW_HEIGHT - 20 - bottomY
						});
					}
				}
			}

			// Voeg unieke obstakels / platformen toe per kamer op basis van willekeur
			for (let i = 0; i < numRooms; i++) {
				const layoutType = Math.floor(Math.random() * 3);
				const rx = 30 + i * roomWidth;

				if (layoutType === 1) {
					// Midden-pilaar / zwevend platform
					walls.push({
						x: rx + roomWidth * 0.25,
						y: 140 + Math.random() * 120,
						width: roomWidth * 0.5,
						height: 18
					});
				} else if (layoutType === 2) {
					// Dubbele kleine plateaus (split-level kamer)
					walls.push({
						x: rx + 20,
						y: 120 + Math.random() * 80,
						width: 60,
						height: 16
					});
					walls.push({
						x: rx + roomWidth - 90,
						y: 260 + Math.random() * 80,
						width: 60,
						height: 16
					});
				}
			}

			// Willekeurige lasers / hazards toevoegen naarmate level stijgt
			const hazardCount = Math.min(Math.floor(lvl * 0.7), 4);
			for (let i = 0; i < hazardCount; i++) {
				const hx = 60 + Math.random() * (VIEW_WIDTH - 120);
				const hy = 80 + Math.random() * (VIEW_HEIGHT - 160);
				const isHorizontal = Math.random() > 0.5;

				hazards.push({
					x: hx,
					y: hy,
					width: isHorizontal ? 80 + Math.random() * 60 : 16,
					height: isHorizontal ? 16 : 80 + Math.random() * 60,
					active: true
				});
			}

			// Spawn links in de eerste kamer
			const spawn = { x: 50, y: VIEW_HEIGHT - 80 };

			// Goal rechts in de laatste kamer
			const goal = {
				x: VIEW_WIDTH - 70,
				y: 50 + Math.random() * (VIEW_HEIGHT - 140),
				width: 40,
				height: 60
			};

			// Munten verspreiden door de kamers
			const coinCount = Math.min(2 + Math.floor(lvl / 2), 7);
			for (let i = 0; i < coinCount; i++) {
				const roomIdx = i % numRooms;
				coins.push({
					x: 40 + roomIdx * roomWidth + Math.random() * (roomWidth - 60),
					y: 50 + Math.random() * (VIEW_HEIGHT - 100),
					radius: 8,
					collected: false
				});
			}

			return { spawn, walls, doors, coins, buttons, hazards, goal };
		}
		// --------------------------------------------------------------------

		let currentLevelData = getLevelData(level);

		function resetPlayerPosition() {
			player.x = currentLevelData.spawn.x;
			player.y = currentLevelData.spawn.y;
			player.vx = 0;
			player.vy = 0;
			portalA.active = false;
			portalB.active = false;
			teleportCooldown = 0;
		}

		resetPlayerPosition();

		function shootPortal(type: "blue" | "orange") {
			const dx = mouseX - player.x;
			const dy = mouseY - player.y;
			const len = Math.hypot(dx, dy);
			if (len === 0) return;

			const ndx = dx / len;
			const ndy = dy / len;

			let closestHit: { t: number; x: number; y: number; nx: number; ny: number } | null = null;

			// Alleen op dichte deuren en vaste muren kun je schieten. Open deuren laten de straal door.
			const closedDoorsAsWalls = currentLevelData.doors.filter((_, idx) => {
				const linkedButton = currentLevelData.buttons.find((b) => b.targetDoorId === idx);
				return !linkedButton || !linkedButton.pressed;
			});

			const shootableSurfaces = [...currentLevelData.walls, ...closedDoorsAsWalls];

			shootableSurfaces.forEach((w) => {
				const segments = [
					{ ax: w.x, ay: w.y, bx: w.x + w.width, by: w.y, nx: 0, ny: -1 },
					{ ax: w.x, ay: w.y + w.height, bx: w.x + w.width, by: w.y + w.height, nx: 0, ny: 1 },
					{ ax: w.x, ay: w.y, bx: w.x, by: w.y + w.height, nx: -1, ny: 0 },
					{ ax: w.x + w.width, ay: w.y, bx: w.x + w.width, by: w.y + w.height, nx: 1, ny: 0 }
				];

				segments.forEach((s) => {
					const hit = raySegmentIntersect(player.x, player.y, ndx, ndy, s.ax, s.ay, s.bx, s.by);
					if (hit) {
						if (!closestHit || hit.t < closestHit.t) {
							closestHit = { t: hit.t, x: hit.x, y: hit.y, nx: s.nx, ny: s.ny };
						}
					}
				});
			});

			if (closestHit) {
				const targetPortal = type === "blue" ? portalA : portalB;
				targetPortal.x = closestHit.x;
				targetPortal.y = closestHit.y;
				targetPortal.nx = closestHit.nx;
				targetPortal.ny = closestHit.ny;
				targetPortal.active = true;

				spawnParticles(closestHit.x, closestHit.y, targetPortal.color, 12);
				triggerShake(2);
			}
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				[
					"ArrowLeft",
					"a",
					"A",
					"ArrowRight",
					"d",
					"D",
					"ArrowUp",
					"w",
					"W",
					" ",
					"q",
					"Q",
					"e",
					"E"
				].includes(e.key)
			) {
				e.preventDefault();
			}
			if (["ArrowLeft", "a", "A"].includes(e.key)) keys.left = true;
			if (["ArrowRight", "d", "D"].includes(e.key)) keys.right = true;
			if (["ArrowUp", "w", "W", " "].includes(e.key)) keys.up = true;

			if (["q", "Q"].includes(e.key)) shootPortal("blue");
			if (["e", "E"].includes(e.key)) shootPortal("orange");
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (["ArrowLeft", "a", "A"].includes(e.key)) keys.left = false;
			if (["ArrowRight", "d", "D"].includes(e.key)) keys.right = false;
			if (["ArrowUp", "w", "W", " "].includes(e.key)) keys.up = false;
		};

		const updateMousePos = (e: MouseEvent) => {
			if (!canvasRef) return;
			const rect = canvasRef.getBoundingClientRect();
			mouseX = (e.clientX - rect.left) * (VIEW_WIDTH / rect.width);
			mouseY = (e.clientY - rect.top) * (VIEW_HEIGHT / rect.height);
		};

		const handleContextMenu = (e: MouseEvent) => {
			e.preventDefault();
		};
		const handleMouseDown = (e: MouseEvent) => {
			updateMousePos(e);
			if (e.button === 0) shootPortal("blue");
			else if (e.button === 2) shootPortal("orange");
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("mousemove", updateMousePos);
		window.addEventListener("mousedown", handleMouseDown);
		window.addEventListener("contextmenu", handleContextMenu);

		function checkPortalTeleport(inPortal: Portal, outPortal: Portal) {
			if (!inPortal.active || !outPortal.active || teleportCooldown > 0) return;

			const dist = Math.hypot(player.x - inPortal.x, player.y - inPortal.y);
			if (dist < player.radius + inPortal.width / 2) {
				const currentSpeed = Math.max(Math.hypot(player.vx, player.vy), 9.0);

				player.x = outPortal.x + outPortal.nx * (player.radius + 8);
				player.y = outPortal.y + outPortal.ny * (player.radius + 8);

				player.vx = outPortal.nx * currentSpeed;
				player.vy = outPortal.ny * currentSpeed;

				teleportCooldown = 15;
				spawnParticles(inPortal.x, inPortal.y, inPortal.color, 15);
				spawnParticles(outPortal.x, outPortal.y, outPortal.color, 15);
				triggerShake(6);
			}
		}

		function update() {
			if (teleportCooldown > 0) teleportCooldown--;

			if (screenShake > 0) {
				screenShake -= 0.25;
				if (screenShake < 0) screenShake = 0;
			}

			if (keys.left) player.vx -= player.speed;
			if (keys.right) player.vx += player.speed;

			player.vx *= player.friction;

			if (keys.up && player.grounded) {
				player.vy = player.jumpStrength;
				player.grounded = false;
			}

			player.vy += player.gravity;

			player.x += player.vx;
			player.y += player.vy;
			player.rotation += player.vx * 0.05;

			player.grounded = false;

			// Knoppen activeren
			currentLevelData.buttons.forEach((b) => {
				const isTouchingButton =
					player.x + player.radius > b.x &&
					player.x - player.radius < b.x + b.width &&
					player.y + player.radius > b.y &&
					player.y - player.radius < b.y + b.height;

				b.pressed = isTouchingButton;
			});

			// Botsingen met muren en dichte deuren
			const activeCollidables = [
				...currentLevelData.walls,
				...currentLevelData.doors.filter((_, idx) => {
					const linkedButton = currentLevelData.buttons.find((b) => b.targetDoorId === idx);
					return !linkedButton || !linkedButton.pressed;
				})
			];

			activeCollidables.forEach((w) => {
				if (
					player.x + player.radius > w.x &&
					player.x - player.radius < w.x + w.width &&
					player.y + player.radius > w.y &&
					player.y - player.radius < w.y + w.height
				) {
					const overlapX1 = player.x + player.radius - w.x;
					const overlapX2 = w.x + w.width - (player.x - player.radius);
					const overlapY1 = player.y + player.radius - w.y;
					const overlapY2 = w.y + w.height - (player.y - player.radius);

					const minX = Math.min(overlapX1, overlapX2);
					const minY = Math.min(overlapY1, overlapY2);

					if (minY < minX) {
						if (overlapY1 < overlapY2 && player.vy >= 0) {
							player.y = w.y - player.radius;
							player.vy = 0;
							player.grounded = true;
						} else if (overlapY2 < overlapY1 && player.vy < 0) {
							player.y = w.y + w.height + player.radius;
							player.vy = 0;
						}
					} else {
						if (overlapX1 < overlapX2) {
							player.x = w.x - player.radius;
							player.vx = 0;
						} else {
							player.x = w.x + w.width + player.radius;
							player.vx = 0;
						}
					}
				}
			});

			// Hazards / Lasers controleren
			currentLevelData.hazards.forEach((h) => {
				if (
					h.active &&
					player.x + player.radius > h.x &&
					player.x - player.radius < h.x + h.width &&
					player.y + player.radius > h.y &&
					player.y - player.radius < h.y + h.height
				) {
					spawnParticles(player.x, player.y, COLORS.hazard, 20);
					triggerShake(8);
					score = Math.max(0, score - 15);
					resetPlayerPosition();
				}
			});

			checkPortalTeleport(portalA, portalB);
			checkPortalTeleport(portalB, portalA);

			// Munten verzamelen
			currentLevelData.coins.forEach((c) => {
				if (!c.collected) {
					const dist = Math.hypot(player.x - c.x, player.y - c.y);
					if (dist < player.radius + c.radius) {
						c.collected = true;
						score += 10;
						spawnParticles(c.x, c.y, COLORS.coin, 10);
					}
				}
			});

			// Doel bereikt -> Volgend level genereren
			const goal = currentLevelData.goal;
			if (
				player.x + player.radius > goal.x &&
				player.x - player.radius < goal.x + goal.width &&
				player.y + player.radius > goal.y &&
				player.y - player.radius < goal.y + goal.height
			) {
				level += 1;
				score += 50;
				currentLevelData = getLevelData(level);
				resetPlayerPosition();
				triggerShake(5);
			}

			// Partikels updaten
			for (let i = particles.length - 1; i >= 0; i--) {
				const p = particles[i];
				p.x += p.vx;
				p.y += p.vy;
				p.life++;
				p.alpha = 1 - p.life / p.maxLife;

				if (p.life >= p.maxLife) {
					particles.splice(i, 1);
				}
			}
		}

		function drawPortal(p: Portal) {
			if (!p.active) return;
			if (!ctx) return;

			ctx.save();
			ctx.translate(p.x, p.y);

			const angle = Math.atan2(p.ny, p.nx);
			ctx.rotate(angle);

			ctx.shadowColor = p.glowColor;
			ctx.shadowBlur = 12;

			ctx.beginPath();
			ctx.ellipse(0, 0, 8, p.width / 2, 0, 0, Math.PI * 2);
			ctx.fillStyle = p.color;
			ctx.fill();
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.restore();
		}

		function draw() {
			if (!canvasRef) return;
			if (!ctx) return;

			ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.fillStyle = COLORS.bg;
			ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.save();

			let offsetX = 0;
			let offsetY = 0;
			if (screenShake > 0) {
				offsetX = (Math.random() - 0.5) * screenShake * 2;
				offsetY = (Math.random() - 0.5) * screenShake * 2;
			}

			ctx.translate(offsetX, offsetY);

			// Richtlijn (laser)
			ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(player.x, player.y);
			ctx.lineTo(mouseX, mouseY);
			ctx.stroke();
			ctx.setLineDash([]);

			// Muren tekenen
			currentLevelData.walls.forEach((w) => {
				ctx.fillStyle = COLORS.wall;
				ctx.fillRect(w.x, w.y, w.width, w.height);
				ctx.strokeStyle = COLORS.wallBorder;
				ctx.lineWidth = 2;
				ctx.strokeRect(w.x, w.y, w.width, w.height);
			});

			// Deuren tekenen
			currentLevelData.doors.forEach((d, idx) => {
				const linkedButton = currentLevelData.buttons.find((b) => b.targetDoorId === idx);
				const isOpen = linkedButton && linkedButton.pressed;

				if (!isOpen) {
					ctx.fillStyle = COLORS.door;
					ctx.fillRect(d.x, d.y, d.width, d.height);
					ctx.strokeStyle = "#ffffff";
					ctx.lineWidth = 2;
					ctx.strokeRect(d.x, d.y, d.width, d.height);
				} else {
					ctx.strokeStyle = "rgba(6, 182, 212, 0.4)";
					ctx.lineWidth = 1;
					ctx.setLineDash([2, 2]);
					ctx.strokeRect(d.x, d.y, d.width, d.height);
					ctx.setLineDash([]);
				}
			});

			// Knoppen tekenen
			currentLevelData.buttons.forEach((b) => {
				ctx.fillStyle = b.pressed ? COLORS.buttonPressed : COLORS.button;
				ctx.fillRect(b.x, b.y + (b.pressed ? 10 : 0), b.width, b.height - (b.pressed ? 10 : 0));
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 1;
				ctx.strokeRect(b.x, b.y + (b.pressed ? 10 : 0), b.width, b.height - (b.pressed ? 10 : 0));
			});

			// Hazards / Lasers
			currentLevelData.hazards.forEach((h) => {
				if (h.active) {
					ctx.save();
					ctx.shadowColor = COLORS.hazard;
					ctx.shadowBlur = 10;
					ctx.fillStyle = COLORS.hazard;
					ctx.fillRect(h.x, h.y, h.width, h.height);
					ctx.restore();
				}
			});

			// Doel deur
			const goal = currentLevelData.goal;
			ctx.fillStyle = COLORS.goal;
			ctx.fillRect(goal.x, goal.y, goal.width, goal.height);
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.strokeRect(goal.x, goal.y, goal.width, goal.height);

			// Munten
			currentLevelData.coins.forEach((c) => {
				if (!c.collected) {
					ctx.beginPath();
					ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
					ctx.fillStyle = COLORS.coin;
					ctx.fill();
					ctx.strokeStyle = "#ffffff";
					ctx.lineWidth = 1.5;
					ctx.stroke();
				}
			});

			// Portals
			drawPortal(portalA);
			drawPortal(portalB);

			// Partikels
			particles.forEach((p) => {
				ctx.save();
				ctx.globalAlpha = p.alpha;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			});

			// Speler avatar
			ctx.save();
			ctx.translate(player.x, player.y);
			ctx.rotate(player.rotation);

			ctx.beginPath();
			ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
			ctx.closePath();
			ctx.clip();

			if (avatarImg && avatarLoaded) {
				ctx.drawImage(
					avatarImg,
					-player.radius,
					-player.radius,
					player.radius * 2,
					player.radius * 2
				);
			} else {
				ctx.fillStyle = COLORS.player;
				ctx.fill();
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(player.radius, 0);
				ctx.stroke();
			}

			ctx.strokeStyle = COLORS.player;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
			ctx.stroke();

			ctx.restore();

			ctx.restore();
		}

		let lastTime: number | null = null;
		let accumulator = 0;
		const STEP = 1000 / 60;

		function gameLoop(timestamp: number) {
			if (lastTime === null) lastTime = timestamp;
			let dt = timestamp - lastTime;
			if (dt < 0) dt = 0;
			if (dt > 100) dt = 100;
			lastTime = timestamp;
			accumulator += dt;

			while (accumulator >= STEP) {
				update();
				accumulator -= STEP;
			}
			draw();
			animationFrameId = requestAnimationFrame(gameLoop);
		}

		animationFrameId = requestAnimationFrame(gameLoop);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("mousemove", updateMousePos);
			window.removeEventListener("mousedown", handleMouseDown);
			window.removeEventListener("contextmenu", handleContextMenu);
			cancelAnimationFrame(animationFrameId);
		};
	});

	function resetGame() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		score = 0;
		level = 1;
		resetSignal += 1;
	}

	function toggleFullscreen() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		if (!gameContainerRef) return;
		if (!document.fullscreenElement) {
			gameContainerRef.requestFullscreen().catch((err) => {
				console.error(`Error attempting to enable fullscreen: ${err.message}`);
			});
		} else {
			document.exitFullscreen();
		}
	}
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="medium">
	<div
		bind:this={gameContainerRef}
		style="height: 90%; width: 90%; border-radius: {token.global.radius
			.huge}; overflow: hidden; position: relative; background: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center;">
		<div
			style="position: absolute; top: 16px; left: 20px; color: #ffffff; font-family: {token.global
				.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token.global
				.font.size.medium}; display: flex; gap: {token.global.spacing
				.large}; pointer-events: none; z-index: 10;">
			<div>Level: {level}</div>
			<div>Score: {score}</div>
		</div>

		<canvas
			bind:this={canvasRef}
			width="800"
			height="500"
			style="max-width: 100%; max-height: 100%; object-fit: contain; cursor: crosshair;">
		</canvas>
	</div>

	<Flex height="fit-content" width="fit-content" gap="small">
		<LinkButton href="/games" iconbefore="arrow_back">Back</LinkButton>
		<Button onclick={resetGame} iconbefore="refresh">Reset</Button>
		<Button onclick={toggleFullscreen} iconbefore="fullscreen">Fullscreen</Button>
	</Flex>

	<Flex
		width="fit-content"
		height="fit-content"
		alignItems="center"
		style="color: {token.theme.color.text.tertiary}"
		gap="xsmall"
		verticalAlign="middle">
		<Icon icon="star_shine" />Game is generated with AI!
	</Flex>
</Flex>
