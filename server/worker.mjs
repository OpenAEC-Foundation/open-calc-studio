import { workerData, parentPort } from 'node:worker_threads';
import { executeTool, ApiError } from './tools.mjs';
try { parentPort.postMessage({ result: executeTool(workerData.name, workerData.args) }); }
catch (error) { parentPort.postMessage({ error: { status: error instanceof ApiError ? error.status : 500, code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR', message: error instanceof ApiError ? error.message : 'Calculation failed.' } }); }
