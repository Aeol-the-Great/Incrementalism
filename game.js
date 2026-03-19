import React, { useState, useEffect, useCallback, useRef, useMemo } from 'https://esm.sh/react@19?dev';
import ReactDOM from 'https://esm.sh/react-dom@19/client?dev';
import { Cpu, Zap, Shield, Swords, TrendingUp, Plus, X, Lock } from 'https://esm.sh/lucide-react@0.441.0?dev';

// ==========================================
// CONSTANTS
// ==========================================
export const NODE_TYPES = {
  EMPTY: 'EMPTY',
  CORE: 'CORE',
  PRODUCTIVE: 'PRODUCTIVE',
  OFFENSIVE: 'OFFENSIVE',
  ADVANCE: 'ADVANCE',
  DEFENSIVE: 'DEFENSIVE',
  BORDER: 'BORDER',
  REPAIR: 'REPAIR',
  ENEMY_CORE: 'ENEMY_CORE',
  ENEMY_NODE: 'ENEMY_NODE'
};

export const INITIAL_HP = {
  [NODE_TYPES.CORE]: 20,
  [NODE_TYPES.DEFENSIVE]: 15,
  [NODE_TYPES.ADVANCE]: 7,
  [NODE_TYPES.PRODUCTIVE]: 1,
  [NODE_TYPES.OFFENSIVE]: 5,
  [NODE_TYPES.REPAIR]: 10,
  [NODE_TYPES.BORDER]: 1,
  [NODE_TYPES.EMPTY]: 0,
  [NODE_TYPES.ENEMY_CORE]: 20,
  [NODE_TYPES.ENEMY_NODE]: 5
};

export const BITS_COST = {
  [NODE_TYPES.PRODUCTIVE]: 10,
  [NODE_TYPES.OFFENSIVE]: 25,
  [NODE_TYPES.DEFENSIVE]: 50,
  [NODE_TYPES.ADVANCE]: 100,
  [NODE_TYPES.REPAIR]: 150
};

export const STAT_COST_BASE = 50;
export const MAJOR_COST = 500;
export const MAX_STAT_LEVEL = 10;

export const EXPANSION_TIME = 15000;
export const CORE_EXPANSION_TIME = 5000;
export const DEFENSIVE_EXPANSION_TIME = 2500;
export const HEX_SIZE = 40;

// ==========================================
// HEX MATH UTILS
// ==========================================
export const hexKey = (q, r) => `${q},${r}`;

export const axialToPixel = (q, r, size) => {
  const x = size * (3/2 * q);
  const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
  return { x, y };
};

export const getHexPoints = (center, size) => {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    points.push(`${center.x + size * Math.cos(angle)},${center.y + size * Math.sin(angle)}`);
  }
  return points.join(' ');
};

export const getNeighbors = (q, r) => ([
  {q: q+1, r: r}, {q: q+1, r: r-1}, {q: q, r: r-1},
  {q: q-1, r: r}, {q: q-1, r: r+1}, {q: q, r: r+1}
]);

// ==========================================
// GAME ENGINE HOOK
// ==========================================
function useGameEngine() {
  const [nodes, setNodes] = useState({});
  const [bits, setBits] = useState(0);
  const [selectedHex, setSelectedHex] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeExpansions, setActiveExpansions] = useState({});
  const [strikes, setStrikes] = useState([]);
  
  const [techStats, setTechStats] = useState({
    hp: 0, damage: 0, bitGen: 0, expansionSpeed: 0, repairSpeed: 0
  });
  const [techMajors, setTechMajors] = useState({
    missiles: false, repair: false, ultraStrike: false
  });

  const nodesRef = useRef(nodes);
  const expansionsRef = useRef(activeExpansions);
  const strikesRef = useRef(strikes);
  const techStatsRef = useRef(techStats);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { expansionsRef.current = activeExpansions; }, [activeExpansions]);
  useEffect(() => { strikesRef.current = strikes; }, [strikes]);
  useEffect(() => { techStatsRef.current = techStats; }, [techStats]);

  useEffect(() => {
    if (isInitialized) return;
    const initialNodes = {};
    const coreKey = hexKey(0, 0);
    initialNodes[coreKey] = { q: 0, r: 0, type: NODE_TYPES.CORE, hp: INITIAL_HP[NODE_TYPES.CORE], maxHp: INITIAL_HP[NODE_TYPES.CORE], controlled: true, expansionProgress: 100 };
    getNeighbors(0, 0).forEach(n => {
      const key = hexKey(n.q, n.r);
      initialNodes[key] = { q: n.q, r: n.r, type: NODE_TYPES.BORDER, hp: INITIAL_HP[NODE_TYPES.BORDER], maxHp: INITIAL_HP[NODE_TYPES.BORDER], controlled: true, expansionProgress: 100 };
    });
    const enemyCoreKey = hexKey(5, -2);
    initialNodes[enemyCoreKey] = { q: 5, r: -2, type: NODE_TYPES.ENEMY_CORE, hp: INITIAL_HP[NODE_TYPES.ENEMY_CORE], maxHp: INITIAL_HP[NODE_TYPES.ENEMY_CORE], controlled: false, expansionProgress: 100 };
    setNodes(initialNodes);
    setIsInitialized(true);
  }, [isInitialized]);

  const isIsolated = useCallback((q, r, targetNodes = nodesRef.current) => {
    const node = targetNodes[hexKey(q, r)];
    if (!node) return true;
    const isEnemy = node.type.startsWith('ENEMY');
    return !getNeighbors(q, r).some(n => {
      const neighbor = targetNodes[hexKey(n.q, n.r)];
      return neighbor && neighbor.hp > 0 && neighbor.type.startsWith('ENEMY') === isEnemy;
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
        const nextNodes = { ...nodesRef.current };
        const nextExp = { ...expansionsRef.current };
        const currentStats = techStatsRef.current;
        let modified = false;

        // BITS
        const genBonus = 1 + (currentStats.bitGen * 0.2);
        Object.values(nextNodes).forEach(n => { if (n.type === NODE_TYPES.PRODUCTIVE) setBits(b => b + (0.5 * genBonus)); });

        // EXPANSION
        Object.keys(nextExp).forEach(key => {
          const expansion = nextExp[key];
          const target = nextNodes[key];
          const valid = expansion.expanderKeys.filter(k => nextNodes[k]?.hp > 0);
          if (valid.length === 0) { nextNodes[key] = { ...target, expansionProgress: 0 }; modified = true; return; }
          const mult = 1 + (0.1 * valid.length);
          let base = EXPANSION_TIME;
          valid.forEach(k => { if (nextNodes[k].type === NODE_TYPES.CORE) base = Math.min(base, CORE_EXPANSION_TIME); });
          const inc = (100 / (base/500)) * mult * (1 + currentStats.expansionSpeed * 0.15);
          const prog = Math.min(100, (target.expansionProgress || 0) + inc);
          nextNodes[key] = { ...target, expansionProgress: prog };
          if (prog >= 100) {
            nextNodes[key] = { ...target, type: NODE_TYPES.BORDER, controlled: true, expansionProgress: 100, hp: 1, maxHp: 1 };
            setActiveExpansions(prev => { const n = {...prev}; delete n[key]; return n; });
          }
          modified = true;
        });

        // STRIKES
        setStrikes(prev => {
          const next = [];
          let changed = false;
          prev.forEach(s => {
            if (s.progress + 20 >= 100) {
              const tKey = hexKey(s.targetQ, s.targetR);
              const target = nextNodes[tKey];
              if (target) {
                const dmg = 5 + (currentStats.damage * 0.5);
                target.hp = Math.max(0, target.hp - dmg);
                if (target.hp <= 0 && !target.type.includes('CORE')) delete nextNodes[tKey];
                modified = true;
              }
              changed = true;
            } else { next.push({...s, progress: s.progress + 20}); changed = true; }
          });
          return changed ? next : prev;
        });

        if (modified) setNodes(nextNodes);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return {
    nodes, bits: Math.floor(bits), selectedHex, setSelectedHex,
    techStats, techMajors, strikes, activeExpansions,
    startExpansion: (tQ, tR, eQ, eR) => {
      const tKey = hexKey(tQ, tR);
      const eKey = hexKey(eQ, eR);
      setActiveExpansions(prev => {
        const ex = prev[tKey] || { expanderKeys: [] };
        if (ex.expanderKeys.includes(eKey)) return prev;
        return { ...prev, [tKey]: { expanderKeys: [...ex.expanderKeys, eKey] } };
      });
      setNodes(prev => ({ ...prev, [tKey]: prev[tKey] || { q: tQ, r: tR, type: NODE_TYPES.EMPTY, hp: 0, maxHp: 0, controlled: false, expansionProgress: 0 } }));
    },
    convertNode: (q, r, type) => {
      const key = hexKey(q, r);
      setNodes(prev => {
        const node = prev[key];
        const hp = INITIAL_HP[type] + (type === NODE_TYPES.DEFENSIVE ? techStatsRef.current.hp * 2 : techStatsRef.current.hp);
        return { ...prev, [key]: { ...node, type, hp, maxHp: hp, expansionProgress: 100 } };
      });
    },
    upgradeStat: (id) => {
      const lvl = techStats[id];
      const cost = STAT_COST_BASE * (lvl + 1);
      setBits(b => { if (b >= cost) { setTechStats(s => ({...s, [id]: lvl + 1})); return b - cost; } return b; });
    },
    unlockMajor: (id) => {
      if (bits >= MAJOR_COST) { setTechMajors(m => ({...m, [id]: true})); setBits(b => b - MAJOR_COST); }
    },
    fireStrike: (q, r) => {
      if (nodes[hexKey(q,r)]?.type === NODE_TYPES.ENEMY_CORE && !isIsolated(q, r)) return;
      setStrikes(prev => [...prev, { id: Math.random(), fromQ: 0, fromR: 0, targetQ: q, targetR: r, progress: 0 }]);
    }
  };
}

// ==========================================
// COMPONENTS
// ==========================================
const HexNode = ({ node, isSelected, isPotentialTarget, onClick }) => {
  const { x, y } = axialToPixel(node.q, node.r, HEX_SIZE);
  const points = getHexPoints({ x, y }, HEX_SIZE);
  const colors = {
    [NODE_TYPES.CORE]: '#7dd3fc', [NODE_TYPES.PRODUCTIVE]: '#10b981', [NODE_TYPES.OFFENSIVE]: '#f43f5e',
    [NODE_TYPES.DEFENSIVE]: '#eab308', [NODE_TYPES.ADVANCE]: '#a855f7', [NODE_TYPES.REPAIR]: '#22d3ee',
    [NODE_TYPES.BORDER]: '#7dd3fc11', [NODE_TYPES.ENEMY_CORE]: '#ff0055', [NODE_TYPES.ENEMY_NODE]: '#991b1b'
  };
  const IconsDict = { [NODE_TYPES.CORE]: Cpu, [NODE_TYPES.PRODUCTIVE]: TrendingUp, [NODE_TYPES.OFFENSIVE]: Swords, [NODE_TYPES.DEFENSIVE]: Shield, [NODE_TYPES.ADVANCE]: Zap };
  const Icon = IconsDict[node.type];
  const color = colors[node.type];

  return (
    <g className="cursor-pointer" onClick={() => onClick(node.q, node.r)}>
      <polygon points={points} fill={color} stroke={isSelected ? '#fff' : (isPotentialTarget ? '#7dd3fc' : '#7dd3fc22')} strokeWidth={isSelected ? 3 : 1} />
      {Icon && <Icon x={x-8} y={y-8} width={16} height={16} className="text-white opacity-40" />}
      {node.expansionProgress > 0 && node.expansionProgress < 100 && (
         <polygon points={getHexPoints({x, y}, HEX_SIZE * (1 - node.expansionProgress/100))} fill="none" stroke="#7dd3fc" strokeWidth="2" />
      )}
      {node.maxHp > 0 && (
        <rect x={x-15} y={y+12} width={30 * (node.hp/node.maxHp)} height={2} fill={color} />
      )}
    </g>
  );
};

const TechTree = ({ bits, stats, majors, onUpgradeStat, onUnlockMajor, onClose }) => {
  const statInfo = [
    { id: 'bitGen', name: 'BIT_EXTRACTION', icon: Cpu, desc: '+20% Bit Generation' },
    { id: 'hp', name: 'STRUCTURAL_INTEGRITY', icon: Shield, desc: '+1 HP to all nodes' },
    { id: 'expansionSpeed', name: 'VECTOR_VELOCITY', icon: TrendingUp, desc: '+15% Expansion Speed' },
    { id: 'damage', name: 'STRIKE_CALIBRATION', icon: Swords, desc: '+10% Strike Damage' },
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
      <div className="bg-[#0a0f1e] border border-[#7dd3fc]/30 rounded-3xl w-full max-w-2xl p-8">
        <div className="flex justify-between mb-8">
          <h2 className="text-2xl font-orbitron font-bold text-[#7dd3fc]">SYSTEM_UPGRADES</h2>
          <button onClick={onClose}><X /></button>
        </div>
        <div className="grid gap-4">
          {statInfo.map(s => (
            <div key={s.id} className="p-4 bg-[#7dd3fc]/5 border border-[#7dd3fc]/10 rounded-xl flex justify-between items-center">
              <div>
                <h4 className="font-bold text-[#7dd3fc]">{s.name} (LVL {stats[s.id]})</h4>
                <p className="text-[0.6rem] opacity-40">{s.desc}</p>
              </div>
              <button onClick={() => onUpgradeStat(s.id)} className="bg-[#7dd3fc]/20 px-4 py-2 rounded font-orbitron text-xs">
                UPGRADE ({STAT_COST_BASE * (stats[s.id]+1)} B)
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const { nodes, bits, selectedHex, setSelectedHex, convertNode, startExpansion, strikes, techStats, techMajors, upgradeStat, unlockMajor, fireStrike } = useGameEngine();
  const [gameStarted, setGameStarted] = useState(false);
  const [isTargeting, setIsTargeting] = useState(false);
  const [isStriking, setIsStriking] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const selectedNode = selectedHex ? nodes[hexKey(selectedHex.q, selectedHex.r)] : null;

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#e0e6ed] font-inter overflow-hidden">
      <header className="fixed top-0 inset-x-0 p-6 flex justify-between items-center z-50">
        <div className="bg-[#0a0f1e]/80 border border-[#7dd3fc]/20 p-4 rounded-lg">
          <div className="text-[0.6rem] text-[#7dd3fc]/60 uppercase">System_Currency</div>
          <div className="text-2xl font-orbitron text-[#7dd3fc] font-bold">{bits} <span className="text-sm opacity-60">BITS</span></div>
        </div>
        {gameStarted && <button onClick={() => setShowTech(true)} className="bg-[#7dd3fc]/20 border border-[#7dd3fc]/40 px-6 py-2 rounded-lg font-orbitron text-xs">TECH_CENTER</button>}
      </header>

      <main className="relative flex items-center justify-center min-h-screen">
        {!gameStarted ? (
          <div className="text-center p-12 bg-[#0a0f1e]/40 border border-[#7dd3fc]/10 rounded-2xl">
            <h1 className="text-5xl font-orbitron font-bold mb-6 text-[#7dd3fc]">INCREMENTALISM</h1>
            <button onClick={() => setGameStarted(true)} className="px-10 py-4 bg-[#7dd3fc] text-black font-bold rounded-lg shadow-[0_0_20px_#7dd3fc]">INITIALIZE</button>
          </div>
        ) : (
          <svg viewBox="-400 -400 800 800" className="w-[800px] h-[800px]">
            {Object.values(nodes).map(n => (
              <HexNode key={hexKey(n.q,n.r)} node={n} isSelected={selectedHex?.q===n.q && selectedHex?.r===n.r} 
                isPotentialTarget={isTargeting || isStriking} 
                onClick={(q,r) => {
                  if(isTargeting && selectedHex) { startExpansion(q,r,selectedHex.q,selectedHex.r); setIsTargeting(false); }
                  else if(isStriking && selectedHex) { fireStrike(q,r); setIsStriking(false); }
                  else setSelectedHex({q,r});
                }} 
              />
            ))}
            {strikes.map(s => {
               const from = axialToPixel(s.fromQ, s.fromR, HEX_SIZE);
               const to = axialToPixel(s.targetQ, s.targetR, HEX_SIZE);
               const x = from.x + (to.x - from.x) * (s.progress/100);
               const y = from.y + (to.y - from.y) * (s.progress/100);
               return <circle key={s.id} cx={x} cy={y} r="5" fill="#f43f5e" className="animate-pulse" />
            })}
          </svg>
        )}
      </main>

      {selectedNode && (
        <aside className="fixed right-6 top-1/4 w-72 bg-[#0a0f1e]/80 border border-[#7dd3fc]/20 rounded-2xl p-6">
          <h2 className="text-xl font-orbitron font-bold text-[#7dd3fc]">{selectedNode.type}</h2>
          <div className="mt-4 grid gap-2">
            {selectedNode.type === NODE_TYPES.BORDER && (
              Object.keys(BITS_COST).map(type => (
                <button key={type} onClick={() => convertNode(selectedHex.q, selectedHex.r, type)} className="text-left p-2 bg-[#7dd3fc]/10 border border-[#7dd3fc]/20 rounded hover:bg-[#7dd3fc]/20 transition-all text-xs">
                  CONVERT_TO_{type} ({BITS_COST[type]} B)
                </button>
              ))
            )}
            {selectedNode.controlled && (
              <button onClick={() => setIsTargeting(!isTargeting)} className="p-4 bg-[#7dd3fc]/20 border border-[#7dd3fc]/40 rounded hover:bg-[#7dd3fc]/30 transition-all text-xs font-bold">
                {isTargeting ? 'CANCEL_EXPANSION' : 'INIT_EXPANSION'}
              </button>
            )}
            {selectedNode.type === NODE_TYPES.OFFENSIVE && (
              <button onClick={() => setIsStriking(!isStriking)} className="p-4 bg-[#f43f5e]/20 border border-[#f43f5e]/40 rounded hover:bg-[#f43f5e]/30 transition-all text-xs font-bold text-[#f43f5e]">
                {isStriking ? 'CANCEL_STRIKE' : 'FIRE_STRIKE'}
              </button>
            )}
          </div>
        </aside>
      )}

      {showTech && <TechTree bits={bits} stats={techStats} majors={techMajors} onUpgradeStat={upgradeStat} onUnlockMajor={unlockMajor} onClose={() => setShowTech(false)} />}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
