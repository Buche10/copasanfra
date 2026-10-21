import { ScoreContext, computeScore, firstSlotLimit, SCORE_WEIGHTS } from './score';

export interface FullScheduleResult {
  matchSlot: number[];
  slotMatches: number[][];
  score: number;
}

interface SearchState {
  ctx: ScoreContext;
  order: number[];
  usableSlots: number[];
  rng: () => number;
  capacity: number[];
  matchClubs: number[][];
  clubMatches: number[][];
  matchSlot: number[];
  slotMatches: number[][];
  maxFree: number;
  restPairs: number;
  firstSlotMatches: ReadonlySet<number>;
  firstSlotLimit: number;
  nodes: number;
  nodeLimit: number;
  solutionsLeft: number;
  best: FullScheduleResult | null;
}

/**
 * Capacidad por turno para usar el minimo de turnos con canchas llenas:
 * todos los turnos completos salvo el ultimo, que recibe el resto.
 */
function buildCapacity(n: number, fieldsPerSlot: number, slotCount: number): number[] | null {
  const minSlots = Math.ceil(n / fieldsPerSlot);
  if (minSlots > slotCount) return null;
  return Array.from({ length: slotCount }, (_, s) => {
    if (s < minSlots - 1) return fieldsPerSlot;
    if (s === minSlots - 1) return n - (minSlots - 1) * fieldsPerSlot;
    return 0;
  });
}

function buildClubIndex(ctx: ScoreContext): { matchClubs: number[][]; clubMatches: number[][] } {
  const matchClubs: number[][] = Array.from({ length: ctx.n }, () => []);
  const clubMatches = ctx.multiClubs.map((club, c) => {
    const ms = ctx.clubMatchIndices.get(club) ?? [];
    ms.forEach((m) => matchClubs[m].push(c));
    return ms;
  });
  return { matchClubs, clubMatches };
}

/**
 * Pares nuevos sin descanso (jugadores compartidos en turnos seguidos) al colocar el partido.
 */
function newRestPairs(st: SearchState, mIdx: number, s: number): number {
  const { n, shareMatrix } = st.ctx;
  let pairs = 0;
  for (let j = 0; j < n; j++) {
    const sj = st.matchSlot[j];
    if (sj !== -1 && j !== mIdx && Math.abs(sj - s) === 1 && shareMatrix[mIdx * n + j]) pairs += 1;
  }
  return pairs;
}

function conflictsWithPlaced(st: SearchState, mIdx: number, s: number): boolean {
  if (st.firstSlotMatches.has(mIdx) && s >= st.firstSlotLimit) return true;
  const { n, linkedMatrix } = st.ctx;
  for (let j = 0; j < n; j++) {
    if (st.matchSlot[j] === s && j !== mIdx && linkedMatrix[mIdx * n + j]) return true;
  }
  return false;
}

function recordSolution(st: SearchState): void {
  const score = computeScore(st.ctx, st.matchSlot, st.slotMatches);
  if (!st.best || score < st.best.score) {
    st.best = {
      matchSlot: [...st.matchSlot],
      slotMatches: st.slotMatches.map((arr) => [...arr]),
      score,
    };
  }
  st.solutionsLeft -= 1;
}

/**
 * Costo de colocar el partido en el turno respecto a lo ya colocado: equidad, hora de
 * descanso con jugadores compartidos y cercania con los otros partidos del dueno.
 */
function placementCost(st: SearchState, mIdx: number, s: number): number {
  const { n, slotCount, shareMatrix, costTable } = st.ctx;
  let cost = costTable[mIdx * slotCount + s];
  for (let j = 0; j < n; j++) {
    const sj = st.matchSlot[j];
    if (sj === -1 || j === mIdx || !shareMatrix[mIdx * n + j]) continue;
    const dist = Math.abs(s - sj);
    cost += (dist === 1 ? SCORE_WEIGHTS.REST : 0) + Math.abs(dist - 2) * SCORE_WEIGHTS.SOFT;
  }
  // Dueno: lo que agrega este partido a los turnos libres entre partidos seguidos del
  // dueno (no contra todos sus partidos, que castigaria de mas a un dueno con 3).
  for (const c of st.matchClubs[mIdx]) {
    const placed = st.clubMatches[c]
      .filter((j) => j !== mIdx && st.matchSlot[j] !== -1)
      .map((j) => st.matchSlot[j]);
    if (placed.length === 0) continue;
    const before = ownerGapCost(placed, st.maxFree);
    cost += ownerGapCost([...placed, s], st.maxFree) - before;
  }
  return cost;
}

function ownerGapCost(slots: number[], maxFree: number): number {
  const sorted = [...slots].sort((a, b) => a - b);
  let cost = 0;
  for (let i = 1; i < sorted.length; i++) {
    const free = Math.max(0, sorted[i] - sorted[i - 1] - 1);
    cost += Math.max(0, free - maxFree) * SCORE_WEIGHTS.OWNER_GAP + free * SCORE_WEIGHTS.SOFT;
  }
  return cost;
}

/**
 * Cota inferior de turnos libres de mas por dueno: con k partidos repartidos en un tramo
 * de W turnos hay al menos W - k - (k - 1) * maxFree turnos libres por encima del maximo.
 */
function ownerGapLowerBound(st: SearchState): number {
  let bound = 0;
  for (const group of st.clubMatches) {
    let min = Infinity;
    let max = -Infinity;
    for (const m of group) {
      const s = st.matchSlot[m];
      if (s === -1) continue;
      min = Math.min(min, s);
      max = Math.max(max, s);
    }
    if (max < min) continue;
    const k = group.length;
    bound += Math.max(0, max - min + 1 - k - (k - 1) * st.maxFree);
  }
  return bound;
}

/**
 * Poda: si la rama ya acumula mas pares sin descanso y turnos libres de mas del dueno
 * que el score de la mejor solucion, no puede mejorarla.
 */
function cannotBeatBest(st: SearchState, restPairs: number): boolean {
  if (st.best === null) return false;
  const bound = restPairs * SCORE_WEIGHTS.REST + ownerGapLowerBound(st) * SCORE_WEIGHTS.OWNER_GAP;
  return bound >= st.best.score;
}

function orderedCandidates(st: SearchState, mIdx: number): number[] {
  return st.usableSlots
    .filter((s) => st.slotMatches[s].length < st.capacity[s] && !conflictsWithPlaced(st, mIdx, s))
    .map((s) => ({ s, c: placementCost(st, mIdx, s) + st.rng() * 0.5 }))
    .sort((a, b) => a.c - b.c)
    .map((x) => x.s);
}

function search(st: SearchState, depth: number): void {
  if (st.solutionsLeft <= 0 || st.nodes >= st.nodeLimit) return;
  st.nodes += 1;
  if (depth === st.order.length) {
    recordSolution(st);
    return;
  }
  const mIdx = st.order[depth];
  for (const s of orderedCandidates(st, mIdx)) {
    const added = newRestPairs(st, mIdx, s);
    st.matchSlot[mIdx] = s;
    st.slotMatches[s].push(mIdx);
    st.restPairs += added;
    if (!cannotBeatBest(st, st.restPairs)) search(st, depth + 1);
    st.restPairs -= added;
    st.slotMatches[s].pop();
    st.matchSlot[mIdx] = -1;
    if (st.solutionsLeft <= 0 || st.nodes >= st.nodeLimit) return;
  }
}

/**
 * Primero los partidos de primer turno y luego los mas restringidos (mas partidos
 * vinculados); empates al azar.
 */
function buildOrder(ctx: ScoreContext, rng: () => number): number[] {
  const firstSlot = new Set(ctx.firstSlotMatches ?? []);
  const degree = Array.from({ length: ctx.n }, (_, i) => {
    let d = firstSlot.has(i) ? ctx.n : 0;
    for (let j = 0; j < ctx.n; j++) if (j !== i && ctx.linkedMatrix[i * ctx.n + j]) d += 1;
    return d + rng() * 0.5;
  });
  return Array.from({ length: ctx.n }, (_, i) => i).sort((a, b) => degree[b] - degree[a]);
}

// Limites de la busqueda: con 14 partidos como maximo por fecha, 6 reinicios de 40.000 nodos
// llegan al optimo de turnos libres por dueno en las fechas reales (octubre y noviembre de
// 2026) en unos 30 ms por fecha y acotan el peor caso.
const DEFAULT_RESTARTS = 6;
const DEFAULT_NODE_LIMIT = 40_000;
const DEFAULT_MAX_SOLUTIONS = 50;
// Reinicios sin ninguna solucion tras los que se da la fecha por imposible.
const MAX_FAILED_RESTARTS = 2;

function runSearch(
  ctx: ScoreContext,
  capacity: number[],
  rng: () => number,
  nodeLimit: number,
  maxSolutions: number,
  incumbent: FullScheduleResult | null
): { best: FullScheduleResult | null; exhausted: boolean } {
  const { matchClubs, clubMatches } = buildClubIndex(ctx);
  const st: SearchState = {
    ctx,
    order: buildOrder(ctx, rng),
    usableSlots: capacity.map((c, s) => (c > 0 ? s : -1)).filter((s) => s !== -1),
    rng,
    capacity,
    matchClubs,
    clubMatches,
    matchSlot: new Array(ctx.n).fill(-1),
    slotMatches: Array.from({ length: ctx.slotCount }, () => []),
    maxFree: ctx.maxOwnerFreeSlots ?? 1,
    restPairs: 0,
    firstSlotMatches: new Set(ctx.firstSlotMatches ?? []),
    firstSlotLimit: firstSlotLimit(ctx),
    nodes: 0,
    nodeLimit,
    solutionsLeft: maxSolutions,
    // La mejor solucion de reinicios anteriores sirve de cota para podar desde el inicio.
    best: incumbent,
  };
  search(st, 0);
  // Agotada: recorrio todo el espacio sin cortar por limite de nodos ni de soluciones.
  const exhausted = st.nodes < nodeLimit && st.solutionsLeft > 0;
  return { best: st.best, exhausted };
}

function swapSlots(res: FullScheduleResult, i: number, j: number): void {
  const si = res.matchSlot[i];
  const sj = res.matchSlot[j];
  res.slotMatches[si] = res.slotMatches[si].map((m) => (m === i ? j : m));
  res.slotMatches[sj] = res.slotMatches[sj].map((m) => (m === j ? i : m));
  res.matchSlot[i] = sj;
  res.matchSlot[j] = si;
}

/**
 * Mejora la solucion intercambiando partidos de turno mientras baje el score.
 * Un intercambio no cambia cuantos partidos hay por turno, asi que las canchas siguen llenas.
 */
function improveBySwaps(ctx: ScoreContext, start: FullScheduleResult, maxRounds = 20): FullScheduleResult {
  const res: FullScheduleResult = {
    matchSlot: [...start.matchSlot],
    slotMatches: start.slotMatches.map((arr) => [...arr]),
    score: start.score,
  };
  for (let round = 0; round < maxRounds; round++) {
    let improved = false;
    for (let i = 0; i < ctx.n; i++) {
      for (let j = i + 1; j < ctx.n; j++) {
        if (res.matchSlot[i] === res.matchSlot[j]) continue;
        swapSlots(res, i, j);
        const score = computeScore(ctx, res.matchSlot, res.slotMatches);
        if (score < res.score) {
          res.score = score;
          improved = true;
        } else {
          swapSlots(res, i, j);
        }
      }
    }
    if (!improved) break;
  }
  return res;
}

/**
 * Busca por backtracking un horario con el minimo de turnos y canchas llenas que cumpla
 * las reglas obligatorias (vinculados nunca a la vez, +50 en el primer turno) y que deje
 * la menor cantidad de jugadores compartidos sin hora de descanso.
 * Cada turno candidato se prueba del mas barato al mas caro; hace varios reinicios con
 * distinto orden, mejora la mejor solucion con intercambios y la devuelve, o null si no
 * encontro ninguna.
 */
export function findFullSchedule(
  ctx: ScoreContext,
  rng: () => number,
  restarts = DEFAULT_RESTARTS,
  nodeLimit = DEFAULT_NODE_LIMIT,
  maxSolutions = DEFAULT_MAX_SOLUTIONS
): FullScheduleResult | null {
  const capacity = buildCapacity(ctx.n, ctx.fieldsPerSlot, ctx.slotCount);
  if (!capacity || ctx.n === 0) return null;
  let best: FullScheduleResult | null = null;
  for (let r = 0; r < restarts; r++) {
    const { best: found, exhausted } = runSearch(ctx, capacity, rng, nodeLimit, maxSolutions, best);
    if (found && (!best || found.score < best.score)) best = found;
    // Sin solucion y espacio agotado: es imposible; sin solucion en varios intentos: se abandona.
    if (!best && (exhausted || r + 1 >= MAX_FAILED_RESTARTS)) break;
  }
  return best ? improveBySwaps(ctx, best) : null;
}
