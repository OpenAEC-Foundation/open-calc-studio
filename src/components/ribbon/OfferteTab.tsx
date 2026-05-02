import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import { reportIcon, settingsIcon, pdfExportIcon, printIcon, addChapterIcon, deleteIcon } from "./icons";
import { useAppStore } from "../../state/appStore";
import { getBuiltInTemplates, applyTemplate } from '@/services/offerte/templateService';

export default function OfferteTab() {
  const { t } = useTranslation("ribbon");
  const {
    offerte, setOfferteType, addSection, setActiveSectionId,
    activeSectionId, removeSection, createSnapshot,
    setActiveContentTab,
  } = useAppStore();

  const handleAddTechnisch = () => {
    const id = addSection('technisch');
    setActiveSectionId(id);
  };

  const handleAddOpties = () => {
    const id = addSection('opties');
    setActiveSectionId(id);
  };

  const handleAddVrij = () => {
    const id = addSection('vrij');
    setActiveSectionId(id);
  };

  const handleAddMeerwerk = () => {
    const id = addSection('meerwerk');
    setActiveSectionId(id);
    setActiveContentTab('offerte');
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("offerte.type")}>
          <RibbonButton
            icon={reportIcon}
            label={t("offerte.particulier")}
            onClick={() => setOfferteType('particulier')}
            active={offerte.type === 'particulier'}
          />
          <RibbonButton
            icon={reportIcon}
            label={t("offerte.raw")}
            onClick={() => setOfferteType('raw')}
            active={offerte.type === 'raw'}
          />
          <RibbonButton
            icon={reportIcon}
            label={t("offerte.eenvoudig")}
            onClick={() => setOfferteType('eenvoudig')}
            active={offerte.type === 'eenvoudig'}
          />
        </RibbonGroup>

        <RibbonGroup label={t("offerte.sections")}>
          <RibbonButton icon={addChapterIcon} label={t("offerte.technisch")} onClick={handleAddTechnisch} />
          <RibbonButton icon={addChapterIcon} label={t("offerte.opties")} onClick={handleAddOpties} />
          <RibbonButton icon={addChapterIcon} label={t("offerte.vrij")} onClick={handleAddVrij} />
          <RibbonButton icon={addChapterIcon} label={t("offerte.meerwerk")} onClick={handleAddMeerwerk} />
          <RibbonButton
            icon={deleteIcon}
            label={t("offerte.remove")}
            onClick={() => {
              if (activeSectionId && !activeSectionId.startsWith('__')) {
                removeSection(activeSectionId);
                setActiveSectionId(null);
              }
            }}
            disabled={!activeSectionId || activeSectionId.startsWith('__')}
          />
        </RibbonGroup>

        <RibbonGroup label={t("offerte.document")}>
          <RibbonButton icon={settingsIcon} label={t("offerte.gegevens")} onClick={() => setActiveSectionId('__meta')} />
          <RibbonButton icon={settingsIcon} label={t("offerte.termijnen")} onClick={() => setActiveSectionId('__termijnen')} />
          <RibbonButton icon={settingsIcon} label={t("offerte.garanties")} onClick={() => setActiveSectionId('__garanties')} />
        </RibbonGroup>

        <RibbonGroup label={t("offerte.version")}>
          <RibbonButton
            icon={reportIcon}
            label={t("offerte.send")}
            onClick={() => {
              const label = `${t("offerte.sentPrefix")} ${new Date().toLocaleDateString('nl-NL')}`;
              createSnapshot(label, 'verstuurd');
            }}
          />
          <RibbonButton
            icon={reportIcon}
            label={t("offerte.concept")}
            onClick={() => {
              const label = `${t("offerte.conceptPrefix")} ${new Date().toLocaleDateString('nl-NL')}`;
              createSnapshot(label, 'concept');
            }}
          />
        </RibbonGroup>

        <div className="ribbon-group">
          <div className="ribbon-group-content">
            <select
              className="ribbon-select"
              onChange={(e) => {
                const templates = getBuiltInTemplates();
                const tpl = templates.find(t => t.id === e.target.value);
                if (tpl) {
                  const items = useAppStore.getState().items;
                  const partial = applyTemplate(tpl, items);
                  useAppStore.getState().setOfferteField(partial as any);
                }
                e.target.value = '';
              }}
              defaultValue=""
            >
              <option value="" disabled>Template toepassen...</option>
              {getBuiltInTemplates().map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="ribbon-group-label">Template</div>
        </div>

        <RibbonGroup label={t("offerte.export")}>
          <RibbonButton icon={pdfExportIcon} label={t("offerte.pdfQuotation")} onClick={async () => {
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                const { save } = await import('@tauri-apps/plugin-dialog');
                const store = useAppStore.getState();

                // Gebruik map van actieve begroting, met "Offerte_<nummer>" als bestandsnaam
                const active = store.documents?.find((d) => d.id === store.activeDocumentId);
                const fileBase = `Offerte_${store.offerte.offerteNummer || 'concept'}`;
                let defaultPath = `${fileBase}.pdf`;
                if (active?.filePath) {
                  const sep = active.filePath.includes('\\') ? '\\' : '/';
                  const dir = active.filePath.substring(0, active.filePath.lastIndexOf(sep));
                  if (dir) defaultPath = `${dir}${sep}${fileBase}.pdf`;
                }

                const outputPath = await save({
                  defaultPath,
                  filters: [{ name: 'PDF', extensions: ['pdf'] }],
                });
                if (!outputPath) return;

                const request = {
                  offerte: {
                    offerteNummer: store.offerte.offerteNummer,
                    offerteDatum: store.offerte.offerteDatum,
                    geldigheid: store.offerte.geldigheid,
                    geadresseerde: store.offerte.geadresseerde,
                    begeleidendSchrijven: store.offerte.begeleidendSchrijven,
                    secties: store.offerte.secties.map(s => ({
                      titel: s.titel,
                      type: s.type,
                      begeleidendeTekst: s.begeleidendeTekst,
                      items: s.items.map(i => ({
                        onderdeel: i.onderdeel,
                        omschrijving: i.omschrijving,
                        afbeeldingen: i.afbeeldingen.map(img => ({
                          path: img.path,
                          thumbnail: img.thumbnail,
                          caption: img.caption,
                          widthMm: img.widthMm,
                        })),
                        subItems: i.subItems,
                        properties: i.properties.map(p => ({ name: p.name, value: p.value, unit: p.unit })),
                        priceOverride: i.priceOverride,
                        pricePerUnit: i.pricePerUnit,
                        priceUnit: i.priceUnit,
                        isSelected: i.isSelected,
                      })),
                    })),
                    betalingstermijnen: store.offerte.betalingstermijnen.map(t => ({
                      beschrijving: t.beschrijving,
                      percentage: t.percentage,
                      toelichting: t.toelichting,
                    })),
                    garanties: store.offerte.garanties.map(g => ({
                      onderdeel: g.onderdeel,
                      termijn: g.termijn,
                      toelichting: g.toelichting,
                    })),
                    voorwaarden: store.offerte.voorwaarden,
                    ondertekening: store.offerte.ondertekening,
                    projectInfo: store.projectInfo.projectType ? {
                      projectType: store.projectInfo.projectType,
                      architect: store.projectInfo.architect,
                      locatie: store.projectInfo.locatie,
                      bouwmethode: store.projectInfo.bouwmethode,
                    } : null,
                  },
                  schedule: {
                    name: store.schedule?.name || '',
                    projectName: store.schedule?.projectName || '',
                    projectNumber: store.schedule?.projectNumber || '',
                    client: store.schedule?.client || '',
                    author: store.schedule?.author || '',
                    description: store.schedule?.description || '',
                    status: store.schedule?.status || '',
                    algemeneKosten: store.schedule?.algemeneKosten ?? 6,
                    winstRisico: store.schedule?.winstRisico ?? 2,
                  },
                  items: store.items.map(i => ({
                    id: i.id,
                    code: i.code || '',
                    description: i.description || '',
                    nr: i.nr,
                    rowType: i.rowType,
                    quantity: i.quantity,
                    unit: i.unit || '',
                    unitPrice: i.unitPrice ?? 0,
                    total: i.total ?? 0,
                    depth: i.depth ?? 0,
                    parentId: i.parentId,
                    staartPercentage: i.staartPercentage,
                  })),
                  briefhoofdPath: null,
                };

                await invoke('generate_offerte_pdf', { request, outputPath });
              } catch (err) {
                console.error('[Offerte] PDF export failed:', err);
              }
            }} />
          <RibbonButton icon={printIcon} label={t("offerte.printBtn")} onClick={() => {}} disabled />
        </RibbonGroup>
      </div>
    </div>
  );
}
