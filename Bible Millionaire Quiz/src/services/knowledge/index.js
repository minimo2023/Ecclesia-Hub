// Knowledge Graph services are currently disabled as they require Firebase
// These are advanced features not needed for core game functionality

export const knowledgeGraphService = {
    async saveEntity() { console.warn('Knowledge Graph disabled'); },
    async getEntity() { return null; },
    async queryEntities() { return []; }
};

export const ingestionService = {
    async ingest() { console.warn('Ingestion service disabled'); }
};

export const encyclopediaBuilder = {
    async build() { console.warn('Encyclopedia builder disabled'); }
};

export const normalizationService = {
    async normalize() { console.warn('Normalization service disabled'); }
};

export const validationService = {
    async validate() { console.warn('Validation service disabled'); return true; }
};

export const versioningService = {
    async createVersion() { console.warn('Versioning service disabled'); }
};

export const reportAnalyzer = {
    async analyze() { console.warn('Report analyzer disabled'); }
};
