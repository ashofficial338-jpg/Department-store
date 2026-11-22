import { useEffect, useState } from 'react';
import { settingsService } from '../services/index.js';

// Mandatory / optional fields chosen in Settings > Mandatory Fields (server: utils/fieldRules.js).
// Loaded once and shared by every form; `req(entity, field)` is true only for mandatory fields.
// Until the rules arrive only the essential fields count as mandatory (the server checks again anyway).
let cache = null;
let pending = null;
const subscribers = new Set();

export function loadFieldRules(force = false) {
  if (cache && !force) return Promise.resolve(cache);
  if (!pending || force) {
    pending = settingsService.fieldRules()
      .then((r) => { cache = r.data; subscribers.forEach((fn) => fn(cache)); return cache; })
      .catch(() => cache)
      .finally(() => { pending = null; });
  }
  return pending;
}

export function setFieldRulesCache(data) {
  cache = data;
  subscribers.forEach((fn) => fn(cache));
}

export function useFieldRules() {
  const [data, setData] = useState(cache);
  useEffect(() => {
    subscribers.add(setData);
    if (!cache) loadFieldRules();
    return () => subscribers.delete(setData);
  }, []);
  const req = (entity, field) => {
    if (data?.rules?.[entity]) return !!data.rules[entity][field];
    const def = data?.registry?.[entity]?.fields?.find((f) => f.key === field);
    return !!def?.essential;
  };
  return { data, req };
}

export default useFieldRules;
