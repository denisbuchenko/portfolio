import type { Object3D } from "three";
import type { GnomeController } from "./GnomeController";

export class GnomeInstance {
  private _root: Object3D;
  private _controller: GnomeController;

  constructor(opts: { root: Object3D; controller: GnomeController }) {
    this._root = opts.root;
    this._controller = opts.controller;
  }

  get root(): Object3D {
    return this._root;
  }

  get controller(): GnomeController {
    return this._controller;
  }
}

