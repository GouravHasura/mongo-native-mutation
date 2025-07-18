#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

interface BsonSchemaProperty {
  bsonType: string | string[];
  maxLength?: number;
  enum?: any[];
  items?: BsonSchemaProperty;
  properties?: Record<string, BsonSchemaProperty>;
  required?: string[];
  uniqueItems?: boolean;
  additionalProperties?: boolean;
}

interface BsonSchema {
  bsonType: string;
  title?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties: Record<string, BsonSchemaProperty>;
}

interface CollectionValidator {
  $jsonSchema: BsonSchema;
}

interface CollectionDefinition {
  validator: CollectionValidator;
}

interface HasuraFieldType {
  scalar?: string;
  nullable?: {
    scalar?: string;
    object?: string;
    arrayOf?: {
      scalar?: string;
      object?: string;
    };
  };
  object?: string;
  arrayOf?: {
    scalar?: string;
    object?: string;
  };
}

// Allow extendedJSON as a direct type
type HasuraFieldTypeOrExtended = HasuraFieldType | 'extendedJSON';

interface HasuraField {
  type: HasuraFieldTypeOrExtended;
}

interface HasuraObjectType {
  fields: Record<string, HasuraField>;
}

interface HasuraCollection {
  type: string;
}

interface HasuraSchema {
  name: string;
  collections: Record<string, HasuraCollection>;
  objectTypes: Record<string, HasuraObjectType>;
}

function mapBsonTypeToScalar(bsonType: string): string {
  switch (bsonType) {
    case 'string':
      return 'string';
    case 'int':
    case 'long':
      return 'int';
    case 'double':
    case 'decimal':
      return 'double';
    case 'bool':
    case 'boolean':
      return 'bool';
    case 'date':
      return 'date';
    case 'timestamp':
      return 'timestamp';
    case 'objectId':
      return 'objectId';
    case 'uuid':
      return 'uuid';
    case 'binData':
      return 'binData';
    case 'regex':
      return 'regex';
    case 'javascript':
      return 'javascript';
    case 'javascriptWithScope':
      return 'javascriptWithScope';
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'minKey':
      return 'minKey';
    case 'maxKey':
      return 'maxKey';
    case 'dbPointer':
      return 'dbPointer';
    case 'symbol':
      return 'symbol';
    case 'array':
      // Arrays should be handled in convertBsonPropertyToHasuraField, not here
      console.warn(`Array type should not be mapped to scalar, defaulting to 'extendedJSON'`);
      return 'extendedJSON';
    default:
      console.warn(`Unknown bsonType: ${bsonType}, defaulting to 'extendedJSON'`);
      return 'extendedJSON';
  }
}

function isRequired(fieldName: string, required: string[] = []): boolean {
  return required.includes(fieldName);
}

function convertBsonPropertyToHasuraField(
  property: BsonSchemaProperty,
  fieldName: string,
  required: string[] = [],
  collectionName: string,
  objectTypes: Record<string, HasuraObjectType>
): HasuraField {
  const isFieldRequired = isRequired(fieldName, required);

  // Handle array types
  if (property.bsonType === 'array' && property.items) {
    const itemType = convertBsonPropertyToHasuraField(
      property.items,
      `${fieldName}_item`,
      property.items.required || [],
      collectionName,
      objectTypes
    );

    if (typeof itemType.type === 'string') {
      // Handle extendedJSON type
      return {
        type: isFieldRequired
          ? { arrayOf: { scalar: 'extendedJSON' } }
          : { nullable: { arrayOf: { scalar: 'extendedJSON' } } }
      };
    } else if (itemType.type.scalar) {
      return {
        type: isFieldRequired
          ? { arrayOf: { scalar: itemType.type.scalar } }
          : { nullable: { arrayOf: { scalar: itemType.type.scalar } } }
      };
    } else if (itemType.type.object) {
      return {
        type: isFieldRequired
          ? { arrayOf: { object: itemType.type.object } }
          : { nullable: { arrayOf: { object: itemType.type.object } } }
      };
    } else if (itemType.type.nullable?.scalar) {
      return {
        type: isFieldRequired
          ? { arrayOf: { scalar: itemType.type.nullable.scalar } }
          : { nullable: { arrayOf: { scalar: itemType.type.nullable.scalar } } }
      };
    } else if (itemType.type.nullable?.object) {
      return {
        type: isFieldRequired
          ? { arrayOf: { object: itemType.type.nullable.object } }
          : { nullable: { arrayOf: { object: itemType.type.nullable.object } } }
      };
    }
  }

  // Handle object types
  if (property.bsonType === 'object') {
    if (property.properties) {
      // Create a nested object type
      const objectTypeName = `${collectionName}_${fieldName}`;
      const nestedObjectType: HasuraObjectType = {
        fields: {}
      };

      Object.entries(property.properties).forEach(([propName, propDef]) => {
        nestedObjectType.fields[propName] = convertBsonPropertyToHasuraField(
          propDef,
          propName,
          property.required || [],
          objectTypeName,
          objectTypes
        );
      });

      objectTypes[objectTypeName] = nestedObjectType;

      return {
        type: isFieldRequired
          ? { object: objectTypeName }
          : { nullable: { object: objectTypeName } }
      };
    } else {
      // Generic object without specific properties - use extendedJSON
      return {
        type: isFieldRequired
          ? 'extendedJSON'
          : { nullable: 'extendedJSON' }
      };
    }
  }

  // Handle scalar types
  if (typeof property.bsonType === 'string') {
    const scalarType = mapBsonTypeToScalar(property.bsonType);
    return {
      type: isFieldRequired
        ? { scalar: scalarType }
        : { nullable: { scalar: scalarType } }
    };
  }

  // Handle union types (array of bsonTypes)
  if (Array.isArray(property.bsonType)) {
    // For simplicity, use the first type or default to extendedJSON
    const primaryType = property.bsonType[0] || 'extendedJSON';
    const scalarType = mapBsonTypeToScalar(primaryType);
    return {
      type: isFieldRequired
        ? { scalar: scalarType }
        : { nullable: { scalar: scalarType } }
    };
  }

  // Fallback - use extendedJSON
  return {
    type: isFieldRequired
      ? 'extendedJSON'
      : { nullable: 'extendedJSON' }
  };
}

function parseMongoScript(content: string): { collectionName: string; schema: BsonSchema } | null {
  try {
    // Extract collection name from db.createCollection("COLLECTION_NAME", ...)
    const collectionMatch = content.match(/db\.createCollection\s*\(\s*["']([^"']+)["']/);
    if (!collectionMatch) {
      throw new Error('Could not find collection name in script');
    }
    const collectionName = collectionMatch[1];

    // Extract the validator object - more robust approach
    const validatorStart = content.indexOf('validator:');
    if (validatorStart === -1) {
      throw new Error('Could not find validator in script');
    }

    // Find the opening brace after 'validator:'
    const openBraceIndex = content.indexOf('{', validatorStart);
    if (openBraceIndex === -1) {
      throw new Error('Could not find validator object start');
    }

    // Find the matching closing brace
    let braceCount = 0;
    let endIndex = openBraceIndex;
    for (let i = openBraceIndex; i < content.length; i++) {
      if (content[i] === '{') braceCount++;
      if (content[i] === '}') braceCount--;
      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }

    let validatorStr = content.substring(openBraceIndex, endIndex + 1);

    // More comprehensive JavaScript-to-JSON conversion
    validatorStr = validatorStr
      // Quote unquoted property names
      .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
      // Quote unquoted string values (but not numbers, booleans, arrays, objects)
      .replace(/:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*([,}\]])/g, (_match, value, suffix) => {
        // Don't quote true, false, null, or numbers
        if (['true', 'false', 'null'].includes(value) || /^\d+$/.test(value)) {
          return `: ${value}${suffix}`;
        }
        return `: "${value}"${suffix}`;
      })
      // Remove trailing commas
      .replace(/,(\s*[}\]])/g, '$1');

    const validator = JSON.parse(validatorStr);

    if (!validator.$jsonSchema) {
      throw new Error('Validator does not contain $jsonSchema');
    }

    return {
      collectionName,
      schema: validator.$jsonSchema
    };
  } catch (error) {
    console.error('Error parsing MongoDB script:', error);
    return null;
  }
}

function convertToHasuraSchema(collectionName: string, bsonSchema: BsonSchema): HasuraSchema {
  const objectTypes: Record<string, HasuraObjectType> = {};
  
  // Create the main collection object type
  const mainObjectType: HasuraObjectType = {
    fields: {}
  };

  // Convert each property
  Object.entries(bsonSchema.properties).forEach(([fieldName, property]) => {
    mainObjectType.fields[fieldName] = convertBsonPropertyToHasuraField(
      property,
      fieldName,
      bsonSchema.required || [],
      collectionName,
      objectTypes
    );
  });

  // Add the main object type
  objectTypes[collectionName] = mainObjectType;

  return {
    name: collectionName,
    collections: {
      [collectionName]: {
        type: collectionName
      }
    },
    objectTypes
  };
}

function processFile(filePath: string, outputDir: string): void {
  console.log(`Processing: ${filePath}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseMongoScript(content);
  
  if (!parsed) {
    console.error(`Failed to parse: ${filePath}`);
    return;
  }

  const { collectionName, schema } = parsed;
  const hasuraSchema = convertToHasuraSchema(collectionName, schema);
  
  const outputPath = path.join(outputDir, `${collectionName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(hasuraSchema, null, 2));
  
  console.log(`Generated: ${outputPath}`);
}

function main() {
  const args = (globalThis as any).process?.argv?.slice(2) || [];

  if (args.length !== 2) {
    console.error('Usage: npx tsx generate-schema.ts <input-directory> <output-directory>');
    console.error('Example: npx tsx generate-schema.ts ../schema ../app/connector/mongo/schema');
    (globalThis as any).process?.exit(1);
    return;
  }

  const [inputDir, outputDir] = args;

  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory does not exist: ${inputDir}`);
    (globalThis as any).process?.exit(1);
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  // Process all .txt files in the input directory
  const files = fs.readdirSync(inputDir).filter((file: string) => file.endsWith('.txt'));

  console.log(`Processing ${files.length} script files...`);

  files.forEach((file: string) => {
    const filePath = path.join(inputDir, file);
    try {
      processFile(filePath, outputDir);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  });

  console.log('Schema generation complete!');
}

// Run main function
main();
