import protobuf from 'protobufjs';
// @ts-ignore
import { camelCase, constantCase, pascalCase, snakeCase } from 'change-case';
import path from 'path';
import ts from 'typescript';
import { Config, defaultConfig, TypeNameCase } from './config';

const UNKNOWN_FILE_NAME = 'proto_to_ts_unknown_file_name.proto' as const;

const optionalFieldMarker = ts.factory.createToken(ts.SyntaxKind.QuestionToken);

const UNKNOWN_TYPE = 'any' as const;

interface IndexFileVariables {
  generationTimestamp: string;
}

interface TypeFileVariables {
  generationTimestamp: string;
  sourceFile: string;
}

interface TypeNameVariables {
  parentNodeNames: string;
  typeName: string;
}

function replaceVariables<T = {}>(template: string, variables: T, padVariable?: boolean): string {
  let str = template;

  for (const variableName in variables) {
    let variableValue = (variables as Record<string, string>)[variableName] || '';

    if (padVariable) {
      variableValue = ` ${variableValue} `;
    }
    str = str.replaceAll(new RegExp('{{(?:\\s+)?(' + variableName + ')(?:\\s+)?}}', 'g'), variableValue);
  }

  return str.trim();
}

function getRelativePath(source: string, target: string) {
  const targetArr = target.split('/');
  const sourceArr = source.split('/');
  // Remove filename from end of source & target, discard source
  sourceArr.pop();
  const targetFileName = targetArr.pop();

  const relativePath = path.relative(sourceArr.join('/'), targetArr.join('/'));

  return (relativePath ? `${relativePath}/${targetFileName}` : `./${targetFileName}`).replaceAll(path.sep, '/');
}

function getCaseFunction(caseName: TypeNameCase) {
  return {
    [TypeNameCase.Camel]: camelCase,
    [TypeNameCase.Constant]: constantCase,
    [TypeNameCase.Pascal]: pascalCase,
    [TypeNameCase.Snake]: snakeCase,
  }[caseName];
}

interface CachedType {
  generatedPath: string;
  generatedName: string;
  type: protobuf.Type | protobuf.Enum;
}

type ImportAdder = (namedExport: string, importPath: string) => void;

interface TypeScriptFileToCreate {
  content: string;
  path: string;
}

export class ProtoToTypeScriptGenerator {
  static buildTypeName(
    node: protobuf.Type | protobuf.Enum,
    template: string,
    caseFn: (str: string) => string,
    typeNameIgnoreParentNodeNames?: string[],
  ) {
    const parentNames: string[] = [];

    let currentNode: protobuf.ReflectionObject | null = node.parent;
    while (currentNode) {
      if (!typeNameIgnoreParentNodeNames?.includes(currentNode.name)) {
        parentNames.unshift(currentNode.name);
      }

      currentNode = currentNode.parent;
    }

    return caseFn(
      replaceVariables<TypeNameVariables>(
        template,
        {
          parentNodeNames: parentNames.join(' '),
          typeName: node.name,
        },
        true,
      ),
    );
  }

  static buildTypeCacheKey(node: protobuf.Type | protobuf.Enum) {
    return `${node.filename}:${ProtoToTypeScriptGenerator.buildTypeName(
      node,
      defaultConfig.typeNameTemplate,
      getCaseFunction(defaultConfig.typeNameCase),
    )}`;
  }

  static getEnumKeyName(value: string) {
    // If the first character is a number, wrap in quotes
    if (!Number.isNaN(Number(value[0]))) {
      return `'${value}'`;
    }

    // If the name contains an unsupported character, wrap it in quotes
    for (const char of value) {
      if (!char.match(/\p{Letter}|[0-9]|\$|_/u)) {
        return `'${value}'`;
      }
    }

    return value;
  }

  config: Config;
  root: protobuf.Root;
  typeCache: Record<string, CachedType>;
  wellKnownMappings: Record<string, string>;

  constructor(config: Config, root: protobuf.Root) {
    this.root = root;
    this.config = config;
    this.typeCache = {};

    // As per documentation at https://protobuf.dev/programming-guides/proto3/#json
    this.wellKnownMappings = {
      'bool': 'boolean',
      'double': 'number',
      'float': 'number',
      'int32': 'number',
      'uint32': 'number',
      'sint32': 'number',
      'fixed32': 'number',
      'sfixed32': 'number',
      'string': 'string',
      'int64': 'string',
      'fixed64': 'string',
      'uint64': 'string',
      'sint64': 'string',
      'sfixed64': 'string',
      'bytes': 'string',
      'google.protobuf.Timestamp': 'string',
      'google.protobuf.Duration': 'string',
      'google.protobuf.FieldMask': 'string',
      'google.protobuf.BoolValue': 'boolean | null',
      'google.protobuf.StringValue': 'string | null',
      'google.protobuf.Int64Value': 'string | null',
      'google.protobuf.UInt64Value': 'string | null',
      'google.protobuf.BytesValue': 'string | null',
      'google.protobuf.Int32Value': 'number | null',
      'google.protobuf.UInt32Value': 'number | null',
      'google.protobuf.FloatValue': 'number | null',
      'google.protobuf.DoubleValue': 'number | null',
      'google.protobuf.NullValue': 'null',
      'google.protobuf.Empty': '{}',
      'google.protobuf.ListValue': 'any[]',
      'google.protobuf.Struct': 'Record<string, any>',
      'google.protobuf.Any': "{ '@type': string, value: any }",
      ...(config.generatedTypeOverrides || {}),
    };
  }

  private getFieldTypeMapping(field: protobuf.Field | protobuf.MapField, addImport: ImportAdder): string | undefined {
    const mappedType = this.wellKnownMappings[field.type];

    if (mappedType) {
      return mappedType;
    }

    if (field.resolvedType) {
      const typeResolvedFromCache = this.typeCache[ProtoToTypeScriptGenerator.buildTypeCacheKey(field.resolvedType)];

      if (typeResolvedFromCache) {
        addImport(typeResolvedFromCache.generatedName, typeResolvedFromCache.generatedPath);
        return typeResolvedFromCache.generatedName;
      }
    }
  }

  private convertFieldType(field: protobuf.Field | protobuf.MapField, addImport: ImportAdder): ts.TypeNode | undefined {
    let node: ts.TypeNode;

    // If an enum type was generated (non-nested type), reference it, else create an inline union type declaration
    if (
      field.resolvedType instanceof protobuf.Enum &&
      !this.typeCache[ProtoToTypeScriptGenerator.buildTypeCacheKey(field.resolvedType)]
    ) {
      node = this.generateEnumDefinition(field.resolvedType) as ts.TypeNode;
    } else {
      let mappedType = this.getFieldTypeMapping(field, addImport);

      if (field.map) {
        const mapField = field as protobuf.MapField;
        const keyMappedType = this.getFieldTypeMapping(
          { ...field, type: mapField.keyType } as protobuf.Field,
          addImport,
        );
        mappedType = `Record<${keyMappedType}, ${mappedType}>`;
      }

      if (!mappedType && field.resolvedType instanceof protobuf.Type && field.parent instanceof protobuf.Type) {
        node = this.generateNestedType(field.resolvedType, addImport);
      } else {
        node = ts.factory.createTypeReferenceNode(mappedType || UNKNOWN_TYPE);
      }
    }

    if (field.repeated) {
      node = ts.factory.createArrayTypeNode(node);
    }

    return node;
  }

  private generateEnumDefinition(protoEnum: protobuf.Enum, generatedName?: string) {
    // If generatedName is not provided, a union type will be returned
    if (this.config.generateEnumType === 'enum' && generatedName) {
      return ts.factory.createEnumDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        ts.factory.createIdentifier(generatedName),
        Object.keys(protoEnum.values || {}).map((value) => {
          const destutteredValue = pascalCase(value).replace(pascalCase(protoEnum.name), '');

          return ts.factory.createEnumMember(
            ProtoToTypeScriptGenerator.getEnumKeyName(destutteredValue),
            ts.factory.createStringLiteral(value, true),
          );
        }),
      );
    }

    const literals = Object.keys(protoEnum.values || {}).map((value) => ts.factory.createStringLiteral(value, true));

    const union = ts.factory.createUnionTypeNode(literals as unknown as readonly ts.TypeNode[]);

    if (!generatedName) {
      return union;
    }

    return ts.factory.createTypeAliasDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createIdentifier(generatedName),
      undefined,
      union,
    );
  }

  private generateFieldMember(
    field: protobuf.Field | protobuf.MapField,
    addImport: ImportAdder,
  ): ts.TypeElement | void {
    const baseFieldType = this.convertFieldType(field, addImport);
    let member = ts.factory.createPropertySignature(
      undefined,
      camelCase(field.name),
      field.optional || !field.required ? optionalFieldMarker : undefined,
      baseFieldType,
    );

    // If the field is part of a oneof, add a comment to indicate the start and end of the oneof,
    // but if proto3_optional is set to true, don't treat it as a oneof (protobuf.js does, probably for backwards compatibility)
    if (field.partOf instanceof protobuf.OneOf && !field.options?.['proto3_optional']) {
      if (field.id === field.partOf.fieldsArray[0].id) {
        member = ts.addSyntheticLeadingComment(
          member,
          ts.SyntaxKind.SingleLineCommentTrivia,
          ` start oneof "${field.partOf.name}"`,
          false,
        );
      }

      if (field.id === field.partOf.fieldsArray[field.partOf.fieldsArray.length - 1].id) {
        member = ts.addSyntheticTrailingComment(
          member,
          ts.SyntaxKind.SingleLineCommentTrivia,
          ` end oneof "${field.partOf.name}"`,
          false,
        );
      }
    }

    return member;
  }

  private generateNestedType(node: protobuf.Type, addImport: ImportAdder) {
    const members: ts.TypeElement[] = [];

    for (const field of node.fieldsArray) {
      const member = this.generateFieldMember(field, addImport);

      if (member) {
        members.push(member);
      }
    }

    return ts.factory.createTypeLiteralNode(members);
  }

  private generateInterfaceMembersFromProtobufType(node: protobuf.Type, addImport: ImportAdder): ts.TypeElement[] {
    const members: ts.TypeElement[] = [];

    if (!node.fieldsArray.length) {
      return members;
    }

    for (const field of node.fieldsArray) {
      let member = this.generateFieldMember(field, addImport);

      if (member) {
        if (this.config.generatedTypeComments?.[field.type]) {
          member = ts.addSyntheticLeadingComment(
            member,
            ts.SyntaxKind.SingleLineCommentTrivia,
            ` ${this.config.generatedTypeComments[field.type]}`,
            false,
          );
        }

        members.push(member);
      }
    }

    return members;
  }

  private generateInterfaceFromProtobufType(
    node: protobuf.Type,
    generatedName: string,
    addImport: ImportAdder,
  ): ts.Node {
    return ts.factory.createInterfaceDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createIdentifier(generatedName),
      [],
      undefined,
      this.generateInterfaceMembersFromProtobufType(node, addImport),
    );
  }

  private buildGeneratedTypeName(node: protobuf.Type | protobuf.Enum) {
    const caseFn = getCaseFunction(node instanceof protobuf.Enum ? this.config.enumNameCase : this.config.typeNameCase);
    const template = node instanceof protobuf.Enum ? this.config.enumNameTemplate : this.config.typeNameTemplate;

    return ProtoToTypeScriptGenerator.buildTypeName(node, template, caseFn, this.config.typeNameIgnoreParentNodeNames);
  }

  private buildGeneratedFilename(node: protobuf.Type | protobuf.Enum) {
    const pathRoot = this.config.tempDir.replaceAll(path.sep, '/');
    const base = (node.filename || node.parent?.filename || UNKNOWN_FILE_NAME)
      .replace(pathRoot, '')
      .replace('.proto', '.ts');

    return base.startsWith('/') ? base.substring(1) : base;
  }

  private collectTypes(node: protobuf.ReflectionObject) {
    if (!node) {
      return;
    }

    if (node instanceof protobuf.Root) {
      for (const nestedItemName in node.nested) {
        this.collectTypes(node.nested[nestedItemName]);
      }

      return;
    }

    if (node instanceof protobuf.Namespace) {
      if (!this.config.namespacesToIgnore?.includes(node.name)) {
        for (const nestedItemName in node.nested) {
          this.collectTypes(node.nested[nestedItemName]);
        }
      }
    }

    if (node instanceof protobuf.Service) {
      for (const nestedItemName in node.nested) {
        this.collectTypes(node.nested[nestedItemName]);
      }
    }

    if ((node instanceof protobuf.Type || node instanceof protobuf.Enum) && !(node.parent instanceof protobuf.Type)) {
      this.typeCache[ProtoToTypeScriptGenerator.buildTypeCacheKey(node)] = {
        generatedName: this.buildGeneratedTypeName(node),
        generatedPath: this.buildGeneratedFilename(node),
        type: node,
      };
    }
  }

  private getTypesByFile() {
    return Object.values(this.typeCache).reduce(
      (accum, curr) => {
        accum[curr.generatedPath] = [...(accum[curr.generatedPath] || []), curr];
        return accum;
      },
      {} as Record<string, CachedType[]>,
    );
  }

  generateTypeDefinitionsByFile(): TypeScriptFileToCreate[] {
    const generationTimestamp = new Date().toISOString();

    // Collect all types
    this.collectTypes(this.root);

    const files: TypeScriptFileToCreate[] = [];
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const typesByFile = this.getTypesByFile();

    for (const fileToCreate in typesByFile) {
      const imports: Map<string, Set<string>> = new Map();
      const nodeList: ts.Node[] = [];

      function addImport(namedExport: string, importPath: string) {
        if (importPath !== fileToCreate) {
          if (!imports.has(importPath)) {
            imports.set(importPath, new Set());
          }

          imports.get(importPath)!.add(namedExport);
        }
      }

      for (const cachedType of typesByFile[fileToCreate]) {
        if (!(cachedType.type.parent instanceof protobuf.Type)) {
          if (cachedType.type instanceof protobuf.Enum) {
            nodeList.push(
              this.generateEnumDefinition(cachedType.type, cachedType.generatedName),
              ts.factory.createIdentifier('\n'),
            );
          } else if (cachedType.type instanceof protobuf.Type) {
            nodeList.push(
              this.generateInterfaceFromProtobufType(cachedType.type, cachedType.generatedName, addImport),
              ts.factory.createIdentifier('\n'),
            );
          }
        }
      }

      for (const [importFile, namedImports] of imports) {
        nodeList.unshift(
          ts.factory.createImportDeclaration(
            undefined,
            ts.factory.createImportClause(
              true,
              ts.factory.createIdentifier(`{ ${Array.from(namedImports).join(', ')} }`),
              undefined,
            ),
            ts.factory.createStringLiteral(getRelativePath(fileToCreate, importFile).replace('.ts', ''), true),
          ),
        );
      }

      if (imports.size) {
        nodeList.splice(imports.size, 0, ts.factory.createIdentifier('\n'));
      }

      if (this.config.fileHeaderCommentTemplate) {
        nodeList.unshift(
          ts.factory.createJSDocComment(
            replaceVariables<TypeFileVariables>(this.config.fileHeaderCommentTemplate, {
              generationTimestamp,
              sourceFile: fileToCreate.replace('.ts', '.proto'),
            }),
          ),
          ts.factory.createIdentifier('\n'),
        );
      }

      files.push({
        path: path.join(this.config.outputPath, fileToCreate).replaceAll(path.sep, '/'),
        content: printer.printList(
          ts.ListFormat.MultiLine,
          ts.factory.createNodeArray(nodeList),
          ts.createSourceFile(fileToCreate, '', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS),
        ),
      });
    }

    if (this.config.generateIndexFile) {
      const baseNodes: ts.Node[] = [];

      if (this.config.indexFileHeaderCommentTemplate) {
        baseNodes.push(
          ts.factory.createJSDocComment(
            replaceVariables<IndexFileVariables>(this.config.indexFileHeaderCommentTemplate, { generationTimestamp }),
          ),
        );
      }

      const indexFile = printer.printList(
        ts.ListFormat.MultiLine,
        ts.factory.createNodeArray([
          ...baseNodes,
          ...Object.keys(typesByFile).map((fileCreated) =>
            ts.factory.createExportDeclaration(
              undefined,
              false,
              undefined,
              ts.factory.createStringLiteral(`./${fileCreated.replace('.ts', '')}`, true),
            ),
          ),
        ]),
        ts.createSourceFile('index.ts', '', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS),
      );

      files.push({
        content: indexFile,
        path: path.join(this.config.outputPath, 'index.ts').replaceAll(path.sep, '/'),
      });
    }

    return files;
  }
}
