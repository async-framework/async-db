import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const settings = db.collection('settings');
const flags = db.collection('featureFlags');
const demoFlagId = 'flag_preview_search';

await flags.delete(demoFlagId);

const created = await flags.create({
  id: demoFlagId,
  key: 'preview_search',
  description: 'Temporary flag created by the admin CRUD example.',
  enabled: false,
  rolloutPercent: 0,
  ownerEmail: 'admin@example.com',
});

const patched = await flags.patch(demoFlagId, {
  enabled: true,
  rolloutPercent: 25,
});
const setting = await settings.patch('setting_theme', {
  value: 'dark',
  updatedBy: 'admin@example.com',
});
const deleted = await flags.delete(demoFlagId);

console.log(JSON.stringify({
  created: created.key,
  patched: {
    enabled: patched.enabled,
    rolloutPercent: patched.rolloutPercent,
  },
  setting: {
    id: setting.id,
    value: setting.value,
  },
  deleted,
  remainingFlags: (await flags.all()).map((flag) => flag.key),
}, null, 2));
