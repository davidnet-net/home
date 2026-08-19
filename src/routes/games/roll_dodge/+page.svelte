<script lang="ts">
	import {
		authState,
		Flex,
		whenAuthReady,
		LinkButton,
		Button,
		identityState,
		Lozenge,
		Icon
	} from "@davidnet-net/svelte-ui";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { PUBLIC_ACCOUNT_FRONTEND_URL } from "$env/static/public";
	import { token } from "@davidnet-net/svelte-ui/tokens";

	// Strict TypeScript Interfaces
	interface Platform {
		x: number;
		y: number;
		width: number;
		height: number;
		moving?: boolean;
		dir?: number;
		minX?: number;
		maxX?: number;
		type?: "normal" | "icy" | "crumbling";
		crumbleTimer?: number;
		isCrumbled?: boolean;
	}

	interface Coin {
		x: number;
		y: number;
		radius: number;
		collected: boolean;
	}

	interface BouncePad {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface Enemy {
		x: number;
		y: number;
		width: number;
		height: number;
		vx: number;
		minX: number;
		maxX: number;
	}

	interface Meteor {
		x: number;
		y: number;
		radius: number;
		vx: number;
		vy: number;
	}

	interface LaserBeam {
		x: number;
		y: number;
		width: number;
		height: number;
		timer: number;
		period: number;
		activeTime: number;
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

	interface Portal {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface LevelData {
		spawn: { x: number; y: number };
		platforms: Platform[];
		coins: Coin[];
		bouncePads: BouncePad[];
		enemies: Enemy[];
		lasers: LaserBeam[];
		portal: Portal;
	}

	let canvasRef = $state<HTMLCanvasElement | undefined>();
	let gameContainerRef = $state<HTMLDivElement | undefined>();
	let score = $state(0);
	let level = $state(1);
	let resetSignal = $state(0);

	// World Dimensions
	const WORLD_WIDTH = 3600;
	const WORLD_HEIGHT = 1800;

	// Canvas Rendering Palette
	const GAME_COLORS = {
		bg: "#16213e",
		platform: "#0f3460",
		platformBorder: "#e94560",
		icyPlatform: "#1a8cff",
		icyBorder: "#70d6ff",
		crumblePlatform: "#8d5b4c",
		crumbleBorder: "#d1a384",
		player: "#e94560",
		coin: "#f1c40f",
		bouncePad: "#00fff5",
		enemy: "#ff2e63",
		meteor: "#ff3333",
		meteorGlow: "#ff9900",
		laserActive: "#ff0055",
		laserWarning: "rgba(255, 0, 85, 0.3)",
		portal: "#2ecc71"
	};

	$effect(() => {
		(async () => {
			await whenAuthReady();
			if (!authState.isLoggedIn && !authState.loading) {
				window.location.href = `${PUBLIC_ACCOUNT_FRONTEND_URL}/login?continue=${encodeURIComponent(page.url.href)}`;
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
			img.onerror = () => {
				avatarLoaded = false;
			};
		}

		const keys = { left: false, right: false, up: false };

		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				["ArrowLeft", "a", "A", "ArrowRight", "d", "D", "ArrowUp", "w", "W", " "].includes(e.key)
			) {
				e.preventDefault();
			}
			if (["ArrowLeft", "a", "A"].includes(e.key)) keys.left = true;
			if (["ArrowRight", "d", "D"].includes(e.key)) keys.right = true;
			if (["ArrowUp", "w", "W", " "].includes(e.key)) keys.up = true;
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (
				["ArrowLeft", "a", "A", "ArrowRight", "d", "D", "ArrowUp", "w", "W", " "].includes(e.key)
			) {
				e.preventDefault();
			}
			if (["ArrowLeft", "a", "A"].includes(e.key)) keys.left = false;
			if (["ArrowRight", "d", "D"].includes(e.key)) keys.right = false;
			if (["ArrowUp", "w", "W", " "].includes(e.key)) keys.up = false;
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);

		// Player Ball Properties with Momentum Physics
		const player = {
			x: 100,
			y: WORLD_HEIGHT - 250,
			width: 26,
			height: 26,
			vx: 0,
			vy: 0,
			baseAccel: 0.55,
			accel: 0.55,
			maxSpeed: 5.5,
			groundFriction: 0.94,
			airFriction: 0.98,
			jumpStrength: -11.5,
			gravity: 0.48,
			grounded: false,
			rotation: 0
		};

		const camera = { x: 0, y: 0 };
		let activeMeteors: Meteor[] = [];
		let particles: Particle[] = [];
		let screenShake = 0;

		let activeLevel: LevelData = generateValidatedLevel(level);

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

		function resetPlayerPosition() {
			player.x = activeLevel.spawn.x;
			player.y = activeLevel.spawn.y;
			player.vx = 0;
			player.vy = 0;
			player.rotation = 0;
			activeMeteors = [];
		}

		resetPlayerPosition();

		function canReach(p1: Platform, p2: Platform, hasBouncePad: boolean): boolean {
			const vx = player.maxSpeed;
			const vy = hasBouncePad ? player.jumpStrength * 1.45 : player.jumpStrength;
			const g = player.gravity;

			const gap = p2.x - (p1.x + p1.width);
			const deltaY = p1.y - p2.y;

			const discriminant = vy * vy - 2 * g * deltaY;
			if (discriminant < 0) return false;

			const tMax = (-vy + Math.sqrt(discriminant)) / g;
			const maxReachableGap = vx * tMax - 25;

			return gap <= maxReachableGap;
		}

		function isLevelPlayable(levelData: LevelData): boolean {
			const { platforms, bouncePads } = levelData;
			const queue: number[] = [0];
			const visited = new Set<number>([0]);

			while (queue.length > 0) {
				const currIdx = queue.shift()!;
				if (currIdx === platforms.length - 1) return true;

				const p1 = platforms[currIdx];

				for (let i = 0; i < platforms.length; i++) {
					if (visited.has(i)) continue;
					const p2 = platforms[i];

					const hasBounce = bouncePads.some(
						(pad) =>
							pad.x >= p1.x &&
							pad.x + pad.width <= p1.x + p1.width &&
							Math.abs(pad.y - (p1.y - 8)) < 10
					);

					if (canReach(p1, p2, hasBounce)) {
						visited.add(i);
						queue.push(i);
					}
				}
			}

			return false;
		}

		function overlapsAny(
			rect: { x: number; y: number; width: number; height: number },
			existing: Array<{ x: number; y: number; width: number; height: number }>,
			padding = 60
		): boolean {
			return existing.some(
				(p) =>
					rect.x < p.x + p.width + padding &&
					rect.x + rect.width + padding > p.x &&
					rect.y < p.y + p.height + padding &&
					rect.y + rect.height + padding > p.y
			);
		}

		function buildCandidateLevel(currentLvl: number): LevelData {
			const platforms: Platform[] = [];
			const coins: Coin[] = [];
			const bouncePads: BouncePad[] = [];
			const enemies: Enemy[] = [];
			const lasers: LaserBeam[] = [];

			const startX = 100;
			const startY = WORLD_HEIGHT - 250;
			const spawnPlat: Platform = {
				x: startX - 30,
				y: startY + 30,
				width: 180,
				height: 24,
				type: "normal"
			};
			platforms.push(spawnPlat);

			let currX = startX + 180;
			let currY = startY + 30;

			const totalSteps = 10 + Math.min(currentLvl * 2, 16);

			for (let i = 0; i < totalSteps; i++) {
				const stepWidth = Math.max(100, 160 - currentLvl * 2);
				const stepHeight = 20;

				let placed = false;
				let attempts = 0;

				while (!placed && attempts < 30) {
					attempts++;

					const deltaX = 100 + Math.random() * 90;
					const yOffsets = [-110, -60, 0, 60, 110];
					const deltaY = yOffsets[Math.floor(Math.random() * yOffsets.length)];

					const nextX = currX + deltaX;
					const nextY = currY + deltaY;

					const candidate = { x: nextX, y: nextY, width: stepWidth, height: stepHeight };

					if (nextY < 200 || nextY > WORLD_HEIGHT - 200 || nextX + stepWidth > WORLD_WIDTH - 200) {
						continue;
					}

					if (!overlapsAny(candidate, platforms, 50)) {
						const isMoving = currentLvl >= 4 && Math.random() > 0.7;

						// Determine platform type
						let platType: "normal" | "icy" | "crumbling" = "normal";
						if (currentLvl >= 2 && Math.random() < 0.25) {
							platType = "icy";
						} else if (currentLvl >= 2 && Math.random() < 0.2) {
							platType = "crumbling";
						}

						const finalPlat: Platform = {
							...candidate,
							moving: isMoving,
							dir: 1,
							minX: candidate.x - 40,
							maxX: candidate.x + 40,
							type: platType
						};

						platforms.push(finalPlat);

						if (currentLvl >= 2 && deltaY <= -90 && !isMoving && Math.random() > 0.4) {
							bouncePads.push({
								x: currX + 35,
								y: currY - 8,
								width: 30,
								height: 8
							});
						}

						if (currentLvl >= 3 && stepWidth >= 110 && !isMoving && Math.random() > 0.5) {
							enemies.push({
								x: nextX + 15,
								y: nextY - 20,
								width: 20,
								height: 20,
								vx: 1.2 + currentLvl * 0.2,
								minX: nextX,
								maxX: nextX + stepWidth - 20
							});
						}

						// Timed Laser Beam Hazards (Unlocked at Level 3)
						if (currentLvl >= 3 && Math.random() < 0.35 && !isMoving) {
							lasers.push({
								x: nextX + stepWidth / 2 - 4,
								y: nextY - 140,
								width: 8,
								height: 140,
								timer: Math.floor(Math.random() * 120),
								period: 160,
								activeTime: 60
							});
						}

						coins.push({
							x: nextX + stepWidth / 2,
							y: nextY - 24,
							radius: 7,
							collected: false
						});

						currX = nextX;
						currY = nextY;
						placed = true;
					}
				}
			}

			const lastPlat = platforms[platforms.length - 1];
			const portal: Portal = {
				x: lastPlat.x + lastPlat.width / 2 - 15,
				y: lastPlat.y - 50,
				width: 30,
				height: 50
			};

			return {
				spawn: { x: startX, y: startY },
				platforms,
				coins,
				bouncePads,
				enemies,
				lasers,
				portal
			};
		}

		function generateValidatedLevel(currentLvl: number): LevelData {
			let attempts = 0;
			while (attempts < 50) {
				attempts++;
				const candidate = buildCandidateLevel(currentLvl);
				if (isLevelPlayable(candidate)) {
					return candidate;
				}
			}
			return buildCandidateLevel(currentLvl);
		}

		function loadNextLevel() {
			level += 1;
			activeLevel = generateValidatedLevel(level);
			resetPlayerPosition();
			triggerShake(6);
		}

		function update() {
			// Update Screen Shake decay
			if (screenShake > 0) {
				screenShake -= 0.25;
				if (screenShake < 0) screenShake = 0;
			}

			// Default Friction Values
			let currentFriction = player.groundFriction;
			player.accel = player.baseAccel;

			// Update Crumbling Platforms
			activeLevel.platforms.forEach((plat) => {
				if (plat.type === "crumbling" && plat.crumbleTimer !== undefined && !plat.isCrumbled) {
					plat.crumbleTimer--;
					if (plat.crumbleTimer % 8 === 0) {
						spawnParticles(plat.x + Math.random() * plat.width, plat.y, "#d1a384", 2);
					}
					if (plat.crumbleTimer <= 0) {
						plat.isCrumbled = true;
						spawnParticles(plat.x + plat.width / 2, plat.y + plat.height / 2, "#8d5b4c", 15);
						triggerShake(2);
					}
				}
			});

			// Momentum Physics Calculations
			if (keys.left) {
				player.vx -= player.accel;
			} else if (keys.right) {
				player.vx += player.accel;
			} else {
				player.vx *= player.grounded ? currentFriction : player.airFriction;
			}

			if (player.vx > player.maxSpeed) player.vx = player.maxSpeed;
			if (player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;

			if (keys.up && player.grounded) {
				player.vy = player.jumpStrength;
				player.grounded = false;
			}
			player.vy += player.gravity;

			player.x += player.vx;
			player.y += player.vy;

			// Angular velocity for rolling ball
			player.rotation += player.vx / (player.width / 2);

			player.grounded = false;

			if (player.x < 0) {
				player.x = 0;
				player.vx = 0;
			}
			if (player.x + player.width > WORLD_WIDTH) {
				player.x = WORLD_WIDTH - player.width;
				player.vx = 0;
			}

			// Moving Platforms
			activeLevel.platforms.forEach((plat) => {
				if (
					plat.moving &&
					plat.minX !== undefined &&
					plat.maxX !== undefined &&
					plat.dir !== undefined
				) {
					plat.x += plat.dir * 1.5;
					if (plat.x <= plat.minX || plat.x + plat.width >= plat.maxX) {
						plat.dir *= -1;
					}
				}
			});

			// Bounce Pads (Checked BEFORE platform collision so vy isn't zeroed out first)
			activeLevel.bouncePads.forEach((pad) => {
				const isHorizontallyAligned =
					player.x + player.width > pad.x && player.x < pad.x + pad.width;
				const prevFeetY = player.y + player.height - player.vy;
				const currFeetY = player.y + player.height;

				if (
					isHorizontallyAligned &&
					player.vy >= 0 &&
					currFeetY >= pad.y - 4 &&
					prevFeetY <= pad.y + pad.height + 10
				) {
					player.y = pad.y - player.height;
					player.vy = player.jumpStrength * 1.5;
					player.grounded = false;
					spawnParticles(pad.x + pad.width / 2, pad.y, GAME_COLORS.bouncePad, 14);
					triggerShake(4);
				}
			});

			// Solid 4-Way Platform Collision
			activeLevel.platforms.forEach((plat) => {
				if (plat.isCrumbled) return;

				if (
					player.x + player.width > plat.x &&
					player.x < plat.x + plat.width &&
					player.y + player.height > plat.y &&
					player.y < plat.y + plat.height
				) {
					const overlapX1 = player.x + player.width - plat.x;
					const overlapX2 = plat.x + plat.width - player.x;
					const overlapY1 = player.y + player.height - plat.y;
					const overlapY2 = plat.y + plat.height - player.y;

					const minOverlapX = Math.min(overlapX1, overlapX2);
					const minOverlapY = Math.min(overlapY1, overlapY2);

					if (minOverlapY < minOverlapX) {
						if (overlapY1 < overlapY2 && player.vy >= 0) {
							player.y = plat.y - player.height;
							player.vy = 0;
							player.grounded = true;

							if (plat.type === "icy") {
								currentFriction = 0.992;
								player.accel = 0.25;
							}

							if (plat.type === "crumbling" && plat.crumbleTimer === undefined) {
								plat.crumbleTimer = 60;
							}

							if (plat.moving && plat.dir !== undefined) {
								player.x += plat.dir * 1.5;
							}
						} else if (overlapY2 < overlapY1) {
							player.y = plat.y + plat.height;
							if (player.vy < 0) player.vy = 0;
						}
					} else {
						if (overlapX1 < overlapX2) {
							player.x = plat.x - player.width;
							player.vx = 0;
						} else {
							player.x = plat.x + plat.width;
							player.vx = 0;
						}
					}
				}
			});

			// Falling Meteor Hazard Logic (Reduced spawn rate to ~1 per 4-6 seconds)
			const spawnChance = 0.003 + Math.min(level * 0.001, 0.006);
			if (canvasRef && Math.random() < spawnChance) {
				activeMeteors.push({
					x: camera.x + Math.random() * (canvasRef.width + 200) - 100,
					y: camera.y - 40,
					radius: 7 + Math.random() * 6,
					vx: (Math.random() - 0.5) * 2.5,
					vy: 3.5 + Math.random() * 3 + level * 0.2
				});
			}

			// Update Meteors & Collision Check
			for (let i = activeMeteors.length - 1; i >= 0; i--) {
				const meteor = activeMeteors[i];
				meteor.x += meteor.vx;
				meteor.y += meteor.vy;

				// Player Collision
				const playerCenterX = player.x + player.width / 2;
				const playerCenterY = player.y + player.height / 2;
				const distToPlayer = Math.hypot(playerCenterX - meteor.x, playerCenterY - meteor.y);

				if (distToPlayer < player.width / 2 + meteor.radius) {
					spawnParticles(playerCenterX, playerCenterY, GAME_COLORS.meteor, 20);
					triggerShake(8);
					resetPlayerPosition();
					break;
				}

				// Platform Collision (Explode & disappear on impact)
				let hitPlatform = false;
				for (const plat of activeLevel.platforms) {
					if (plat.isCrumbled) continue;
					if (
						meteor.x + meteor.radius > plat.x &&
						meteor.x - meteor.radius < plat.x + plat.width &&
						meteor.y + meteor.radius > plat.y &&
						meteor.y - meteor.radius < plat.y + plat.height
					) {
						spawnParticles(meteor.x, meteor.y, GAME_COLORS.meteor, 12);
						triggerShake(2);
						activeMeteors.splice(i, 1);
						hitPlatform = true;
						break;
					}
				}
				if (hitPlatform) continue;

				if (canvasRef && meteor.y > camera.y + canvasRef.height + 60) {
					activeMeteors.splice(i, 1);
				}
			}

			// Timed Lasers Collision & Logic
			activeLevel.lasers.forEach((laser) => {
				laser.timer = (laser.timer + 1) % laser.period;
				const isActive = laser.timer < laser.activeTime;

				if (
					isActive &&
					player.x + player.width > laser.x &&
					player.x < laser.x + laser.width &&
					player.y + player.height > laser.y &&
					player.y < laser.y + laser.height
				) {
					spawnParticles(
						player.x + player.width / 2,
						player.y + player.height / 2,
						GAME_COLORS.laserActive,
						20
					);
					triggerShake(8);
					resetPlayerPosition();
				}
			});

			// Enemies
			activeLevel.enemies.forEach((enemy) => {
				enemy.x += enemy.vx;
				if (enemy.x <= enemy.minX || enemy.x + enemy.width >= enemy.maxX) {
					enemy.vx *= -1;
				}

				if (
					player.x < enemy.x + enemy.width &&
					player.x + player.width > enemy.x &&
					player.y < enemy.y + enemy.height &&
					player.y + player.height > enemy.y
				) {
					if (player.vy > 0 && player.y + player.height - player.vy <= enemy.y + 6) {
						player.vy = player.jumpStrength * 0.7;
						spawnParticles(
							enemy.x + enemy.width / 2,
							enemy.y + enemy.height / 2,
							GAME_COLORS.enemy,
							15
						);
						triggerShake(3);
						enemy.x = -999;
						score += 25;
					} else {
						spawnParticles(
							player.x + player.width / 2,
							player.y + player.height / 2,
							GAME_COLORS.enemy,
							15
						);
						triggerShake(6);
						resetPlayerPosition();
					}
				}
			});

			if (player.y > WORLD_HEIGHT + 100) {
				resetPlayerPosition();
			}

			// Coin Collection (+1 score & Sparkle)
			activeLevel.coins.forEach((coin) => {
				if (!coin.collected) {
					const distX = player.x + player.width / 2 - coin.x;
					const distY = player.y + player.height / 2 - coin.y;
					const distance = Math.sqrt(distX * distX + distY * distY);

					if (distance < coin.radius + player.width / 2) {
						coin.collected = true;
						score += 1;
						spawnParticles(coin.x, coin.y, GAME_COLORS.coin, 10);
					}
				}
			});

			// Update Particle Life & Physics
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

			// Portal
			const portal = activeLevel.portal;
			if (
				player.x < portal.x + portal.width &&
				player.x + player.width > portal.x &&
				player.y < portal.y + portal.height &&
				player.y + player.height > portal.y
			) {
				loadNextLevel();
			}

			// Camera Tracking
			if (canvasRef) {
				const targetCamX = player.x + player.width / 2 - canvasRef.width / 2;
				const targetCamY = player.y + player.height / 2 - canvasRef.height / 2;

				camera.x += (targetCamX - camera.x) * 0.1;
				camera.y += (targetCamY - camera.y) * 0.1;

				camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvasRef.width, camera.x));
				camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvasRef.height, camera.y));
			}
		}

		function draw() {
			if (!canvasRef) return;
			if (!ctx) return;
			ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);

			ctx.fillStyle = GAME_COLORS.bg;
			ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);

			ctx.save();

			// Calculate Screen Shake Offset
			let offsetX = 0;
			let offsetY = 0;
			if (screenShake > 0) {
				offsetX = (Math.random() - 0.5) * screenShake * 2;
				offsetY = (Math.random() - 0.5) * screenShake * 2;
			}

			ctx.translate(-Math.floor(camera.x) + offsetX, -Math.floor(camera.y) + offsetY);

			// Draw Platforms
			activeLevel.platforms.forEach((plat) => {
				if (plat.isCrumbled) return;

				if (plat.type === "icy") {
					ctx.fillStyle = GAME_COLORS.icyPlatform;
					ctx.strokeStyle = GAME_COLORS.icyBorder;
				} else if (plat.type === "crumbling") {
					ctx.fillStyle = GAME_COLORS.crumblePlatform;
					ctx.strokeStyle = GAME_COLORS.crumbleBorder;
				} else {
					ctx.fillStyle = GAME_COLORS.platform;
					ctx.strokeStyle = GAME_COLORS.platformBorder;
				}

				ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
				ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
			});

			// Draw Timed Lasers
			activeLevel.lasers.forEach((laser) => {
				const isActive = laser.timer < laser.activeTime;
				if (isActive) {
					ctx.fillStyle = GAME_COLORS.laserActive;
					ctx.fillRect(laser.x, laser.y, laser.width, laser.height);
				} else {
					// Warning Telegraph Line
					ctx.strokeStyle = GAME_COLORS.laserWarning;
					ctx.setLineDash([4, 4]);
					ctx.beginPath();
					ctx.moveTo(laser.x + laser.width / 2, laser.y);
					ctx.lineTo(laser.x + laser.width / 2, laser.y + laser.height);
					ctx.stroke();
					ctx.setLineDash([]);
				}
			});

			// Draw Bounce Pads
			ctx.fillStyle = GAME_COLORS.bouncePad;
			activeLevel.bouncePads.forEach((pad) => {
				ctx.fillRect(pad.x, pad.y, pad.width, pad.height);
			});

			// Draw Enemies
			ctx.fillStyle = GAME_COLORS.enemy;
			activeLevel.enemies.forEach((enemy) => {
				if (enemy.x > 0) {
					ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
				}
			});

			// Draw Meteors
			activeMeteors.forEach((meteor) => {
				ctx.beginPath();
				ctx.arc(meteor.x, meteor.y, meteor.radius, 0, Math.PI * 2);
				ctx.fillStyle = GAME_COLORS.meteor;
				ctx.fill();
				ctx.strokeStyle = GAME_COLORS.meteorGlow;
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.closePath();
			});

			// Draw Coins
			ctx.fillStyle = GAME_COLORS.coin;
			activeLevel.coins.forEach((coin) => {
				if (!coin.collected) {
					ctx.beginPath();
					ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
					ctx.fill();
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

			// Draw Portal
			ctx.fillStyle = GAME_COLORS.portal;
			if (activeLevel.portal) {
				ctx.fillRect(
					activeLevel.portal.x,
					activeLevel.portal.y,
					activeLevel.portal.width,
					activeLevel.portal.height
				);
			}

			// Draw Rolling Ball Player with Avatar Image
			ctx.save();
			const centerX = player.x + player.width / 2;
			const centerY = player.y + player.height / 2;
			const radius = player.width / 2;

			ctx.translate(centerX, centerY);
			ctx.rotate(player.rotation);

			ctx.beginPath();
			ctx.arc(0, 0, radius, 0, Math.PI * 2);
			ctx.closePath();
			ctx.clip();

			if (avatarImg && avatarLoaded) {
				ctx.drawImage(avatarImg, -radius, -radius, player.width, player.height);
			} else {
				ctx.fillStyle = GAME_COLORS.player;
				ctx.fill();
				ctx.strokeStyle = "#ffffff";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.lineTo(radius, 0);
				ctx.stroke();
			}

			ctx.strokeStyle = GAME_COLORS.platformBorder;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(0, 0, radius, 0, Math.PI * 2);
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
			.huge}; overflow: hidden; position: relative; background: #16213e; display: flex; flex-direction: column; align-items: center; justify-content: center;">
		<div
			style="position: absolute; top: 16px; left: 20px; color: #ffffff; font-family: {token.global
				.font.family.sans}; font-weight: {token.global.font.weight.bold}; font-size: {token.global
				.font.size.medium}; display: flex; gap: {token.global.spacing
				.large}; pointer-events: none; z-index: 10;">
			<div>Coins: {score}</div>
			<div>Level: {level}</div>
		</div>

		<canvas
			bind:this={canvasRef}
			width="800"
			height="450"
			style="max-width: 100%; max-height: 100%; object-fit: contain;">
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
