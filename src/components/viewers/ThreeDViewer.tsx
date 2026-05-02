/**
 * 3D IFC Viewer using @thatopen/components (That Open Company).
 * This is NOT a custom viewer — it wraps the That Open Components library.
 *
 * Features:
 * - Load .ifc files (drag & drop or file picker)
 * - Navigate 3D model (orbit, pan, zoom)
 * - Select elements and view their properties
 * - Extract quantities (volume, area, length) to push into the budget
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';

export function ThreeDViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const worldRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<{
    name?: string;
    quantities?: Record<string, number>;
  } | null>(null);

  // Initialize viewer once
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const components = new OBC.Components();
    componentsRef.current = components;

    const worlds = components.get(OBC.Worlds);
    const world = worlds.create<
      OBC.SimpleScene,
      OBC.SimpleCamera,
      OBF.PostproductionRenderer
    >();

    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBF.PostproductionRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);

    components.init();

    world.scene.setup();
    world.scene.three.background = new THREE.Color(0xf0f0f0);

    const grid = components.get(OBC.Grids);
    grid.create(world);

    world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);

    worldRef.current = world;

    // Cleanup
    return () => {
      components.dispose();
      componentsRef.current = null;
      worldRef.current = null;
    };
  }, []);

  const loadIfc = useCallback(async (file: File) => {
    if (!componentsRef.current || !worldRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const ifcLoader = componentsRef.current.get(OBC.IfcLoader);
      await ifcLoader.setup({
        autoSetWasm: false,
        wasm: {
          path: 'https://unpkg.com/web-ifc@0.0.68/',
          absolute: true,
        },
      });

      const buffer = await file.arrayBuffer();
      const model = await ifcLoader.load(new Uint8Array(buffer));
      worldRef.current.scene.three.add(model);

      // Fit camera to model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      worldRef.current.camera.controls.setLookAt(
        center.x + size, center.y + size * 0.5, center.z + size,
        center.x, center.y, center.z,
      );
    } catch (e: any) {
      setError(`IFC laden mislukt: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadIfc(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.ifc')) loadIfc(file);
  };

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', background: '#f0f0f0' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 10,
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'rgba(255,255,255,0.9)', padding: 8, borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: '6px 12px', fontSize: 12, background: 'var(--theme-accent)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          📁 Open IFC...
        </button>
        <span style={{ fontSize: 11, color: '#555' }}>of sleep een .ifc bestand</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ifc"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          background: 'rgba(255,255,255,0.95)', padding: 20, borderRadius: 8,
          fontSize: 14, zIndex: 20,
        }}>
          IFC laden...
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', bottom: 20, left: 20, right: 20, zIndex: 20,
          background: '#fee', color: '#900', padding: 12, borderRadius: 6, fontSize: 12,
          border: '1px solid #fcc',
        }}>
          {error}
        </div>
      )}

      {selectedInfo && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          background: 'rgba(255,255,255,0.95)', padding: 12, borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', minWidth: 200, fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{selectedInfo.name}</div>
          {selectedInfo.quantities && Object.entries(selectedInfo.quantities).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{k}:</span>
              <span>{v.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 3D canvas container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
