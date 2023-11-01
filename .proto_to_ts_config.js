const ts = require('typescript');
const protobuf = require('protobufjs');

module.exports = {
  protoPath: 'test/protos',
  namespacesToIgnore: ['google'],
  typeNameIgnoreParentNodeNames: ['company_name', 'services'],
  generateEnumType: 'enum',
  generatedTypeComments: {
    'google.protobuf.Timestamp': 'format: date-time',
  },
  indexFileHeaderCommentTemplate: 'DO NOT EDIT! Types generated at {{generationTimestamp}}.',
  fileHeaderCommentTemplate: 'DO NOT EDIT! Types generated from {{sourceFile}} at {{generationTimestamp}}.',
  customInterfaceBuilder: (node) => {
    if (node.name === 'Filter' || node.name === 'Sort') {
      return {
        typeParameters: [
          ts.factory.createTypeParameterDeclaration([], 'T', undefined, ts.factory.createTypeReferenceNode('any')),
          ts.factory.createTypeParameterDeclaration(
            [],
            'Field',
            ts.factory.createTypeReferenceNode('keyof T | undefined'),
            ts.factory.createTypeReferenceNode('undefined'),
          ),
        ],
        customMemberBuilder: (field) => {
          if (field.name === 'field') {
            return ts.factory.createPropertySignature(
              undefined,
              'field',
              undefined,
              ts.factory.createTypeReferenceNode('Field'),
              undefined,
            );
          }
        },
      };
    }

    return {};
  },
};
