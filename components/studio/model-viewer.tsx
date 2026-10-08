"use client";

/**
 * WebGL preview of the generated solid.
 *
 * This is the ONLY module in the studio that imports Three.js. It is loaded
 * through next/dynamic with ssr:false (see studio-editor.tsx), because Three
 * cannot server-render and is large enough that pulling it into the shared
 * client bundle would slow down every storefront page.
 *
 * It takes a plain { positions, indices } mesh - the geometry layer never
 * learns that Three exists, which is what keeps that layer testable in node.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Mesh as StudioMesh } from "@/lib/studio/types";

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  frame: number;
}

/** Brass, to match the rings and rails the rest of the storefront uses. */
const MATERIAL_COLOR = 0xb08d57;

export default function ModelViewer({ mesh }: { mesh: StudioMesh | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const objectRef = useRef<THREE.Mesh | null>(null);

  // --- Scene setup, once -------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    camera.position.set(0, -90, 70);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;

    // Three-point-ish lighting so the extruded walls read as solid rather than
    // flat silhouette, which matters when judging thickness.
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(40, -60, 80);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-50, 40, -30);
    scene.add(fill);

    const stage: Stage = { renderer, scene, camera, controls, frame: 0 };
    stageRef.current = stage;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;

      // updateStyle MUST stay on (the default). setSize always sets the canvas
      // WIDTH/HEIGHT ATTRIBUTES to size x devicePixelRatio, and only sets a CSS
      // size when updateStyle is true. Passing false without supplying CSS of
      // our own left the canvas laying out at its attribute size - so on any
      // scaled display it rendered 1.25-2x too large, overflowed its grid
      // column (grid items are min-width:auto and cannot shrink below their
      // content), and scrolled the whole page sideways.
      renderer.setSize(clientWidth, clientHeight);

      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const tick = () => {
      stage.frame = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(stage.frame);
      observer.disconnect();
      controls.dispose();

      // Releasing the WebGL context matters in development: without it every
      // hot reload leaks one, and browsers cap how many may exist at once.
      renderer.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
    };
  }, []);

  // --- Swap in new geometry whenever the mesh changes --------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (objectRef.current) {
      stage.scene.remove(objectRef.current);
      objectRef.current.geometry.dispose();
      (objectRef.current.material as THREE.Material).dispose();
      objectRef.current = null;
    }

    if (!mesh || mesh.indices.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const object = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: MATERIAL_COLOR,
        roughness: 0.45,
        metalness: 0.25,
        // Both faces, so a thin charm still reads correctly if the camera ends
        // up behind it.
        side: THREE.DoubleSide,
      }),
    );

    stage.scene.add(object);
    objectRef.current = object;

    // Frame the piece: pull the camera back to fit whatever size was chosen, so
    // changing width from 10mm to 200mm does not send it off screen.
    const radius = geometry.boundingSphere?.radius ?? 25;
    const distance = radius / Math.sin((stage.camera.fov * Math.PI) / 360);

    stage.camera.position.setLength(distance * 1.4);
    stage.camera.near = Math.max(0.1, distance / 100);
    stage.camera.far = distance * 100;
    stage.camera.updateProjectionMatrix();
    stage.controls.target.set(0, 0, 0);
    stage.controls.update();
  }, [mesh]);

  return (
    <div
      ref={containerRef}
      // The canvas is a preview, not the way the design is edited - every
      // parameter is reachable as a form control - so it is hidden from
      // assistive technology rather than announced as meaningless content.
      aria-hidden="true"
      className="h-full w-full min-h-80 cursor-grab rounded-lg bg-paper ring-1 ring-border active:cursor-grabbing"
    />
  );
}
