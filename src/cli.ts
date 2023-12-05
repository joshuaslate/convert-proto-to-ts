import fs from 'fs';
import path from 'path';
import { loadConfig, parseCLIArgs } from './config';
import { loadAndParseProtos } from './load';
import { ProtoToTypeScriptGenerator } from './generator';

interface Args {
  cwd: string;
  args: string[];
}

export async function cli({ cwd, args }: Args) {
  try {
    const config = await loadConfig(parseCLIArgs(args));
    const root = await loadAndParseProtos(cwd, config);
    const generator = new ProtoToTypeScriptGenerator(config, root);

    const typeDefinitionsByFile = generator.generateTypeDefinitionsByFile();

    if (config.clearOutputPath) {
      console.log('Clearing output path before writing new generated files');
      fs.rmSync(path.join(cwd, config.outputPath), { recursive: true, force: true });
    }

    for (const tsFile of typeDefinitionsByFile) {
      fs.mkdirSync(path.dirname(path.join(cwd, tsFile.path)), { recursive: true });
      fs.writeFileSync(path.join(cwd, tsFile.path), tsFile.content);

      console.log(`Successfully wrote ${tsFile.path}`);
    }
  } catch (e) {
    console.error(e);
  }
}
