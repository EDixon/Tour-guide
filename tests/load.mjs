// Test helper: load a tour and its knowledge from disk the same way the app does over HTTP.
import fs from 'node:fs';
import { loadKnowledge } from '../assistant/knowledge.js';
const root = new URL('..', import.meta.url).pathname;
export const readText = async (p) => (fs.existsSync(root + p) ? fs.readFileSync(root + p, 'utf8') : null);
export const tour = JSON.parse(fs.readFileSync(root + 'tours/wrest-park.json', 'utf8'));
export const { sections: secs, dates } = await loadKnowledge(tour, readText);
