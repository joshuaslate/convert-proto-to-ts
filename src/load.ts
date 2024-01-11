import inquirer, { QuestionCollection } from 'inquirer';
import path from 'path';
import protobuf from 'protobufjs';
import fs from 'fs';
import url from 'url';
import { execSync } from 'child_process';
import { resolve } from 'import-meta-resolve';
import { Config, ProtoSource } from './config';

interface Answers {
  src: ProtoSource;
  repositoryUrl?: string;
  inputDir?: string;
  outputDir: string;
}

function mergeAnswersToConfig(answers: Answers, config: Partial<Config>): Config {
  return {
    protoGitRepository: answers.src === ProtoSource.Git ? answers.repositoryUrl : undefined,
    protoPath: answers.src === ProtoSource.FileSystem ? answers.inputDir : undefined,
    outputPath: answers.outputDir,
    ...config,
  } as Config;
}

function cloneGitRepository(cwd: string, repositoryUrl: string, tempFolder: string) {
  execSync(`git clone ${repositoryUrl} ${tempFolder}`, {
    stdio: [0, 1, 2], // print command output
    cwd: path.resolve(cwd, ''),
  });
}

function collectProtos(dir: string): string[] {
  const protos = new Set<string>();

  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      collectProtos(fullPath).forEach((proto) => protos.add(proto));
    } else if (path.extname(fullPath) === '.proto') {
      protos.add(fullPath);
    }
  });

  return Array.from(protos);
}

function collectAndParseProtos(protoPath: string, config: Config): protobuf.Root {
  const root = new protobuf.Root();
  const protoPaths = collectProtos(protoPath);

  // // Add wellknown and wrapper types
  for (const commonType in protobuf.common) {
    root.addJSON((protobuf.common as any)[commonType].nested);
  }

  // Load in all the Google types
  root.loadSync(collectProtos(url.fileURLToPath(path.dirname(resolve('protobufjs', import.meta.url)))));

  if (!protoPaths.length) {
    throw new Error(`[convert-proto-to-ts]: no .proto files found in ${protoPath}`);
  }

  // Due to bug noted here: https://github.com/protobufjs/protobuf.js/issues/1937
  // we need to load the files one-by-one so that errors are visible if a proto can't be loaded.
  protoPaths.forEach((protoPath) => {
    root.loadSync(protoPath, {
      keepCase: config.fieldNameKeepCase,
      alternateCommentMode: true,
    });
  });

  root.resolveAll();

  return root;
}

export async function loadAndParseProtos(cwd: string, providedConfig: Config) {
  let config = providedConfig;
  const questions: QuestionCollection<Answers>[] = [];

  if (!config.protoGitRepository && !config.protoPath) {
    questions.push(
      {
        type: 'list',
        name: 'src',
        message: 'Where are your `.proto` files located?',
        choices: [ProtoSource.Git, ProtoSource.FileSystem],
      },
      {
        type: 'input',
        name: 'repositoryUrl',
        message: 'Enter the Git repository URL:',
        validate: (input: string) => (input.trim() ? true : 'Please provide a valid Git repository URL'),
        when: (collected) => collected.src === ProtoSource.Git,
      },
      {
        type: 'input',
        name: 'inputDir',
        message: 'Enter the relative path to the `.proto` fields in your file system:',
        validate: (input: string) => (input.trim() ? true : 'Please provide a valid path'),
        when: (collected) => collected.src === ProtoSource.FileSystem,
      },
    );
  }

  if (!config.outputPath) {
    questions.push({
      type: 'input',
      name: 'outputDir',
    });
  }

  // If the user needs to be prompted, wait for responses and merge with config object
  if (questions.length) {
    const answers = await inquirer.prompt<Answers>(questions);
    config = mergeAnswersToConfig(answers, config);
  }

  if (config.protoGitRepository) {
    // Remove anything at the temporary directory path
    const tempDirPath = path.join(cwd, config.tempDir);
    config.tempDir = tempDirPath;

    fs.rmSync(tempDirPath, { recursive: true, force: true });

    console.log(`Cloning protos from ${config.protoGitRepository} into temporary directory: ${tempDirPath}`);

    if (typeof config.protoGitRepository === 'string') {
      cloneGitRepository(cwd, config.protoGitRepository, tempDirPath);
    } else {
      for (const repo of config.protoGitRepository) {
        let repositoryName = '';
        const lastSegment = url.parse(repo)?.pathname?.split('/').pop();

        if (lastSegment) {
          if (path.extname(lastSegment) === '.git') {
            repositoryName = path.basename(lastSegment, '.git');
          } else {
            repositoryName = path.basename(lastSegment);
          }
        }

        // Clone into temp directory
        cloneGitRepository(cwd, repo, repositoryName ? `${tempDirPath}/${repositoryName}` : tempDirPath);
      }
    }

    console.log('Parsing cloned .proto files');
    const root = collectAndParseProtos(tempDirPath, config);

    // Clean up
    console.log(`Removing cloned protos from temporary directory: ${tempDirPath}`);
    fs.rmSync(tempDirPath, { recursive: true, force: true });

    return root;
  }

  if (config.protoPath) {
    const inputPath = path.join(cwd, config.protoPath);
    config.tempDir = inputPath;
    console.log(`Parsing local .proto files at ${inputPath}`);

    return collectAndParseProtos(inputPath, config);
  }

  throw new Error('[convert-proto-to-ts]: no proto definitions were found');
}
