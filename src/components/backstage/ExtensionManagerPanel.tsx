import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../state/appStore';
import {
  enableExtension,
  disableExtension,
  removeExtension,
  installFromFile,
  installFromJsFile,
  fetchCatalog,
  installFromCatalog,
} from '../../extensions';
import type { InstalledExtension, CatalogEntry, ExtensionCategory } from '../../extensions/types';
import './ExtensionManagerPanel.css';

type TabId = 'installed' | 'browse';

const CATEGORY_COLORS: Record<ExtensionCategory, string> = {
  'Import/Export': '#06b6d4',
  Calculation: '#3b82f6',
  Reporting: '#8b5cf6',
  Utility: '#6b7280',
  Other: '#6b7280',
};

export default function ExtensionManagerPanel() {
  const { t } = useTranslation('backstage');
  const [activeTab, setActiveTab] = useState<TabId>('installed');
  const [search, setSearch] = useState('');

  return (
    <div className="ext-manager">
      <h2 className="ext-manager-title">{t('extensionManager.title')}</h2>

      <div className="ext-manager-toolbar">
        <div className="ext-manager-tabs">
          <button
            className={`ext-tab ${activeTab === 'installed' ? 'active' : ''}`}
            onClick={() => setActiveTab('installed')}
          >
            {t('extensionManager.installed')}
          </button>
          <button
            className={`ext-tab ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => { setActiveTab('browse'); fetchCatalog(); }}
          >
            {t('extensionManager.browse')}
          </button>
        </div>

        <div className="ext-manager-actions">
          <button className="ext-install-btn" onClick={() => installFromFile()} title={t('extensionManager.installFromZip')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            ZIP
          </button>
          <button className="ext-install-btn" onClick={() => installFromJsFile()} title={t('extensionManager.installFromJs')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" />
            </svg>
            JS
          </button>
        </div>
      </div>

      <input
        className="ext-search"
        type="text"
        placeholder={t('extensionManager.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {activeTab === 'installed' && <InstalledTab search={search} />}
      {activeTab === 'browse' && <BrowseTab search={search} />}
    </div>
  );
}

function InstalledTab({ search }: { search: string }) {
  const { t } = useTranslation('backstage');
  const extensions = useAppStore((s) => s.installedExtensions);
  const list = Object.values(extensions);

  const filtered = list.filter((ext) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      ext.manifest.name.toLowerCase().includes(q) ||
      ext.manifest.description.toLowerCase().includes(q) ||
      ext.manifest.author.toLowerCase().includes(q) ||
      ext.manifest.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (filtered.length === 0) {
    return (
      <div className="ext-empty">
        <p>{t('extensionManager.noExtensions')}</p>
        <p className="ext-empty-hint">
          {t('extensionManager.noExtensionsHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="ext-list">
      {filtered.map((ext) => (
        <InstalledExtensionCard key={ext.id} ext={ext} />
      ))}
    </div>
  );
}

function InstalledExtensionCard({ ext }: { ext: InstalledExtension }) {
  const { t } = useTranslation('backstage');
  const [removing, setRemoving] = useState(false);

  const handleToggle = useCallback(async () => {
    if (ext.status === 'enabled') {
      await disableExtension(ext.id);
    } else {
      await enableExtension(ext.id);
    }
  }, [ext.id, ext.status]);

  const handleRemove = useCallback(async () => {
    if (!removing) {
      setRemoving(true);
      return;
    }
    await removeExtension(ext.id);
  }, [ext.id, removing]);

  const isEnabled = ext.status === 'enabled';
  const isLoading = ext.status === 'loading';
  const isError = ext.status === 'error';

  return (
    <div className={`ext-card ${isError ? 'ext-card-error' : ''}`}>
      <div className="ext-card-icon">
        {ext.manifest.icon ? (
          <span dangerouslySetInnerHTML={{ __html: ext.manifest.icon }} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M9 9l6 6M15 9l-6 6" />
          </svg>
        )}
      </div>

      <div className="ext-card-body">
        <div className="ext-card-header">
          <span className="ext-card-name">{ext.manifest.name}</span>
          <span className="ext-card-version">v{ext.manifest.version}</span>
          <span
            className="ext-card-category"
            style={{ color: CATEGORY_COLORS[ext.manifest.category] || '#6b7280' }}
          >
            {ext.manifest.category}
          </span>
        </div>
        <p className="ext-card-desc">{ext.manifest.description}</p>
        <span className="ext-card-author">{ext.manifest.author}</span>
        {isError && ext.error && (
          <p className="ext-card-error-msg">{ext.error}</p>
        )}
      </div>

      <div className="ext-card-actions">
        <button
          className={`ext-toggle ${isEnabled ? 'ext-toggle-on' : ''}`}
          onClick={handleToggle}
          disabled={isLoading}
          title={isEnabled ? t('extensionManager.disable') : t('extensionManager.enable')}
        >
          <div className="ext-toggle-track">
            <div className="ext-toggle-thumb" />
          </div>
        </button>
        <button
          className={`ext-remove-btn ${removing ? 'ext-remove-confirm' : ''}`}
          onClick={handleRemove}
          title={removing ? t('extensionManager.confirmRemoveHint') : t('extensionManager.remove')}
        >
          {removing ? t('extensionManager.confirm') : t('extensionManager.removeShort')}
        </button>
      </div>
    </div>
  );
}

function BrowseTab({ search }: { search: string }) {
  const { t } = useTranslation('backstage');
  const catalogEntries = useAppStore((s) => s.catalogEntries);
  const catalogLoading = useAppStore((s) => s.catalogLoading);
  const catalogError = useAppStore((s) => s.catalogError);
  const installed = useAppStore((s) => s.installedExtensions);

  const filtered = catalogEntries.filter((entry) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      entry.name.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.author.toLowerCase().includes(q) ||
      entry.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (catalogLoading) {
    return <div className="ext-empty"><p>{t('extensionManager.catalogLoading')}</p></div>;
  }

  if (catalogError) {
    return (
      <div className="ext-empty">
        <p>{t('extensionManager.catalogError')}{catalogError}</p>
        <button className="ext-install-btn" onClick={() => fetchCatalog()} style={{ marginTop: 8 }}>
          {t('extensionManager.retry')}
        </button>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="ext-empty">
        <p>{t('extensionManager.noCatalogResults')}</p>
      </div>
    );
  }

  return (
    <div className="ext-list">
      {filtered.map((entry) => (
        <CatalogCard
          key={entry.id}
          entry={entry}
          isInstalled={!!installed[entry.id]}
        />
      ))}
    </div>
  );
}

function CatalogCard({ entry, isInstalled }: { entry: CatalogEntry; isInstalled: boolean }) {
  const { t } = useTranslation('backstage');
  const [installing, setInstalling] = useState(false);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    await installFromCatalog(entry);
    setInstalling(false);
  }, [entry]);

  return (
    <div className="ext-card">
      <div className="ext-card-icon">
        {entry.icon ? (
          <span dangerouslySetInnerHTML={{ __html: entry.icon }} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        )}
      </div>

      <div className="ext-card-body">
        <div className="ext-card-header">
          <span className="ext-card-name">{entry.name}</span>
          <span className="ext-card-version">v{entry.version}</span>
          <span
            className="ext-card-category"
            style={{ color: CATEGORY_COLORS[entry.category] || '#6b7280' }}
          >
            {entry.category}
          </span>
        </div>
        <p className="ext-card-desc">{entry.description}</p>
        <span className="ext-card-author">{entry.author}</span>
      </div>

      <div className="ext-card-actions">
        {isInstalled ? (
          <span className="ext-installed-badge">{t('extensionManager.installed')}</span>
        ) : (
          <button
            className="ext-install-btn"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? t('extensionManager.installing') : t('extensionManager.install')}
          </button>
        )}
      </div>
    </div>
  );
}
