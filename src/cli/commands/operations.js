import path from 'node:path';
import { buildOperationManifest } from '../../operations.js';
import { valueAfter } from '../args.js';

export async function runOperations(config, args) {
  if (args[0] !== 'build') {
    throw new Error('Unknown operations command. Use async-db operations build.');
  }

  const result = await buildOperationManifest(config, {
    outFile: valueAfter(args, '--out'),
    refsOutFile: valueAfter(args, '--refs-out'),
  });

  if (result.outFiles.length === 0 && result.refsOutFiles.length === 0) {
    console.log(JSON.stringify(result.manifest, null, 2));
    return;
  }

  for (const filePath of [...result.outFiles, ...result.refsOutFiles]) {
    console.log(`Generated ${path.relative(config.cwd, filePath)}`);
  }
}
