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
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	type GameState = "menu" | "playing" | "paused" | "gameover" | "victory";
	type PowerUpType = "expand" | "multiball" | "laser" | "shield" | "life" | "bomb";

	interface Paddle {
		x: number;
		y: number;
		width: number;
		height: number;
		dx: number;
		isLaser: boolean;
		laserTimer: number;
		isExpanded: boolean;
		expandTimer: number;
	}

	interface Ball {
		x: number;
		y: number;
		vx: number;
		vy: number;
		radius: number;
		active: boolean;
	}

	interface Brick {
		x: number;
		y: number;
		width: number;
		height: number;
		health: number;
		maxHealth: number;
		type: "normal" | "tough" | "bomb" | "unbreakable" | "powerup";
		color: string;
		alive: boolean;
	}

	interface PowerUp {
		x: number;
		y: number;
		vy: number;
		type: PowerUpType;
		radius: number;
		active: boolean;
	}

	interface LaserBeam {
		x: number;
		y: number;
		vy: number;
		width: number;
		height: number;
	}

	interface Particle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		color: string;
		alpha: number;
		life: number;
		maxLife: number;
		radius: number;
	}

	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();

	let gameState = $state<GameState>("menu");
	let score = $state(0);
	let highScore = $state(0);
	let lives = $state(3);
	let level = $state(1);
	let shieldActive = $state(false);

	// Canvas Constants (16:9 Widescreen)
	const VIEW_WIDTH = 960;
	const VIEW_HEIGHT = 540;

	const COLORS = {
		bg1: "#12161f",
		bg2: "#1a202c",
		paddle: "#6366f1",
		paddleGlow: "#818cf8",
		ball: "#f8fafc",
		shield: "#38bdf8",
		text: "#f8fafc"
	};

	$effect(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("cyber_breakout_highscore");
			if (saved) highScore = parseInt(saved, 10);
		}
	});

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
			}
		})();
	});

	$effect(() => {
		if (!canvasRef) return;
		const ctx = canvasRef.getContext("2d");
		if (!ctx) return;

		let animationFrameId: number;

		let keysPressed: Record<string, boolean> = {};

		let paddle: Paddle = {
			x: VIEW_WIDTH / 2 - 60,
			y: VIEW_HEIGHT - 45,
			width: 120,
			height: 16,
			dx: 0,
			isLaser: false,
			laserTimer: 0,
			isExpanded: false,
			expandTimer: 0
		};

		let balls: Ball[] = [
			{
				x: VIEW_WIDTH / 2,
				y: VIEW_HEIGHT - 65,
				vx: 3.5,
				vy: -4.5,
				radius: 8,
				active: true
			}
		];

		let bricks: Brick[] = [];
		let powerUps: PowerUp[] = [];
		let lasers: LaserBeam[] = [];
		let particles: Particle[] = [];
		let screenShake = 0;

		function triggerShake(intensity = 6) {
			screenShake = Math.max(screenShake, intensity);
		}

		function spawnParticles(x: number, y: number, color: string, count = 15) {
			for (let i = 0; i < count; i++) {
				const angle = Math.random() * Math.PI * 2;
				const speed = 1 + Math.random() * 4;
				particles.push({
					x,
					y,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					color,
					alpha: 1,
					life: 0,
					maxLife: 20 + Math.random() * 20,
					radius: 2 + Math.random() * 3
				});
			}
		}

		function initLevel(lvl: number) {
			bricks = [];
			powerUps = [];
			lasers = [];
			balls = [
				{
					x: paddle.x + paddle.width / 2,
					y: paddle.y - 15,
					vx: 3.5 + lvl * 0.3,
					vy: -4.5 - lvl * 0.3,
					radius: 8,
					active: true
				}
			];

			const rows = 5 + Math.min(3, Math.floor(lvl / 2));
			const cols = 12;
			const brickWidth = 72;
			const brickHeight = 24;
			const padding = 8;
			const offsetX = (VIEW_WIDTH - (cols * (brickWidth + padding) - padding)) / 2;
			const offsetY = 60;

			const rowColors = [
				"#ef4444",
				"#f97316",
				"#eab308",
				"#10b981",
				"#06b6d4",
				"#8b5cf6",
				"#ec4899"
			];

			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const bx = offsetX + c * (brickWidth + padding);
					const by = offsetY + r * (brickHeight + padding);

					let bType: Brick["type"] = "normal";
					let bHealth = 1;
					let color = rowColors[r % rowColors.length];

					const roll = Math.random();
					if (lvl >= 2 && roll < 0.12) {
						bType = "bomb";
						color = "#f43f5e";
					} else if (roll < 0.22) {
						bType = "tough";
						bHealth = 2;
						color = "#64748b";
					} else if (lvl >= 3 && roll < 0.28) {
						bType = "unbreakable";
						bHealth = 999;
						color = "#334155";
					} else if (roll < 0.38) {
						bType = "powerup";
						color = "#a855f7";
					}

					bricks.push({
						x: bx,
						y: by,
						width: brickWidth,
						height: brickHeight,
						health: bHealth,
						maxHealth: bHealth,
						type: bType,
						color,
						alive: true
					});
				}
			}
		}

		function resetGame() {
			score = 0;
			lives = 3;
			level = 1;
			shieldActive = false;
			paddle.width = 120;
			paddle.dx = 0;
			paddle.isLaser = false;
			paddle.isExpanded = false;
			initLevel(level);
			gameState = "playing";
		}

		(window as any).startBreakoutGame = resetGame;

		const handleMouseDown = (e: MouseEvent) => {
			if (gameState !== "playing") return;
			if (paddle.isLaser && e.button === 0) {
				shootLaser();
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			keysPressed[e.key] = true;
			if (gameState === "menu" && (e.key === "Enter" || e.key === " ")) {
				resetGame();
			}
			if (e.key === "Escape" || e.key === "p" || e.key === "P") {
				if (gameState === "playing") gameState = "paused";
				else if (gameState === "paused") gameState = "playing";
			}
			if (gameState === "playing" && (e.key === " " || e.key === "Spacebar") && paddle.isLaser) {
				shootLaser();
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			keysPressed[e.key] = false;
		};

		function shootLaser() {
			lasers.push({
				x: paddle.x + 15,
				y: paddle.y,
				vy: -9,
				width: 4,
				height: 14
			});
			lasers.push({
				x: paddle.x + paddle.width - 19,
				y: paddle.y,
				vy: -9,
				width: 4,
				height: 14
			});
		}

		window.addEventListener("mousedown", handleMouseDown);
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);

		function triggerBombExplosion(bombBrick: Brick) {
			triggerShake(12);
			spawnParticles(
				bombBrick.x + bombBrick.width / 2,
				bombBrick.y + bombBrick.height / 2,
				"#f43f5e",
				25
			);

			bricks.forEach((b) => {
				if (!b.alive || b.type === "unbreakable") return;
				const dist = Math.hypot(b.x - bombBrick.x, b.y - bombBrick.y);
				if (dist < 110) {
					b.alive = false;
					score += 50;
					spawnParticles(b.x + b.width / 2, b.y + b.height / 2, b.color, 8);
				}
			});
		}

		function spawnPowerUp(x: number, y: number) {
			const types: PowerUpType[] = ["expand", "multiball", "laser", "shield", "life", "bomb"];
			const weights = [0.25, 0.2, 0.2, 0.15, 0.1, 0.1];
			let rand = Math.random();
			let selectedType: PowerUpType = "expand";

			let cumulative = 0;
			for (let i = 0; i < types.length; i++) {
				cumulative += weights[i];
				if (rand <= cumulative) {
					selectedType = types[i];
					break;
				}
			}

			powerUps.push({
				x,
				y,
				vy: 2.2,
				type: selectedType,
				radius: 12,
				active: true
			});
		}

		function updateGame() {
			if (gameState !== "playing") return;

			if (screenShake > 0) {
				screenShake -= 0.3;
				if (screenShake < 0) screenShake = 0;
			}

			// Smooth A & D Arcade Movement with Acceleration/Easing
			let targetDx = 0;
			if (keysPressed["ArrowLeft"] || keysPressed["a"] || keysPressed["A"]) {
				targetDx = -11;
			}
			if (keysPressed["ArrowRight"] || keysPressed["d"] || keysPressed["D"]) {
				targetDx = 11;
			}

			// Smooth interpolation (easing) for responsive arcade control feel
			paddle.dx = paddle.dx * 0.65 + targetDx * 0.35;
			paddle.x += paddle.dx;

			// Clamp paddle bounds
			if (paddle.x < 0) {
				paddle.x = 0;
				paddle.dx = 0;
			}
			if (paddle.x + paddle.width > VIEW_WIDTH) {
				paddle.x = VIEW_WIDTH - paddle.width;
				paddle.dx = 0;
			}

			if (paddle.isExpanded) {
				paddle.expandTimer--;
				if (paddle.expandTimer <= 0) {
					paddle.isExpanded = false;
					paddle.width = 120;
				}
			}
			if (paddle.isLaser) {
				paddle.laserTimer--;
				if (paddle.laserTimer <= 0) {
					paddle.isLaser = false;
				}
			}

			for (let i = lasers.length - 1; i >= 0; i--) {
				const l = lasers[i];
				l.y += l.vy;
				if (l.y < 0) {
					lasers.splice(i, 1);
					continue;
				}

				for (const b of bricks) {
					if (!b.alive) continue;
					if (l.x > b.x && l.x < b.x + b.width && l.y > b.y && l.y < b.y + b.height) {
						lasers.splice(i, 1);
						if (b.type !== "unbreakable") {
							b.health--;
							if (b.health <= 0) {
								b.alive = false;
								score += 20;
								if (b.type === "bomb") triggerBombExplosion(b);
								if (b.type === "powerup") spawnPowerUp(b.x + b.width / 2, b.y + b.height / 2);
								spawnParticles(b.x + b.width / 2, b.y + b.height / 2, b.color, 12);
							}
						}
						break;
					}
				}
			}

			for (let i = powerUps.length - 1; i >= 0; i--) {
				const p = powerUps[i];
				p.y += p.vy;

				if (
					p.x + p.radius > paddle.x &&
					p.x - p.radius < paddle.x + paddle.width &&
					p.y + p.radius > paddle.y &&
					p.y - p.radius < paddle.y + paddle.height
				) {
					if (p.type === "expand") {
						paddle.isExpanded = true;
						paddle.width = 160;
						paddle.expandTimer = 450;
					} else if (p.type === "multiball") {
						if (balls.length > 0) {
							const b = balls[0];
							balls.push({ x: b.x, y: b.y, vx: -b.vx, vy: b.vy, radius: 8, active: true });
							balls.push({
								x: b.x,
								y: b.y,
								vx: b.vx * 0.7,
								vy: b.vy * 1.2,
								radius: 8,
								active: true
							});
						}
					} else if (p.type === "laser") {
						paddle.isLaser = true;
						paddle.laserTimer = 500;
					} else if (p.type === "shield") {
						shieldActive = true;
					} else if (p.type === "life") {
						lives++;
					} else if (p.type === "bomb") {
						const aliveBricks = bricks.filter((b) => b.alive && b.type !== "unbreakable");
						if (aliveBricks.length > 0) {
							const randomBrick = aliveBricks[Math.floor(Math.random() * aliveBricks.length)];
							triggerBombExplosion(randomBrick);
						}
					}

					spawnParticles(p.x, p.y, "#38bdf8", 15);
					powerUps.splice(i, 1);
					continue;
				}

				if (p.y > VIEW_HEIGHT) {
					powerUps.splice(i, 1);
				}
			}

			for (let i = balls.length - 1; i >= 0; i--) {
				const ball = balls[i];
				ball.x += ball.vx;
				ball.y += ball.vy;

				if (ball.x - ball.radius < 0) {
					ball.x = ball.radius;
					ball.vx *= -1;
				}
				if (ball.x + ball.radius > VIEW_WIDTH) {
					ball.x = VIEW_WIDTH - ball.radius;
					ball.vx *= -1;
				}
				if (ball.y - ball.radius < 0) {
					ball.y = ball.radius;
					ball.vy *= -1;
				}

				if (ball.y + ball.radius > VIEW_HEIGHT) {
					if (shieldActive) {
						shieldActive = false;
						ball.vy *= -1;
						triggerShake(4);
					} else {
						balls.splice(i, 1);
						if (balls.length === 0) {
							lives--;
							triggerShake(8);
							if (lives <= 0) {
								gameState = "gameover";
							} else {
								balls.push({
									x: paddle.x + paddle.width / 2,
									y: paddle.y - 15,
									vx: 3.5,
									vy: -4.5,
									radius: 8,
									active: true
								});
							}
						}
						continue;
					}
				}

				if (
					ball.x > paddle.x &&
					ball.x < paddle.x + paddle.width &&
					ball.y + ball.radius >= paddle.y &&
					ball.y - ball.radius <= paddle.y + paddle.height &&
					ball.vy > 0
				) {
					const hitPoint = ball.x - (paddle.x + paddle.width / 2);
					const normalizedHit = hitPoint / (paddle.width / 2);
					const maxAngle = Math.PI / 3;
					const bounceAngle = normalizedHit * maxAngle;
					const speed = Math.hypot(ball.vx, ball.vy);

					ball.vx = speed * Math.sin(bounceAngle);
					ball.vy = -speed * Math.cos(bounceAngle);
					triggerShake(2);
				}

				for (const b of bricks) {
					if (!b.alive) continue;

					const closestX = Math.max(b.x, Math.min(ball.x, b.x + b.width));
					const closestY = Math.max(b.y, Math.min(ball.y, b.y + b.height));

					const distX = ball.x - closestX;
					const distY = ball.y - closestY;
					const distance = Math.hypot(distX, distY);

					if (distance < ball.radius) {
						const overlapX = ball.radius - Math.abs(ball.x - closestX);
						const overlapY = ball.radius - Math.abs(ball.y - closestY);

						if (overlapX < overlapY) {
							ball.vx *= -1;
						} else {
							ball.vy *= -1;
						}

						if (b.type !== "unbreakable") {
							b.health--;
							if (b.health <= 0) {
								b.alive = false;
								score += 30;
								if (score > highScore) {
									highScore = score;
									localStorage.setItem("cyber_breakout_highscore", highScore.toString());
								}

								if (b.type === "bomb") {
									triggerBombExplosion(b);
								} else {
									if (Math.random() < 0.3) {
										spawnPowerUp(b.x + b.width / 2, b.y + b.height / 2);
									}
								}

								spawnParticles(b.x + b.width / 2, b.y + b.height / 2, b.color, 14);
							}
						}
						triggerShake(3);
						break;
					}
				}
			}

			const remainingBricks = bricks.filter((b) => b.alive && b.type !== "unbreakable");
			if (remainingBricks.length === 0) {
				level++;
				if (level > 5) {
					gameState = "victory";
				} else {
					initLevel(level);
				}
			}

			for (let i = particles.length - 1; i >= 0; i--) {
				const p = particles[i];
				p.x += p.vx;
				p.y += p.vy;
				p.life++;
				p.alpha = 1 - p.life / p.maxLife;
				if (p.life >= p.maxLife) particles.splice(i, 1);
			}
		}

		function draw() {
			ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.save();
			let offsetX = 0;
			let offsetY = 0;
			if (screenShake > 0) {
				offsetX = (Math.random() - 0.5) * screenShake * 2;
				offsetY = (Math.random() - 0.5) * screenShake * 2;
			}
			ctx.translate(offsetX, offsetY);

			ctx.fillStyle = COLORS.bg1;
			ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

			ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
			ctx.lineWidth = 1;
			for (let x = 0; x < VIEW_WIDTH; x += 40) {
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, VIEW_HEIGHT);
				ctx.stroke();
			}

			if (shieldActive) {
				ctx.strokeStyle = COLORS.shield;
				ctx.lineWidth = 4;
				ctx.shadowColor = COLORS.shield;
				ctx.shadowBlur = 10;
				ctx.beginPath();
				ctx.moveTo(40, VIEW_HEIGHT - 10);
				ctx.lineTo(VIEW_WIDTH - 40, VIEW_HEIGHT - 10);
				ctx.stroke();
				ctx.shadowBlur = 0;
			}

			bricks.forEach((b) => {
				if (!b.alive) return;
				ctx.fillStyle = b.color;
				ctx.strokeStyle = "rgba(255,255,255,0.15)";
				ctx.lineWidth = 2;

				ctx.beginPath();
				ctx.roundRect(b.x, b.y, b.width, b.height, 6);
				ctx.fill();
				ctx.stroke();

				if (b.type === "bomb") {
					ctx.fillStyle = "#ffffff";
					ctx.font = "bold 12px sans-serif";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText("💣", b.x + b.width / 2, b.y + b.height / 2);
				} else if (b.type === "powerup") {
					ctx.fillStyle = "#ffffff";
					ctx.font = "bold 12px sans-serif";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText("?", b.x + b.width / 2, b.y + b.height / 2);
				} else if (b.type === "tough" && b.health > 1) {
					ctx.fillStyle = "rgba(255,255,255,0.7)";
					ctx.font = "11px sans-serif";
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText(`${b.health}`, b.x + b.width / 2, b.y + b.height / 2);
				}
			});

			powerUps.forEach((p) => {
				ctx.fillStyle = p.type === "bomb" ? "#f43f5e" : p.type === "life" ? "#10b981" : "#38bdf8";
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.stroke();

				ctx.fillStyle = "#ffffff";
				ctx.font = "bold 10px sans-serif";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				const icon =
					p.type === "expand"
						? "⇔"
						: p.type === "multiball"
							? "⚽"
							: p.type === "laser"
								? "⚡"
								: p.type === "shield"
									? "🛡️"
									: p.type === "life"
										? "❤️"
										: "💣";
				ctx.fillText(icon, p.x, p.y);
			});

			lasers.forEach((l) => {
				ctx.fillStyle = "#ef4444";
				ctx.shadowColor = "#ef4444";
				ctx.shadowBlur = 8;
				ctx.fillRect(l.x, l.y, l.width, l.height);
				ctx.shadowBlur = 0;
			});

			ctx.fillStyle = COLORS.paddle;
			ctx.shadowColor = COLORS.paddleGlow;
			ctx.shadowBlur = 12;
			ctx.beginPath();
			ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 8);
			ctx.fill();
			ctx.shadowBlur = 0;

			if (paddle.isLaser) {
				ctx.fillStyle = "#ef4444";
				ctx.fillRect(paddle.x + 12, paddle.y - 6, 6, 8);
				ctx.fillRect(paddle.x + paddle.width - 18, paddle.y - 6, 6, 8);
			}

			balls.forEach((ball) => {
				ctx.beginPath();
				ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
				ctx.fillStyle = COLORS.ball;
				ctx.shadowColor = "#ffffff";
				ctx.shadowBlur = 10;
				ctx.fill();
				ctx.shadowBlur = 0;
				ctx.closePath();
			});

			particles.forEach((p) => {
				ctx.save();
				ctx.globalAlpha = p.alpha;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			});

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
				updateGame();
				accumulator -= STEP;
			}

			draw();
			animationFrameId = requestAnimationFrame(gameLoop);
		}

		animationFrameId = requestAnimationFrame(gameLoop);

		return () => {
			window.removeEventListener("mousedown", handleMouseDown);
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			cancelAnimationFrame(animationFrameId);
		};
	});

	function resetGameAction() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		if ((window as any).startBreakoutGame) {
			(window as any).startBreakoutGame();
		}
	}

	function toggleFullscreen() {
		if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		if (!gameContainerRef) return;
		if (!document.fullscreenElement) {
			gameContainerRef.requestFullscreen().catch((err) => {
				console.error(`Error attempting fullscreen: ${err.message}`);
			});
		} else {
			document.exitFullscreen();
		}
	}
</script>

<Flex alignItems="center" marginTop="medium" direction="column" gap="medium">
	<div
		bind:this={gameContainerRef}
		style="width: 95%; max-width: 1050px; aspect-ratio: 16/9; border-radius: {token.global.radius
			.huge}; overflow: hidden; position: relative; background: #12161f; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 12px 40px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08);">
		<div
			style="position: absolute; top: 18px; left: 24px; right: 24px; color: #f8fafc; font-family: {token
				.global.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token
				.global.font.size
				.medium}; display: flex; justify-content: space-between; pointer-events: none; z-index: 10; align-items: center; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
			<div style="display: flex; gap: 16px;">
				<span
					style="background: rgba(0,0,0,0.4); padding: 6px 14px; border-radius: 10px; backdrop-filter: blur(4px);">
					Score: {score}
				</span>
				<span
					style="background: rgba(0,0,0,0.4); padding: 6px 14px; border-radius: 10px; backdrop-filter: blur(4px);">
					Level: {level}
				</span>
			</div>
			<div style="display: flex; gap: 16px;">
				<span
					style="background: rgba(0,0,0,0.4); padding: 6px 14px; border-radius: 10px; backdrop-filter: blur(4px);">
					Lives: {"❤️".repeat(lives)}
				</span>
				<span
					style="background: rgba(0,0,0,0.4); padding: 6px 14px; border-radius: 10px; backdrop-filter: blur(4px);">
					High: {highScore}
				</span>
			</div>
		</div>

		<canvas
			bind:this={canvasRef}
			width={VIEW_WIDTH}
			height={VIEW_HEIGHT}
			style="width: 100%; height: 100%; object-fit: contain;">
		</canvas>

		{#if gameState === "menu"}
			<div
				style="position: absolute; inset: 0; background: rgba(18,22,31,0.9); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; z-index: 20; color: white; padding: 24px; text-align: center;">
				<h1
					style="font-size: 2.8rem; font-weight: 800; margin: 0; background: linear-gradient(135deg, #6366f1, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
					Cyber Breakout
				</h1>
				<p style="margin: 0; opacity: 0.75; font-size: 1rem;">
					Use <b>A / D</b>
					(or Arrow Keys) to steer paddle • Press
					<b>Spacebar</b>
					or click to shoot lasers!
				</p>
				<Button onclick={resetGameAction} iconbefore="play_arrow">Start Game</Button>
			</div>
		{:else if gameState === "paused"}
			<div
				style="position: absolute; inset: 0; background: rgba(18,22,31,0.75); backdrop-filter: blur(6px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; z-index: 20; color: white;">
				<h2 style="font-size: 2.2rem; margin: 0; font-weight: 700;">Game Paused</h2>
				<Button onclick={() => (gameState = "playing")} iconbefore="play_arrow">Resume</Button>
			</div>
		{:else if gameState === "gameover"}
			<div
				style="position: absolute; inset: 0; background: rgba(18,22,31,0.92); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; z-index: 20; color: white; text-align: center;">
				<h2 style="font-size: 2.4rem; color: #f87171; margin: 0; font-weight: 800;">Game Over</h2>
				<p style="margin: 0; font-size: 1.1rem; opacity: 0.9;">
					Final Score: <b>{score}</b>
				</p>
				<Button onclick={resetGameAction} iconbefore="refresh">Play Again</Button>
			</div>
		{:else if gameState === "victory"}
			<div
				style="position: absolute; inset: 0; background: rgba(18,22,31,0.92); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; z-index: 20; color: white; text-align: center;">
				<h2 style="font-size: 2.4rem; color: #38bdf8; margin: 0; font-weight: 800;">
					Victory! You Beat All Levels
				</h2>
				<p style="margin: 0; font-size: 1.1rem; opacity: 0.9;">
					Final Score: <b>{score}</b>
				</p>
				<Button onclick={resetGameAction} iconbefore="refresh">Play Again</Button>
			</div>
		{/if}
	</div>

	<Flex height="fit-content" width="fit-content" gap="small">
		<LinkButton href="/games" iconbefore="arrow_back">Back</LinkButton>
		<Button onclick={resetGameAction} iconbefore="refresh">Restart</Button>
		<Button onclick={toggleFullscreen} iconbefore="fullscreen">Fullscreen</Button>
	</Flex>

	<Flex
		width="fit-content"
		height="fit-content"
		alignItems="center"
		style="color: {token.theme.color.text.tertiary}"
		gap="xsmall"
		verticalAlign="middle">
		<Icon icon="star_shine" />Cyber Breakout generated with AI!
	</Flex>
</Flex>
