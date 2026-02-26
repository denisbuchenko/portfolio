import * as THREE from "three";

export function cloneOcclusionMaterial(material: THREE.Material | THREE.Material[], opacity: number): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) return material.map((m) => cloneOcclusionMaterial(m, opacity) as THREE.Material);
  const m = material.clone();
  m.transparent = true;
  m.opacity = opacity;
  // Ключевой момент для “без внутренностей”: пишем depth, чтобы задние/внутренние полигоны не просвечивали.
  m.depthWrite = true;
  m.depthTest = true;
  m.side = THREE.FrontSide;
  m.needsUpdate = true;
  return m;
}

export function setMaterialOpacity(material: THREE.Material | THREE.Material[], opacity: number): void {
  if (Array.isArray(material)) {
    for (const m of material) setMaterialOpacity(m, opacity);
    return;
  }
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = true;
  material.side = THREE.FrontSide;
  material.needsUpdate = true;
}

