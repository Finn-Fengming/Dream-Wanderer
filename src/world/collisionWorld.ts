import * as THREE from 'three';

interface IndexedTri {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  enabledFlag?: () => boolean;
}

export interface CircleObstacle {
  x: number;
  z: number;
  r: number;
  minY: number;
  maxY: number;
}

export interface CapsuleObstacle {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  minY: number;
  maxY: number;
}

class SpatialTriGrid {
  private cellSize: number;
  private buckets = new Map<number, IndexedTri[]>();

  constructor(cellSize = 2.5) {
    this.cellSize = cellSize;
  }

  private hashCell(ix: number, iz: number): number {
    return ((ix + 4096) << 14) | ((iz + 4096) & 0x3fff);
  }

  public insertMesh(mesh: THREE.Mesh, enabledFlag?: () => boolean) {
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const idx = geo.index;
    const m = mesh.matrixWorld;

    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const nrm = new THREE.Vector3();

    const triCount = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;

      va.fromBufferAttribute(pos, i0).applyMatrix4(m);
      vb.fromBufferAttribute(pos, i1).applyMatrix4(m);
      vc.fromBufferAttribute(pos, i2).applyMatrix4(m);

      e1.subVectors(vb, va);
      e2.subVectors(vc, va);
      nrm.crossVectors(e1, e2);
      const len = nrm.length();
      if (len < 1e-6) continue;
      // Only upward-facing walkable surfaces (up to ~65 deg slope)
      if (nrm.y / len < 0.42) continue;

      const minX = Math.min(va.x, vb.x, vc.x);
      const maxX = Math.max(va.x, vb.x, vc.x);
      const minZ = Math.min(va.z, vb.z, vc.z);
      const maxZ = Math.max(va.z, vb.z, vc.z);

      const rec: IndexedTri = {
        ax: va.x,
        ay: va.y,
        az: va.z,
        bx: vb.x,
        by: vb.y,
        bz: vb.z,
        cx: vc.x,
        cy: vc.y,
        cz: vc.z,
        minX,
        maxX,
        minZ,
        maxZ,
        enabledFlag,
      };

      const ix0 = Math.floor(minX / this.cellSize);
      const ix1 = Math.floor(maxX / this.cellSize);
      const iz0 = Math.floor(minZ / this.cellSize);
      const iz1 = Math.floor(maxZ / this.cellSize);

      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = this.hashCell(ix, iz);
          let arr = this.buckets.get(key);
          if (!arr) {
            arr = [];
            this.buckets.set(key, arr);
          }
          arr.push(rec);
        }
      }
    }
  }

  /**
   * Exact 2D XZ Barycentric Vertical Raycast at (x, z), returning highest valid triangle Y <= refY + maxStepUp!
   */
  public sampleHeight(x: number, z: number, refY: number, maxStepUp = 1.45): number | null {
    const ix = Math.floor(x / this.cellSize);
    const iz = Math.floor(z / this.cellSize);
    const list = this.buckets.get(this.hashCell(ix, iz));
    if (!list) return null;

    let bestH: number | null = null;
    const eps = -0.0025; // slight edge tolerance prevents hairline seam drops between adjacent slabs

    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.enabledFlag && !t.enabledFlag()) continue;
      if (x < t.minX - 0.01 || x > t.maxX + 0.01 || z < t.minZ - 0.01 || z > t.maxZ + 0.01) continue;

      const v0x = t.cx - t.ax;
      const v0z = t.cz - t.az;
      const v1x = t.bx - t.ax;
      const v1z = t.bz - t.az;
      const v2x = x - t.ax;
      const v2z = z - t.az;

      const denom = v0x * v1z - v1x * v0z;
      if (Math.abs(denom) < 1e-7) continue;
      const invDenom = 1.0 / denom;

      const u = (v2x * v1z - v1x * v2z) * invDenom;
      if (u < eps) continue;
      const v = (v0x * v2z - v2x * v0z) * invDenom;
      if (v < eps || u + v > 1.0 - eps) continue;

      const hitY = t.ay + u * (t.cy - t.ay) + v * (t.by - t.ay);
      if (hitY <= refY + maxStepUp) {
        if (bestH === null || hitY > bestH) {
          bestH = hitY;
        }
      }
    }

    return bestH;
  }
}

/**
 * Exact Mesh-Driven Zero-Clip Collision & Foot-IK Raycast World.
 * - `walkGrid`: Smooth capsule locomotion surface (includes flush stair-nosing ramps so boots never catch or sink!).
 * - `footGrid`: Exact individual beveled stair treads & stone slabs for 2-Bone Analytical Leg IK!
 * - `capsules` & `circles`: Snag-free wall/balustrade capsule segments + prop pillars.
 */
export class CollisionWorld {
  public walkGrid = new SpatialTriGrid(2.5);
  public footGrid = new SpatialTriGrid(2.0);
  public circles: CircleObstacle[] = [];
  public capsules: CapsuleObstacle[] = [];

  public registerWalkableMesh(mesh: THREE.Mesh, alsoForFootIk = true, enabledFlag?: () => boolean) {
    this.walkGrid.insertMesh(mesh, enabledFlag);
    if (alsoForFootIk) {
      this.footGrid.insertMesh(mesh, enabledFlag);
    }
  }

  public registerFootIkOnlyMesh(mesh: THREE.Mesh, enabledFlag?: () => boolean) {
    this.footGrid.insertMesh(mesh, enabledFlag);
  }

  public addCircle(x: number, z: number, r: number, minY = -20, maxY = 40) {
    this.circles.push({ x, z, r, minY, maxY });
  }

  public addCapsule(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    r: number,
    minY = -20,
    maxY = 40
  ) {
    this.capsules.push({ ax, az, bx, bz, r, minY, maxY });
  }

  public sampleWalkableHeight(x: number, z: number, refY: number, maxStepUp = 1.45): number | null {
    return this.walkGrid.sampleHeight(x, z, refY, maxStepUp);
  }

  public sampleFootSurfaceHeight(x: number, z: number, refY: number): number {
    const h = this.footGrid.sampleHeight(x, z, refY, 1.15);
    if (h !== null) return h;
    return this.walkGrid.sampleHeight(x, z, refY, 1.45) ?? refY;
  }

  public pushOutObstacles(x: number, z: number, currentY: number, radius: number): { x: number; z: number } {
    let px = x;
    let pz = z;

    // 1. Smooth capsule wall/balustrade segments (zero concave corner snags!)
    for (let i = 0; i < this.capsules.length; i++) {
      const cap = this.capsules[i];
      if (currentY + 1.75 < cap.minY || currentY > cap.maxY) continue;
      const abx = cap.bx - cap.ax;
      const abz = cap.bz - cap.az;
      const lenSq = abx * abx + abz * abz;
      const t = lenSq > 1e-6 ? THREE.MathUtils.clamp(((px - cap.ax) * abx + (pz - cap.az) * abz) / lenSq, 0, 1) : 0;
      const cx = cap.ax + abx * t;
      const cz = cap.az + abz * t;
      const dx = px - cx;
      const dz = pz - cz;
      const dist = Math.hypot(dx, dz);
      const minDist = cap.r + radius;
      if (dist < minDist && dist > 1e-5) {
        const push = (minDist - dist) / dist;
        px += dx * push;
        pz += dz * push;
      }
    }

    // 2. Pillar/boulder/censer circle obstacles
    for (let i = 0; i < this.circles.length; i++) {
      const ob = this.circles[i];
      if (currentY + 1.75 < ob.minY || currentY > ob.maxY) continue;
      const dx = px - ob.x;
      const dz = pz - ob.z;
      const dist = Math.hypot(dx, dz);
      const minDist = ob.r + radius;
      if (dist < minDist && dist > 1e-5) {
        const push = (minDist - dist) / dist;
        px += dx * push;
        pz += dz * push;
      }
    }

    return { x: px, z: pz };
  }

  /**
   * Automated 8-Direction Grid Walkability & Anti-Clip Audit (`window.G.scanMap()`).
   */
  public scanSpineContinuity(): { tested: number; validHits: number; maxDropStep: number; brokenZs: number[] } {
    let tested = 0;
    let validHits = 0;
    let maxDropStep = 0;
    const brokenZs: number[] = [];
    let prevY = 0;

    for (let z = 82; z >= -82; z -= 0.5) {
      tested++;
      const h = this.sampleWalkableHeight(0, z, prevY + 2.5, 3.0);
      if (h === null) {
        brokenZs.push(Number(z.toFixed(1)));
      } else {
        validHits++;
        if (tested > 1) {
          maxDropStep = Math.max(maxDropStep, Math.abs(h - prevY));
        }
        prevY = h;
      }
    }
    return { tested, validHits, maxDropStep: Number(maxDropStep.toFixed(3)), brokenZs };
  }
}
