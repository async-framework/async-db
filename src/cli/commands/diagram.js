import path from 'node:path';
import { generateDiagram } from '../../diagram.js';
import { isHelpRequested, valueAfter } from '../args.js';
import { printDiagramHelp } from '../output.js';

export async function runDiagram(config, args) {
  if (isHelpRequested(args)) {
    printDiagramHelp();
    return;
  }

  const result = await generateDiagram(config, {
    format: valueAfter(args, '--format') ?? 'mermaid',
    fields: valueAfter(args, '--fields') ?? 'compact',
    outFile: valueAfter(args, '--out'),
  });

  if (result.outFiles.length === 0) {
    console.log(result.content);
    return;
  }

  for (const filePath of result.outFiles) {
    console.log(`Generated ${path.relative(config.cwd, filePath)}`);
  }
}
