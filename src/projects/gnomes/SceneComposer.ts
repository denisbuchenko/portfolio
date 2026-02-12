import * as THREE from "three";
import { GNOMES_CONFIG } from "./config";

export class SceneComposer {
  private _canvas: HTMLCanvasElement;
  private _renderer: THREE.WebGLRenderer;
  private _scene: THREE.Scene;
  private _ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

  constructor(opts: { canvas: HTMLCanvasElement }) {
    this._canvas = opts.canvas;

    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });

    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.05;
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x05070c);
    this._scene.fog = new THREE.Fog(0x05070c, 7.5, 18);

    this._ground = this._createGround();
    this._scene.add(this._ground);

    this._setupLights();
  }

  get renderer(): THREE.WebGLRenderer {
    return this._renderer;
  }

  get scene(): THREE.Scene {
    return this._scene;
  }

  resize(w: number, h: number, dpr: number): void {
    this._renderer.setPixelRatio(dpr);
    this._renderer.setSize(w, h, false);
  }

  dispose(): void {
    this._renderer.dispose();
    this._ground.geometry.dispose();
    this._ground.material.dispose();
  }

  private _createGround(): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
    const geo = new THREE.PlaneGeometry(22, 300, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x070a12),
      roughness: 1.0,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.y = -0.001;
    mesh.receiveShadow = true;
    return mesh;
  }

  private _setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xbfd2ff, 0x101018, GNOMES_CONFIG.lighting.hemisphereIntensity);
    this._scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, GNOMES_CONFIG.lighting.keyIntensity);
    key.position.set(3.5, 6.0, 4.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.00015;
    this._scene.add(key);

    const fill = new THREE.PointLight(0x9ad5ff, GNOMES_CONFIG.lighting.fillIntensity, 30);
    fill.position.set(-2.2, 2.2, 2.4);
    this._scene.add(fill);
  }
}

