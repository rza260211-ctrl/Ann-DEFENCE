/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Trophy, RotateCcw, Languages } from 'lucide-react';

// --- Types ---

type Point = { x: number; y: number };

type Rocket = {
  id: number;
  start: Point;
  current: Point;
  target: Point;
  speed: number;
  color: string;
};

type Missile = {
  id: number;
  start: Point;
  current: Point;
  target: Point;
  speed: number;
  turretIndex: number;
};

type Explosion = {
  id: number;
  pos: Point;
  radius: number;
  maxRadius: number;
  growing: boolean;
  done: boolean;
};

type City = {
  id: number;
  x: number;
  active: boolean;
};

type Turret = {
  id: number;
  x: number;
  ammo: number;
  maxAmmo: number;
  active: boolean;
};

type GameState = 'START' | 'PLAYING' | 'WON' | 'LOST';

// --- Constants ---

const CITY_COUNT = 6;
const TURRET_COUNT = 3;
const WIN_SCORE = 1000;
const ROCKET_SCORE = 20;

const TURRET_AMMO = [20, 40, 20]; // Left, Middle, Right

const LANGUAGES = {
  en: {
    title: "ANN NOVA DEFENSE",
    start: "START GAME",
    win: "MISSION ACCOMPLISHED",
    lost: "DEFENSE BREACHED",
    score: "SCORE",
    ammo: "AMMO",
    restart: "PLAY AGAIN",
    instructions: "Click to intercept incoming rockets. Protect your cities!",
    target: "TARGET: 1000",
  },
  zh: {
    title: "Ann新星防御",
    start: "开始游戏",
    win: "任务完成",
    lost: "防御失守",
    score: "得分",
    ammo: "弹药",
    restart: "再玩一次",
    instructions: "点击发射拦截导弹。保护你的城市！",
    target: "目标: 1000",
  }
};

// --- Helper Functions ---

const getDistance = (p1: Point, p2: Point) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [lang, setLang] = useState<'en' | 'zh'>('zh');
  
  // Game Entities Refs (to avoid re-renders and keep game loop smooth)
  const rocketsRef = useRef<Rocket[]>([]);
  const missilesRef = useRef<Missile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const citiesRef = useRef<City[]>([]);
  const turretsRef = useRef<Turret[]>([]);
  const frameIdRef = useRef<number>(0);
  const nextIdRef = useRef(0);
  const lastSpawnTimeRef = useRef(0);

  const t = LANGUAGES[lang];

  // --- Initialization ---

  const initGame = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Distribute cities and turrets
    // Pattern: T C C C T C C C T
    const positions = [];
    const totalSlots = TURRET_COUNT + CITY_COUNT;
    const slotWidth = width / (totalSlots + 1);

    const turrets: Turret[] = [];
    const cities: City[] = [];

    let turretIdx = 0;
    for (let i = 1; i <= totalSlots; i++) {
      const x = i * slotWidth;
      if (i === 1 || i === 5 || i === 9) {
        turrets.push({
          id: i,
          x,
          ammo: TURRET_AMMO[turretIdx],
          maxAmmo: TURRET_AMMO[turretIdx],
          active: true
        });
        turretIdx++;
      } else {
        cities.push({
          id: i,
          x,
          active: true
        });
      }
    }

    turretsRef.current = turrets;
    citiesRef.current = cities;
    rocketsRef.current = [];
    missilesRef.current = [];
    explosionsRef.current = [];
    setScore(0);
    setGameState('PLAYING');
    lastSpawnTimeRef.current = performance.now();
  }, []);

  // --- Game Loop ---

  const update = useCallback((time: number) => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Spawn Rockets
    const spawnRate = Math.max(500, 2000 - (score / 100) * 200); // Faster as score increases
    if (time - lastSpawnTimeRef.current > spawnRate) {
      const startX = Math.random() * width;
      // Target a random active city or turret
      const activeTargets = [
        ...citiesRef.current.filter(c => c.active).map(c => ({ x: c.x, type: 'city' })),
        ...turretsRef.current.filter(t => t.active).map(t => ({ x: t.x, type: 'turret' }))
      ];

      if (activeTargets.length > 0) {
        const target = activeTargets[Math.floor(Math.random() * activeTargets.length)];
        rocketsRef.current.push({
          id: nextIdRef.current++,
          start: { x: startX, y: 0 },
          current: { x: startX, y: 0 },
          target: { x: target.x, y: height - 20 },
          speed: (1 + (score / 500)) * 0.8,
          color: '#ef4444'
        });
      }
      lastSpawnTimeRef.current = time;
    }

    // 2. Update Rockets
    rocketsRef.current.forEach(rocket => {
      const dx = rocket.target.x - rocket.start.x;
      const dy = rocket.target.y - rocket.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vx = (dx / dist) * rocket.speed;
      const vy = (dy / dist) * rocket.speed;

      rocket.current.x += vx;
      rocket.current.y += vy;

      // Check if hit ground
      if (rocket.current.y >= rocket.target.y) {
        // Impact!
        explosionsRef.current.push({
          id: nextIdRef.current++,
          pos: { ...rocket.current },
          radius: 0,
          maxRadius: 30,
          growing: true,
          done: false
        });
        rocket.id = -1; // Mark for removal

        // Damage cities/turrets
        citiesRef.current.forEach(city => {
          if (city.active && Math.abs(city.x - rocket.current.x) < 30) city.active = false;
        });
        turretsRef.current.forEach(turret => {
          if (turret.active && Math.abs(turret.x - rocket.current.x) < 30) turret.active = false;
        });
      }
    });
    rocketsRef.current = rocketsRef.current.filter(r => r.id !== -1);

    // 3. Update Missiles
    missilesRef.current.forEach(missile => {
      const dx = missile.target.x - missile.start.x;
      const dy = missile.target.y - missile.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vx = (dx / dist) * missile.speed;
      const vy = (dy / dist) * missile.speed;

      missile.current.x += vx;
      missile.current.y += vy;

      // Check if reached target
      if (getDistance(missile.current, missile.target) < missile.speed) {
        explosionsRef.current.push({
          id: nextIdRef.current++,
          pos: { ...missile.target },
          radius: 0,
          maxRadius: 80,
          growing: true,
          done: false
        });
        missile.id = -1;
      }
    });
    missilesRef.current = missilesRef.current.filter(m => m.id !== -1);

    // 4. Update Explosions
    explosionsRef.current.forEach(exp => {
      if (exp.growing) {
        exp.radius += 1.5;
        if (exp.radius >= exp.maxRadius) exp.growing = false;
      } else {
        exp.radius -= 0.8;
        if (exp.radius <= 0) exp.done = true;
      }

      // Check collision with rockets
      rocketsRef.current.forEach(rocket => {
        if (getDistance(exp.pos, rocket.current) < exp.radius) {
          rocket.id = -1;
          setScore(s => s + ROCKET_SCORE);
          // Chain explosion
          explosionsRef.current.push({
            id: nextIdRef.current++,
            pos: { ...rocket.current },
            radius: 0,
            maxRadius: 30,
            growing: true,
            done: false
          });
        }
      });
    });
    explosionsRef.current = explosionsRef.current.filter(e => !e.done);

    // 5. Check Win/Loss
    if (score >= WIN_SCORE) {
      setGameState('WON');
    }
    if (turretsRef.current.every(t => !t.active)) {
      setGameState('LOST');
    }

    // 6. Draw
    ctx.clearRect(0, 0, width, height);

    // Sea / Deep Water
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(0, height - 20, width, 20);

    // Waves effect (simple)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
      ctx.beginPath();
      ctx.arc(i + 20, height - 20, 10, Math.PI, 0);
      ctx.stroke();
    }

    // Cities
    citiesRef.current.forEach(city => {
      if (city.active) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(city.x - 15, height - 35, 30, 15);
        ctx.fillStyle = '#60a5fa';
        ctx.fillRect(city.x - 10, height - 45, 8, 10);
        ctx.fillRect(city.x + 2, height - 40, 8, 5);
      }
    });

    // Turrets
    turretsRef.current.forEach(turret => {
      if (turret.active) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(turret.x - 20, height - 20);
        ctx.lineTo(turret.x + 20, height - 20);
        ctx.lineTo(turret.x, height - 50);
        ctx.closePath();
        ctx.fill();
        
        // Ammo bar
        const barWidth = 30;
        const ammoPct = turret.ammo / turret.maxAmmo;
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(turret.x - barWidth/2, height - 15, barWidth, 4);
        ctx.fillStyle = ammoPct > 0.3 ? '#10b981' : '#ef4444';
        ctx.fillRect(turret.x - barWidth/2, height - 15, barWidth * ammoPct, 4);
      }
    });

    // Rockets
    rocketsRef.current.forEach(rocket => {
      ctx.strokeStyle = rocket.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rocket.start.x, rocket.start.y);
      ctx.lineTo(rocket.current.x, rocket.current.y);
      ctx.stroke();
      
      ctx.fillStyle = rocket.color;
      ctx.fillRect(rocket.current.x - 1, rocket.current.y - 1, 2, 2);
    });

    // Missiles
    missilesRef.current.forEach(missile => {
      // Trail glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ef4444';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(missile.start.x, missile.start.y);
      ctx.lineTo(missile.current.x, missile.current.y);
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow

      // Target X
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(missile.target.x - 5, missile.target.y - 5);
      ctx.lineTo(missile.target.x + 5, missile.target.y + 5);
      ctx.moveTo(missile.target.x + 5, missile.target.y - 5);
      ctx.lineTo(missile.target.x - 5, missile.target.y + 5);
      ctx.stroke();
    });

    // Explosions
    explosionsRef.current.forEach(exp => {
      const gradient = ctx.createRadialGradient(exp.pos.x, exp.pos.y, 0, exp.pos.x, exp.pos.y, exp.radius);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.4, '#facc15');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(exp.pos.x, exp.pos.y, exp.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    frameIdRef.current = requestAnimationFrame(update);
  }, [gameState, score]);

  useEffect(() => {
    frameIdRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [update]);

  // --- Handlers ---

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Find closest active turret with ammo
    let bestTurret: Turret | null = null;
    let minDist = Infinity;

    turretsRef.current.forEach(t => {
      if (t.active && t.ammo > 0) {
        const d = Math.abs(t.x - x);
        if (d < minDist) {
          minDist = d;
          bestTurret = t;
        }
      }
    });

    if (bestTurret) {
      (bestTurret as Turret).ammo -= 1;
      missilesRef.current.push({
        id: nextIdRef.current++,
        start: { x: (bestTurret as Turret).x, y: canvas.height - 50 },
        current: { x: (bestTurret as Turret).x, y: canvas.height - 50 },
        target: { x, y },
        speed: 6,
        turretIndex: turretsRef.current.indexOf(bestTurret)
      });
    }
  };

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  return (
    <div className="game-container">
      {/* HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col gap-2">
          <div className="bg-black/60 backdrop-blur-md border border-zinc-800 p-3 rounded-lg flex items-center gap-3">
            <Target className="w-5 h-5 text-emerald-500" />
            <div className="flex flex-col">
              <span className="hud-text text-zinc-400 uppercase tracking-widest">{t.score}</span>
              <span className="hud-text text-xl text-white">{score}</span>
            </div>
          </div>
          <div className="hud-text text-zinc-500 text-[8px] uppercase tracking-tighter ml-1">
            {t.target}
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button 
            onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
            className="p-2 bg-black/60 backdrop-blur-md border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <Languages className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleCanvasClick}
        onTouchStart={handleCanvasClick}
        className="w-full h-full"
      />

      {/* Overlays */}
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 p-6 text-center"
          >
            <motion.h1 
              initial={{ y: -20 }}
              animate={{ y: 0 }}
              className="font-game text-3xl sm:text-5xl text-emerald-500 mb-8 tracking-tighter"
            >
              {t.title}
            </motion.h1>
            
            <div className="max-w-md mb-12 space-y-4">
              <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                {t.instructions}
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={initGame}
              className="font-game bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-full text-sm sm:text-base transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              {t.start}
            </motion.button>
          </motion.div>
        )}

        {(gameState === 'WON' || gameState === 'LOST') && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-30 p-6 text-center"
          >
            <h2 className={`font-game text-2xl sm:text-4xl mb-2 ${gameState === 'WON' ? 'text-emerald-500' : 'text-red-500'}`}>
              {gameState === 'WON' ? t.win : t.lost}
            </h2>
            
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8 min-w-[200px]">
              <div className="text-zinc-500 text-xs uppercase mb-1">{t.score}</div>
              <div className="font-game text-3xl text-white">{score}</div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={initGame}
              className="font-game flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full text-sm sm:text-base hover:bg-zinc-200 transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
              {t.restart}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom HUD - Ammo Status */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 sm:gap-12 z-10 pointer-events-none px-4">
        {turretsRef.current.map((turret) => (
          <div key={turret.id} className={`flex flex-col items-center transition-opacity ${turret.active ? 'opacity-100' : 'opacity-20'}`}>
            <div className="bg-black/60 backdrop-blur-md border border-zinc-800 px-3 py-1 rounded-t-lg">
              <span className="hud-text text-[8px] text-zinc-500 uppercase">{t.ammo}</span>
            </div>
            <div className={`bg-black/60 backdrop-blur-md border border-zinc-800 px-4 py-2 rounded-lg flex items-center gap-2 ${turret.ammo === 0 ? 'border-red-500/50' : ''}`}>
              <div className={`w-2 h-2 rounded-full ${turret.ammo > 5 ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
              <span className="font-game text-sm text-white">{turret.ammo}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
