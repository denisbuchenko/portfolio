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
      alpha: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true,
    });

    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = GNOMES_CONFIG.visuals.renderer.toneMappingExposure;
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this._scene = new THREE.Scene();
    this._scene.background = null;
    this._scene.fog = new THREE.Fog(
      GNOMES_CONFIG.visuals.environment.fogColor,
      GNOMES_CONFIG.visuals.environment.fogNear,
      GNOMES_CONFIG.visuals.environment.fogFar,
    );

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
    const groundCfg = GNOMES_CONFIG.visuals.ground;
    const geo = new THREE.PlaneGeometry(groundCfg.width, groundCfg.length, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(groundCfg.color),
      roughness: groundCfg.roughness,
      metalness: groundCfg.metalness,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.y = groundCfg.y;
    mesh.receiveShadow = true;
    return mesh;
  }

  private _setupLights(): void {
    const lightsCfg = GNOMES_CONFIG.visuals.lights;

    const hemi = new THREE.HemisphereLight(
      lightsCfg.hemisphere.skyColor,
      lightsCfg.hemisphere.groundColor,
      lightsCfg.hemisphere.intensity,
    );
    this._scene.add(hemi);

    const key = new THREE.DirectionalLight(lightsCfg.key.color, lightsCfg.key.intensity);
    key.position.set(lightsCfg.key.position.x, lightsCfg.key.position.y, lightsCfg.key.position.z);
    key.castShadow = lightsCfg.key.castShadow;
    key.shadow.mapSize.set(lightsCfg.key.shadowMapSize, lightsCfg.key.shadowMapSize);
    key.shadow.camera.near = lightsCfg.key.shadowCamera.near;
    key.shadow.camera.far = lightsCfg.key.shadowCamera.far;
    key.shadow.camera.left = lightsCfg.key.shadowCamera.left;
    key.shadow.camera.right = lightsCfg.key.shadowCamera.right;
    key.shadow.camera.top = lightsCfg.key.shadowCamera.top;
    key.shadow.camera.bottom = lightsCfg.key.shadowCamera.bottom;
    key.shadow.bias = lightsCfg.key.shadowBias;
    key.shadow.normalBias = lightsCfg.key.shadowNormalBias;
    this._scene.add(key);

    const fill = new THREE.PointLight(lightsCfg.fill.color, lightsCfg.fill.intensity, lightsCfg.fill.distance);
    fill.position.set(lightsCfg.fill.position.x, lightsCfg.fill.position.y, lightsCfg.fill.position.z);
    this._scene.add(fill);

    const rim = new THREE.DirectionalLight(lightsCfg.rim.color, lightsCfg.rim.intensity);
    rim.position.set(lightsCfg.rim.position.x, lightsCfg.rim.position.y, lightsCfg.rim.position.z);
    this._scene.add(rim);
  }
}

