import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { describe, it, expect } from 'vitest';
import { ProtoToTypeScriptGenerator } from '../src/generator';
import { loadAndParseProtos } from '../src/load';
import { loadConfig } from '../src/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe(ProtoToTypeScriptGenerator, () => {
  it('should generate types from a given directory of protos', async () => {
    const config = await loadConfig();
    config.protoPath = 'protos';
    config.fileHeaderCommentTemplate = undefined;
    config.indexFileHeaderCommentTemplate = undefined;

    const root = await loadAndParseProtos(__dirname, config);
    const generator = new ProtoToTypeScriptGenerator(config, root);

    expect(generator.generateTypeDefinitionsByFile()).toMatchSnapshot();
  });
});
