import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import CostItemPicker from '@/components/common/CostItemPicker';
import { formatCurrency } from '@/utils/formatting';
import type { OfferteSectionItem, OfferteSectionType, LayerFunction } from '@/types/costModel';
import { ProjectInfoEditor } from './ProjectInfoEditor';
import { ImageUploader } from './ImageUploader';
import './OfferteView.css';

export function OfferteView() {
  const { t } = useTranslation('common');
  const offerte = useAppStore(s => s.offerte);
  const activeSectionId = useAppStore(s => s.activeSectionId);
  const setActiveSectionId = useAppStore(s => s.setActiveSectionId);
  const addSection = useAppStore(s => s.addSection);
  const removeSection = useAppStore(s => s.removeSection);
  const updateSection = useAppStore(s => s.updateSection);
  const moveSectionUp = useAppStore(s => s.moveSectionUp);
  const moveSectionDown = useAppStore(s => s.moveSectionDown);
  const addSectionItem = useAppStore(s => s.addSectionItem);
  const removeSectionItem = useAppStore(s => s.removeSectionItem);
  const updateSectionItem = useAppStore(s => s.updateSectionItem);
  const setOfferteField = useAppStore(s => s.setOfferteField);
  const setGeadresseerde = useAppStore(s => s.setGeadresseerde);
  const setOfferteType = useAppStore(s => s.setOfferteType);
  const addBetalingsTermijn = useAppStore(s => s.addBetalingsTermijn);
  const removeBetalingsTermijn = useAppStore(s => s.removeBetalingsTermijn);
  const updateBetalingsTermijn = useAppStore(s => s.updateBetalingsTermijn);
  const addGarantie = useAppStore(s => s.addGarantie);
  const removeGarantie = useAppStore(s => s.removeGarantie);
  const updateGarantie = useAppStore(s => s.updateGarantie);
  const updateOndertekenaar = useAppStore(s => s.updateOndertekenaar);
  const addProperty = useAppStore(s => s.addProperty);
  const removeProperty = useAppStore(s => s.removeProperty);
  const updateProperty = useAppStore(s => s.updateProperty);
  const addLayer = useAppStore(s => s.addLayer);
  const removeLayer = useAppStore(s => s.removeLayer);
  const updateLayer = useAppStore(s => s.updateLayer);
  const moveLayerUp = useAppStore(s => s.moveLayerUp);
  const moveLayerDown = useAppStore(s => s.moveLayerDown);
  const linkSectionItemToCostItem = useAppStore(s => s.linkSectionItemToCostItem);
  const unlinkSectionItemFromCostItem = useAppStore(s => s.unlinkSectionItemFromCostItem);
  const syncSectiesMetHoofdstukken = useAppStore(s => s.syncSectiesMetHoofdstukken);
  const items = useAppStore(s => s.items);
  const addImage = useAppStore(s => s.addImage);
  const removeImage = useAppStore(s => s.removeImage);
  const updateImage = useAppStore(s => s.updateImage);
  const addSubItem = useAppStore(s => s.addSubItem);
  const removeSubItem = useAppStore(s => s.removeSubItem);
  const updateSubItem = useAppStore(s => s.updateSubItem);
  const projectInfo = useAppStore(s => s.projectInfo);
  const setProjectInfo = useAppStore(s => s.setProjectInfo);

  const [linkingItem, setLinkingItem] = useState<{ sectionId: string; item: OfferteSectionItem } | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => setExpandedItems(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const activeSection = useMemo(
    () => offerte.secties.find(s => s.id === activeSectionId) ?? null,
    [offerte.secties, activeSectionId]
  );

  const chapters = useMemo(
    () => items.filter(i => i.rowType === 'chapter' && i.depth === 0),
    [items]
  );

  // Kostinformatie naast het tekstdeel: totaal van het gekoppelde hoofdstuk.
  const chapterTotalOf = (chapterId: string | null): number | null => {
    if (!chapterId) return null;
    const ch = chapters.find(c => c.id === chapterId);
    return ch ? ch.total : null;
  };

  const totalTermijnen = offerte.betalingstermijnen.reduce((sum, term) => sum + term.percentage, 0);

  return (
    <div className="offerte-view">
      <div className="offerte-main">
        {/* Left: Section navigator */}
        <div className="offerte-nav">
          <div className="offerte-nav-header">
            <h3>{t("offerte.title")}</h3>
            <select
              className="offerte-type-select"
              value={offerte.type}
              onChange={e => setOfferteType(e.target.value as any)}
            >
              <option value="particulier">{t("offerte.typeParticulier")}</option>
              <option value="raw">{t("offerte.typeRaw")}</option>
              <option value="eenvoudig">{t("offerte.typeEenvoudig")}</option>
            </select>
          </div>

          {/* Meta section */}
          <div
            className={`offerte-nav-item meta ${activeSectionId === '__meta' ? 'active' : ''}`}
            onClick={() => setActiveSectionId('__meta')}
          >
            <span className="nav-icon">📋</span>
            <span>{t("offerte.dataAndSalutation")}</span>
          </div>

          <div
            className={`offerte-nav-item ${activeSectionId === '__projectinfo' ? 'active' : ''}`}
            onClick={() => setActiveSectionId('__projectinfo')}
          >
            <span className="nav-icon">🏗️</span>
            <span>Projectgegevens</span>
          </div>

          {/* Sections */}
          {offerte.secties.map((sec, idx) => (
            <div
              key={sec.id}
              className={`offerte-nav-item ${sec.id === activeSectionId ? 'active' : ''}`}
              onClick={() => setActiveSectionId(sec.id)}
            >
              <span className="nav-icon">
                {sec.type === 'technisch' ? '🔧' : sec.type === 'opties' ? '➕' : sec.type === 'meerwerk' ? '🔨' : sec.type === 'opdrachtgever' ? '👤' : sec.type === 'betalingstermijnen' ? '💰' : sec.type === 'garanties' ? '🛡️' : '📄'}
              </span>
              <span className="nav-label">{sec.titel}</span>
              {sec.linkedChapterId && chapterTotalOf(sec.linkedChapterId) !== null && (
                <span className="nav-amount">{formatCurrency(chapterTotalOf(sec.linkedChapterId)!)}</span>
              )}
              <div className="nav-actions">
                <button className="nav-btn" onClick={e => { e.stopPropagation(); moveSectionUp(sec.id); }} disabled={idx === 0}>↑</button>
                <button className="nav-btn" onClick={e => { e.stopPropagation(); moveSectionDown(sec.id); }} disabled={idx === offerte.secties.length - 1}>↓</button>
                <button className="nav-btn del" onClick={e => { e.stopPropagation(); removeSection(sec.id); }}>×</button>
              </div>
            </div>
          ))}

          {/* Betalingstermijnen & Garanties (fixed) */}
          <div
            className={`offerte-nav-item ${activeSectionId === '__termijnen' ? 'active' : ''}`}
            onClick={() => setActiveSectionId('__termijnen')}
          >
            <span className="nav-icon">💰</span>
            <span>{t("offerte.paymentTerms")}</span>
          </div>
          <div
            className={`offerte-nav-item ${activeSectionId === '__garanties' ? 'active' : ''}`}
            onClick={() => setActiveSectionId('__garanties')}
          >
            <span className="nav-icon">🛡️</span>
            <span>{t("offerte.warranties")}</span>
          </div>
          <div
            className={`offerte-nav-item ${activeSectionId === '__ondertekening' ? 'active' : ''}`}
            onClick={() => setActiveSectionId('__ondertekening')}
          >
            <span className="nav-icon">✍️</span>
            <span>{t("offerte.signature")}</span>
          </div>

          {/* Add section button */}
          <div className="offerte-add-section">
            <select
              onChange={e => {
                const type = e.target.value as OfferteSectionType;
                if (type) {
                  const id = addSection(type);
                  setActiveSectionId(id);
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>{t("offerte.addSection")}</option>
              <option value="technisch">{t("offerte.technicalDescription")}</option>
              <option value="opties">{t("offerte.optionsExtras")}</option>
              <option value="opdrachtgever">{t("offerte.clientArranged")}</option>
              <option value="vrij">{t("offerte.freeSection")}</option>
            </select>
            <button
              className="offerte-sync-btn"
              title="Maak per hoofdstuk uit de begroting een sectie met een eigen tekstdeel; bestaande gekoppelde secties blijven staan"
              onClick={() => {
                const n = syncSectiesMetHoofdstukken();
                if (n === 0) window.alert('Alle hoofdstukken hebben al een gekoppelde sectie.');
              }}
            >
              ⇪ Hoofdstukken uit begroting overnemen
            </button>
          </div>
        </div>

        {/* Center: Section editor */}
        <div className="offerte-editor">
          {/* Meta editor */}
          {activeSectionId === '__meta' && (
            <div className="offerte-meta-editor">
              <h3>{t("offerte.quotationDetails")}</h3>
              <div className="offerte-form-grid">
                <label>{t("offerte.quotationNumber")}</label>
                <input value={offerte.offerteNummer} onChange={e => setOfferteField({ offerteNummer: e.target.value })} placeholder="AC247" />
                <label>{t("offerte.date")}</label>
                <input type="date" value={offerte.offerteDatum} onChange={e => setOfferteField({ offerteDatum: e.target.value })} />
                <label>{t("offerte.validityDays")}</label>
                <input type="number" value={offerte.geldigheid} onChange={e => setOfferteField({ geldigheid: parseInt(e.target.value) || 30 })} />
              </div>

              <h4>{t("offerte.addressee")}</h4>
              <div className="offerte-form-grid">
                <label>{t("offerte.name")}</label>
                <input value={offerte.geadresseerde.naam} onChange={e => setGeadresseerde({ naam: e.target.value })} />
                <label>{t("offerte.address")}</label>
                <input value={offerte.geadresseerde.adres} onChange={e => setGeadresseerde({ adres: e.target.value })} />
                <label>{t("offerte.postalCode")}</label>
                <input value={offerte.geadresseerde.postcode} onChange={e => setGeadresseerde({ postcode: e.target.value })} />
                <label>{t("offerte.city")}</label>
                <input value={offerte.geadresseerde.plaats} onChange={e => setGeadresseerde({ plaats: e.target.value })} />
              </div>

              <h4>{t("offerte.coverLetter")}</h4>
              <textarea
                className="offerte-richtext"
                rows={8}
                value={offerte.begeleidendSchrijven}
                onChange={e => setOfferteField({ begeleidendSchrijven: e.target.value })}
                placeholder={t("offerte.coverLetterPlaceholder")}
              />

              <h4>{t("offerte.conditions")}</h4>
              <textarea
                className="offerte-richtext"
                rows={4}
                value={offerte.voorwaarden}
                onChange={e => setOfferteField({ voorwaarden: e.target.value })}
              />
            </div>
          )}

          {/* ProjectInfo editor */}
          {activeSectionId === '__projectinfo' && (
            <ProjectInfoEditor projectInfo={projectInfo} onChange={setProjectInfo} />
          )}

          {/* Section editor */}
          {activeSection && activeSection.type !== 'meerwerk' && (
            <div className="offerte-section-editor">
              <div className="section-header">
                <input
                  className="section-title-input"
                  value={activeSection.titel}
                  onChange={e => updateSection(activeSection.id, { titel: e.target.value })}
                />
                <select
                  className="section-chapter-link"
                  value={activeSection.linkedChapterId ?? ''}
                  onChange={e => updateSection(activeSection.id, { linkedChapterId: e.target.value || null })}
                >
                  <option value="">{t("offerte.noLink")}</option>
                  {chapters.map(ch => (
                    <option key={ch.id} value={ch.id}>{ch.description}</option>
                  ))}
                </select>
                {chapterTotalOf(activeSection.linkedChapterId) !== null && (
                  <span className="section-chapter-total" title="Totaal van het gekoppelde hoofdstuk uit de begroting">
                    {formatCurrency(chapterTotalOf(activeSection.linkedChapterId)!)}
                  </span>
                )}
              </div>

              <textarea
                className="section-text"
                rows={3}
                value={activeSection.begeleidendeTekst}
                onChange={e => updateSection(activeSection.id, { begeleidendeTekst: e.target.value })}
                placeholder={t("offerte.sectionNotePlaceholder")}
              />

              {/* Items table */}
              <div className="section-items">
                <table className="offerte-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: 28 }}></th>
                      <th className="col-onderdeel">{t("offerte.component")}</th>
                      <th className="col-omschrijving">{t("offerte.descriptionLabel")}</th>
                      <th className="col-afbeelding">{t("offerte.image")}</th>
                      <th className="col-actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSection.items.map(item => {
                      const isExpanded = expandedItems.has(item.id);
                      const linkedCostItem = item.linkedCostItemId ? items.find(i => i.id === item.linkedCostItemId) : null;
                      return (
                        <React.Fragment key={item.id}>
                          <tr>
                            <td>
                              <button className="offerte-expand-btn" onClick={() => toggleExpand(item.id)}>
                                {isExpanded ? '▾' : '▸'}
                              </button>
                            </td>
                            <td>
                              <input
                                className="item-input"
                                value={item.onderdeel}
                                onChange={e => updateSectionItem(activeSection.id, item.id, { onderdeel: e.target.value })}
                                placeholder={t("offerte.component")}
                              />
                            </td>
                            <td>
                              <textarea
                                className="item-textarea"
                                rows={3}
                                value={item.omschrijving}
                                onChange={e => updateSectionItem(activeSection.id, item.id, { omschrijving: e.target.value })}
                                placeholder={t("offerte.descriptionPlaceholder")}
                              />
                            </td>
                            <td>
                              <input
                                className="item-input"
                                value={item.afbeeldingPath ?? ''}
                                onChange={e => updateSectionItem(activeSection.id, item.id, { afbeeldingPath: e.target.value || null })}
                                placeholder={t("offerte.imagePath")}
                              />
                            </td>
                            <td>
                              <button className="item-del" onClick={() => removeSectionItem(activeSection.id, item.id)}>×</button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="offerte-item-detail-row">
                              <td colSpan={5} className="offerte-item-detail">
                                {/* Cost item link */}
                                <div className="offerte-item-link">
                                  <span className="offerte-detail-label">{t("offerte.linkedCostItem")}:</span>
                                  {linkedCostItem ? (
                                    <span className="offerte-linked-item">
                                      {linkedCostItem.code && <span className="cost-picker-code">{linkedCostItem.code}</span>}
                                      {linkedCostItem.description}
                                      {linkedCostItem.total != null && ` — ${formatCurrency(linkedCostItem.total)}`}
                                      <button className="offerte-link-btn" onClick={() => setLinkingItem({ sectionId: activeSection.id, item })}>Wijzig</button>
                                      <button className="offerte-link-btn del" onClick={() => unlinkSectionItemFromCostItem(activeSection.id, item.id)}>×</button>
                                    </span>
                                  ) : (
                                    <button className="offerte-link-btn" onClick={() => setLinkingItem({ sectionId: activeSection.id, item })}>Koppel...</button>
                                  )}
                                </div>

                                {/* Properties sub-table */}
                                <div className="offerte-detail-label">{t("offerte.properties")}</div>
                                <table className="offerte-props-table">
                                  <thead>
                                    <tr>
                                      <th>{t("offerte.propName")}</th>
                                      <th>{t("offerte.propValue")}</th>
                                      <th>{t("offerte.propUnit")}</th>
                                      <th style={{ width: 24 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.properties.map(prop => (
                                      <tr key={prop.id}>
                                        <td><input className="item-input" value={prop.name} onChange={e => updateProperty(activeSection.id, item.id, prop.id, { name: e.target.value })} /></td>
                                        <td><input className="item-input" value={prop.value} onChange={e => updateProperty(activeSection.id, item.id, prop.id, { value: e.target.value })} /></td>
                                        <td><input className="item-input" value={prop.unit ?? ''} onChange={e => updateProperty(activeSection.id, item.id, prop.id, { unit: e.target.value || undefined })} /></td>
                                        <td><button className="item-del" onClick={() => removeProperty(activeSection.id, item.id, prop.id)}>×</button></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <button className="offerte-add-btn-sm" onClick={() => addProperty(activeSection.id, item.id)}>+ {t("offerte.addProperty")}</button>

                                {/* Layers sub-table */}
                                <div className="offerte-detail-label">{t("offerte.layers")}</div>
                                <table className="offerte-layers-table">
                                  <thead>
                                    <tr>
                                      <th>{t("offerte.layerMaterial")}</th>
                                      <th style={{ width: 80 }}>{t("offerte.layerThickness")}</th>
                                      <th style={{ width: 120 }}>{t("offerte.layerFunction")}</th>
                                      <th style={{ width: 60 }}>Rc</th>
                                      <th style={{ width: 72 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.layers.map((layer, layerIdx) => (
                                      <tr key={layer.id}>
                                        <td><input className="item-input" value={layer.material} onChange={e => updateLayer(activeSection.id, item.id, layer.id, { material: e.target.value })} /></td>
                                        <td><input className="item-input" type="number" value={layer.thickness ?? ''} onChange={e => updateLayer(activeSection.id, item.id, layer.id, { thickness: e.target.value ? parseFloat(e.target.value) : null })} /></td>
                                        <td>
                                          <select className="item-input" value={layer.function} onChange={e => updateLayer(activeSection.id, item.id, layer.id, { function: e.target.value as LayerFunction })}>
                                            <option value="constructie">Constructie</option>
                                            <option value="isolatie">Isolatie</option>
                                            <option value="beplating">Beplating</option>
                                            <option value="afwerking">Afwerking</option>
                                            <option value="folie">Folie</option>
                                            <option value="overig">Overig</option>
                                          </select>
                                        </td>
                                        <td><input className="item-input" type="number" value={layer.rcValue ?? ''} onChange={e => updateLayer(activeSection.id, item.id, layer.id, { rcValue: e.target.value ? parseFloat(e.target.value) : null })} /></td>
                                        <td>
                                          <button className="nav-btn" onClick={() => moveLayerUp(activeSection.id, item.id, layer.id)} disabled={layerIdx === 0}>↑</button>
                                          <button className="nav-btn" onClick={() => moveLayerDown(activeSection.id, item.id, layer.id)} disabled={layerIdx === item.layers.length - 1}>↓</button>
                                          <button className="item-del" onClick={() => removeLayer(activeSection.id, item.id, layer.id)}>×</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <button className="offerte-add-btn-sm" onClick={() => addLayer(activeSection.id, item.id)}>+ {t("offerte.addLayer")}</button>

                                <h5 style={{ marginTop: 12 }}>Afbeeldingen</h5>
                                <ImageUploader
                                  images={item.afbeeldingen}
                                  onAdd={(img) => addImage(activeSection!.id, item.id, img)}
                                  onRemove={(imgId) => removeImage(activeSection!.id, item.id, imgId)}
                                  onUpdateCaption={(imgId, caption) => updateImage(activeSection!.id, item.id, imgId, { caption })}
                                />

                                <h5 style={{ marginTop: 12 }}>Sub-specificaties</h5>
                                <div className="offerte-subitems">
                                  {item.subItems.map((text, idx) => (
                                    <div key={idx} className="offerte-subitem-row">
                                      <span>•</span>
                                      <input
                                        type="text"
                                        value={text}
                                        onChange={(e) => updateSubItem(activeSection!.id, item.id, idx, e.target.value)}
                                      />
                                      <button onClick={() => removeSubItem(activeSection!.id, item.id, idx)}>✕</button>
                                    </div>
                                  ))}
                                  <button
                                    className="offerte-add-btn"
                                    onClick={() => addSubItem(activeSection!.id, item.id, '')}
                                  >
                                    + Sub-item
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <button className="add-item-btn" onClick={() => addSectionItem(activeSection.id)}>{t("offerte.addItem")}</button>
              </div>
            </div>
          )}

          {/* Meerwerk section editor */}
          {activeSection && activeSection.type === 'meerwerk' && (
            <div className="offerte-section-editor">
              <div className="section-header">
                <input
                  className="section-title-input"
                  value={activeSection.titel}
                  onChange={e => updateSection(activeSection.id, { titel: e.target.value })}
                />
              </div>

              <textarea
                className="section-text"
                rows={3}
                value={activeSection.begeleidendeTekst}
                onChange={e => updateSection(activeSection.id, { begeleidendeTekst: e.target.value })}
                placeholder={t("offerte.sectionNotePlaceholder")}
              />

              <div className="section-items">
                <table className="offerte-items-table">
                  <thead>
                    <tr>
                      <th className="col-onderdeel">{t("offerte.component")}</th>
                      <th className="col-omschrijving">{t("offerte.descriptionLabel")}</th>
                      <th style={{ width: 100, textAlign: 'right' }}>{t("offerte.price")}</th>
                      <th style={{ width: 80 }}>{t("offerte.perUnit")}</th>
                      <th style={{ width: 40, textAlign: 'center' }}>Sel.</th>
                      <th className="col-actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSection.items.map(item => (
                      <tr key={item.id} className={item.isSelected ? 'meerwerk-selected' : ''}>
                        <td>
                          <input
                            className="item-input"
                            value={item.onderdeel}
                            onChange={e => updateSectionItem(activeSection.id, item.id, { onderdeel: e.target.value })}
                            placeholder={t("offerte.component")}
                          />
                        </td>
                        <td>
                          <input
                            className="item-input"
                            value={item.omschrijving}
                            onChange={e => updateSectionItem(activeSection.id, item.id, { omschrijving: e.target.value })}
                            placeholder={t("offerte.descriptionPlaceholder")}
                          />
                        </td>
                        <td>
                          <input
                            className="item-input"
                            type="number"
                            style={{ textAlign: 'right' }}
                            value={item.pricePerUnit ?? ''}
                            onChange={e => updateSectionItem(activeSection.id, item.id, { pricePerUnit: e.target.value ? parseFloat(e.target.value) : null })}
                          />
                        </td>
                        <td>
                          <input
                            className="item-input"
                            value={item.priceUnit ?? ''}
                            onChange={e => updateSectionItem(activeSection.id, item.id, { priceUnit: e.target.value || null })}
                            placeholder="st"
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={item.isSelected}
                            onChange={e => updateSectionItem(activeSection.id, item.id, { isSelected: e.target.checked })}
                          />
                        </td>
                        <td>
                          <button className="item-del" onClick={() => removeSectionItem(activeSection.id, item.id)}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="meerwerk-total">
                  {t("offerte.meerwerkSelected")}: {formatCurrency(
                    activeSection.items
                      .filter(i => i.isSelected && i.pricePerUnit != null)
                      .reduce((sum, i) => sum + (i.pricePerUnit ?? 0), 0)
                  )}
                </div>
                <button className="add-item-btn" onClick={() => addSectionItem(activeSection.id)}>{t("offerte.addItem")}</button>
              </div>
            </div>
          )}

          {/* Betalingstermijnen editor */}
          {activeSectionId === '__termijnen' && (
            <div className="offerte-termijnen-editor">
              <h3>{t("offerte.paymentTerms")}</h3>
              <p className="termijn-total" style={{ color: totalTermijnen === 100 ? 'var(--theme-text)' : '#dc2626' }}>
                {t("offerte.totalLabel")}: {totalTermijnen}% {totalTermijnen !== 100 && t("offerte.mustBe100")}
              </p>
              <table className="offerte-items-table">
                <thead>
                  <tr>
                    <th>{t("offerte.descriptionLabel")}</th>
                    <th style={{ width: 70, textAlign: 'right' }}>%</th>
                    <th>{t("offerte.explanation")}</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {offerte.betalingstermijnen.map(term => (
                    <tr key={term.id}>
                      <td><input className="item-input" value={term.beschrijving} onChange={e => updateBetalingsTermijn(term.id, { beschrijving: e.target.value })} /></td>
                      <td><input className="item-input" type="number" style={{ textAlign: 'right' }} value={term.percentage} onChange={e => updateBetalingsTermijn(term.id, { percentage: parseFloat(e.target.value) || 0 })} /></td>
                      <td><input className="item-input" value={term.toelichting} onChange={e => updateBetalingsTermijn(term.id, { toelichting: e.target.value })} placeholder={t("offerte.explanation")} /></td>
                      <td><button className="item-del" onClick={() => removeBetalingsTermijn(term.id)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="add-item-btn" onClick={addBetalingsTermijn}>{t("offerte.addPaymentTerm")}</button>
            </div>
          )}

          {/* Garanties editor */}
          {activeSectionId === '__garanties' && (
            <div className="offerte-garanties-editor">
              <h3>{t("offerte.warranties")}</h3>
              <table className="offerte-items-table">
                <thead>
                  <tr>
                    <th>{t("offerte.component")}</th>
                    <th style={{ width: 100 }}>{t("offerte.term")}</th>
                    <th>{t("offerte.explanation")}</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {offerte.garanties.map(g => (
                    <tr key={g.id}>
                      <td><input className="item-input" value={g.onderdeel} onChange={e => updateGarantie(g.id, { onderdeel: e.target.value })} /></td>
                      <td><input className="item-input" value={g.termijn} onChange={e => updateGarantie(g.id, { termijn: e.target.value })} placeholder={t("offerte.termPlaceholder")} /></td>
                      <td><input className="item-input" value={g.toelichting} onChange={e => updateGarantie(g.id, { toelichting: e.target.value })} /></td>
                      <td><button className="item-del" onClick={() => removeGarantie(g.id)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="add-item-btn" onClick={addGarantie}>{t("offerte.addWarranty")}</button>
            </div>
          )}

          {/* Ondertekening editor */}
          {activeSectionId === '__ondertekening' && (
            <div className="offerte-ondertekening-editor">
              <h3>{t("offerte.signature")}</h3>
              {offerte.ondertekening.map((o, idx) => (
                <div key={idx} className="offerte-form-grid">
                  <label>{t("offerte.name")}</label>
                  <input value={o.naam} onChange={e => updateOndertekenaar(idx, { naam: e.target.value })} />
                  <label>{t("offerte.function")}</label>
                  <input value={o.functie} onChange={e => updateOndertekenaar(idx, { functie: e.target.value })} />
                  <label>{t("offerte.emailLabel")}</label>
                  <input value={o.email} onChange={e => updateOndertekenaar(idx, { email: e.target.value })} />
                  <label>{t("offerte.phoneLabel")}</label>
                  <input value={o.telefoon} onChange={e => updateOndertekenaar(idx, { telefoon: e.target.value })} />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!activeSectionId && (
            <div className="offerte-empty">
              <p>{t("offerte.selectSectionHint")}</p>
            </div>
          )}
        </div>
      </div>

      {/* CostItemPicker modal */}
      <CostItemPicker
        open={linkingItem !== null}
        offerteOnderdeel={linkingItem?.item.onderdeel ?? ''}
        offerteOmschrijving={linkingItem?.item.omschrijving ?? ''}
        linkedChapterId={linkingItem ? (offerte.secties.find(s => s.id === linkingItem.sectionId)?.linkedChapterId ?? null) : null}
        currentLinkedId={linkingItem?.item.linkedCostItemId ?? null}
        onSelect={(costItemId) => {
          if (linkingItem) {
            linkSectionItemToCostItem(linkingItem.sectionId, linkingItem.item.id, costItemId);
            setLinkingItem(null);
          }
        }}
        onUnlink={() => {
          if (linkingItem) {
            unlinkSectionItemFromCostItem(linkingItem.sectionId, linkingItem.item.id);
            setLinkingItem(null);
          }
        }}
        onCancel={() => setLinkingItem(null)}
      />
    </div>
  );
}
