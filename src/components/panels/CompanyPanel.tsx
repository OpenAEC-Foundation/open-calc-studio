import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { CompanyInfo } from '@/types/costModel';
import { createThumbnail } from '@/services/offerte/imageService';
import { BranchTreeEditor } from './BranchTreeEditor';

export const CompanyPanel: React.FC = () => {
  const { t } = useTranslation();
  const { companyInfo, setCompanyInfo } = useAppStore();

  const fields: { key: keyof CompanyInfo; label: string }[] = [
    { key: 'name', label: t('company') },
    { key: 'postalAddress', label: t('postalAddress') },
    { key: 'postalCity', label: t('postalCity') },
    { key: 'visitAddress', label: t('visitAddress') },
    { key: 'visitCity', label: t('visitCity') },
    { key: 'phone', label: t('phone') },
    { key: 'fax', label: t('fax') },
    { key: 'email', label: t('email') },
  ];

  const logoLeftRef = useRef<HTMLInputElement>(null);
  const logoRightRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (key: keyof CompanyInfo, value: string) => {
      setCompanyInfo({ ...companyInfo, [key]: value });
    },
    [companyInfo, setCompanyInfo],
  );

  const handleLogoSelect = useCallback(async (side: 'logoLeft' | 'logoRight') => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Afbeeldingen', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      });
      if (selected) {
        const { createOfferteImageFromPath } = await import('@/services/offerte/imageService');
        const img = await createOfferteImageFromPath(selected as string);
        setCompanyInfo({ ...companyInfo, [side]: img.thumbnail });
      }
    } catch {
      // Fallback to HTML file input
      const ref = side === 'logoLeft' ? logoLeftRef : logoRightRef;
      ref.current?.click();
    }
  }, [companyInfo, setCompanyInfo]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, side: 'logoLeft' | 'logoRight') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const thumbnail = await createThumbnail(file);
    setCompanyInfo({ ...companyInfo, [side]: thumbnail });
    e.target.value = '';
  }, [companyInfo, setCompanyInfo]);

  return (
    <div className="summary-panel">
      <div className="summary-card">
        <h2 className="summary-title">{t('companyDetails')}</h2>
        <p className="summary-subtitle">{t('companySubtitle')}</p>

        <div className="summary-section">
          <h3 className="summary-section-title">{t('details')}</h3>
          <div className="company-fields">
            {fields.map(({ key, label }) => (
              <div className="company-field" key={key}>
                <label className="prop-label" htmlFor={`company-${key}`}>
                  {label}
                </label>
                <input
                  id={`company-${key}`}
                  className="prop-input"
                  type={key === 'email' ? 'email' : 'text'}
                  value={companyInfo[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="summary-section">
          <h3 className="summary-section-title">Logo's rapportage</h3>
          <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
            {(['logoLeft', 'logoRight'] as const).map((side) => (
              <div key={side} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>
                  {side === 'logoLeft' ? 'Logo links' : 'Logo rechts'}
                </span>
                <div
                  style={{
                    width: 120, height: 60, border: '2px dashed var(--theme-border)',
                    borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', background: 'var(--theme-surface)', cursor: 'pointer',
                  }}
                  onClick={() => handleLogoSelect(side)}
                >
                  {companyInfo[side] ? (
                    <img src={companyInfo[side]} alt={side} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Kies logo</span>
                  )}
                </div>
                {companyInfo[side] && (
                  <button
                    style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--theme-danger)', cursor: 'pointer' }}
                    onClick={() => setCompanyInfo({ ...companyInfo, [side]: '' })}
                  >
                    Verwijder
                  </button>
                )}
              </div>
            ))}
          </div>
          <input ref={logoLeftRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, 'logoLeft')} />
          <input ref={logoRightRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileChange(e, 'logoRight')} />
        </div>

        <div className="summary-section">
          <h3 className="summary-section-title">Begrotingsvarianten</h3>
          <BranchTreeEditor />
        </div>
      </div>
    </div>
  );
};
