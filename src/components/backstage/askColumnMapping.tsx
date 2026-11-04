import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getPortalTarget } from '@/lib/hostRoot';
import ColumnMappingDialog from './ColumnMappingDialog';
import type { ColumnMapping, TabularData } from '../../services/importers';

/** Gegooid wanneer de gebruiker het koppelvenster sluit zonder te importeren. */
export class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelled');
    this.name = 'ImportCancelledError';
  }
}

/**
 * Toon het koppelvenster buiten de React-boom van de aanroeper (zoals
 * `showImportWarnings`), zodat ook "Openen" vanuit de titelbalk of het
 * startscherm de gebruiker de kolommen kan laten controleren (#40).
 * Resolvet met de gekozen mapping, of `null` bij annuleren.
 */
export function askColumnMapping(data: TabularData): Promise<ColumnMapping | null> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    getPortalTarget().appendChild(el);
    const root = createRoot(el);
    let done = false;
    const finish = (mapping: ColumnMapping | null) => {
      if (done) return; // sluiten na bevestigen mag niet nog eens annuleren
      done = true;
      resolve(mapping);
      // Na de huidige render opruimen; unmount tijdens een event-handler waarschuwt React.
      queueMicrotask(() => { root.unmount(); el.remove(); });
    };
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <ColumnMappingDialog
          open={open}
          data={data}
          onClose={() => { setOpen(false); finish(null); }}
          onConfirm={(mapping) => { setOpen(false); finish(mapping); }}
        />
      );
    }
    root.render(<Host />);
  });
}
