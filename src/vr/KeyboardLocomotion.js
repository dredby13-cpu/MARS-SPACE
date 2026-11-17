import * as THREE from 'three';

const MOVE_SPEED = 10.0; // m/s
const TURN_SPEED = THREE.MathUtils.degToRad(100); // rad/s, desktop smooth turn
const SNAP_ANGLE = THREE.MathUtils.degToRad(30); // XR: snap turn for comfort

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA'];
const RIGHT = ['KeyD'];
const TURN_LEFT = ['KeyQ', 'ArrowLeft'];
const TURN_RIGHT = ['KeyE', 'ArrowRight'];

const _head = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Keyboard locomotion that works on desktop AND inside an XR session (Immersive Web Emulator):
 * W/S (↑/↓) forward/back where you look, A/D strafe, Q/E (←/→) turn.
 * The body is a circle that collides with walls, door frames and furniture and slides along them;
 * walking at a door slightly off-centre is guided through it (see Collision.js).
 */
export class KeyboardLocomotion {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Group} dolly
   * @param {import('./Locomotion.js').Locomotion} locomotion
   * @param {ReturnType<typeof import('./Collision.js').buildCollider>} collider
   */
  constructor(renderer, camera, dolly, locomotion, collider) {
    this.renderer = renderer;
    this.camera = camera;
    this.dolly = dolly;
    this.locomotion = locomotion;
    this.collider = collider;
    /** @type {Set<string>} */
    this.keys = new Set();
    /** False while the start menu is open (keys ignored). */
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (isTyping(e) || !this.enabled) return;
      const code = e.code;
      if ([...FORWARD, ...BACK, ...TURN_LEFT, ...TURN_RIGHT].includes(code)) e.preventDefault();
      if (!e.repeat && this.renderer.xr.isPresenting) {
        if (TURN_LEFT.includes(code)) this.locomotion.rotate(SNAP_ANGLE);
        if (TURN_RIGHT.includes(code)) this.locomotion.rotate(-SNAP_ANGLE);
      }
      this.keys.add(code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** @param {string[]} codes */
  #down(codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** @param {number} dt */
  update(dt) {
    if (!this.enabled || this.keys.size === 0) return;

    if (!this.renderer.xr.isPresenting) {
      const turn = (this.#down(TURN_LEFT) ? 1 : 0) - (this.#down(TURN_RIGHT) ? 1 : 0);
      if (turn) this.locomotion.rotate(turn * TURN_SPEED * dt);
    }

    const forward = (this.#down(FORWARD) ? 1 : 0) - (this.#down(BACK) ? 1 : 0);
    const strafe = (this.#down(RIGHT) ? 1 : 0) - (this.#down(LEFT) ? 1 : 0);
    if (!forward && !strafe) return;

    // Direction from where the head looks, flattened to the floor.
    this.locomotion.headForward(_dir);
    if (_dir.lengthSq() === 0) return;
    const step = MOVE_SPEED * dt;
    const len = Math.hypot(forward, strafe);
    // right vector = (-dir.z, dir.x)
    const dx = ((_dir.x * forward - _dir.z * strafe) / len) * step;
    const dz = ((_dir.z * forward + _dir.x * strafe) / len) * step;

    this.locomotion.headWorld(_head);
    const next = this.collider.move(_head.x, _head.z, dx, dz);
    this.#translate(next.x - _head.x, next.z - _head.z);
  }

  /** @param {number} dx @param {number} dz */
  #translate(dx, dz) {
    this.dolly.position.x += dx;
    this.dolly.position.z += dz;
  }
}

/** @param {KeyboardEvent} e */
function isTyping(e) {
  const el = /** @type {HTMLElement | null} */ (e.target);
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
