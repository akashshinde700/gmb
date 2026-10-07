import config from "../../freemodels-api.json";

export const FREEMODELS_UPSTREAM_URL = config.upstream.baseUrl;
export const FREEMODELS_MODELS = config.models;
export const FREEMODELS_MODEL_IDS = new Set(FREEMODELS_MODELS.map(({ id }) => id));
export const FREEMODELS_DEFAULT_MODEL = config.upstream.requestBody.modelId.default;
