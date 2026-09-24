import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Pause, Play, RotateCcw, Download, Copy, Check, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { sound } from './game/audio';
import { Lane, Obstacle, Coin, Particle, FloatingText, GameState, PowerUpItem, ActivePowerUps } from './game/types';

const WIDTH = 540;
const HEIGHT = 860;
const HORIZON_Y = 220;
const GROUND_Y = 720;
const LANE_WIDTH_BOTTOM = 135;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // React State for HUD & UI
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState<number>(0);
  const [coins, setCoins] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    return parseInt(localStorage.getItem('subway_run_high_score') || '0', 10);
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showControlsGuide, setShowControlsGuide] = useState<boolean>(false);
  const [activePowerUps, setActivePowerUps] = useState<ActivePowerUps>({
    magnet: 0,
    superJump: 0,
    multiplier: 0,
  });

  // Mutable Game References to avoid frame drops inside 60FPS loop
  const gameRef = useRef({
    state: 'START' as GameState,
    score: 0,
    coins: 0,
    highScore: 0,
    distance: 0,
    speed: 420,
    trackOffset: 0,
    lastTime: 0,
    isPaused: false,

    player: {
      lane: 0 as Lane,
      visualLane: 0,
      jumpHeight: 0,
      jumpVy: 0,
      isGrounded: true,
      isRolling: false,
      rollTimer: 0,
      runAnim: 0,
      isFastFalling: false,
      landingSquash: 0,
    },

    powerUps: {
      magnet: 0,
      superJump: 0,
      multiplier: 0,
    },

    obstacles: [] as Obstacle[],
    coinItems: [] as Coin[],
    powerUpItems: [] as PowerUpItem[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    nextSpawnZ: 900,
    nextCoinZ: 600,
  });

  // Keep state sync
  useEffect(() => {
    gameRef.current.highScore = highScore;
  }, [highScore]);

  // Perspective helper
  const project = useCallback((lane: number, z: number, heightOffset = 0) => {
    const t = Math.max(0, 1 - (z / 1000));
    const screenY = HORIZON_Y + (GROUND_Y - HORIZON_Y) * Math.pow(t, 1.8) - (heightOffset * t);
    const laneSpread = LANE_WIDTH_BOTTOM * t;
    const screenX = (WIDTH / 2) + (lane * laneSpread);
    const scale = Math.pow(t, 1.5) * 0.9 + 0.1;
    return { x: screenX, y: screenY, scale, t };
  }, []);

  // Reset Game
  const resetGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0;
    g.coins = 0;
    g.distance = 0;
    g.speed = 420;
    g.trackOffset = 0;
    g.isPaused = false;
    g.state = 'PLAYING';

    g.player.lane = 0;
    g.player.visualLane = 0;
    g.player.jumpHeight = 0;
    g.player.jumpVy = 0;
    g.player.isGrounded = true;
    g.player.isRolling = false;
    g.player.rollTimer = 0;
    g.player.runAnim = 0;
    g.player.isFastFalling = false;
    g.player.landingSquash = 0;

    g.powerUps = { magnet: 0, superJump: 0, multiplier: 0 };
    g.obstacles = [];
    g.coinItems = [];
    g.powerUpItems = [];
    g.particles = [];
    g.floatingTexts = [];
    g.nextSpawnZ = 900;
    g.nextCoinZ = 600;

    setScore(0);
    setCoins(0);
    setIsPaused(false);
    setGameState('PLAYING');
    setActivePowerUps({ magnet: 0, superJump: 0, multiplier: 0 });

    sound.startMusic();
  }, []);

  // Lane Switch
  const switchLane = useCallback((dir: number) => {
    const g = gameRef.current;
    if (g.state !== 'PLAYING' || g.isPaused) return;
    const current = g.player.lane;
    const target = Math.max(-1, Math.min(1, current + dir)) as Lane;
    if (target !== current) {
      g.player.lane = target;
      sound.playLaneSwitch();
    }
  }, []);

  // Jump
  const jump = useCallback(() => {
    const g = gameRef.current;
    if (g.state === 'START' || g.state === 'GAME_OVER') {
      resetGame();
      return;
    }
    if (g.state !== 'PLAYING' || g.isPaused) return;

    if (g.player.isGrounded) {
      // Natural launch impulse for smooth parabolic flight
      const jumpPower = g.powerUps.superJump > 0 ? 740 : 540;
      g.player.jumpVy = jumpPower;
      g.player.isGrounded = false;
      g.player.isRolling = false;
      g.player.isFastFalling = false;
      g.player.landingSquash = 0;
      sound.playJump();
    }
  }, [resetGame]);

  // Roll / Slide
  const roll = useCallback(() => {
    const g = gameRef.current;
    if (g.state !== 'PLAYING' || g.isPaused) return;

    if (!g.player.isGrounded) {
      // Seamless downward impulse rather than a straight plummet
      g.player.isFastFalling = true;
      g.player.jumpVy = Math.min(g.player.jumpVy - 140, -100);
    }
    g.player.isRolling = true;
    g.player.rollTimer = 0.65;
    sound.playSlide();

    // Slide friction sparks
    const p = project(g.player.visualLane, 0);
    for (let i = 0; i < 7; i++) {
      g.particles.push({
        x: p.x + (Math.random() * 24 - 12),
        y: p.y - 4,
        vx: (Math.random() * 50 - 25),
        vy: -Math.random() * 30 - 10,
        color: '#cbd5e1',
        size: Math.random() * 4 + 2,
        alpha: 0.9,
        life: 0.35,
        maxLife: 0.35,
      });
    }
  }, [project]);

  // Pause toggle
  const togglePause = useCallback(() => {
    const g = gameRef.current;
    if (g.state !== 'PLAYING') return;
    g.isPaused = !g.isPaused;
    setIsPaused(g.isPaused);
  }, []);

  // Sound toggle
  const toggleSound = useCallback(() => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  }, []);

  // Spawner
  const spawnObstacleWave = useCallback(() => {
    const g = gameRef.current;
    const types: Obstacle['type'][] = ['LOW_BARRIER', 'HIGH_BARRIER', 'TRAIN', 'TRAIN_CHAIN'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const lane = (Math.floor(Math.random() * 3) - 1) as Lane;

    if (chosenType === 'TRAIN_CHAIN') {
      g.obstacles.push({
        id: Math.random(),
        lane,
        z: g.nextSpawnZ,
        type: 'TRAIN',
        length: 200,
      });
      if (Math.random() > 0.45) {
        const otherLane = ((lane + 1 > 1) ? -1 : lane + 1) as Lane;
        g.obstacles.push({
          id: Math.random(),
          lane: otherLane,
          z: g.nextSpawnZ + 120,
          type: 'LOW_BARRIER',
          length: 30,
        });
      }
      g.nextSpawnZ += 480;
    } else if (chosenType === 'TRAIN') {
      g.obstacles.push({
        id: Math.random(),
        lane,
        z: g.nextSpawnZ,
        type: 'TRAIN',
        length: 130,
      });
      g.nextSpawnZ += 390;
    } else {
      g.obstacles.push({
        id: Math.random(),
        lane,
        z: g.nextSpawnZ,
        type: chosenType,
        length: 30,
      });
      if (Math.random() > 0.55) {
        const altLane = (lane === 0 ? (Math.random() > 0.5 ? 1 : -1) : 0) as Lane;
        g.obstacles.push({
          id: Math.random(),
          lane: altLane,
          z: g.nextSpawnZ,
          type: chosenType === 'LOW_BARRIER' ? 'HIGH_BARRIER' : 'LOW_BARRIER',
          length: 30,
        });
      }
      g.nextSpawnZ += 340;
    }

    // Rare chance to spawn a Power-Up item in an open lane
    if (Math.random() < 0.18) {
      const pTypes: PowerUpItem['type'][] = ['MAGNET', 'SUPER_JUMP', 'MULTIPLIER'];
      const pType = pTypes[Math.floor(Math.random() * pTypes.length)];
      const openLane = ((lane === 0 ? 1 : 0)) as Lane;
      g.powerUpItems.push({
        id: Math.random(),
        lane: openLane,
        z: g.nextSpawnZ - 140,
        type: pType,
        collected: false,
      });
    }
  }, []);

  const spawnCoins = useCallback(() => {
    const g = gameRef.current;
    const coinLane = (Math.floor(Math.random() * 3) - 1) as Lane;
    const count = Math.floor(Math.random() * 3) + 4;
    for (let i = 0; i < count; i++) {
      g.coinItems.push({
        id: Math.random(),
        lane: coinLane,
        z: g.nextCoinZ + i * 45,
        collected: false,
      });
    }
    g.nextCoinZ += count * 45 + Math.random() * 200 + 160;
  }, []);

  // Game Over trigger
  const triggerGameOver = useCallback(() => {
    const g = gameRef.current;
    g.state = 'GAME_OVER';
    setGameState('GAME_OVER');
    sound.stopMusic();
    sound.playCrash();

    const finalScore = g.score;
    if (finalScore > g.highScore) {
      g.highScore = finalScore;
      setHighScore(finalScore);
      localStorage.setItem('subway_run_high_score', finalScore.toString());
    }

    // Debris particles
    const p = project(g.player.visualLane, 0);
    for (let i = 0; i < 30; i++) {
      g.particles.push({
        x: p.x,
        y: p.y - 40,
        vx: (Math.random() - 0.5) * 280,
        vy: (Math.random() - 0.5) * 280 - 50,
        color: ['#ea580c', '#facc15', '#ef4444', '#f8fafc', '#38bdf8'][Math.floor(Math.random() * 5)],
        size: Math.random() * 7 + 4,
        alpha: 1,
        life: 0.85,
        maxLife: 0.85,
      });
    }
  }, [project]);

  // Main Canvas render and animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const gameLoop = (time: number) => {
      const g = gameRef.current;
      if (!g.lastTime) g.lastTime = time;
      const dt = Math.min(0.1, (time - g.lastTime) / 1000);
      g.lastTime = time;

      // UPDATE PHASE
      if (g.state === 'PLAYING' && !g.isPaused) {
        g.speed += 3.5 * dt;
        const multiplier = g.powerUps.multiplier > 0 ? 2 : 1;
        g.distance += g.speed * dt * 0.05 * multiplier;
        g.score = Math.floor(g.distance) + (g.coins * 25);
        setScore(g.score);

        g.trackOffset = (g.trackOffset + g.speed * dt) % 120;

        // Player visual lane smoothing
        g.player.visualLane += (g.player.lane - g.player.visualLane) * Math.min(1, dt * 20);

        // Power-up countdowns
        if (g.powerUps.magnet > 0) g.powerUps.magnet = Math.max(0, g.powerUps.magnet - dt);
        if (g.powerUps.superJump > 0) g.powerUps.superJump = Math.max(0, g.powerUps.superJump - dt);
        if (g.powerUps.multiplier > 0) g.powerUps.multiplier = Math.max(0, g.powerUps.multiplier - dt);

        setActivePowerUps({
          magnet: Math.ceil(g.powerUps.magnet),
          superJump: Math.ceil(g.powerUps.superJump),
          multiplier: Math.ceil(g.powerUps.multiplier),
        });

        // Parabolic Player Jump Physics
        if (!g.player.isGrounded) {
          // Athletic parabolic gravity model with apex hang-time and continuous downward curvature
          const targetGravity = g.player.isFastFalling
            ? 1550
            : (Math.abs(g.player.jumpVy) < 95 ? 680 : 920);

          const prevVy = g.player.jumpVy;
          g.player.jumpVy = Math.max(-720, g.player.jumpVy - targetGravity * dt);

          // Exact parabolic trapezoidal integration: Δy = 0.5 * (v0 + v1) * dt
          g.player.jumpHeight += (prevVy + g.player.jumpVy) * 0.5 * dt;

          if (g.player.jumpHeight <= 0) {
            g.player.jumpHeight = 0;
            g.player.jumpVy = 0;
            g.player.isGrounded = true;
            g.player.isFastFalling = false;
            // Absorb impact momentum into landing compression
            g.player.landingSquash = Math.min(1.0, Math.abs(prevVy) / 450);
          }
        } else {
          // Recover from landing squash
          if (g.player.landingSquash > 0) {
            g.player.landingSquash = Math.max(0, g.player.landingSquash - dt * 9);
          }
        }

        // Player Roll Physics
        if (g.player.isRolling) {
          g.player.rollTimer -= dt;
          if (g.player.rollTimer <= 0) {
            g.player.isRolling = false;
          }
        }

        // Running stride
        if (g.player.isGrounded && !g.player.isRolling) {
          g.player.runAnim += dt * (g.speed / 28);
        }

        // Spawning
        g.nextSpawnZ -= g.speed * dt;
        g.nextCoinZ -= g.speed * dt;
        if (g.nextSpawnZ < 950) spawnObstacleWave();
        if (g.nextCoinZ < 950) spawnCoins();

        // Update Obstacles & Collision Check
        for (let i = g.obstacles.length - 1; i >= 0; i--) {
          const obs = g.obstacles[i];
          obs.z -= g.speed * dt;

          const hitDepthStart = 45;
          const hitDepthEnd = -obs.length;

          if (obs.z <= hitDepthStart && obs.z >= hitDepthEnd) {
            if (Math.abs(g.player.visualLane - obs.lane) < 0.55) {
              if (obs.type === 'LOW_BARRIER') {
                if (g.player.jumpHeight < 40) {
                  triggerGameOver();
                  break;
                }
              } else if (obs.type === 'HIGH_BARRIER') {
                if (!g.player.isRolling) {
                  triggerGameOver();
                  break;
                }
              } else if (obs.type === 'TRAIN') {
                if (g.player.jumpHeight < 95) {
                  triggerGameOver();
                  break;
                }
              }
            }
          }

          if (obs.z < -250) {
            g.obstacles.splice(i, 1);
          }
        }

        // Update Coins & Magnet Effect
        for (let i = g.coinItems.length - 1; i >= 0; i--) {
          const c = g.coinItems[i];
          c.z -= g.speed * dt;

          // Magnet Attraction
          if (g.powerUps.magnet > 0 && c.z < 450 && c.z > -20) {
            c.lane += (g.player.visualLane - c.lane) * Math.min(1, dt * 8) as Lane;
          }

          // Collection
          if (!c.collected && Math.abs(c.z) < 45 && Math.abs(g.player.visualLane - c.lane) < 0.55) {
            c.collected = true;
            g.coins++;
            setCoins(g.coins);
            sound.playCoin();

            const proj = project(c.lane, c.z);
            for (let p = 0; p < 7; p++) {
              g.particles.push({
                x: proj.x,
                y: proj.y - 20,
                vx: (Math.random() - 0.5) * 130,
                vy: (Math.random() - 0.5) * 130 - 30,
                color: '#facc15',
                size: Math.random() * 4 + 2,
                alpha: 1,
                life: 0.4,
                maxLife: 0.4,
              });
            }

            g.floatingTexts.push({
              id: Math.random(),
              x: proj.x,
              y: proj.y - 30,
              text: g.powerUps.multiplier > 0 ? '+50' : '+25',
              color: '#facc15',
              alpha: 1,
              vy: -75,
            });
          }

          if (c.z < -100 || c.collected) {
            g.coinItems.splice(i, 1);
          }
        }

        // Update Power-Up Items
        for (let i = g.powerUpItems.length - 1; i >= 0; i--) {
          const item = g.powerUpItems[i];
          item.z -= g.speed * dt;

          if (!item.collected && Math.abs(item.z) < 45 && Math.abs(g.player.visualLane - item.lane) < 0.55) {
            item.collected = true;
            sound.playPowerUp();

            if (item.type === 'MAGNET') g.powerUps.magnet = 12;
            else if (item.type === 'SUPER_JUMP') g.powerUps.superJump = 12;
            else if (item.type === 'MULTIPLIER') g.powerUps.multiplier = 12;

            const proj = project(item.lane, item.z);
            g.floatingTexts.push({
              id: Math.random(),
              x: proj.x,
              y: proj.y - 35,
              text: item.type === 'MAGNET' ? '🧲 MAGNET!' : item.type === 'SUPER_JUMP' ? '👟 SUPER JUMP!' : '⭐ 2X BOOST!',
              color: '#38bdf8',
              alpha: 1,
              vy: -70,
            });
          }

          if (item.z < -100 || item.collected) {
            g.powerUpItems.splice(i, 1);
          }
        }

        // Update Particles
        for (let i = g.particles.length - 1; i >= 0; i--) {
          const p = g.particles[i];
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.alpha = Math.max(0, p.life / p.maxLife);
          if (p.life <= 0) g.particles.splice(i, 1);
        }

        // Update Floating Texts
        for (let i = g.floatingTexts.length - 1; i >= 0; i--) {
          const ft = g.floatingTexts[i];
          ft.y += ft.vy * dt;
          ft.alpha -= dt * 1.5;
          if (ft.alpha <= 0) g.floatingTexts.splice(i, 1);
        }
      } else {
        // Idle animation when on title / game over
        g.trackOffset = (g.trackOffset + 60 * dt) % 120;
      }

      // RENDER PHASE
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // 1. Sky / Tunnel Top
      const skyGrad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
      skyGrad.addColorStop(0, '#020617');
      skyGrad.addColorStop(0.7, '#0f172a');
      skyGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, WIDTH, HORIZON_Y);

      // Tunnel arch / city skyline silhouettes
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.moveTo(0, HORIZON_Y);
      for (let x = 0; x <= WIDTH; x += 30) {
        const h = Math.sin(x * 0.05) * 20 + 25;
        ctx.lineTo(x, HORIZON_Y - h);
      }
      ctx.lineTo(WIDTH, HORIZON_Y);
      ctx.closePath();
      ctx.fill();

      // Distant tunnel warm glow
      const horizonGlow = ctx.createRadialGradient(WIDTH / 2, HORIZON_Y, 5, WIDTH / 2, HORIZON_Y, 180);
      horizonGlow.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
      horizonGlow.addColorStop(0.5, 'rgba(234, 88, 12, 0.15)');
      horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = horizonGlow;
      ctx.fillRect(0, HORIZON_Y - 90, WIDTH, 120);

      // 2. Track Ballast Ground
      const groundGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, HEIGHT);
      groundGrad.addColorStop(0, '#1e293b');
      groundGrad.addColorStop(0.3, '#334155');
      groundGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, HORIZON_Y, WIDTH, HEIGHT - HORIZON_Y);

      // Side Tunnel Walls
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(0, HORIZON_Y);
      ctx.lineTo(WIDTH * 0.18, HORIZON_Y);
      ctx.lineTo(0, HEIGHT);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(WIDTH, HORIZON_Y);
      ctx.lineTo(WIDTH * 0.82, HORIZON_Y);
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Graffiti on side wall
      ctx.save();
      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fillText('SUBWAY', 15, HORIZON_Y + 180);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.2)';
      ctx.fillText('RUN', 35, HORIZON_Y + 230);
      ctx.restore();

      // 3. Railroad Sleepers (Ties)
      for (let i = 0; i < 24; i++) {
        const tieOffsetZ = ((i * 50 - g.trackOffset) % 1000 + 1000) % 1000;
        const pL = project(-1.3, tieOffsetZ);
        const pR = project(1.3, tieOffsetZ);
        if (pL.t > 0.05) {
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = Math.max(1, 7 * pL.scale);
          ctx.beginPath();
          ctx.moveTo(pL.x, pL.y);
          ctx.lineTo(pR.x, pR.y);
          ctx.stroke();
        }
      }

      // 4. Steel Rails
      const lanes = [-1, 0, 1];
      lanes.forEach(l => {
        const pFarL = project(l - 0.35, 1000);
        const pNearL = project(l - 0.35, 0);
        const pFarR = project(l + 0.35, 1000);
        const pNearR = project(l + 0.35, 0);

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(pFarL.x, pFarL.y);
        ctx.lineTo(pNearL.x, pNearL.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(pFarR.x, pFarR.y);
        ctx.lineTo(pNearR.x, pNearR.y);
        ctx.stroke();

        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pFarL.x, pFarL.y);
        ctx.lineTo(pNearL.x, pNearL.y);
        ctx.moveTo(pFarR.x, pFarR.y);
        ctx.lineTo(pNearR.x, pNearR.y);
        ctx.stroke();
      });

      // Overhead Gantries
      const beamZ = ((g.trackOffset * 1.8) % 350);
      [beamZ, beamZ + 350, beamZ + 700].forEach(z => {
        if (z >= 0 && z <= 1000) {
          const pL = project(-1.8, z, 140);
          const pR = project(1.8, z, 140);
          const pBaseL = project(-1.8, z, 0);
          const pBaseR = project(1.8, z, 0);

          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = Math.max(1, 4 * pL.scale);

          ctx.beginPath();
          ctx.moveTo(pBaseL.x, pBaseL.y);
          ctx.lineTo(pL.x, pL.y);
          ctx.moveTo(pBaseR.x, pBaseR.y);
          ctx.lineTo(pR.x, pR.y);
          ctx.lineTo(pL.x, pL.y);
          ctx.stroke();
        }
      });

      // 5. Sorted Depth Render List
      interface Renderable {
        type: 'COIN' | 'OBSTACLE' | 'PLAYER' | 'POWERUP';
        z: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        obj: any;
      }
      const renderList: Renderable[] = [];

      g.coinItems.forEach(coin => renderList.push({ type: 'COIN', z: coin.z, obj: coin }));
      g.powerUpItems.forEach(item => renderList.push({ type: 'POWERUP', z: item.z, obj: item }));
      g.obstacles.forEach(obs => renderList.push({ type: 'OBSTACLE', z: obs.z, obj: obs }));
      renderList.push({ type: 'PLAYER', z: 0, obj: g.player });

      renderList.sort((a, b) => b.z - a.z);

      renderList.forEach(item => {
        if (item.type === 'COIN') {
          const c = item.obj as Coin;
          if (c.z >= -20 && c.z <= 1000) {
            const p = project(c.lane, c.z, 28);
            const radius = 16 * p.scale;
            if (radius >= 1.5) {
              const spin = Math.sin((c.z + g.trackOffset * 4) * 0.05);
              ctx.save();
              ctx.translate(p.x, p.y);
              ctx.scale(Math.abs(spin) * 0.7 + 0.3, 1);

              ctx.fillStyle = '#ca8a04';
              ctx.beginPath();
              ctx.arc(0, 0, radius, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#facc15';
              ctx.beginPath();
              ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#fef08a';
              ctx.beginPath();
              ctx.arc(-radius * 0.25, -radius * 0.25, radius * 0.3, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#b45309';
              ctx.fillRect(-radius * 0.15, -radius * 0.35, radius * 0.3, radius * 0.7);
              ctx.fillRect(-radius * 0.35, -radius * 0.15, radius * 0.7, radius * 0.3);
              ctx.restore();
            }
          }
        } else if (item.type === 'POWERUP') {
          const pItem = item.obj as PowerUpItem;
          if (pItem.z >= -20 && pItem.z <= 1000) {
            const p = project(pItem.lane, pItem.z, 35);
            const r = 20 * p.scale;
            if (r >= 2) {
              ctx.save();
              ctx.translate(p.x, p.y);
              // Glowing aura
              ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
              ctx.beginPath();
              ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#0284c7';
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = '#ffffff';
              ctx.font = `bold ${Math.max(8, Math.floor(16 * p.scale))}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              const icon = pItem.type === 'MAGNET' ? '🧲' : pItem.type === 'SUPER_JUMP' ? '👟' : '⭐';
              ctx.fillText(icon, 0, 0);
              ctx.restore();
            }
          }
        } else if (item.type === 'OBSTACLE') {
          const obs = item.obj as Obstacle;
          if (obs.z >= -obs.length && obs.z <= 1000) {
            if (obs.type === 'LOW_BARRIER') {
              const p = project(obs.lane, obs.z, 0);
              const width = 85 * p.scale;
              const height = 40 * p.scale;
              if (width >= 3) {
                ctx.fillStyle = '#475569';
                ctx.fillRect(p.x - width / 2, p.y - height, 6 * p.scale, height);
                ctx.fillRect(p.x + width / 2 - 6 * p.scale, p.y - height, 6 * p.scale, height);

                ctx.fillStyle = '#ea580c';
                ctx.fillRect(p.x - width / 2, p.y - height * 0.9, width, height * 0.45);

                ctx.fillStyle = '#f8fafc';
                const stripeWidth = 10 * p.scale;
                for (let sx = -width / 2 + 5 * p.scale; sx < width / 2 - 5 * p.scale; sx += stripeWidth * 2) {
                  ctx.fillRect(p.x + sx, p.y - height * 0.9, stripeWidth, height * 0.45);
                }

                ctx.fillStyle = '#f59e0b';
                ctx.beginPath();
                ctx.arc(p.x, p.y - height - (4 * p.scale), 5 * p.scale, 0, Math.PI * 2);
                ctx.fill();
              }
            } else if (obs.type === 'HIGH_BARRIER') {
              const p = project(obs.lane, obs.z, 0);
              const pTop = project(obs.lane, obs.z, 95);
              const width = 105 * p.scale;
              const gantryH = p.y - pTop.y;
              if (width >= 3) {
                ctx.fillStyle = '#334155';
                const poleW = 7 * p.scale;
                ctx.fillRect(p.x - width / 2, pTop.y, poleW, gantryH);
                ctx.fillRect(p.x + width / 2 - poleW, pTop.y, poleW, gantryH);

                const barH = 34 * p.scale;
                const barY = pTop.y + (10 * p.scale);

                ctx.fillStyle = '#eab308';
                ctx.fillRect(p.x - width / 2, barY, width, barH);

                ctx.fillStyle = '#0f172a';
                for (let x = -width / 2; x < width / 2; x += 16 * p.scale) {
                  ctx.beginPath();
                  ctx.moveTo(p.x + x, barY);
                  ctx.lineTo(p.x + x + 8 * p.scale, barY);
                  ctx.lineTo(p.x + x - 2 * p.scale, barY + barH);
                  ctx.lineTo(p.x + x - 10 * p.scale, barY + barH);
                  ctx.closePath();
                  ctx.fill();
                }

                ctx.fillStyle = '#dc2626';
                ctx.fillRect(p.x - width * 0.35, barY + barH * 0.25, width * 0.7, barH * 0.5);
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(7, Math.floor(9 * p.scale))}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('▼ SLIDE ▼', p.x, barY + barH * 0.65);
              }
            } else if (obs.type === 'TRAIN') {
              const frontZ = obs.z;
              const backZ = Math.min(1000, obs.z + obs.length);

              const pFront = project(obs.lane, frontZ, 0);
              const pFrontTop = project(obs.lane, frontZ, 100);
              const pBack = project(obs.lane, backZ, 0);
              const pBackTop = project(obs.lane, backZ, 100);

              const widthFront = 92 * pFront.scale;
              const widthBack = 92 * pBack.scale;
              const heightFront = pFront.y - pFrontTop.y;

              if (widthFront >= 2) {
                // Train Roof
                ctx.fillStyle = '#14532d';
                ctx.beginPath();
                ctx.moveTo(pFront.x - widthFront / 2, pFrontTop.y);
                ctx.lineTo(pFront.x + widthFront / 2, pFrontTop.y);
                ctx.lineTo(pBack.x + widthBack / 2, pBackTop.y);
                ctx.lineTo(pBack.x - widthBack / 2, pBackTop.y);
                ctx.closePath();
                ctx.fill();

                // Roof AC vent
                ctx.fillStyle = '#0f172a';
                const acW = widthFront * 0.4;
                const acH = 6 * pFront.scale;
                ctx.fillRect(pFront.x - acW / 2, pFrontTop.y - acH, acW, acH);

                // Train Front Body
                const trainBodyGrad = ctx.createLinearGradient(0, pFrontTop.y, 0, pFront.y);
                trainBodyGrad.addColorStop(0, '#16a34a');
                trainBodyGrad.addColorStop(1, '#15803d');
                ctx.fillStyle = trainBodyGrad;
                ctx.fillRect(pFront.x - widthFront / 2, pFrontTop.y, widthFront, heightFront);

                // Windshield
                ctx.fillStyle = '#0f172a';
                const wsW = widthFront * 0.75;
                const wsH = heightFront * 0.35;
                const wsY = pFrontTop.y + heightFront * 0.12;
                ctx.fillRect(pFront.x - wsW / 2, wsY, wsW, wsH);

                ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
                ctx.beginPath();
                ctx.moveTo(pFront.x - wsW / 2, wsY);
                ctx.lineTo(pFront.x, wsY);
                ctx.lineTo(pFront.x - wsW * 0.2, wsY + wsH);
                ctx.lineTo(pFront.x - wsW / 2, wsY + wsH);
                ctx.closePath();
                ctx.fill();

                // Line Display
                ctx.fillStyle = '#0284c7';
                ctx.fillRect(pFront.x - widthFront * 0.25, pFrontTop.y + heightFront * 0.04, widthFront * 0.5, heightFront * 0.07);
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(6, Math.floor(7 * pFront.scale))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('METRO 1', pFront.x, pFrontTop.y + heightFront * 0.095);

                // Headlights
                const hlRadius = 7 * pFront.scale;
                const hlY = pFrontTop.y + heightFront * 0.65;
                ctx.fillStyle = '#fef08a';
                ctx.beginPath();
                ctx.arc(pFront.x - widthFront * 0.3, hlY, hlRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(pFront.x + widthFront * 0.3, hlY, hlRadius, 0, Math.PI * 2);
                ctx.fill();

                // Cowcatcher
                ctx.fillStyle = '#334155';
                ctx.fillRect(pFront.x - widthFront * 0.45, pFront.y - (10 * pFront.scale), widthFront * 0.9, 10 * pFront.scale);
              }
            }
          }
        } else if (item.type === 'PLAYER') {
          const pl = g.player;
          const p = project(pl.visualLane, 0, pl.jumpHeight);
          const groundP = project(pl.visualLane, 0, 0);

          // Shadow on tracks
          const shadowScale = Math.max(0.3, 1 - (pl.jumpHeight / 250));
          ctx.save();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.beginPath();
          ctx.ellipse(groundP.x, groundP.y, 28 * shadowScale, 9 * shadowScale, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.translate(p.x, p.y);

          // Parabolic flight squash and stretch & impact absorption
          let pScaleX = 1;
          let pScaleY = 1;
          if (!pl.isGrounded) {
            if (pl.jumpVy > 80) {
              // Ascending upward stretch
              pScaleY = 1 + Math.min(0.12, pl.jumpVy / 4000);
              pScaleX = 1 / Math.sqrt(pScaleY);
            } else if (pl.jumpVy < -120) {
              // Descending acceleration extension
              pScaleY = 1 + Math.min(0.10, Math.abs(pl.jumpVy) / 5000);
              pScaleX = 1 / Math.sqrt(pScaleY);
            }
          } else if (pl.landingSquash > 0) {
            // Landing impact compression
            pScaleY = 1 - pl.landingSquash * 0.16;
            pScaleX = 1 + pl.landingSquash * 0.16;
          }
          ctx.scale(pScaleX, pScaleY);

          if (pl.isRolling) {
            // Rolling / Tuck Pose
            ctx.fillStyle = '#ea580c';
            ctx.beginPath();
            ctx.ellipse(0, -18, 22, 14, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(0, -30, 11, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#b91c1c';
            ctx.fillRect(-6, -24, 16, 4);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-18, -6, 14, 6);
            ctx.fillRect(6, -6, 14, 6);
          } else {
            // Running / Jumping Pose
            const legSwing = Math.sin(pl.runAnim) * 12;

            ctx.fillStyle = '#1e3a8a';
            if (pl.isGrounded) {
              ctx.fillRect(-12, -35, 8, 30 + legSwing * 0.5);
              ctx.fillRect(4, -35, 8, 30 - legSwing * 0.5);

              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(-15, -6 + legSwing * 0.5, 12, 7);
              ctx.fillRect(3, -6 - legSwing * 0.5, 12, 7);
            } else {
              // Mid-air parabolic posture: tucked knees when rising/apex, extended when falling
              const legLen = pl.jumpVy > 40 ? 17 : 24;
              ctx.fillRect(-14, -35, 9, legLen);
              ctx.fillRect(5, -35, 9, legLen);
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(-16, -35 + legLen - 2, 12, 7);
              ctx.fillRect(4, -35 + legLen - 2, 12, 7);
            }

            // Orange Hoodie
            ctx.fillStyle = '#ea580c';
            ctx.fillRect(-15, -68, 30, 36);

            // Backpack
            ctx.fillStyle = '#475569';
            ctx.fillRect(-11, -64, 22, 24);

            // Arms
            ctx.fillStyle = '#c2410c';
            const armSwing = pl.isGrounded ? Math.sin(pl.runAnim) * 8 : -14;
            ctx.fillRect(-20, -66, 6, 22 + armSwing);
            ctx.fillRect(14, -66, 6, 22 - armSwing);

            // Head
            ctx.fillStyle = '#fed7aa';
            ctx.beginPath();
            ctx.arc(0, -78, 12, 0, Math.PI * 2);
            ctx.fill();

            // Red Cap
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(0, -82, 12, Math.PI, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#b91c1c';
            ctx.fillRect(-4, -84, 16, 4);
          }

          ctx.restore();
        }
      });

      // 6. Particles
      g.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 7. Floating Texts
      g.floatingTexts.forEach(ft => {
        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = ft.color;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      });

      // 8. In-Canvas Overlays
      if (g.state === 'START') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.textAlign = 'center';
        ctx.font = '900 48px sans-serif';
        ctx.fillStyle = '#ea580c';
        ctx.fillText('SUBWAY RUN', WIDTH / 2, HEIGHT * 0.32);

        ctx.font = '600 16px sans-serif';
        ctx.fillStyle = '#facc15';
        ctx.fillText('3-LANE INFINITE RUNNER', WIDTH / 2, HEIGHT * 0.37);

        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Press SPACE or Tap to Start', WIDTH / 2, HEIGHT * 0.52);

        ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
        ctx.beginPath();
        ctx.roundRect(WIDTH / 2 - 170, HEIGHT * 0.6, 340, 150, 12);
        ctx.fill();

        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('KEYBOARD & TOUCH CONTROLS', WIDTH / 2, HEIGHT * 0.65);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '15px sans-serif';
        ctx.fillText('← / → (or A/D) : Switch Lanes', WIDTH / 2, HEIGHT * 0.70);
        ctx.fillText('↑ / SPACE (or W) : Jump Over Trains', WIDTH / 2, HEIGHT * 0.74);
        ctx.fillText('↓ (or S) : Roll / Slide Under Barriers', WIDTH / 2, HEIGHT * 0.78);

        if (g.highScore > 0) {
          ctx.font = 'bold 15px sans-serif';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(`BEST RECORD: ${g.highScore}`, WIDTH / 2, HEIGHT * 0.88);
        }
      } else if (g.state === 'GAME_OVER') {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.textAlign = 'center';
        ctx.font = '900 46px sans-serif';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('GAME OVER', WIDTH / 2, HEIGHT * 0.33);

        ctx.font = 'bold 38px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(g.score.toString(), WIDTH / 2, HEIGHT * 0.44);
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('FINAL SCORE', WIDTH / 2, HEIGHT * 0.48);

        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#facc15';
        ctx.fillText(`🪙 Coins Collected: ${g.coins}`, WIDTH / 2, HEIGHT * 0.54);

        ctx.font = '16px sans-serif';
        ctx.fillStyle = g.score >= g.highScore && g.score > 0 ? '#10b981' : '#cbd5e1';
        ctx.fillText(`High Score: ${g.highScore}`, WIDTH / 2, HEIGHT * 0.58);

        if (g.score >= g.highScore && g.score > 0) {
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText('★ NEW RECORD! ★', WIDTH / 2, HEIGHT * 0.62);
        }

        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.roundRect(WIDTH / 2 - 130, HEIGHT * 0.68, 260, 50, 10);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText('PLAY AGAIN', WIDTH / 2, HEIGHT * 0.68 + 32);

        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Press SPACE to Restart', WIDTH / 2, HEIGHT * 0.79);
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, [project, spawnObstacleWave, spawnCoins, triggerGameOver]);

  // Global Keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        jump();
        return;
      }

      if (e.code === 'KeyP') {
        e.preventDefault();
        togglePause();
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        toggleSound();
        return;
      }

      const g = gameRef.current;
      if (g.state !== 'PLAYING') return;

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        switchLane(-1);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        switchLane(1);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        jump();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        roll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump, roll, switchLane, togglePause, toggleSound]);

  // Touch Swipe on Canvas
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) > 25) {
      if (absDx > absDy) {
        if (dx > 0) switchLane(1);
        else switchLane(-1);
      } else {
        if (dy < 0) jump();
        else roll();
      }
    }
  };

  // Copy Single-File HTML to clipboard
  const handleCopyStandaloneHtml = async () => {
    try {
      const res = await fetch('/subway_surfer_standalone.html');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback
      alert('Could not copy code. Please use the Download button.');
    }
  };

  // Download Standalone HTML
  const handleDownloadStandaloneHtml = () => {
    const link = document.createElement('a');
    link.href = '/subway_surfer_standalone.html';
    link.download = 'subway_runner.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 select-none">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-slate-800/80 px-4 md:px-8 flex items-center justify-between bg-slate-900/60 backdrop-blur-md shrink-0 z-20">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black tracking-tight bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 bg-clip-text text-transparent">
            SUBWAY RUN
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">
            3-Lane Canvas Runner
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio toggle */}
          <button
            onClick={toggleSound}
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Pause button (active during play) */}
          {gameState === 'PLAYING' && (
            <button
              onClick={togglePause}
              title={isPaused ? 'Resume Game (P)' : 'Pause Game (P)'}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}

          {/* Copy HTML Code Button */}
          <button
            onClick={handleCopyStandaloneHtml}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
            title="Copy self-contained single-file HTML code"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'HTML Copied!' : 'Copy Single-File HTML'}</span>
          </button>

          {/* Download HTML Button */}
          <button
            onClick={handleDownloadStandaloneHtml}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-semibold text-white transition-colors shadow-sm shadow-orange-900/40"
            title="Download pure single-file subway_runner.html"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download HTML</span>
            <span className="sm:hidden">HTML</span>
          </button>
        </div>
      </header>

      {/* Main Viewport Container */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden relative">
        <div
          ref={containerRef}
          className="relative w-full max-w-[480px] aspect-[9/14] sm:aspect-[9/14.5] max-h-[82vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-slate-800/60 flex items-center justify-center"
        >
          {/* Game Canvas */}
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            onClick={() => {
              if (gameState === 'START' || gameState === 'GAME_OVER') {
                jump();
              }
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="w-full h-full object-contain cursor-pointer block"
          />

          {/* Real-time HUD overlay on canvas */}
          {gameState === 'PLAYING' && (
            <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none z-10">
              <div className="flex flex-col gap-0.5">
                <div className="text-3xl font-black text-white tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  {score.toLocaleString()}
                </div>
                <div className="text-xs font-semibold text-slate-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  BEST {highScore.toLocaleString()}
                </div>

                {/* Active Power-up timer pill indicators */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  {activePowerUps.magnet > 0 && (
                    <div className="flex items-center gap-1 bg-sky-500/80 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md animate-pulse">
                      <span>🧲</span>
                      <span>{activePowerUps.magnet}s</span>
                    </div>
                  )}
                  {activePowerUps.superJump > 0 && (
                    <div className="flex items-center gap-1 bg-emerald-500/80 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md animate-pulse">
                      <span>👟</span>
                      <span>{activePowerUps.superJump}s</span>
                    </div>
                  )}
                  {activePowerUps.multiplier > 0 && (
                    <div className="flex items-center gap-1 bg-amber-500/80 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md animate-pulse">
                      <span>⭐ 2X</span>
                      <span>{activePowerUps.multiplier}s</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-900/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/50 shadow-md">
                <span className="text-lg">🪙</span>
                <span className="text-base font-black text-yellow-400 tabular-nums">
                  {coins}
                </span>
              </div>
            </div>
          )}

          {/* Pause Modal Overlay */}
          {isPaused && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-20">
              <h2 className="text-3xl font-black text-white mb-2">GAME PAUSED</h2>
              <p className="text-sm text-slate-400 mb-6">Take a breather, track ahead is waiting</p>
              <button
                onClick={togglePause}
                className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-orange-900/40 transition-all hover:scale-105 active:scale-95"
              >
                <Play className="w-4 h-4" />
                Resume Run
              </button>
            </div>
          )}

          {/* On-Screen Mobile Action Buttons */}
          <div className="absolute bottom-4 left-0 right-0 px-4 flex items-center justify-between pointer-events-none z-10">
            {/* Left & Right buttons */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  switchLane(-1);
                }}
                className="w-12 h-12 rounded-full bg-slate-800/70 hover:bg-slate-700/90 active:bg-orange-600 border border-slate-600/50 text-white flex items-center justify-center backdrop-blur-sm shadow-lg transition-transform active:scale-90"
                title="Left Lane"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  switchLane(1);
                }}
                className="w-12 h-12 rounded-full bg-slate-800/70 hover:bg-slate-700/90 active:bg-orange-600 border border-slate-600/50 text-white flex items-center justify-center backdrop-blur-sm shadow-lg transition-transform active:scale-90"
                title="Right Lane"
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>

            {/* Jump & Slide buttons */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  roll();
                }}
                className="w-12 h-12 rounded-full bg-slate-800/70 hover:bg-slate-700/90 active:bg-amber-600 border border-slate-600/50 text-white flex items-center justify-center backdrop-blur-sm shadow-lg transition-transform active:scale-90"
                title="Roll / Slide Under"
              >
                <ArrowDown className="w-6 h-6" />
              </button>
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  jump();
                }}
                className="w-12 h-12 rounded-full bg-orange-600/80 hover:bg-orange-500 active:bg-orange-400 border border-orange-400/50 text-white flex items-center justify-center backdrop-blur-sm shadow-lg shadow-orange-950/60 transition-transform active:scale-90"
                title="Jump Over"
              >
                <ArrowUp className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer controls guide */}
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
          <span>
            <strong className="text-slate-200">Keyboard:</strong> Arrows or WASD · Space to Jump
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">
            <strong className="text-slate-200">Touch:</strong> Swipe or on-screen buttons
          </span>
        </div>
      </main>
    </div>
  );
}
