import { findUp } from 'find-up';
import fs from 'fs/promises';
import { cli } from './cli';

export enum ProtoSource {
  Git = 'Git',
  FileSystem = 'File System',
}

export enum TypeNameCase {
  Camel = 'camelCase',
  Constant = 'constantCase',
  Pascal = 'pascalCase',
  Snake = 'snakeCase',
}

export interface Config {
  // tempDir is the path, relative to the root, that the proto files are cloned into if an option is provided for protoGitRepository
  tempDir: string;
  // protoGitRepository is the repository that will be git cloned in order to pull proto definitions
  protoGitRepository?: string;
  // protoPath is the path, relative to the root, to proto definitions on your local file system
  protoPath?: string;
  // outputPath is the path, relative to the root, where the generated TypeScript files will be saved
  outputPath: string;
  // fieldNameKeepCase is true if you'd like to keep field casing instead of camel casing (passed to protobufjs loadSync options), defaults to false
  fieldNameKeepCase?: boolean;
  // namespacesToIgnore is an array of namespaces that you would like to avoid resolving types for, e.g., ["google"]
  namespacesToIgnore?: string[];
  /**
   * typeNameCase determines the casing for generated interface types
   *  Available options:
   *    camelCase (e.g., camelCase)
   *    constantCase (e.g., CONSTANT_CASE)
   *    pascalCase (e.g., PascalCase)
   *    snakeCase (e.g., snake_case)
   *
   *    default: pascalCase
   */
  typeNameCase: TypeNameCase;
  /**
   * enumNameCase determines the casing for generated enum types
   *  Available options:
   *    camelCase (e.g., camelCase)
   *    constantCase (e.g., CONSTANT_CASE)
   *    pascalCase (e.g., PascalCase)
   *    snakeCase (e.g., snake_case)
   *
   *    default: pascalCase
   */
  enumNameCase: TypeNameCase;
  /**
   * typeNameTemplate determines how the generated interface types are named.
   *  Available variables:
   *    parentNodeNames
   *    typeName
   *
   *    default: "{{parentNodeNames}}{{typeName}}"
   */
  typeNameTemplate: string;
  /**
   * enumNameTemplate determines how the generated enum types are named.
   *  Available variables:
   *    parentNodeNames
   *    typeName
   *
   *    default: "{{parentNodeNames}}{{typeName}}"
   */
  enumNameTemplate: string;
  /**
   * typeNameIgnoreParentNodeNames is an array of parent node names in the generated type names that you'd like to leave off.
   * This is only used when {{parentNodeNames}} is included in typeNameTemplate/enumNameTemplate.
   * For example, if the package is your_app.services.auth.v1, and the message name is RegisterRequest, ["your_app", "services"] would yield:
   * export interface AuthV1RegisterRequest {}
   */
  typeNameIgnoreParentNodeNames?: string[];
  // generatedTypeOverrides is a Record<string, string> for type overrides (key == Protobuf type, value == TypeScript type)
  generatedTypeOverrides?: Record<string, string>;
  // generatedTypeComments is a Record<string, string> for leading comments for types, e.g., { 'google.protobuf.Timestamp': 'format: date-time' }
  generatedTypeComments?: Record<string, string>;
  // generateIndexFile is true if an index.ts file exporting all generated types should be generated (default: true)
  generateIndexFile?: boolean;
  /**
   * generateEnumType can be set to either 'union' or 'enum'
   *    union: export type FakeEnum = 'FAKE_ENUM_UNSPECIFIED' | 'FAKE_ENUM_VALUE';
   *    enum: export enum FakeEnum { Unspecified: 'FAKE_ENUM_UNSPECIFIED', Value: 'FAKE_ENUM_VALUE' };
   * Nested enums will always be generated as inline union types, because enums can't be declared inline
   */
  generateEnumType?: 'union' | 'enum';
  /**
   * fileHeaderCommentTemplate can be set to define a header that will be prepended to all generated TypeScript files. Variables available:
   *    generationTimestamp, sourceFile
   * Example: "DO NOT EDIT! Types generated from {{sourceFile}} at {{generationTimestamp}}."
   */
  fileHeaderCommentTemplate?: string;
  /**
   * indexFileHeaderCommentTemplate can be set to define a header that will be prepended to the generated TypeScript file (if enabled). Variables available:
   *    generationTimestamp
   * Example: "DO NOT EDIT! Types generated at {{generationTimestamp}}."
   */
  indexFileHeaderCommentTemplate?: string;
}

export const defaultConfig: Config = {
  tempDir: '__proto-to-ts-temp',
  outputPath: 'generated_from_proto',
  fieldNameKeepCase: false,
  generateIndexFile: true,
  enumNameTemplate: '{{parentNodeNames}}{{typeName}}',
  enumNameCase: TypeNameCase.Pascal,
  typeNameTemplate: '{{parentNodeNames}}{{typeName}}',
  typeNameCase: TypeNameCase.Pascal,
};

function mergeConfigs(cliArgs: Partial<Config>, configFile?: Partial<Config>) {
  const { protoPath, protoGitRepository, ...restOfConfigFile } = configFile || {};

  return {
    ...defaultConfig,
    ...restOfConfigFile,
    protoPath: cliArgs.protoGitRepository ? undefined : protoPath,
    protoGitRepository: cliArgs.protoPath ? undefined : protoGitRepository,
    ...cliArgs,
  };
}

export async function loadConfig(configFromArgs: Partial<Config>): Promise<Config> {
  const foundConfigPath = await findUp('.proto_to_ts_config.json');

  if (foundConfigPath) {
    const fileContent = await fs.readFile(foundConfigPath, 'utf8');

    if (fileContent) {
      try {
        const fileContentAsObject = JSON.parse(fileContent);

        return mergeConfigs(configFromArgs, fileContentAsObject);
      } catch (e) {
        throw new Error(
          `[convert-proto-to-ts]: error encountered while parsing custom .proto_to_ts_config.json file: ${e}`,
        );
      }
    }
  }

  return mergeConfigs(configFromArgs);
}

const CLI_ARGS_TO_CONFIG_KEY: Record<string, keyof Config> = {
  'git-repository': 'protoGitRepository',
  'proto-path': 'protoPath',
};

export function parseCLIArgs(args: string[]): Partial<Config> {
  const config: Partial<Config> = {};
  let configItem: keyof Config | undefined;

  for (let i = 0; i < args.length; i++) {
    const configKey = CLI_ARGS_TO_CONFIG_KEY[args[i].substring(2).toLowerCase()];

    if (configItem) {
      if (!configKey) {
        config[configItem] = args[i] as any;
      }

      configItem = undefined;
    } else {
      if (configKey) {
        configItem = configKey;
      }
    }
  }

  return config;
}
