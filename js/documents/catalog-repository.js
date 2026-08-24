import bundledCatalog from '../../documents.json';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { normalizeDocument, sortDocuments } from '../model.js';

const WEB_KEY = 'byd-skyrail:local-catalog-v1';
const NATIVE_PATH = 'skyrail/catalog/documents.json';

const text = value => String(value ?? '').trim();
const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
const normalizeCode = value => fold(value).replace(/[^a-z0-9]/g, '');

function normalizeCatalog(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.documents)) throw new Error('Catálogo documental inválido.');
  const systems = Array.isArray(input.systems) ? input.systems.map(item => ({
    id: text(item.id), name: text(item.name), active: item.active !== false
  })).filter(item => item.id && item.name) : [];
  const documents = input.documents.map(item => normalizeDocument({
    ...item,
    description: text(item.description),
    document_type: text(item.document_type ?? item.documentType),
    system_id: text(item.system_id ?? item.systemId),
    status: text(item.status || (item.active === false ? 'inactive' : 'active')).toLowerCase(),
    file_path: text(item.file_path ?? item.file),
    updated_at: text(item.updated_at ?? item.updatedAt ?? input.generatedAt ?? new Date(0).toISOString()),
    active: item.active !== false && text(item.status || 'active').toLowerCase() === 'active'
  })).filter(Boolean);
  return {
    schemaVersion: Number(input.schemaVersion || 1),
    catalogVersion: text(input.catalogVersion || '0.0.0'),
    generatedAt: input.generatedAt || null,
    packageVersion: input.packageVersion || null,
    systems,
    documents
  };
}

async function readNative() {
  try {
    const result = await Filesystem.readFile({ path: NATIVE_PATH, directory: Directory.Data, encoding: Encoding.UTF8 });
    return normalizeCatalog(JSON.parse(String(result.data)));
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('not found')) return null;
    throw error;
  }
}

async function writeNative(catalog) {
  await Filesystem.mkdir({ path: 'skyrail/catalog', directory: Directory.Data, recursive: true });
  await Filesystem.writeFile({ path: NATIVE_PATH, directory: Directory.Data, data: JSON.stringify(catalog), encoding: Encoding.UTF8, recursive: true });
}

export class JsonDocumentRepository {
  constructor() { this.catalog = null; }

  async load({ force = false } = {}) {
    if (this.catalog && !force) return this.catalog;
    let source = null;
    if (Capacitor.isNativePlatform()) source = await readNative();
    else {
      const raw = localStorage.getItem(WEB_KEY);
      if (raw) source = normalizeCatalog(JSON.parse(raw));
    }
    this.catalog = source || normalizeCatalog(bundledCatalog);
    return this.catalog;
  }

  async replace(catalog) {
    const normalized = normalizeCatalog(catalog);
    if (Capacitor.isNativePlatform()) await writeNative(normalized);
    else localStorage.setItem(WEB_KEY, JSON.stringify(normalized));
    this.catalog = normalized;
    return normalized;
  }

  async getAll({ includeInactive = false } = {}) {
    const catalog = await this.load();
    const docs = includeInactive ? catalog.documents : catalog.documents.filter(doc => doc.active !== false && doc.status !== 'cancelled');
    return sortDocuments(docs);
  }

  async getById(id) {
    const catalog = await this.load();
    return catalog.documents.find(doc => doc.id === id) || null;
  }

  async getSystems({ includeInactive = false } = {}) {
    const catalog = await this.load();
    return catalog.systems.filter(system => includeInactive || system.active !== false).sort((a,b) => a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
  }

  async info() {
    const catalog = await this.load();
    return { catalogVersion: catalog.catalogVersion, generatedAt: catalog.generatedAt, packageVersion: catalog.packageVersion, documentCount: catalog.documents.filter(doc => doc.active !== false).length };
  }

  async search(query = '', filters = {}) {
    const docs = await this.getAll({ includeInactive: filters.status === 'ALL' });
    const q = fold(query), qCode = normalizeCode(query);
    const rank = doc => {
      const code = fold(doc.code), codeN = normalizeCode(doc.code), title = fold(doc.title), description = fold(doc.description), system = fold(doc.system_name), discipline = fold(doc.discipline), type = fold(doc.document_type);
      if (!q) return 100;
      if (codeN === qCode) return 0;
      if (codeN.startsWith(qCode)) return 10;
      if (codeN.includes(qCode)) return 20;
      if (title.startsWith(q)) return 30;
      if (title.includes(q)) return 40;
      if (description.includes(q)) return 50;
      if (`${system} ${discipline} ${type}`.includes(q)) return 60;
      return Number.POSITIVE_INFINITY;
    };
    return docs
      .filter(doc => (filters.systemId === undefined || filters.systemId === 'ALL' || doc.system_id === filters.systemId)
        && (filters.discipline === undefined || filters.discipline === 'ALL' || doc.discipline === filters.discipline)
        && (filters.documentType === undefined || filters.documentType === 'ALL' || doc.document_type === filters.documentType)
        && (filters.status === undefined || filters.status === 'ALL' || doc.status === filters.status))
      .map(doc => ({ doc, rank: rank(doc) })).filter(row => Number.isFinite(row.rank))
      .sort((a,b) => a.rank - b.rank || a.doc.code.localeCompare(b.doc.code,'pt-BR',{numeric:true,sensitivity:'base'}))
      .map(row => row.doc);
  }
}

export const documentRepository = new JsonDocumentRepository();
