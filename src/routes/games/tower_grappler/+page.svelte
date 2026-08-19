<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		identityState,
		Icon
	} from "@davidnet-net/svelte-ui";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	// Strict TypeScript Interfaces
	interface AnchorPoint {
		id: number;
		x: number;
		y: number;
		radius: number;
		type: "static" | "moving" | "gold";
		vx?: number;
		minX?: number;
		maxX?: number;
	}

	interface Coin {
		id: number;
		x: number;
		y: number;
		radius: number;
		collected: boolean;
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

	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();
	let score = $state(0);
	let heightScore = $state(0);
	let resetSignal = $state(0);

	// World & Viewport Configuration
	const VIEW_WIDTH = 800;
	const VIEW_HEIGHT = 500;
	const WORLD_WIDTH = 800;
	const MAX_HOOK_DISTANCE = 420;

	// Theme Color Palette
	const COLORS = {
		bg: "#0d1117",
		lava: "#ff3300",
		lavaGlow: "#ff9900",
		playerBorder: "#00fff5",
		anchorStatic: "#1f6feb",
		anchorMoving: "#a371f7",
		anchorGold: "#f1e05a",
		rope: "#00fff5",
		aimLine: "rgba(0, 255, 245, 0.35)"
	};

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	// Main Game Loop Effect
	$effect(() => {
		if (!canvasRef) return;
		const ctx = canvasRef.getContext("2d");
		if (!ctx) return;

		const _trigger = resetSignal;

		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}

		let animationFrameId: number;

		// User Avatar Loader
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

		// Input Tracking
		const keys = { left: false, right: false };
		let mouseCanvasX = VIEW_WIDTH / 2;
		let mouseCanvasY = VIEW_HEIGHT / 2;
		let isMouseDown = false;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (["ArrowLeft", "a", "A", "ArrowRight", "d", "D", " "].includes(e.key)) {
				e.preventDefault();
			}
			if (["ArrowLeft", "a", "A"].includes(e.key)) keys.left = true;
			if (["ArrowRight", "d", "D"].includes(e.key)) keys.right = true;
			if (e.key === " ") isMouseDown = true;
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (["ArrowLeft", "a", "A"].includes(e.key)) keys.left = false;
			if (["ArrowRight", "d", "D"].includes(e.key)) keys.right = false;
			if (e.key === " ") isMouseDown = false;
		};

		const updateMousePos = (e: MouseEvent) => {
			if (!canvasRef) return;
			const rect = canvasRef.getBoundingClientRect();
			mouseCanvasX = (e.clientX - rect.left) * (VIEW_WIDTH / rect.width);
			mouseCanvasY = (e.clientY - rect.top) * (VIEW_HEIGHT / rect.height);
		};

		const handleMouseDown = (e: MouseEvent) => {
			if (e.button === 0) {
				isMouseDown = true;
				updateMousePos(e);
			}
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (e.button === 0) {
				isMouseDown = false;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("mousemove", updateMousePos);
		window.addEventListener("mousedown", handleMouseDown);
		window.addEventListener("mouseup", handleMouseUp);

		// Physics State
		const player = {
			x: WORLD_WIDTH / 2,
			y: VIEW_HEIGHT - 120,
			radius: 16,
			vx: 0,
			vy: 0,
			gravity: 0.38,
			airFriction: 0.99,
			swingAccel: 0.4,
			rotation: 0
		};

		const grapple = {
			active: false,
			anchor: null as AnchorPoint | null,
			length: 0
		};

		let lavaY = VIEW_HEIGHT + 100;
		let lavaSpeed = 0.6;
		let highestPoint = player.y;
		let highestGeneratedY = VIEW_HEIGHT + 100;
		let screenShake = 0;

		let anchors: AnchorPoint[] = [];
		let coins: Coin[] = [];
		let particles: Particle[] = [];
		let nextEntityId = 1;

		function triggerShake(intensity = 5) {
			screenShake = Math.max(screenShake, intensity);
		}

		function spawnParticles(x: number, y: number, color: string, count = 8) {
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

		function generateTowerChunk(upperLimitY: number) {
			while (highestGeneratedY > upperLimitY) {
				highestGeneratedY -= 110 + Math.random() * 50;
				const anchorX = 80 + Math.random() * (WORLD_WIDTH - 160);

				const randType = Math.random();
				let type: "static" | "moving" | "gold" = "static";
				let vx = 0;
				let minX = 0;
				let maxX = 0;

				if (randType > 0.75) {
					type = "moving";
					vx = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 1.5);
					minX = Math.max(60, anchorX - 120);
					maxX = Math.min(WORLD_WIDTH - 60, anchorX + 120);
				} else if (randType > 0.6) {
					type = "gold";
				}

				anchors.push({
					id: nextEntityId++,
					x: anchorX,
					y: highestGeneratedY,
					radius: type === "gold" ? 14 : 12,
					type,
					vx,
					minX,
					maxX
				});

				// Chance to spawn coin around the anchor
				if (Math.random() < 0.6) {
					coins.push({
						id: nextEntityId++,
						x: anchorX + (Math.random() - 0.5) * 120,
						y: highestGeneratedY - 40 - Math.random() * 40,
						radius: 8,
						collected: false
					});
				}
			}
		}

		function initGame() {
			player.x = WORLD_WIDTH / 2;
			player.y = VIEW_HEIGHT - 120;
			player.vx = 0;
			player.vy = 0;
			grapple.active = false;
			grapple.anchor = null;

			lavaY = VIEW_HEIGHT + 150;
			lavaSpeed = 0.65;
			highestPoint = player.y;
			highestGeneratedY = VIEW_HEIGHT + 100;

			anchors = [{ id: 0, x: WORLD_WIDTH / 2, y: VIEW_HEIGHT - 220, radius: 14, type: "static" }];
			coins = [];
			particles = [];

			generateTowerChunk(player.y - VIEW_HEIGHT * 2);
		}

		initGame();

		function findTargetAnchor(mouseWorldX: number, mouseWorldY: number): AnchorPoint | null {
			let bestAnchor: AnchorPoint | null = null;
			let minDistance = MAX_HOOK_DISTANCE;

			anchors.forEach((a) => {
				const distToPlayer = Math.hypot(a.x - player.x, a.y - player.y);
				if (distToPlayer <= MAX_HOOK_DISTANCE && a.y < player.y + 40) {
					const distToMouse = Math.hypot(a.x - mouseWorldX, a.y - mouseWorldY);
					if (distToMouse < minDistance) {
						minDistance = distToMouse;
						bestAnchor = a;
					}
				}
			});

			return bestAnchor;
		}

		function update() {
			// Decay Screen Shake
			if (screenShake > 0) {
				screenShake -= 0.3;
				if (screenShake < 0) screenShake = 0;
			}

			// Rising Lava Logic
			lavaY -= lavaSpeed;
			if (player.y < highestPoint) {
				highestPoint = player.y;
				heightScore = Math.floor((VIEW_HEIGHT - 120 - highestPoint) / 10);
				lavaSpeed = 0.65 + Math.min(heightScore * 0.002, 2.5);
			}

			generateTowerChunk(player.y - VIEW_HEIGHT * 1.5);

			// Update Moving Anchors
			anchors.forEach((a) => {
				if (
					a.type === "moving" &&
					a.vx !== undefined &&
					a.minX !== undefined &&
					a.maxX !== undefined
				) {
					a.x += a.vx;
					if (a.x <= a.minX || a.x >= a.maxX) {
						a.vx *= -1;
					}
				}
			});

			// Camera World Offset calculation
			const cameraY = player.y - VIEW_HEIGHT * 0.55;
			const mouseWorldX = mouseCanvasX;
			const mouseWorldY = mouseCanvasY + cameraY;

			const targetAnchor = findTargetAnchor(mouseWorldX, mouseWorldY);

			// Grapple Handle & Physics
			if (isMouseDown) {
				if (!grapple.active) {
					if (targetAnchor) {
						grapple.active = true;
						grapple.anchor = targetAnchor;
						grapple.length = Math.hypot(targetAnchor.x - player.x, targetAnchor.y - player.y);
						spawnParticles(targetAnchor.x, targetAnchor.y, COLORS.rope, 12);
						triggerShake(3);

						if (targetAnchor.type === "gold") {
							score += 5;
						}
					}
				}
			} else {
				if (grapple.active) {
					grapple.active = false;
					grapple.anchor = null;
				}
			}

			// Apply Grapple Cable Constraints & Swinging Forces
			if (grapple.active && grapple.anchor) {
				const dx = grapple.anchor.x - player.x;
				const dy = grapple.anchor.y - player.y;
				const dist = Math.hypot(dx, dy);

				// Auto reel cable
				if (grapple.length > 50) {
					grapple.length -= 3.2;
				}

				if (dist > grapple.length) {
					const pull = (dist - grapple.length) * 0.12;
					const nx = dx / dist;
					const ny = dy / dist;

					player.vx += nx * pull;
					player.vy += ny * pull;
				}

				// Air Swing Impulse
				if (keys.left) player.vx -= player.swingAccel;
				if (keys.right) player.vx += player.swingAccel;
			} else {
				// Free Flight Physics
				if (keys.left) player.vx -= 0.15;
				if (keys.right) player.vx += 0.15;
				player.vy += player.gravity;
			}

			player.vx *= player.airFriction;
			player.vy *= player.airFriction;

			player.x += player.vx;
			player.y += player.vy;
			player.rotation += player.vx * 0.08;

			// Screen Side Walls Bounds
			if (player.x - player.radius < 0) {
				player.x = player.radius;
				player.vx *= -0.6;
			}
			if (player.x + player.radius > WORLD_WIDTH) {
				player.x = WORLD_WIDTH - player.radius;
				player.vx *= -0.6;
			}

			// Coin Collection Collision
			coins.forEach((coin) => {
				if (!coin.collected) {
					const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
					if (dist < player.radius + coin.radius) {
						coin.collected = true;
						score += 10;
						spawnParticles(coin.x, coin.y, COLORS.anchorGold, 10);
					}
				}
			});

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

			// Lava Defeat Condition Check
			if (player.y + player.radius >= lavaY) {
				spawnParticles(player.x, player.y, COLORS.lava, 25);
				triggerShake(8);
				score = 0;
				heightScore = 0;
				initGame();
			}

			// Clean up entities far below the screen
			const cullY = cameraY + VIEW_HEIGHT + 300;
			anchors = anchors.filter((a) => a.y < cullY);
			coins = coins.filter((c) => c.y < cullY);
		}

		function draw() {
			if (!canvasRef) return;
			if (!ctx) return;

			ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.fillStyle = COLORS.bg;
			ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			const cameraY = player.y - VIEW_HEIGHT * 0.55;

			ctx.save();

			// Calculate Screen Shake Offset
			let offsetX = 0;
			let offsetY = 0;
			if (screenShake > 0) {
				offsetX = (Math.random() - 0.5) * screenShake * 2;
				offsetY = (Math.random() - 0.5) * screenShake * 2;
			}

			ctx.translate(offsetX, -Math.floor(cameraY) + offsetY);

			// Aim Indicator Line
			const mouseWorldX = mouseCanvasX;
			const mouseWorldY = mouseCanvasY + cameraY;
			const aimTarget = findTargetAnchor(mouseWorldX, mouseWorldY);

			if (aimTarget && !grapple.active) {
				ctx.strokeStyle = COLORS.aimLine;
				ctx.lineWidth = 2;
				ctx.setLineDash([6, 6]);
				ctx.beginPath();
				ctx.moveTo(player.x, player.y);
				ctx.lineTo(aimTarget.x, aimTarget.y);
				ctx.stroke();
				ctx.setLineDash([]);

				// Target Lock Ring
				ctx.strokeStyle = COLORS.rope;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(aimTarget.x, aimTarget.y, aimTarget.radius + 6, 0, Math.PI * 2);
				ctx.stroke();
			}

			// Active Grapple Laser Tether
			if (grapple.active && grapple.anchor) {
				ctx.strokeStyle = COLORS.rope;
				ctx.lineWidth = 3;
				ctx.shadowColor = COLORS.rope;
				ctx.shadowBlur = 8;
				ctx.beginPath();
				ctx.moveTo(player.x, player.y);
				ctx.lineTo(grapple.anchor.x, grapple.anchor.y);
				ctx.stroke();
				ctx.shadowBlur = 0;
			}

			// Draw Anchors
			anchors.forEach((a) => {
				ctx.beginPath();
				ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);

				if (a.type === "gold") ctx.fillStyle = COLORS.anchorGold;
				else if (a.type === "moving") ctx.fillStyle = COLORS.anchorMoving;
				else ctx.fillStyle = COLORS.anchorStatic;

				ctx.fill();
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.closePath();
			});

			// Draw Coins
			coins.forEach((c) => {
				if (!c.collected) {
					ctx.beginPath();
					ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
					ctx.fillStyle = COLORS.anchorGold;
					ctx.fill();
					ctx.strokeStyle = "#ffffff";
					ctx.lineWidth = 1.5;
					ctx.stroke();
					ctx.closePath();
				}
			});

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
				ctx.fillStyle = COLORS.playerBorder;
				ctx.fill();
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(player.radius, 0);
				ctx.stroke();
			}

			ctx.strokeStyle = COLORS.playerBorder;
			ctx.lineWidth = 2.5;
			ctx.beginPath();
			ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
			ctx.stroke();

			ctx.restore();

			// Draw Rising Plasma Lava Wall
			ctx.fillStyle = COLORS.lava;
			ctx.fillRect(0, lavaY, WORLD_WIDTH, VIEW_HEIGHT + 300);

			// Lava Glow Surface Wave
			ctx.fillStyle = COLORS.lavaGlow;
			ctx.beginPath();
			ctx.moveTo(0, lavaY);
			for (let x = 0; x <= WORLD_WIDTH; x += 30) {
				const waveY = lavaY + Math.sin(x * 0.05 + Date.now() * 0.005) * 6;
				ctx.lineTo(x, waveY);
			}
			ctx.lineTo(WORLD_WIDTH, lavaY + 20);
			ctx.lineTo(0, lavaY + 20);
			ctx.fill();

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
			window.removeEventListener("mouseup", handleMouseUp);
			cancelAnimationFrame(animationFrameId);
		};
	});

	function resetGame() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		score = 0;
		heightScore = 0;
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
			.huge}; overflow: hidden; position: relative; background: #0d1117; display: flex; flex-direction: column; align-items: center; justify-content: center;">
		<div
			style="position: absolute; top: 16px; left: 20px; color: #ffffff; font-family: {token.global
				.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token.global
				.font.size.medium}; display: flex; gap: {token.global.spacing
				.large}; pointer-events: none; z-index: 10;">
			<div>Score: {score}</div>
			<div>Height: {heightScore}m</div>
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
		Use spacebar to play - <Icon icon="star_shine" />Game is generated with AI!
	</Flex>
</Flex>
