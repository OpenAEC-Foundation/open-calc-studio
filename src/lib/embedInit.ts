/**
 * Eerste import van de bibliotheek: markeer de app als ingebouwd en zorg voor
 * de Buffer-polyfill die enkele importers verwachten — allebei vóór de rest
 * van de modules laadt.
 */
import { Buffer } from 'buffer';
import { markEmbedded } from './hostRoot';

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;

markEmbedded();
