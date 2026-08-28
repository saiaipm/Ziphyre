import "server-only";

/**
 * A 2D `DOMMatrix` for the server, because pdfjs needs one at import
 * time and no Node runtime provides it.
 *
 * `pdfjs-dist/build/pdf.mjs` line ~9387 is a module-level
 * `const SCALE_MATRIX = new DOMMatrix()`, evaluated the instant the
 * module is imported. Without a global, importing `pdf-parse` throws
 * `ReferenceError: DOMMatrix is not defined` before any of our code
 * runs. It surfaced only on Vercel, which is a warning about local
 * confidence rather than a difference in the requirement: Node has
 * never had this global, and local dev was getting away with it.
 *
 * **Not a stub.** An empty class would get past the import and then
 * silently produce wrong geometry if any real path used it. The
 * arithmetic here is the standard affine 2D matrix, so a caller that
 * does reach it gets a correct answer rather than a plausible one.
 *
 * Only the 2D subset is implemented — pdfjs uses nothing else, and text
 * extraction does not touch this at all. `is2D` is therefore always
 * true, and the 3D `m11…m44` accessors are not provided.
 */

type Matrix2D = [number, number, number, number, number, number];

function parseInit(init?: string | number[]): Matrix2D {
  if (init === undefined) return [1, 0, 0, 1, 0, 0];
  if (typeof init === "string") {
    // The spec accepts a CSS transform string. pdfjs never passes one,
    // and guessing at a CSS parser here would be inventing behaviour —
    // so this is the identity plus a loud signal if it ever happens.
    if (init.trim() !== "") {
      console.warn(`DOMMatrix polyfill: ignoring unsupported init "${init}"`);
    }
    return [1, 0, 0, 1, 0, 0];
  }
  if (init.length === 6) return [...init] as Matrix2D;
  if (init.length === 16) {
    // A 4x4 in column-major order, of which the 2D subset is these six.
    return [init[0], init[1], init[4], init[5], init[12], init[13]];
  }
  return [1, 0, 0, 1, 0, 0];
}

class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  readonly is2D = true;

  constructor(init?: string | number[]) {
    [this.a, this.b, this.c, this.d, this.e, this.f] = parseInit(init);
  }

  get isIdentity(): boolean {
    return (
      this.a === 1 &&
      this.b === 0 &&
      this.c === 0 &&
      this.d === 1 &&
      this.e === 0 &&
      this.f === 0
    );
  }

  private set(m: Matrix2D): this {
    [this.a, this.b, this.c, this.d, this.e, this.f] = m;
    return this;
  }

  private clone(): DOMMatrixPolyfill {
    return new DOMMatrixPolyfill([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e,
      this.f,
    ]);
  }

  /** this × other */
  private static mul(
    A: { a: number; b: number; c: number; d: number; e: number; f: number },
    B: { a: number; b: number; c: number; d: number; e: number; f: number },
  ): Matrix2D {
    return [
      A.a * B.a + A.c * B.b,
      A.b * B.a + A.d * B.b,
      A.a * B.c + A.c * B.d,
      A.b * B.c + A.d * B.d,
      A.a * B.e + A.c * B.f + A.e,
      A.b * B.e + A.d * B.f + A.f,
    ];
  }

  multiplySelf(other: DOMMatrixPolyfill): this {
    return this.set(DOMMatrixPolyfill.mul(this, other));
  }

  preMultiplySelf(other: DOMMatrixPolyfill): this {
    return this.set(DOMMatrixPolyfill.mul(other, this));
  }

  multiply(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
    return this.clone().multiplySelf(other);
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      // The spec makes a non-invertible matrix all-NaN and flips is2D.
      // Matching that beats throwing: pdfjs checks the values, and a
      // throw here would surface as a corrupt-PDF error instead.
      return this.set([NaN, NaN, NaN, NaN, NaN, NaN]);
    }
    return this.set([
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    ]);
  }

  inverse(): DOMMatrixPolyfill {
    return this.clone().invertSelf();
  }

  // Per spec these return a NEW matrix; the *Self variants mutate.
  translate(tx = 0, ty = 0): DOMMatrixPolyfill {
    return this.clone().translateSelf(tx, ty);
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.set([
      this.a,
      this.b,
      this.c,
      this.d,
      this.e + this.a * tx + this.c * ty,
      this.f + this.b * tx + this.d * ty,
    ]);
  }

  scale(sx = 1, sy?: number): DOMMatrixPolyfill {
    return this.clone().scaleSelf(sx, sy);
  }

  scaleSelf(sx = 1, sy?: number): this {
    const y = sy ?? sx;
    return this.set([
      this.a * sx,
      this.b * sx,
      this.c * y,
      this.d * y,
      this.e,
      this.f,
    ]);
  }

  rotateSelf(degrees = 0): this {
    const r = (degrees * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return this.set(
      DOMMatrixPolyfill.mul(this, {
        a: cos,
        b: sin,
        c: -sin,
        d: cos,
        e: 0,
        f: 0,
      }),
    );
  }

  rotate(degrees = 0): DOMMatrixPolyfill {
    return this.clone().rotateSelf(degrees);
  }

  transformPoint(point: { x?: number; y?: number } = {}): {
    x: number;
    y: number;
    z: number;
    w: number;
  } {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: 0,
      w: 1,
    };
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

/**
 * Installs the global if the runtime has none. Idempotent, and never
 * replaces a real implementation — if a future Node ships `DOMMatrix`,
 * that one wins.
 */
export function ensureDomMatrix(): void {
  const g = globalThis as { DOMMatrix?: unknown };
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = DOMMatrixPolyfill;
  }
}
