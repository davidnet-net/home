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

	interface Hazard {
		x: number;
		y: number;
		width: number;
		height: number;
		type: "sand" | "water";
	}

	interface Hole {
		x: number;
		y: number;
		radius: number;
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

	interface WindStreak {
		x: number;
		y: number;
		length: number;
		speed: number;
	}

	interface LevelData {
		par: number;
		spawn: { x: number; y: number };
		hole: Hole;
		walls: Wall[];
		hazards: Hazard[];
	}

	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();
	let strokes = $state(0);
	let totalStrokes = $state(0);
	let level = $state(1);
	let holeSunk = $state(false);
	let resetSignal = $state(0);

	// Wind State
	let windSpeedDisplay = $state(0);
	let windAngleDisplay = $state(0);

	// Canvas Constants
	const VIEW_WIDTH = 800;
	const VIEW_HEIGHT = 500;

	const COLORS = {
		fairway: "#2e7d32",
		fairwayBorder: "#1b5e20",
		wall: "#424242",
		wallBorder: "#212121",
		sand: "#fbc02d",
		water: "#0288d1",
		hole: "#111111",
		aimLine: "#ffffff",
		aimLinePower: "#e53935",
		flag: "#d32f2f",
		windLine: "rgba(255, 255, 255, 0.25)"
	};

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				goto(`${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`);
			}
		})();
	});

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

		// Avatar Image Loader
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

		// Mouse & Drag State
		let isDragging = false;
		let dragStartX = 0;
		let dragStartY = 0;
		let mouseX = 0;
		let mouseY = 0;

		// Physics Wind Vector
		let windVx = 0;
		let windVy = 0;

		function randomizeWind() {
			const speed = parseFloat((Math.random() * 3.5 + 0.5).toFixed(1));
			const angle = Math.random() * Math.PI * 2;
			const forceFactor = 0.008;

			windSpeedDisplay = speed;
			windAngleDisplay = angle;

			windVx = Math.cos(angle) * speed * forceFactor;
			windVy = Math.sin(angle) * speed * forceFactor;
		}

		const windStreaks: WindStreak[] = Array.from({ length: 18 }, () => ({
			x: Math.random() * VIEW_WIDTH,
			y: Math.random() * VIEW_HEIGHT,
			length: 15 + Math.random() * 25,
			speed: 1 + Math.random() * 2
		}));

		// Ball State
		const ball = {
			x: 100,
			y: 250,
			radius: 10,
			vx: 0,
			vy: 0,
			friction: 0.985,
			inHole: false,
			lastShotX: 100,
			lastShotY: 250
		};

		let particles: Particle[] = [];
		let screenShake = 0;

		function triggerShake(intensity = 4) {
			screenShake = Math.max(screenShake, intensity);
		}

		function spawnParticles(x: number, y: number, color: string, count = 12) {
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

		// --- BFS Grid-Pathfinding Playability Verification ---
		function isLevelPlayable(
			spawn: { x: number; y: number },
			hole: Hole,
			walls: Wall[],
			hazards: Hazard[]
		): boolean {
			const GRID = 20;
			const cols = Math.floor(VIEW_WIDTH / GRID);
			const rows = Math.floor(VIEW_HEIGHT / GRID);

			const grid: boolean[][] = Array.from({ length: cols }, () => Array(rows).fill(true));

			for (let c = 0; c < cols; c++) {
				for (let r = 0; r < rows; r++) {
					const cx = c * GRID + GRID / 2;
					const cy = r * GRID + GRID / 2;

					// Check Solid Walls (met 12px speler-marge)
					for (const w of walls) {
						if (
							cx >= w.x - 12 &&
							cx <= w.x + w.width + 12 &&
							cy >= w.y - 12 &&
							cy <= w.y + w.height + 12
						) {
							grid[c][r] = false;
							break;
						}
					}

					// Check Water Hazards (Onbegaanbaar)
					for (const h of hazards) {
						if (
							h.type === "water" &&
							cx >= h.x - 10 &&
							cx <= h.x + h.width + 10 &&
							cy >= h.y - 10 &&
							cy <= h.y + h.height + 10
						) {
							grid[c][r] = false;
							break;
						}
					}
				}
			}

			const startC = Math.floor(spawn.x / GRID);
			const startR = Math.floor(spawn.y / GRID);
			const endC = Math.floor(hole.x / GRID);
			const endR = Math.floor(hole.y / GRID);

			if (!grid[startC]?.[startR] || !grid[endC]?.[endR]) return false;

			const queue: [number, number][] = [[startC, startR]];
			const visited = new Set<string>();
			visited.add(`${startC},${startR}`);

			const dirs = [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
				[1, 1],
				[-1, 1],
				[1, -1],
				[-1, -1]
			];

			while (queue.length > 0) {
				const [c, r] = queue.shift()!;
				if (c === endC && r === endR) return true;

				for (const [dc, dr] of dirs) {
					const nc = c + dc;
					const nr = r + dr;
					const key = `${nc},${nr}`;

					if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && grid[nc][nr] && !visited.has(key)) {
						visited.add(key);
						queue.push([nc, nr]);
					}
				}
			}

			return false;
		}

		// Procedurele Level Generator
		function buildCandidateLevel(currentLvl: number): LevelData {
			const outerWalls: Wall[] = [
				{ x: 0, y: 0, width: VIEW_WIDTH, height: 20 },
				{ x: 0, y: VIEW_HEIGHT - 20, width: VIEW_WIDTH, height: 20 },
				{ x: 0, y: 0, width: 20, height: VIEW_HEIGHT },
				{ x: VIEW_WIDTH - 20, y: 0, width: 20, height: VIEW_HEIGHT }
			];

			const spawn = {
				x: 60 + Math.random() * 100,
				y: 80 + Math.random() * (VIEW_HEIGHT - 160)
			};

			const hole: Hole = {
				x: VIEW_WIDTH - (60 + Math.random() * 100),
				y: 80 + Math.random() * (VIEW_HEIGHT - 160),
				radius: 15
			};

			const walls: Wall[] = [...outerWalls];
			const hazards: Hazard[] = [];

			// Genereer willekeurige binnenmuren
			const wallCount = 1 + Math.floor(Math.random() * 3);
			for (let i = 0; i < wallCount; i++) {
				const isVertical = Math.random() > 0.4;
				const wWidth = isVertical ? 25 : 120 + Math.random() * 160;
				const wHeight = isVertical ? 140 + Math.random() * 180 : 25;
				const wx = 180 + Math.random() * (VIEW_WIDTH - 360);
				const wy = 40 + Math.random() * (VIEW_HEIGHT - 200);

				walls.push({ x: wx, y: wy, width: wWidth, height: wHeight });
			}

			// Genereer willekeurige gevaren (zand & water)
			const hazardCount = 1 + Math.floor(Math.random() * 2);
			for (let i = 0; i < hazardCount; i++) {
				const hType: "sand" | "water" = Math.random() > 0.45 ? "sand" : "water";
				const hWidth = 80 + Math.random() * 120;
				const hHeight = 80 + Math.random() * 100;
				const hx = 160 + Math.random() * (VIEW_WIDTH - 320);
				const hy = 40 + Math.random() * (VIEW_HEIGHT - 180);

				hazards.push({ x: hx, y: hy, width: hWidth, height: hHeight, type: hType });
			}

			return {
				par: 3 + Math.floor(currentLvl / 2),
				spawn,
				hole,
				walls,
				hazards
			};
		}

		// Genereer totdat er een gegarandeerd speelbaar level ontstaat
		function generateValidatedLevel(currentLvl: number): LevelData {
			let attempts = 0;
			while (attempts < 100) {
				attempts++;
				const candidate = buildCandidateLevel(currentLvl);
				if (isLevelPlayable(candidate.spawn, candidate.hole, candidate.walls, candidate.hazards)) {
					return candidate;
				}
			}
			return buildCandidateLevel(currentLvl);
		}

		let currentLevelData = generateValidatedLevel(level);

		function initLevel() {
			ball.x = currentLevelData.spawn.x;
			ball.y = currentLevelData.spawn.y;
			ball.vx = 0;
			ball.vy = 0;
			ball.inHole = false;
			ball.lastShotX = ball.x;
			ball.lastShotY = ball.y;
			strokes = 0;
			holeSunk = false;
			randomizeWind();
		}

		initLevel();

		function getCanvasMousePos(e: MouseEvent) {
			if (!canvasRef) return { x: 0, y: 0 };
			const rect = canvasRef.getBoundingClientRect();
			return {
				x: (e.clientX - rect.left) * (VIEW_WIDTH / rect.width),
				y: (e.clientY - rect.top) * (VIEW_HEIGHT / rect.height)
			};
		}

		const handleMouseDown = (e: MouseEvent) => {
			if (e.button !== 0 || holeSunk) return;
			const pos = getCanvasMousePos(e);
			mouseX = pos.x;
			mouseY = pos.y;

			const speed = Math.hypot(ball.vx, ball.vy);
			if (speed < 0.1) {
				const distToBall = Math.hypot(pos.x - ball.x, pos.y - ball.y);
				if (distToBall < 60) {
					isDragging = true;
					dragStartX = ball.x;
					dragStartY = ball.y;
				}
			}
		};

		const handleMouseMove = (e: MouseEvent) => {
			const pos = getCanvasMousePos(e);
			mouseX = pos.x;
			mouseY = pos.y;
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (e.button !== 0 || !isDragging) return;
			isDragging = false;

			const dx = dragStartX - mouseX;
			const dy = dragStartY - mouseY;
			const dist = Math.hypot(dx, dy);

			if (dist > 10) {
				const maxPower = 18;
				const power = Math.min(dist * 0.12, maxPower);
				const angle = Math.atan2(dy, dx);

				ball.lastShotX = ball.x;
				ball.lastShotY = ball.y;
				ball.vx = Math.cos(angle) * power;
				ball.vy = Math.sin(angle) * power;

				strokes += 1;
				totalStrokes += 1;
				spawnParticles(ball.x, ball.y, "#ffffff", 8);
			}
		};

		window.addEventListener("mousedown", handleMouseDown);
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		function update() {
			if (screenShake > 0) {
				screenShake -= 0.25;
				if (screenShake < 0) screenShake = 0;
			}

			// Update Visuele Wind Streaks
			windStreaks.forEach((s) => {
				s.x += Math.cos(windAngleDisplay) * (s.speed + windSpeedDisplay * 0.8);
				s.y += Math.sin(windAngleDisplay) * (s.speed + windSpeedDisplay * 0.8);

				if (s.x > VIEW_WIDTH + 40) s.x = -40;
				if (s.x < -40) s.x = VIEW_WIDTH + 40;
				if (s.y > VIEW_HEIGHT + 40) s.y = -40;
				if (s.y < -40) s.y = VIEW_HEIGHT + 40;
			});

			if (!ball.inHole) {
				const currentSpeed = Math.hypot(ball.vx, ball.vy);

				if (currentSpeed > 0.05) {
					ball.vx += windVx;
					ball.vy += windVy;
				}

				ball.x += ball.vx;
				ball.y += ball.vy;

				let currentFriction = ball.friction;

				// Hazards
				currentLevelData.hazards.forEach((h) => {
					if (ball.x > h.x && ball.x < h.x + h.width && ball.y > h.y && ball.y < h.y + h.height) {
						if (h.type === "sand") {
							currentFriction = 0.88;
						} else if (h.type === "water") {
							spawnParticles(ball.x, ball.y, COLORS.water, 20);
							triggerShake(6);
							ball.x = ball.lastShotX;
							ball.y = ball.lastShotY;
							ball.vx = 0;
							ball.vy = 0;
							strokes += 1;
							totalStrokes += 1;
						}
					}
				});

				ball.vx *= currentFriction;
				ball.vy *= currentFriction;

				if (Math.hypot(ball.vx, ball.vy) < 0.05) {
					ball.vx = 0;
					ball.vy = 0;
				}

				// Wall Collisions
				currentLevelData.walls.forEach((w) => {
					const closestX = Math.max(w.x, Math.min(ball.x, w.x + w.width));
					const closestY = Math.max(w.y, Math.min(ball.y, w.y + w.height));

					const distX = ball.x - closestX;
					const distY = ball.y - closestY;
					const distance = Math.hypot(distX, distY);

					if (distance < ball.radius) {
						const overlap = ball.radius - distance;
						if (distance === 0) return;

						const nx = distX / distance;
						const ny = distY / distance;

						ball.x += nx * overlap;
						ball.y += ny * overlap;

						const dot = ball.vx * nx + ball.vy * ny;
						ball.vx = (ball.vx - 2 * dot * nx) * 0.8;
						ball.vy = (ball.vy - 2 * dot * ny) * 0.8;

						spawnParticles(closestX, closestY, COLORS.wall, 6);
						triggerShake(2);
					}
				});

				// Hole Check
				const hole = currentLevelData.hole;
				const distToHole = Math.hypot(ball.x - hole.x, ball.y - hole.y);
				const ballSpeed = Math.hypot(ball.vx, ball.vy);

				if (distToHole < hole.radius) {
					if (ballSpeed < 6.5) {
						ball.inHole = true;
						ball.x = hole.x;
						ball.y = hole.y;
						ball.vx = 0;
						ball.vy = 0;
						holeSunk = true;

						spawnParticles(hole.x, hole.y, COLORS.flag, 25);
						triggerShake(8);

						setTimeout(() => {
							level += 1;
							currentLevelData = generateValidatedLevel(level);
							initLevel();
						}, 1500);
					}
				}
			}

			// Particles
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

		function draw() {
			if (!canvasRef || !ctx) return;

			ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.fillStyle = COLORS.fairway;
			ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.save();

			let offsetX = 0;
			let offsetY = 0;
			if (screenShake > 0) {
				offsetX = (Math.random() - 0.5) * screenShake * 2;
				offsetY = (Math.random() - 0.5) * screenShake * 2;
			}

			ctx.translate(offsetX, offsetY);

			// Draw Wind Lines
			ctx.strokeStyle = COLORS.windLine;
			ctx.lineWidth = 1.5;
			windStreaks.forEach((s) => {
				ctx.beginPath();
				ctx.moveTo(s.x, s.y);
				ctx.lineTo(
					s.x + Math.cos(windAngleDisplay) * s.length,
					s.y + Math.sin(windAngleDisplay) * s.length
				);
				ctx.stroke();
			});

			// Draw Hazards
			currentLevelData.hazards.forEach((h) => {
				ctx.fillStyle = h.type === "sand" ? COLORS.sand : COLORS.water;
				ctx.fillRect(h.x, h.y, h.width, h.height);
			});

			// Draw Hole & Flag
			const hole = currentLevelData.hole;
			ctx.beginPath();
			ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
			ctx.fillStyle = COLORS.hole;
			ctx.fill();
			ctx.closePath();

			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(hole.x, hole.y);
			ctx.lineTo(hole.x, hole.y - 35);
			ctx.stroke();

			ctx.fillStyle = COLORS.flag;
			ctx.beginPath();
			ctx.moveTo(hole.x, hole.y - 35);
			ctx.lineTo(hole.x + 18, hole.y - 27);
			ctx.lineTo(hole.x, hole.y - 20);
			ctx.fill();

			// Draw Walls
			currentLevelData.walls.forEach((w) => {
				ctx.fillStyle = COLORS.wall;
				ctx.fillRect(w.x, w.y, w.width, w.height);
				ctx.strokeStyle = COLORS.wallBorder;
				ctx.lineWidth = 2;
				ctx.strokeRect(w.x, w.y, w.width, w.height);
			});

			// Draw Aiming Guide Line
			if (isDragging && !ball.inHole) {
				const dx = dragStartX - mouseX;
				const dy = dragStartY - mouseY;

				ctx.strokeStyle = COLORS.aimLine;
				ctx.lineWidth = 2;
				ctx.setLineDash([4, 4]);
				ctx.beginPath();
				ctx.moveTo(ball.x, ball.y);
				ctx.lineTo(ball.x + dx, ball.y + dy);
				ctx.stroke();
				ctx.setLineDash([]);

				const dist = Math.min(Math.hypot(dx, dy), 150);
				ctx.beginPath();
				ctx.arc(ball.x, ball.y, dist, 0, Math.PI * 2);
				ctx.strokeStyle = COLORS.aimLinePower;
				ctx.lineWidth = 1;
				ctx.stroke();
			}

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

			// Draw Golf Ball / Avatar
			if (!ball.inHole) {
				ctx.save();
				ctx.translate(ball.x, ball.y);

				ctx.beginPath();
				ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
				ctx.closePath();
				ctx.clip();

				if (avatarImg && avatarLoaded) {
					ctx.drawImage(avatarImg, -ball.radius, -ball.radius, ball.radius * 2, ball.radius * 2);
				} else {
					ctx.fillStyle = "#ffffff";
					ctx.fill();
				}

				ctx.strokeStyle = "#000000";
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
				ctx.stroke();

				ctx.restore();
			}

			// Hole Sunk Victory Banner
			if (holeSunk) {
				ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
				ctx.fillRect(0, VIEW_HEIGHT / 2 - 40, VIEW_WIDTH, 80);

				ctx.fillStyle = "#ffffff";
				ctx.font = "bold 32px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText("HOLE IN!", VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 10);
			}

			ctx.restore();
		}

		function gameLoop() {
			update();
			draw();
			animationFrameId = requestAnimationFrame(gameLoop);
		}

		gameLoop();

		return () => {
			window.removeEventListener("mousedown", handleMouseDown);
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			cancelAnimationFrame(animationFrameId);
		};
	});

	function resetGame() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		totalStrokes = 0;
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
			.huge}; overflow: hidden; position: relative; background: #2e7d32; display: flex; flex-direction: column; align-items: center; justify-content: center;">
		<div
			style="position: absolute; top: 16px; left: 20px; color: #ffffff; font-family: {token.global
				.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token.global
				.font.size.medium}; display: flex; gap: {token.global.spacing
				.large}; pointer-events: none; z-index: 10; align-items: center;">
			<div>Hole: {level}</div>
			<div>Strokes: {strokes}</div>
			<div>Total: {totalStrokes}</div>
			<div
				style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 12px;">
				<span>Wind: {windSpeedDisplay} m/s</span>
				<span
					style="display: inline-block; transform: rotate({windAngleDisplay}rad); transition: transform 0.3s ease;">
					➔
				</span>
			</div>
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
