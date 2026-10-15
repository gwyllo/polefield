// Brush plane and brush cursor.
import * as THREE from 'three';
import { F, P } from '../state';
import { paintPlane } from './field-viz';
import { camera, controls, renderer, scene } from './scene';

export const plane = new THREE.Plane();
export const cursor = new THREE.Group();
export const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0x17694f, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false }));
export const ballMat = new THREE.MeshBasicMaterial({ color: 0x17694f, wireframe: true, transparent: true, opacity: 0.12, depthWrite: false });
export const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), ballMat);
cursor.add(ring, ball); cursor.visible = false; scene.add(cursor);

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

/** Place the brush plane (horizontal, or facing the view at a depth) and return its normal. */
export function updatePlane(): THREE.Vector3 {
  const n = new THREE.Vector3(), p = new THREE.Vector3();
  if (P.planeMode === 'h') { n.set(0, 1, 0); p.set(0, P.planeH, 0); }
  else { camera.getWorldDirection(n); n.negate(); p.copy(controls.target).addScaledVector(n, P.planeD); }
  plane.setFromNormalAndCoplanarPoint(n, p);
  if (paintPlane) {
    paintPlane.position.copy(P.planeMode === 'h' ? new THREE.Vector3((F.min.x + F.max.x) / 2, P.planeH, (F.min.z + F.max.z) / 2) : p);
    paintPlane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  }
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return n;
}

/** Camera ray for a pointer event, in world space. */
export function pointerRay(e: { clientX: number; clientY: number }): THREE.Ray {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray;
}

export function hitPlane(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
  const r = pointerRay(e); updatePlane();
  return r.intersectPlane(plane, new THREE.Vector3());
}

export function setBrushRadius(r: number): void { ring.scale.setScalar(r); ball.scale.setScalar(r); }
