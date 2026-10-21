import { ScoreContext, computeScore } from './score';

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
 * Indica si los partidos sin colocar del dueno aun pueden cerrar los huecos
 * que superan maxFree entre sus partidos ya colocados.
 */
function ownerStillFeasible(st: SearchState, club: number): boolean {
  const slots: number[] = [];
  let unplaced = 0;
  for (const m of st.clubMatches[club]) {
    if (st.matchSlot[m] === -1) unplaced += 1;
    else slots.push(st.matchSlot[m]);
  }
  slots.sort((a, b) => a - b);
  let needed = 0;
  for (let i = 1; i < slots.length; i++) {
    const free = slots[i] - slots[i - 1] - 1;
    if (free > st.maxFree) needed += Math.ceil((free - st.maxFree) / (st.maxFree + 1));
  }
  return needed <= unplaced;
}

function conflictsWithPlaced(st: SearchState, mIdx: number, s: number): boolean {
  const { n, linkedMatrix, shareMatrix } = st.ctx;
  for (let j = 0; j < n; j++) {
    const sj = st.matchSlot[j];
    if (sj === -1 || j === mIdx) continue;
    if (sj === s && linkedMatrix[mIdx * n + j]) return true;
    if (Math.abs(sj - s) === 1 && shareMatrix[mIdx * n + j]) return true;
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
 * Costo de colocar el partido en el turno respecto a lo ya colocado: equidad, descanso
 * exacto de un turno con jugadores compartidos y cercania con los otros partidos del dueno.
 */
function placementCost(st: SearchState, mIdx: number, s: number): number {
  const { n, slotCount, shareMatrix, costTable } = st.ctx;
  let cost = costTable[mIdx * slotCount + s];
  for (let j = 0; j < n; j++) {
    const sj = st.matchSlot[j];
    if (sj === -1 || j === mIdx) continue;
    if (shareMatrix[mIdx * n + j]) cost += Math.abs(Math.abs(s - sj) - 2) * 1000;
  }
  for (const c of st.matchClubs[mIdx]) {
    for (const j of st.clubMatches[c]) {
      const sj = st.matchSlot[j];
      if (sj === -1 || j === mIdx || shareMatrix[mIdx * n + j]) continue;
      cost += Math.max(0, Math.abs(s - sj) - 1) * 1000;
    }
  }
  return cost;
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
    st.matchSlot[mIdx] = s;
    st.slotMatches[s].push(mIdx);
    if (st.matchClubs[mIdx].every((c) => ownerStillFeasible(st, c))) search(st, depth + 1);
    st.slotMatches[s].pop();
    st.matchSlot[mIdx] = -1;
    if (st.solutionsLeft <= 0 || st.nodes >= st.nodeLimit) return;
  }
}

/**
 * Primero los partidos mas restringidos (mas partidos vinculados); empates al azar.
 */
function buildOrder(ctx: ScoreContext, rng: () => number): number[] {
  const degree = Array.from({ length: ctx.n }, (_, i) => {
    let d = 0;
    for (let j = 0; j < ctx.n; j++) if (j !== i && ctx.linkedMatrix[i * ctx.n + j]) d += 1;
    return d + rng() * 0.5;
  });
  return Array.from({ length: ctx.n }, (_, i) => i).sort((a, b) => degree[b] - degree[a]);
}

// Limites de la busqueda: con 16 partidos como maximo por fecha, 6 reinicios de 8.000 nodos
// encuentran solucion en las fechas reales en pocos milisegundos y acotan el peor caso.
const DEFAULT_RESTARTS = 6;
const DEFAULT_NODE_LIMIT = 8_000;
const DEFAULT_MAX_SOLUTIONS = 8;
// Reinicios sin ninguna solucion tras los que se da la fecha por imposible.
const MAX_FAILED_RESTARTS = 2;

function runSearch(
  ctx: ScoreContext,
  capacity: number[],
  rng: () => number,
  nodeLimit: number,
  maxSolutions: number
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
    nodes: 0,
    nodeLimit,
    solutionsLeft: maxSolutions,
    best: null,
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
 * las reglas duras: vinculados nunca a la vez, compartidos nunca seguidos y como maximo
 * maxOwnerFreeSlots turnos libres entre partidos seguidos del mismo dueno.
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
    const { best: found, exhausted } = runSearch(ctx, capacity, rng, nodeLimit, maxSolutions);
    if (found && (!best || found.score < best.score)) best = found;
    // Sin solucion y espacio agotado: es imposible; sin solucion en varios intentos: se abandona.
    if (!best && (exhausted || r + 1 >= MAX_FAILED_RESTARTS)) break;
  }
  return best ? improveBySwaps(ctx, best) : null;
}
