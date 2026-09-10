import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { createThumbnail } from '@/services/offerte/imageService';

/**
 * Logo-instellingen voor de rapportage: keuze standaard/eigen logo + upload van
 * een logo links/rechts. Zelfstandig (leest/schrijft de store) zodat het zowel
 * in een dialoog vanuit het Rapportage-lint getoond kan worden. Voorheen stond
 * dit in het eigenschappen-paneel.
 */
export const ReportLogoSettings: React.FC = () => {
  const { t } = useTranslation();
  const companyInfo = useAppStore(s => s.companyInfo);
  const setCompanyInfo = useAppStore(s => s.setCompanyInfo);
  const schedule = useAppStore(s => s.schedule);
  const setSchedule = useAppStore(s => s.setSchedule);

  const logoLeftRef = useRef<HTMLInputElement>(null);
  const logoRightRef = useRef<HTMLInputElement>(null);

  const handleLogoSelect = async (side: 'logoLeft' | 'logoRight') => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ multiple: false, filters: [{ name: t('images'), extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
      if (selected) {
        const { createOfferteImageFromPath } = await import('@/services/offerte/imageService');
        const img = await createOfferteImageFromPath(selected as string);
        setCompanyInfo({ ...companyInfo, [side]: img.thumbnail });
      }
    } catch {
      (side === 'logoLeft' ? logoLeftRef : logoRightRef).current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, side: 'logoLeft' | 'logoRight') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const thumbnail = await createThumbnail(file);
    setCompanyInfo({ ...companyInfo, [side]: thumbnail });
    e.target.value = '';
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="prop-label">{t('reportLogo.title')}</div>
        <select
          className="prop-input"
          value={schedule.reportLogoPreset ?? 'bouw1'}
          onChange={(e) => setSchedule({ reportLogoPreset: e.target.value as 'bouw1' | 'custom' })}
        >
          <option value="bouw1">{t('reportLogo.standard')}</option>
          <option value="custom">{t('reportLogo.custom')}</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {(['logoLeft', 'logoRight'] as const).map(side => (
          <div key={side} style={{ flex: 1 }}>
            <div className="prop-label">{side === 'logoLeft' ? t('reportLogo.left') : t('reportLogo.right')}</div>
            <div
              style={{
                height: 64, border: '1px dashed var(--theme-border)', borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', background: 'var(--theme-surface)', overflow: 'hidden',
              }}
              onClick={() => handleLogoSelect(side)}
            >
              {companyInfo[side] ? (
                <img src={companyInfo[side]} alt={side} style={{ maxWidth: '100%', maxHeight: '100%' }} />
              ) : (
                <span style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>{t('reportLogo.choose')}</span>
              )}
            </div>
            {companyInfo[side] && (
              <button
                style={{ fontSize: 10, background: 'none', border: 'none', color: 'var(--theme-danger, #dc2626)', cursor: 'pointer', marginTop: 2, padding: 0 }}
                onClick={(e) => { e.stopPropagation(); setCompanyInfo({ ...companyInfo, [side]: '' }); }}
              >{t('reportLogo.remove')}</button>
            )}
            <input
              ref={side === 'logoLeft' ? logoLeftRef : logoRightRef}
              type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e, side)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
