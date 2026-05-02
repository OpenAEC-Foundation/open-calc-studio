import type { ProjectInfo, OfferteImage } from '@/types/costModel';
import { ImageUploader } from './ImageUploader';

interface ProjectInfoEditorProps {
  projectInfo: ProjectInfo;
  onChange: (updates: Partial<ProjectInfo>) => void;
}

const PROJECT_TYPES = ['waterwoning', 'woning', 'renovatie', 'utiliteit'];
const AANHEF_TYPES = ['dhr', 'mevr', 'fam', 'dhr/mevr'];

export function ProjectInfoEditor({ projectInfo, onChange }: ProjectInfoEditorProps) {
  return (
    <div className="offerte-project-info">
      <h3>Projectgegevens</h3>

      <div className="offerte-form-grid">
        <label>Projecttype</label>
        <select
          value={projectInfo.projectType}
          onChange={(e) => onChange({ projectType: e.target.value })}
        >
          <option value="">— Selecteer —</option>
          {PROJECT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>

        <label>Architect</label>
        <input
          type="text"
          value={projectInfo.architect}
          onChange={(e) => onChange({ architect: e.target.value })}
          placeholder="bijv. Waterstudio"
        />

        <label>Locatie</label>
        <input
          type="text"
          value={projectInfo.locatie}
          onChange={(e) => onChange({ locatie: e.target.value })}
          placeholder="bijv. IJsbaanpad 86A, Amsterdam"
        />

        <label>Bouwmethode</label>
        <input
          type="text"
          value={projectInfo.bouwmethode}
          onChange={(e) => onChange({ bouwmethode: e.target.value })}
          placeholder="bijv. CLT prefab"
        />

        <label>Tekeningen</label>
        <input
          type="text"
          value={projectInfo.tekeningSoort}
          onChange={(e) => onChange({ tekeningSoort: e.target.value })}
          placeholder="bijv. door u verstrekte tekeningen"
        />

        <label>Aanhef</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={projectInfo.aanhefType}
            onChange={(e) => onChange({ aanhefType: e.target.value })}
            style={{ width: 80 }}
          >
            {AANHEF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="text"
            value={projectInfo.aanhefNaam}
            onChange={(e) => onChange({ aanhefNaam: e.target.value })}
            placeholder="Voornaam"
            style={{ flex: 1 }}
          />
        </div>
      </div>

      <h4 style={{ marginTop: 16 }}>Renderings</h4>
      <ImageUploader
        images={projectInfo.renderImages}
        onAdd={(img) => onChange({ renderImages: [...projectInfo.renderImages, img] })}
        onRemove={(id) => onChange({ renderImages: projectInfo.renderImages.filter(i => i.id !== id) })}
        onUpdateCaption={(id, caption) =>
          onChange({ renderImages: projectInfo.renderImages.map(i => i.id === id ? { ...i, caption } : i) })
        }
      />

      <h4 style={{ marginTop: 16 }}>Projectfoto's</h4>
      <ImageUploader
        images={projectInfo.projectFotos}
        onAdd={(img) => onChange({ projectFotos: [...projectInfo.projectFotos, img] })}
        onRemove={(id) => onChange({ projectFotos: projectInfo.projectFotos.filter(i => i.id !== id) })}
        onUpdateCaption={(id, caption) =>
          onChange({ projectFotos: projectInfo.projectFotos.map(i => i.id === id ? { ...i, caption } : i) })
        }
      />
    </div>
  );
}
