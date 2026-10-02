import { ClientResponseError } from 'pocketbase';
import { noteServerTime } from '../lib/clock';
import { pb } from './client';
import {
  DuplicateError,
  MissingError,
  QuotaError,
  RejectedError,
  StaleError,
  type ItemDraft,
  type PullCursor,
  type Remote,
  type RemoteItem,
} from './sync';

/** The server's answers, as the sync understands them. */
function translate(error: unknown): unknown {
  if (!(error instanceof ClientResponseError)) return error;
  if (error.status === 409) return new StaleError();
  // PocketBase writes it as a sentence ("Quota_exceeded.").
  if (error.status === 403 && /quota_exceeded/i.test(String(error.response?.message))) {
    return new QuotaError();
  }
  if (error.status === 404) return new MissingError();
  const key = (error.response?.data as Record<string, { code?: string }> | undefined)?.key;
  if (error.status === 400 && key?.code === 'validation_not_unique') return new DuplicateError();
  if (error.status === 400) return new RejectedError(error.message);
  return error;
}

const guard = async <T>(request: Promise<T>): Promise<T> => {
  try {
    return await request;
  } catch (error) {
    throw translate(error);
  }
};

const FIELDS = 'id,key,kind,data,modified,deleted,updated';

/** PocketBase's times ("2026-10-02 09:48:54.999Z") in ms. */
const parseTime = (time: string) => Date.parse(time.replace(' ', 'T'));
const formatTime = (ms: number) => new Date(ms).toISOString().replace('T', ' ');

/** How far back each pull reads again (see `Remote.rewind`). */
const OVERLAP = 10_000;

/** A write came back with the server's time: this device's clock follows it. */
function written(item: RemoteItem): RemoteItem {
  noteServerTime(parseTime(item.updated));
  return item;
}

/** The `items` collection of the signed-in account (see cloud/pb_migrations). */
export function pocketbaseRemote(userId: string): Remote {
  const items = () => pb.collection('items');
  const options = { requestKey: null, fields: FIELDS };
  return {
    listAfter: async (cursor: PullCursor, limit: number) => {
      const filter = cursor.updated
        ? pb.filter('updated > {:u} || (updated = {:u} && id > {:id})', {
            u: cursor.updated,
            id: cursor.id,
          })
        : '';
      const page = await guard(
        items().getList<RemoteItem>(1, limit, {
          ...options,
          filter,
          sort: 'updated,id',
          skipTotal: true,
        }),
      );
      return page.items;
    },
    create: async (draft: ItemDraft) =>
      written(await guard(items().create<RemoteItem>({ ...draft, user: userId }, options))),
    update: (id: string, draft: ItemDraft) => {
      // The owner and the key never change (the server refuses it).
      const { key: _key, ...change } = draft;
      void _key;
      return guard(items().update<RemoteItem>(id, change, options)).then(written);
    },
    rewind: (cursor: PullCursor) => {
      const time = parseTime(cursor.updated);
      return Number.isFinite(time) ? { updated: formatTime(time - OVERLAP), id: '' } : cursor;
    },
    findByKey: async (key: string) => {
      const page = await guard(
        items().getList<RemoteItem>(1, 1, {
          ...options,
          filter: pb.filter('key = {:key}', { key }),
          skipTotal: true,
        }),
      );
      return page.items[0] ?? null;
    },
  };
}

/** How much of the account's space is used. */
export async function fetchUsage(): Promise<{ used: number; quota: number }> {
  return pb.send('/api/diaryo/usage', { requestKey: null });
}
