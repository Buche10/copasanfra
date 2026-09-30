/**
 * Generador de numeros pseudoaleatorios mulberry32 a partir de una semilla entera de 32 bits.
 * Devuelve un numero flotante en el rango [0, 1).
 */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mezcla aleatoria de un array utilizando el algoritmo Fisher-Yates y el PRNG provisto.
 * No muta el array original; devuelve una nueva copia mezclada.
 */
export function shuffleWith<T>(rng: () => number, array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}
