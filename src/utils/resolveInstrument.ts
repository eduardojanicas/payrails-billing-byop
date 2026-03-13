// Utility to resolve preferred instrument for a holderReference.
import { createLogger } from '@/utils/logger';
import { cloudApi } from '@/api/cloudApi';
// Preference order: default & active card > active card > active any > newest.
export interface ResolveInstrumentOptions {
  attempts?: number; // retry attempts
  delayBaseMs?: number; // base delay for incremental backoff
  preferCard?: boolean;
  logPrefix?: string;
}

export async function resolvePreferredInstrument(holderReference: string, opts: ResolveInstrumentOptions = {}): Promise<string | null> {
  const {
    attempts = 1,
    delayBaseMs = 300,
    preferCard = true,
    logPrefix = '[resolveInstrument]'
  } = opts;

  let resolved: string | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const resp = await cloudApi(`/payrails/instruments?holderReference=${encodeURIComponent(holderReference)}`);
      if (resp.ok) {
        const data = await resp.json();
        const instruments: any[] = data.instruments || [];
        if (instruments.length) {
          const normalized = instruments.map(i => {
            const statusRaw = (i.status || '').toString().toLowerCase();
            const isActive = statusRaw === 'enabled' || statusRaw === 'active' || !!i.active;
            const methodCode = i.paymentMethodCode || i.paymentMethod || i.type;
            const createdTs = new Date(i.createdAt || i.created_at || 0).getTime();
            return { ...i, _isActive: isActive, _method: methodCode, _createdTs: createdTs, _isDefault: !!i.default };
          }).sort((a, b) => b._createdTs - a._createdTs);
          let preferred = null as any;
          if (preferCard) {
            preferred = normalized.find(i => i._isDefault && i._isActive && i._method === 'card')
              || normalized.find(i => i._isActive && i._method === 'card');
          }
          preferred = preferred
            || normalized.find(i => i._isActive)
            || normalized[0];
          if (preferred?.id) {
            resolved = preferred.id;
            break;
          }
        }
      } else {
        const t = await resp.text();
        const logger = (opts as any).logger || createLogger({ route: 'utils/resolveInstrument' });
        logger.warn(`${logPrefix} fetch failed`, { attempt, status: resp.status, body: t });
      }
    } catch (e) {
      const logger = (opts as any).logger || createLogger({ route: 'utils/resolveInstrument' });
      logger.warn(`${logPrefix} error`, { attempt, error: e });
    }
    if (!resolved && attempt < attempts) {
      await new Promise(r => setTimeout(r, attempt * delayBaseMs));
    }
  }
  return resolved;
}
