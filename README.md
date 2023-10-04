# Convert Proto to TS

[![CI](https://github.com/joshuaslate/convert-proto-to-ts/actions/workflows/main.yml/badge.svg)](https://github.com/joshuaslate/convert-proto-to-ts/actions/workflows/main.yml) [![npm downloads](https://img.shields.io/npm/dm/convert-proto-to-ts)](https://www.npmjs.com/package/convert-proto-to-ts)

A CLI tool to generate TypeScript type definitions from Protocol buffer (`.proto`) files.

## How to Use

Run the following command, then answer the prompts. See below for more configuration options.

```sh
npx convert-proto-to-ts
```

## Configuration

To further configure the CLI, create a file called `.proto_to_ts_config.json` at your project root. The available options are below.

```typescript
interface Config {
  // tempDir is the path, relative to the root, that the proto files are cloned into if an option is provided for protoGitRepository
  tempDir: string;
  // protoGitRepository is the repository (or repositories) that will be git cloned in order to pull proto definitions
  protoGitRepository?: string | string[];
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
```
