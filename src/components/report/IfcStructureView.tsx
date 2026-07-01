import React, { useMemo, useState } from 'react';
import { extractStructure, collectGuids, type IfcStructureNode, type IfcSourceStructure } from '@/services/ifc/ifcStructure';

interface Props {
  /** de eigen begroting als ifcx-JSON */
  budgetContent: string;
  /** ifcx-familiebestanden uit de cloudmap */
  folderFiles: { name: string; content?: string }[];
  /** klik op een object dat ook elders voorkomt → spring naar de bron/het object */
  onLink?: (ifcGuid: string) => void;
}

/** Eén object-rij in de boom; inklapbaar als er kinderen zijn. */
const ObjectRow: React.FC<{
  node: IfcStructureNode;
  depth: number;
  linkedGuids: Set<string>;
  guidSources: Map<string, string[]>;
  onLink?: (g: string) => void;
}> = ({ node, depth, linkedGuids, guidSources, onLink }) => {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = node.children.length > 0;
  const isLinked = !!node.ifcGuid && linkedGuids.has(node.ifcGuid);
  return (
    <>
      <div className="ifc-struct-row" style={{ paddingLeft: 6 + depth * 14 }}>
        <span
          className="ifc-struct-twisty"
          onClick={() => hasKids && setOpen(o => !o)}
          style={{ visibility: hasKids ? 'visible' : 'hidden' }}
        >{open ? '▾' : '▸'}</span>
        <span className="ifc-struct-type">{node.type}</span>
        {node.name && <span className="ifc-struct-name">{node.name}</span>}
        {isLinked && (
          <span
            className="ifc-struct-link"
            title={`Gekoppeld via ${node.ifcGuid} — komt ook voor in: ${(guidSources.get(node.ifcGuid!) ?? []).join(', ')}`}
            onClick={() => node.ifcGuid && onLink?.(node.ifcGuid)}
          >🔗 link</span>
        )}
      </div>
      {open && node.children.map(c => (
        <ObjectRow key={c.key} node={c} depth={depth + 1} linkedGuids={linkedGuids} guidSources={guidSources} onLink={onLink} />
      ))}
    </>
  );
};

/**
 * Structuurweergave: toont per bron (de eigen begroting + elk ifcx-bestand in
 * de cloudmap) de IFC-objecten als boom — type + naam, niet de ruwe code.
 * Objecten die over bronnen heen dezelfde ifcGuid delen krijgen een 🔗, zodat
 * je ze kunt herkennen en eruit kunt linken.
 */
export const IfcStructureView: React.FC<Props> = ({ budgetContent, folderFiles, onLink }) => {
  const sources: IfcSourceStructure[] = useMemo(() => {
    const list = [extractStructure('Deze begroting', budgetContent)];
    for (const f of folderFiles) list.push(extractStructure(f.name, f.content));
    return list;
  }, [budgetContent, folderFiles]);

  // guid → in welke bronnen komt hij voor (≥2 = gekoppeld)
  const { linkedGuids, guidSources } = useMemo(() => {
    const srcByGuid = new Map<string, string[]>();
    for (const s of sources) {
      for (const g of collectGuids(s)) {
        const arr = srcByGuid.get(g) ?? [];
        arr.push(s.name);
        srcByGuid.set(g, arr);
      }
    }
    const linked = new Set<string>();
    for (const [g, arr] of srcByGuid) if (arr.length >= 2) linked.add(g);
    return { linkedGuids: linked, guidSources: srcByGuid };
  }, [sources]);

  const [collapsedSrc, setCollapsedSrc] = useState<Set<string>>(new Set());
  const base = (n: string) => (n.includes('/') ? n.slice(n.lastIndexOf('/') + 1) : n);

  return (
    <div className="ifc-structure">
      {sources.map(src => {
        const open = !collapsedSrc.has(src.name);
        return (
          <div key={src.name} className="ifc-struct-source">
            <div
              className="ifc-struct-source-head"
              onClick={() => setCollapsedSrc(prev => {
                const next = new Set(prev);
                next.has(src.name) ? next.delete(src.name) : next.add(src.name);
                return next;
              })}
            >
              <span className="ifc-struct-twisty">{open ? '▾' : '▸'}</span>
              <span className="ifc-struct-source-name">{base(src.name)}</span>
              <span className="ifc-struct-source-meta">
                {src.error ? src.error : `${src.objectCount} objecten`}
              </span>
            </div>
            {open && !src.error && src.roots.map(r => (
              <ObjectRow key={r.key} node={r} depth={0} linkedGuids={linkedGuids} guidSources={guidSources} onLink={onLink} />
            ))}
          </div>
        );
      })}
    </div>
  );
};
