import type { CostItem, CostSchedule, OfferteDocument, OfferteSectionItem } from '@/types/costModel';
import { createDefaultProjectProperties } from '@/types/costModel';
import { getGrandTotal } from '@/services/calculation/calculator';
import { encodeStepString, formatStepFloat, generateIfcGuid, isoTimestamp } from './ifcHelpers';

interface StepLine {
  id: number;
  entity: string;
}

function findLinkedOfferteItem(offerte: OfferteDocument, costItemId: string): OfferteSectionItem | null {
  for (const section of offerte.secties) {
    for (const item of section.items) {
      if (item.linkedCostItemId === costItemId) return item;
    }
  }
  return null;
}

/** Een IFC GlobalId: 22 tekens uit het IFC-base64-alfabet. */
const IFC_GUID = /^[0-9A-Za-z_$]{22}$/;

export function generateIfcCostFile(schedule: CostSchedule, items: CostItem[], offerte?: OfferteDocument): string {
  const lines: StepLine[] = [];
  let nextId = 1;
  const getId = () => nextId++;
  // Elke GlobalId geldig en uniek in het bestand. Een lege, een UUID van 36 tekens of een
  // dubbele ifcGuid (gekopieerde regel) wordt in de export vervangen (knownbug 153).
  const usedGuids = new Set<string>();
  const guid = (preferred?: string | null): string => {
    let value = preferred && IFC_GUID.test(preferred) && !usedGuids.has(preferred) ? preferred : generateIfcGuid();
    while (usedGuids.has(value)) value = generateIfcGuid();
    usedGuids.add(value);
    return value;
  };

  const ts = isoTimestamp();

  // Header
  const header = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('ViewDefinition [CostView]'),'2;1');`,
    `FILE_NAME('${encodeStepString(schedule.name)}.ifc','${ts}',('${encodeStepString(schedule.author)}'),(''),'',' ','');`,
    "FILE_SCHEMA(('IFC4X3'));",
    "ENDSEC;",
    "DATA;",
  ].join('\n');

  // IfcOrganization
  const orgId = getId();
  lines.push({ id: orgId, entity: `IFCORGANIZATION($,'Open Calc Studio',$,$,$)` });

  // IfcApplication
  const appId = getId();
  lines.push({ id: appId, entity: `IFCAPPLICATION(#${orgId},'${__APP_VERSION__}','Open Calc Studio','OCS')` });

  // IfcOwnerHistory
  const personId = getId();
  lines.push({ id: personId, entity: `IFCPERSON($,'${encodeStepString(schedule.author)}','',$,$,$,$,$)` });

  const pOrgId = getId();
  lines.push({ id: pOrgId, entity: `IFCPERSONANDORGANIZATION(#${personId},#${orgId},$)` });

  const ownerHistId = getId();
  lines.push({ id: ownerHistId, entity: `IFCOWNERHISTORY(#${pOrgId},#${appId},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})` });

  // ── IfcSIUnit entries ──
  const unitLengthId = getId();
  lines.push({ id: unitLengthId, entity: `IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)` });

  const unitAreaId = getId();
  lines.push({ id: unitAreaId, entity: `IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)` });

  const unitVolumeId = getId();
  lines.push({ id: unitVolumeId, entity: `IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)` });

  // Tijd staat in uren (eenheid 'uur'): een uur-eenheid op basis van de seconde, anders lezen
  // programma's de waarden als seconden (knownbug 150).
  const unitSecondId = getId();
  lines.push({ id: unitSecondId, entity: `IFCSIUNIT(*,.TIMEUNIT.,$,.SECOND.)` });
  const timeDimsId = getId();
  lines.push({ id: timeDimsId, entity: `IFCDIMENSIONALEXPONENTS(0,0,1,0,0,0,0)` });
  const hourFactorId = getId();
  lines.push({ id: hourFactorId, entity: `IFCMEASUREWITHUNIT(IFCTIMEMEASURE(3600.),#${unitSecondId})` });
  const unitTimeId = getId();
  lines.push({ id: unitTimeId, entity: `IFCCONVERSIONBASEDUNIT(#${timeDimsId},.TIMEUNIT.,'hour',#${hourFactorId})` });

  // Gewichten staan in kg: KILO-voorvoegsel, anders zijn ze 1000x te klein (knownbug 150).
  const unitMassId = getId();
  lines.push({ id: unitMassId, entity: `IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)` });

  // IfcMonetaryUnit: de valuta van de begroting (ISO 4217), zonder omrekening.
  const monetaryUnitId = getId();
  const currency = /^[A-Z]{3}$/.test(schedule.currency ?? '') ? schedule.currency : 'EUR';
  lines.push({ id: monetaryUnitId, entity: `IFCMONETARYUNIT('${currency}')` });

  // IfcUnitAssignment
  const unitAssignId = getId();
  lines.push({
    id: unitAssignId,
    entity: `IFCUNITASSIGNMENT((#${unitLengthId},#${unitAreaId},#${unitVolumeId},#${unitTimeId},#${unitMassId},#${monetaryUnitId}))`,
  });

  // IfcProject: de eenheden horen in UnitsInContext (9e attribuut), niet in
  // RepresentationContexts (knownbug 150). De GlobalId is schedule.ifcGuid; de parser leest
  // hem hier terug, zodat hij bij een round trip gelijk blijft (knownbug 151).
  const projectId = getId();
  lines.push({
    id: projectId,
    entity: `IFCPROJECT('${guid(schedule.ifcGuid)}',#${ownerHistId},'${encodeStepString(schedule.projectName)}','${encodeStepString(schedule.description)}',$,$,$,$,#${unitAssignId})`,
  });

  // ── IfcPropertySet "OCS_ProjectMetrics" on IfcProject ──
  const projectProps = schedule.projectProperties ?? createDefaultProjectProperties();
  const grandTotal = getGrandTotal(items);
  if (projectProps.length > 0) {
    const metricPropIds: number[] = [];
    for (const prop of projectProps) {
      if (prop.value != null) {
        // Property value
        const pvId = getId();
        lines.push({
          id: pvId,
          entity: `IFCPROPERTYSINGLEVALUE('${encodeStepString(prop.name)}',$,IFCREAL(${formatStepFloat(prop.value)}),$)`,
        });
        metricPropIds.push(pvId);

        // Calculated price/unit
        if (prop.value > 0 && grandTotal > 0) {
          const pricePerUnit = grandTotal / prop.value;
          const pricePropName = `PricePer_${encodeStepString(prop.name.replace(/\s+/g, ''))}`;
          const ppId = getId();
          lines.push({
            id: ppId,
            entity: `IFCPROPERTYSINGLEVALUE('${pricePropName}',$,IFCMONETARYMEASURE(${formatStepFloat(pricePerUnit)}),$)`,
          });
          metricPropIds.push(ppId);
        }
      }
    }
    if (metricPropIds.length > 0) {
      const metricsPsetId = getId();
      lines.push({
        id: metricsPsetId,
        entity: `IFCPROPERTYSET('${guid()}',#${ownerHistId},'OCS_ProjectMetrics','Project building metrics',(${metricPropIds.map(p => `#${p}`).join(',')}))`,
      });
      const relMetricsId = getId();
      lines.push({
        id: relMetricsId,
        entity: `IFCRELDEFINESBYPROPERTIES('${guid()}',#${ownerHistId},$,$,(#${projectId}),#${metricsPsetId})`,
      });
    }
  }

  // IfcCostSchedule (IFC4X3, 10 attributen): ..., ObjectType, Identification, PredefinedType,
  // Status (tekst), SubmittedOn, UpdateDate (knownbug 151).
  const schedId = getId();
  lines.push({
    id: schedId,
    entity: `IFCCOSTSCHEDULE('${guid()}',#${ownerHistId},'${encodeStepString(schedule.name)}','${encodeStepString(schedule.description)}',$,$,.${schedule.predefinedType}.,'${encodeStepString(schedule.status)}',$,$)`,
  });

  // ── Tarieven as IfcPropertySet "OCS_Tarieven" on the IfcCostSchedule ──
  let tarievenPsetId: number | null = null;
  if (schedule.tarieven && Object.keys(schedule.tarieven).length > 0) {
    const propIds: number[] = [];
    for (const [key, value] of Object.entries(schedule.tarieven)) {
      const propId = getId();
      lines.push({
        id: propId,
        entity: `IFCPROPERTYSINGLEVALUE('Tarief_${encodeStepString(key)}',$,IFCMONETARYMEASURE(${formatStepFloat(value)}),$)`,
      });
      propIds.push(propId);
    }
    tarievenPsetId = getId();
    lines.push({
      id: tarievenPsetId,
      entity: `IFCPROPERTYSET('${guid()}',#${ownerHistId},'OCS_Tarieven','Tarieven per tariefgroep',(${propIds.map(p => `#${p}`).join(',')}))`,
    });
    const relTarievenId = getId();
    lines.push({
      id: relTarievenId,
      entity: `IFCRELDEFINESBYPROPERTIES('${guid()}',#${ownerHistId},$,$,(#${schedId}),#${tarievenPsetId})`,
    });
  }

  // ── Pset_Offerte on IfcCostSchedule ──
  if (offerte) {
    const offerteProps: number[] = [];
    if (offerte.offerteNummer) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('OfferteNummer',$,IFCLABEL('${encodeStepString(offerte.offerteNummer)}'),$)` });
      offerteProps.push(p);
    }
    if (offerte.offerteDatum) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('OfferteDatum',$,IFCDATE('${offerte.offerteDatum}'),$)` });
      offerteProps.push(p);
    }
    if (offerte.geldigheid) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('Geldigheid',$,IFCCOUNTMEASURE(${offerte.geldigheid}),$)` });
      offerteProps.push(p);
    }
    if (offerteProps.length > 0) {
      const psetId = getId();
      lines.push({ id: psetId, entity: `IFCPROPERTYSET('${guid()}',#${ownerHistId},'Pset_Offerte',$,(${offerteProps.map(p => '#' + p).join(',')}))` });
      const relId = getId();
      lines.push({ id: relId, entity: `IFCRELDEFINESBYPROPERTIES('${guid()}',#${ownerHistId},$,$,(#${schedId}),#${psetId})` });
    }
  }

  // ── Pset_ProjectInfo on IfcProject ──
  if (schedule.projectInfo) {
    const pi = schedule.projectInfo;
    const piProps: number[] = [];

    if (pi.projectType) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('ProjectType',$,IFCTEXT('${encodeStepString(pi.projectType)}'),$)` });
      piProps.push(p);
    }
    if (pi.architect) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('Architect',$,IFCTEXT('${encodeStepString(pi.architect)}'),$)` });
      piProps.push(p);
    }
    if (pi.locatie) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('Locatie',$,IFCTEXT('${encodeStepString(pi.locatie)}'),$)` });
      piProps.push(p);
    }
    if (pi.bouwmethode) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('Bouwmethode',$,IFCTEXT('${encodeStepString(pi.bouwmethode)}'),$)` });
      piProps.push(p);
    }
    if (pi.tekeningSoort) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('TekeningSoort',$,IFCTEXT('${encodeStepString(pi.tekeningSoort)}'),$)` });
      piProps.push(p);
    }
    if (pi.aanhefType) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('AanhefType',$,IFCLABEL('${encodeStepString(pi.aanhefType)}'),$)` });
      piProps.push(p);
    }
    if (pi.aanhefNaam) {
      const p = getId();
      lines.push({ id: p, entity: `IFCPROPERTYSINGLEVALUE('AanhefNaam',$,IFCTEXT('${encodeStepString(pi.aanhefNaam)}'),$)` });
      piProps.push(p);
    }

    if (piProps.length > 0) {
      const piPsetId = getId();
      lines.push({ id: piPsetId, entity: `IFCPROPERTYSET('${guid()}',#${ownerHistId},'Pset_ProjectInfo',$,(${piProps.map(p => '#' + p).join(',')}))` });
      const piRelId = getId();
      lines.push({ id: piRelId, entity: `IFCRELDEFINESBYPROPERTIES('${guid()}',#${ownerHistId},$,$,(#${projectId}),#${piPsetId})` });
    }
  }

  // Map to track item IDs
  const itemIdMap = new Map<string, number>();

  // Create IfcCostItems (including staart items)
  for (const item of items) {
    const costItemId = getId();
    itemIdMap.set(item.id, costItemId);

    // Prijzen en hoeveelheid hangen via CostValues en CostQuantities aan de post; los
    // geschreven entiteiten las niemand terug (knownbug 151).
    const costValueIds: number[] = [];
    const quantityIds: number[] = [];
    if (item.rowType !== 'chapter') {
      const hasMaterial = item.materialPrice !== null && item.materialPrice !== 0;
      const hasLabor = item.laborPrice !== null && item.laborPrice !== 0;
      // IfcCostValue (IFC4X3, 10 attributen): Name, Description, AppliedValue, UnitBasis,
      // ApplicableDate, FixedUntilDate, Category, Condition, ArithmeticOperator, Components.
      const costValue = (category: string, value: number, operator = '$', components = '$') => {
        const id = getId();
        lines.push({ id, entity: `IFCCOSTVALUE($,$,IFCMONETARYMEASURE(${formatStepFloat(value)}),$,$,$,'${category}',$,${operator},${components})` });
        return id;
      };

      if (hasMaterial && hasLabor) {
        // Materiaal + arbeid als componenten van een opgeteld bedrag (Category '*').
        const cvMatCompId = costValue('MATERIAL', item.materialPrice!);
        const cvLabCompId = costValue('LABOR', item.laborPrice!);
        const totalUnitPrice = (item.materialPrice ?? 0) + (item.laborPrice ?? 0);
        costValueIds.push(costValue('*', totalUnitPrice, '.ADD.', `(#${cvMatCompId},#${cvLabCompId})`));
      } else {
        if (hasMaterial) costValueIds.push(costValue('MATERIAL', item.materialPrice!));
        if (hasLabor) costValueIds.push(costValue('LABOR', item.laborPrice!));
      }

      // Quantity
      if (item.quantity !== null && item.quantity !== 0) {
        const qtyId = getId();
        const qtyEntity = getQuantityEntity(item.unit, item.quantity, item.description);
        lines.push({ id: qtyId, entity: qtyEntity });
        quantityIds.push(qtyId);
      }
    }

    // IfcCostItem (IFC4X3, 9 attributen): ..., ObjectType, Identification, PredefinedType,
    // CostValues, CostQuantities.
    const refList = (ids: number[]) => (ids.length ? `(${ids.map((id) => `#${id}`).join(',')})` : '$');
    lines.push({
      id: costItemId,
      entity: `IFCCOSTITEM('${guid(item.ifcGuid)}',#${ownerHistId},'${encodeStepString(item.code)}','${encodeStepString(item.description)}',$,$,$,${refList(costValueIds)},${refList(quantityIds)})`,
    });

    // ── IfcPropertySet "OCS_ItemProperties" for custom fields ──
    const propIds: number[] = [];

    // rowType
    const propRowTypeId = getId();
    lines.push({
      id: propRowTypeId,
      entity: `IFCPROPERTYSINGLEVALUE('rowType',$,IFCLABEL('${item.rowType}'),$)`,
    });
    propIds.push(propRowTypeId);

    // tariefGroep
    if (item.tariefGroep) {
      const propTgId = getId();
      lines.push({
        id: propTgId,
        entity: `IFCPROPERTYSINGLEVALUE('tariefGroep',$,IFCLABEL('${item.tariefGroep}'),$)`,
      });
      propIds.push(propTgId);
    }

    // resourceType
    if (item.resourceType) {
      const propRtId = getId();
      lines.push({
        id: propRtId,
        entity: `IFCPROPERTYSINGLEVALUE('resourceType',$,IFCLABEL('${item.resourceType}'),$)`,
      });
      propIds.push(propRtId);
    }

    // verrekenbaar
    if (item.verrekenbaar) {
      const propVkId = getId();
      lines.push({
        id: propVkId,
        entity: `IFCPROPERTYSINGLEVALUE('verrekenbaar',$,IFCLABEL('${item.verrekenbaar}'),$)`,
      });
      propIds.push(propVkId);
    }

    // Eenheid: het type hoeveelheid kent alleen m, m2, m3, kg en uur (en zonder hoeveelheid niets).
    if (item.unit) {
      const propUnitId = getId();
      lines.push({
        id: propUnitId,
        entity: `IFCPROPERTYSINGLEVALUE('unit',$,IFCLABEL('${encodeStepString(item.unit)}'),$)`,
      });
      propIds.push(propUnitId);
    }

    // staartPercentage (for staart items)
    if (item.rowType.startsWith('staart_') && item.staartPercentage !== null) {
      const propSpId = getId();
      lines.push({
        id: propSpId,
        entity: `IFCPROPERTYSINGLEVALUE('staartPercentage',$,IFCREAL(${formatStepFloat(item.staartPercentage)}),$)`,
      });
      propIds.push(propSpId);
    }

    const psetId = getId();
    lines.push({
      id: psetId,
      entity: `IFCPROPERTYSET('${guid()}',#${ownerHistId},'OCS_ItemProperties','Open Calc Studio custom properties',(${propIds.map(p => `#${p}`).join(',')}))`,
    });

    const relDefId = getId();
    lines.push({
      id: relDefId,
      entity: `IFCRELDEFINESBYPROPERTIES('${guid()}',#${ownerHistId},$,$,(#${costItemId}),#${psetId})`,
    });

    // ── Offerte-linked data per cost item ──
    if (offerte) {
      const linkedOfferteItem = findLinkedOfferteItem(offerte, item.id);

      // Pset_OfferteSpec
      if (linkedOfferteItem && linkedOfferteItem.properties.length > 0) {
        const specProps: number[] = [];
        for (const prop of linkedOfferteItem.properties) {
          const propId = getId();
          const numVal = parseFloat(prop.value);
          if (!isNaN(numVal) && prop.unit) {
            lines.push({ id: propId, entity: `IFCPROPERTYSINGLEVALUE('${encodeStepString(prop.name)}',$,IFCREAL(${formatStepFloat(numVal)}),$)` });
          } else {
            lines.push({ id: propId, entity: `IFCPROPERTYSINGLEVALUE('${encodeStepString(prop.name)}',$,IFCLABEL('${encodeStepString(prop.value)}'),$)` });
          }
          specProps.push(propId);
        }
        const specPsetId = getId();
        lines.push({ id: specPsetId, entity: `IFCPROPERTYSET('${guid()}',#${ownerHistId},'Pset_OfferteSpec',$,(${specProps.map(p => '#' + p).join(',')}))` });
        const specRelId = getId();
        lines.push({ id: specRelId, entity: `IFCRELDEFINESBYPROPERTIES('${guid()}',#${ownerHistId},$,$,(#${costItemId}),#${specPsetId})` });
      }

      // IfcMaterialLayerSet
      if (linkedOfferteItem && linkedOfferteItem.layers.length > 0) {
        const layerIds: number[] = [];
        for (const layer of linkedOfferteItem.layers) {
          const matId = getId();
          lines.push({ id: matId, entity: `IFCMATERIAL('${encodeStepString(layer.material)}')` });
          const lId = getId();
          const thickness = layer.thickness != null ? formatStepFloat(layer.thickness / 1000) : '$';
          lines.push({ id: lId, entity: `IFCMATERIALLAYER(#${matId},${thickness},.U.)` });
          layerIds.push(lId);
        }
        const setId = getId();
        lines.push({ id: setId, entity: `IFCMATERIALLAYERSET((${layerIds.map(l => '#' + l).join(',')}),'${encodeStepString(linkedOfferteItem.onderdeel)}')` });
        const matRelId = getId();
        lines.push({ id: matRelId, entity: `IFCRELASSOCIATESMATERIAL('${guid()}',#${ownerHistId},$,$,(#${costItemId}),#${setId})` });
      }

      // Pset_Meerwerk
      if (linkedOfferteItem) {
        const parentSection = offerte.secties.find(s => s.items.some(i => i.id === linkedOfferteItem.id));
        if (parentSection?.type === 'meerwerk') {
          const mwProps: number[] = [];
          const selId = getId();
          lines.push({ id: selId, entity: `IFCPROPERTYSINGLEVALUE('IsGeselecteerd',$,IFCBOOLEAN(${linkedOfferteItem.isSelected ? '.T.' : '.F.'}),$)` });
          mwProps.push(selId);
          if (linkedOfferteItem.pricePerUnit != null) {
            const ppuId = getId();
            lines.push({ id: ppuId, entity: `IFCPROPERTYSINGLEVALUE('PrijsPerEenheid',$,IFCMONETARYMEASURE(${formatStepFloat(linkedOfferteItem.pricePerUnit)}),$)` });
            mwProps.push(ppuId);
          }
          if (linkedOfferteItem.priceUnit) {
            const puId = getId();
            lines.push({ id: puId, entity: `IFCPROPERTYSINGLEVALUE('Eenheid',$,IFCLABEL('${encodeStepString(linkedOfferteItem.priceUnit)}'),$)` });
            mwProps.push(puId);
          }
          const mwPsetId = getId();
          lines.push({ id: mwPsetId, entity: `IFCPROPERTYSET('${guid()}',#${ownerHistId},'Pset_Meerwerk',$,(${mwProps.map(p => '#' + p).join(',')}))` });
          const mwRelId = getId();
          lines.push({ id: mwRelId, entity: `IFCRELDEFINESBYPROPERTIES('${guid()}',#${ownerHistId},$,$,(#${costItemId}),#${mwPsetId})` });
        }
      }
    }
  }

  // Create IfcRelNests for parent-child relationships
  const childrenByParent = new Map<string | null, CostItem[]>();
  for (const item of items) {
    const list = childrenByParent.get(item.parentId) ?? [];
    list.push(item);
    childrenByParent.set(item.parentId, list);
  }

  // Top-level items nested under schedule
  const topItems = childrenByParent.get(null) ?? [];
  if (topItems.length > 0) {
    const relId = getId();
    const relatedIds = topItems.map((i) => `#${itemIdMap.get(i.id)}`).join(',');
    lines.push({
      id: relId,
      entity: `IFCRELNESTS('${guid()}',#${ownerHistId},$,$,#${schedId},(${relatedIds}))`,
    });
  }

  // Nested chapters
  for (const [parentId, children] of childrenByParent) {
    if (parentId === null) continue;
    const parentStepId = itemIdMap.get(parentId);
    if (!parentStepId) continue;
    const relId = getId();
    const relatedIds = children.map((i) => `#${itemIdMap.get(i.id)}`).join(',');
    lines.push({
      id: relId,
      entity: `IFCRELNESTS('${guid()}',#${ownerHistId},$,$,#${parentStepId},(${relatedIds}))`,
    });
  }

  // Build output
  const dataLines = lines.map((l) => `#${l.id}=${l.entity};`).join('\n');
  return `${header}\n${dataLines}\nENDSEC;\nEND-ISO-10303-21;`;
}

function getQuantityEntity(unit: string, quantity: number, name: string): string {
  const desc = encodeStepString(name);
  const val = formatStepFloat(quantity);
  switch (unit) {
    case 'm':
      return `IFCQUANTITYLENGTH('${desc}',$,$,${val},$)`;
    case 'm²':
      return `IFCQUANTITYAREA('${desc}',$,$,${val},$)`;
    case 'm³':
      return `IFCQUANTITYVOLUME('${desc}',$,$,${val},$)`;
    case 'kg':
      return `IFCQUANTITYWEIGHT('${desc}',$,$,${val},$)`;
    case 'uur':
      return `IFCQUANTITYTIME('${desc}',$,$,${val},$)`;
    default:
      return `IFCQUANTITYCOUNT('${desc}',$,$,${val},$)`;
  }
}
