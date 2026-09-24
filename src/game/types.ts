export type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type Lane = -1 | 0 | 1; // Left, Middle, Right

export type ObstacleType = 
  | 'TRAIN'             // Low-medium, must be jumped or dodged
  | 'LOW_BARRIER'       // Low track hurdle, must be jumped
  | 'HIGH_BARRIER'      // High overhead barrier, must be slid/rolled under
  | 'TRAIN_CHAIN';      // Extended train blocking a lane

export type PowerUpType = 'MAGNET' | 'SUPER_JUMP' | 'MULTIPLIER';

export interface Obstacle {
  id: number;
  lane: Lane;
  z: number;            // Distance from player (starts at ~1100, moves to 0 and below)
  type: ObstacleType;
  length: number;       // For trains that span distance
  cleared?: boolean;
}

export interface Coin {
  id: number;
  lane: Lane;
  z: number;
  collected: boolean;
  yOffset?: number;     // e.g. floating higher on top of trains or in jump arc
}

export interface PowerUpItem {
  id: number;
  lane: Lane;
  z: number;
  type: PowerUpType;
  collected: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  maxLife: number;
  life: number;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

export interface ActivePowerUps {
  magnet: number;       // Remaining duration in seconds
  superJump: number;
  multiplier: number;
}
