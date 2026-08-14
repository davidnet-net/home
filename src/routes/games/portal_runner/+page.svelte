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
		coins: Coin[];
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
		player: "#e11d48"
	};

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				goto(`${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`);
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

		// Generate Preset Chamber Levels
		function getLevelData(lvl: number): LevelData {
			const walls: Wall[] = [
				// Outer Room Boundary
				{ x: 0, y: 0, width: VIEW_WIDTH, height: 20 },
				{ x: 0, y: VIEW_HEIGHT - 20, width: VIEW_WIDTH, height: 20 },
				{ x: 0, y: 0, width: 20, height: VIEW_HEIGHT },
				{ x: VIEW_WIDTH - 20, y: 0, width: 20, height: VIEW_HEIGHT }
			];

			const coins: Coin[] = [];

			if (lvl === 1) {
				walls.push({ x: 300, y: 200, width: 20, height: 280 });
				coins.push({ x: 450, y: 350, radius: 8, collected: false });
				return {
					spawn: { x: 80, y: 400 },
					walls,
					coins,
					goal: { x: 720, y: 400, width: 40, height: 60 }
				};
			} else if (lvl === 2) {
				walls.push({ x: 250, y: 250, width: 300, height: 20 });
				walls.push({ x: 530, y: 100, width: 20, height: 170 });
				coins.push({ x: 400, y: 200, radius: 8, collected: false });
				return {
					spawn: { x: 80, y: 400 },
					walls,
					coins,
					goal: { x: 700, y: 100, width: 40, height: 60 }
				};
			} else {
				walls.push({ x: 200, y: 150, width: 20, height: 330 });
				walls.push({ x: 400, y: 20, width: 20, height: 330 });
				walls.push({ x: 600, y: 150, width: 20, height: 330 });
				coins.push({ x: 300, y: 100, radius: 8, collected: false });
				coins.push({ x: 500, y: 400, radius: 8, collected: false });
				return {
					spawn: { x: 80, y: 400 },
					walls,
					coins,
					goal: { x: 720, y: 80, width: 40, height: 60 }
				};
			}
		}

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

		// Raycast Shoot Portals onto Wall Surfaces
		function shootPortal(type: "blue" | "orange") {
			const dx = mouseX - player.x;
			const dy = mouseY - player.y;
			const len = Math.hypot(dx, dy);
			if (len === 0) return;

			const ndx = dx / len;
			const ndy = dy / len;

			let closestHit: { t: number; x: number; y: number; nx: number; ny: number } | null = null;

			currentLevelData.walls.forEach((w) => {
				const segments = [
					{ ax: w.x, ay: w.y, bx: w.x + w.width, by: w.y, nx: 0, ny: -1 }, // Top
					{ ax: w.x, ay: w.y + w.height, bx: w.x + w.width, by: w.y + w.height, nx: 0, ny: 1 }, // Bottom
					{ ax: w.x, ay: w.y, bx: w.x, by: w.y + w.height, nx: -1, ny: 0 }, // Left
					{ ax: w.x + w.width, ay: w.y, bx: w.x + w.width, by: w.y + w.height, nx: 1, ny: 0 } // Right
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

			// Q for Blue Portal, E for Orange Portal
			if (["q", "Q"].includes(e.key)) shootPortal("blue");
			if (["e", "E"].includes(e.key)) shootPortal("orange");
		};

		const handleKeyUp = (e: KeyboardEvent) => {
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
			if (e.button === 0) {
				shootPortal("blue");
			} else if (e.button === 2) {
				shootPortal("orange");
			}
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

			// Solid Wall Collisions
			currentLevelData.walls.forEach((w) => {
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

			checkPortalTeleport(portalA, portalB);
			checkPortalTeleport(portalB, portalA);

			// Coin Collection
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

			// Goal Reached
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

			// Particles Update
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

			// Draw Aim Laser Line
			ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(player.x, player.y);
			ctx.lineTo(mouseX, mouseY);
			ctx.stroke();
			ctx.setLineDash([]);

			// Draw Walls
			currentLevelData.walls.forEach((w) => {
				ctx.fillStyle = COLORS.wall;
				ctx.fillRect(w.x, w.y, w.width, w.height);
				ctx.strokeStyle = COLORS.wallBorder;
				ctx.lineWidth = 2;
				ctx.strokeRect(w.x, w.y, w.width, w.height);
			});

			// Draw Goal Door
			const goal = currentLevelData.goal;
			ctx.fillStyle = COLORS.goal;
			ctx.fillRect(goal.x, goal.y, goal.width, goal.height);
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.strokeRect(goal.x, goal.y, goal.width, goal.height);

			// Draw Coins
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

			// Draw Portals
			drawPortal(portalA);
			drawPortal(portalB);

			// Draw Particles
			particles.forEach((p) => {
				ctx.save();
				ctx.globalAlpha = p.alpha;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			});

			// Draw Player Avatar Or Orb
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
			if (lastTime === null) {
				lastTime = timestamp;
			}
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
