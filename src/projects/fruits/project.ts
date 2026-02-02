import * as THREE from "three";
import type { FruitsConfig } from "./config";
import type { Product } from "./types";
import {
  FruitsScene,
  ProductPlacement,
  ProductFactory,
  InstancedProductResult,
  disposeMaterials,
} from "./core/scene";

const DEFAULT_SEED = 0xdecafbad;

export class FruitsProject {
  private _products: Product[] = [];
  private _instancedProducts: InstancedProductResult[] = [];
  private _meshes: THREE.Mesh[] = [];
  private _scene: FruitsScene | null = null;
  private _factory: ProductFactory | null = null;
  private _seed = DEFAULT_SEED;
  private _config: FruitsConfig | null = null;

  async load(gltfUrl: string): Promise<Product[]> {
    const { parseGLTF } = await import("./gltfParser");
    this._products = await parseGLTF(gltfUrl);
    return this._products;
  }

  setup(config: FruitsConfig, products: Product[], width: number, height: number): void {
    this._config = config;
    this._seed = config.seed ?? this._seed;
    this._products = products;

    this._initializeScene(config, width, height);
    this._createProducts(config);
  }

  update(time: number): void {
    for (const { material } of this._instancedProducts) {
      // updateAnimation теперь внутри ProductFactory через instancing
      if ("uTime" in material.uniforms) {
        material.uniforms.uTime.value = time;
      }
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    this._scene?.render(renderer);
  }

  resize(width: number, height: number): void {
    this._scene?.resize(width, height);
  }

  get scene(): THREE.Scene | null {
    return this._scene?.scene ?? null;
  }

  get camera(): THREE.PerspectiveCamera | null {
    return this._scene?.camera ?? null;
  }

  get products(): Product[] {
    return this._products;
  }

  get config(): FruitsConfig | null {
    return this._config;
  }

  get instancedProducts(): InstancedProductResult[] {
    return this._instancedProducts;
  }

  dispose(): void {
    this._disposeInstancedProducts();
    this._disposeMeshes();
    this._disposeProducts();

    this._scene = null;
    this._factory = null;
    this._instancedProducts = [];
    this._meshes = [];
    this._products = [];
  }

  private _initializeScene(config: FruitsConfig, width: number, height: number): void {
    this._scene = new FruitsScene();
    this._scene.initialize(config.backgroundColor, width, height, config.camera.fov);

    const placement = new ProductPlacement(this._seed, this._scene.bounds);
    this._factory = new ProductFactory(this._scene, placement);
    this._factory.resetInstanceCounter();
  }

  private _createProducts(config: FruitsConfig): void {
    for (const productConfig of config.products) {
      this._createProduct(productConfig);
    }
  }

  private _createProduct(productConfig: FruitsConfig["products"][number]): void {
    const product = this._products.find(p => p.name === productConfig.productName);

    if (!product) {
      console.warn(`Product "${productConfig.productName}" not found`);
      return;
    }

    if (productConfig.count > 1 && this._factory) {
      const result = this._factory.createInstancedProduct(
        product,
        productConfig,
        this._seed
      );
      this._instancedProducts.push(result);
    } else if (this._factory) {
      const mesh = this._factory.createSingleProduct(product, productConfig);
      this._meshes.push(mesh);
    }
  }

  private _disposeInstancedProducts(): void {
    for (const { instanced, material } of this._instancedProducts) {
      instanced.mesh.geometry.dispose();
      disposeMaterials(material);
    }
  }

  private _disposeMeshes(): void {
    if (!this._scene) return;

    for (const mesh of this._meshes) {
      this._scene.scene.remove(mesh);
      mesh.geometry.dispose();
      disposeMaterials(mesh.material);
    }
  }

  private _disposeProducts(): void {
    for (const product of this._products) {
      product.geometry.dispose();
      product.materials.forEach(m => m.dispose());
    }
  }
}

