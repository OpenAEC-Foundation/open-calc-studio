import { useTranslation } from 'react-i18next';
import type { ProjectInfo } from '@/types/costModel';
import { ImageUploader } from './ImageUploader';

interface ProjectInfoEditorProps {
  projectInfo: ProjectInfo;
  onChange: (updates: Partial<ProjectInfo>) => void;
}

const PROJECT_TYPES = ['waterwoning', 'woning', 'renovatie', 'utiliteit'];
const AANHEF_TYPES = ['dhr', 'mevr', 'fam', 'dhr/mevr'];

export function ProjectInfoEditor({ projectInfo, onChange }: ProjectInfoEditorProps) {
  const { t } = useTranslation();
  return (
    <div className="offerte-project-info">
      <h3>{t('projectInfo.title')}</h3>

      <div className="offerte-form-grid">
        <label>{t('projectInfo.projectType')}</label>
        <select
          value={projectInfo.projectType}
          onChange={(e) => onChange({ projectType: e.target.value })}
        >
          <option value="">{t('projectInfo.selectPlaceholder')}</option>
          {PROJECT_TYPES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>

        <label>{t('projectInfo.architect')}</label>
        <input
          type="text"
          value={projectInfo.architect}
          onChange={(e) => onChange({ architect: e.target.value })}
          placeholder={t('projectInfo.architectPlaceholder')}
        />

        <label>{t('projectInfo.location')}</label>
        <input
          type="text"
          value={projectInfo.locatie}
          onChange={(e) => onChange({ locatie: e.target.value })}
          placeholder={t('projectInfo.locationPlaceholder')}
        />

        <label>{t('projectInfo.buildMethod')}</label>
        <input
          type="text"
          value={projectInfo.bouwmethode}
          onChange={(e) => onChange({ bouwmethode: e.target.value })}
          placeholder={t('projectInfo.buildMethodPlaceholder')}
        />

        <label>{t('projectInfo.drawings')}</label>
        <input
          type="text"
          value={projectInfo.tekeningSoort}
          onChange={(e) => onChange({ tekeningSoort: e.target.value })}
          placeholder={t('projectInfo.drawingsPlaceholder')}
        />

        <label>{t('projectInfo.salutation')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={projectInfo.aanhefType}
            onChange={(e) => onChange({ aanhefType: e.target.value })}
            style={{ width: 80 }}
          >
            {AANHEF_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            type="text"
            value={projectInfo.aanhefNaam}
            onChange={(e) => onChange({ aanhefNaam: e.target.value })}
            placeholder={t('projectInfo.firstName')}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      <h4 style={{ marginTop: 16 }}>{t('projectInfo.renderings')}</h4>
      <ImageUploader
        images={projectInfo.renderImages}
        onAdd={(img) => onChange({ renderImages: [...projectInfo.renderImages, img] })}
        onRemove={(id) => onChange({ renderImages: projectInfo.renderImages.filter(i => i.id !== id) })}
        onUpdateCaption={(id, caption) =>
          onChange({ renderImages: projectInfo.renderImages.map(i => i.id === id ? { ...i, caption } : i) })
        }
      />

      <h4 style={{ marginTop: 16 }}>{t('projectInfo.projectPhotos')}</h4>
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
