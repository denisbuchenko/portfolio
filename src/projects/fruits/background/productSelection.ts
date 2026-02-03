import type { FruitBackgroundPresetsConfig, FruitLayerBits, Product } from "../types";
import { rand01 } from "../core/utils";

const LAYER_BITS = [1, 2, 3, 4, 5, 6, 7] as const;

function _countTypesForBits(config: FruitBackgroundPresetsConfig, bits: FruitLayerBits): number {
  const layer = config.layers[bits];
  if (layer.fruits?.countTypes !== undefined) return layer.fruits.countTypes;
  return bits <= 5 ? config.counts.bits1to5 : config.counts.bits6to7;
}

function _shuffleDeterministic(items: string[], seed: number): string[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const r = rand01((seed + i * 131) | 0);
    const j = Math.floor(r * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * Детерминированно выбирает набор фруктов для каждого bits-слоя.
 * Цель: по умолчанию (без явных include) сделать 7 уникальных наборов без повторов.
 */
export function selectUniqueLayerProducts(
  config: FruitBackgroundPresetsConfig,
  products: Product[]
): Map<FruitLayerBits, string[]> {
  const byBits = new Map<FruitLayerBits, string[]>();
  const allNames = products.map(p => p.name);
  const shuffled = _shuffleDeterministic(allNames, (config.seed ?? 0) | 0);

  const used = new Set<string>();
  let cursor = 0;

  for (const bits of LAYER_BITS) {
    const layer = config.layers[bits];
    const exclude = new Set(layer.fruits?.exclude ?? []);

    // Явный include — уважаем 1:1 (но фильтруем по существующим моделям + exclude).
    if (layer.fruits?.include?.length) {
      const included = layer.fruits.include
        .filter(name => allNames.includes(name))
        .filter(name => !exclude.has(name));
      byBits.set(bits, included);
      for (const n of included) used.add(n);
      continue;
    }

    const want = _countTypesForBits(config, bits);
    const picked: string[] = [];

    // Берём из общего shuffled “по кругу”, стараясь избегать повторов между слоями.
    // Если фруктов не хватит — начнутся повторы (редкий кейс, но лучше чем пусто).
    let safety = 0;
    while (picked.length < want && safety < shuffled.length * 3) {
      const name = shuffled[cursor % shuffled.length];
      cursor++;
      safety++;
      if (!name) continue;
      if (exclude.has(name)) continue;
      if (used.has(name)) continue;
      picked.push(name);
      used.add(name);
    }

    // Если вдруг из-за exclude/include не добрали — добиваем с повторами, чтобы слой был заполнен.
    safety = 0;
    while (picked.length < want && safety < shuffled.length * 2) {
      const name = shuffled[cursor % shuffled.length];
      cursor++;
      safety++;
      if (!name) continue;
      if (exclude.has(name)) continue;
      if (picked.includes(name)) continue;
      picked.push(name);
    }

    byBits.set(bits, picked);
  }

  return byBits;
}

