#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

interface SchemaField {
  type: {
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
  };
}

interface ObjectType {
  fields: Record<string, SchemaField>;
}

interface Collection {
  type: string;
}

interface Schema {
  name: string;
  collections: Record<string, Collection>;
  objectTypes: Record<string, ObjectType>;
}

function mapScalarType(scalarType: string): string {
  switch (scalarType) {
    // Supported basic types
    case 'string':
      return 'string';
    case 'int':
    case 'long':
    case 'double':
    case 'decimal':
    case 'float':
      return 'number';
    case 'bool':
    case 'boolean':
      return 'boolean';

    // Date/time types - use string for compatibility
    case 'date':
    case 'timestamp':
      return 'string';

    // MongoDB-specific types mapped to string
    case 'objectId':
    case 'uuid':
    case 'javascript':
    case 'javascriptWithScope':
      return 'string';

    // Binary data - avoid complex unions, use JSONValue
    case 'binData':
      return 'sdk.JSONValue';

    // Regex - avoid RegExp union, use JSONValue
    case 'regex':
      return 'sdk.JSONValue';

    // Types that must use JSONValue (unsupported as standalone)
    case 'extendedJSON':
    case 'null':
    case 'undefined':
    case 'minKey':
    case 'maxKey':
    case 'dbPointer':
    case 'symbol':
      return 'sdk.JSONValue';

    // Unknown types default to JSONValue for safety
    default:
      console.warn(`Unknown scalar type: ${scalarType}, defaulting to 'sdk.JSONValue'`);
      return 'sdk.JSONValue';
  }
}

function generateTypeFromField(field: SchemaField, objectTypes: Record<string, ObjectType>, typeName: string): string {
  let resultType: string;

  if (field.type.scalar) {
    resultType = mapScalarType(field.type.scalar);
  } else if (field.type.nullable) {
    const innerType = generateTypeFromField({ type: field.type.nullable }, objectTypes, typeName);
    resultType = `${innerType} | null`;
  } else if (field.type.object) {
    resultType = sanitizeTypeName(field.type.object);
  } else if (field.type.arrayOf) {
    if (field.type.arrayOf.scalar) {
      const scalarType = mapScalarType(field.type.arrayOf.scalar);
      // Handle special cases where null/undefined arrays should be JSONValue arrays
      if (scalarType === 'sdk.JSONValue') {
        resultType = 'sdk.JSONValue[]';
      } else {
        resultType = `${scalarType}[]`;
      }
    } else if (field.type.arrayOf.object) {
      resultType = `${sanitizeTypeName(field.type.arrayOf.object)}[]`;
    } else {
      resultType = 'sdk.JSONValue[]';
    }
  } else {
    resultType = 'sdk.JSONValue';
  }

  // Validate and sanitize the final type
  return validateAndSanitizeType(resultType);
}

function isValidTypeScriptIdentifier(name: string): boolean {
  // Check if it's a valid TypeScript identifier
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

function sanitizeTypeName(name: string): string {
  // Replace invalid characters with underscores for type names
  return name.replace(/[^a-zA-Z0-9_$]/g, '_');
}

function mutationTypeName(name: string, type: 'insert' | 'update' | 'delete', many: boolean = false): string {
  switch (type) {
    case 'insert':
      return `${name}MutationInsert${many ? 'Many' : ''}`;
    case 'update':
      return `${name}MutationUpdate${many ? 'Many' : ''}`;
    case 'delete':
      return `${name}MutationDelete${many ? 'Many' : ''}`;
  }

  return `${name}Mutation${many ? 'Many' : ''}`;
}

function validateAndSanitizeType(typeString: string): string {
  // Check for unsupported union patterns and fix them

  // Pattern 1: Complex unions (not type | null or type | undefined)
  const complexUnionPattern = /^([^|]+)\s*\|\s*([^|]+)$/;
  const match = typeString.match(complexUnionPattern);

  if (match) {
    const [, type1, type2] = match;

    // Allow type | null and type | undefined
    if (type2.trim() === 'null' || type2.trim() === 'undefined') {
      return typeString; // This is allowed
    }

    // Allow null | type and undefined | type (reverse order)
    if (type1.trim() === 'null' || type1.trim() === 'undefined') {
      return typeString; // This is allowed
    }

    // Disallow other complex unions - convert to JSONValue
    console.warn(`Converting unsupported union type '${typeString}' to sdk.JSONValue`);
    return 'sdk.JSONValue';
  }

  // Pattern 2: Standalone problematic types
  if (typeString.trim() === 'null' || typeString.trim() === 'undefined') {
    console.warn(`Converting standalone '${typeString}' to sdk.JSONValue`);
    return 'sdk.JSONValue';
  }

  // Pattern 3: Multiple unions (more than 2 types)
  if ((typeString.match(/\|/g) || []).length > 1) {
    console.warn(`Converting multi-union type '${typeString}' to sdk.JSONValue`);
    return 'sdk.JSONValue';
  }

  // Pattern 4: Any remaining problematic types (function types, classes, etc.)
  const problematicPatterns = [
    /\bFunction\b/,
    /\bclass\b/,
    /\bMap\b/,
    /\bSet\b/,
    /\bWeakMap\b/,
    /\bWeakSet\b/,
    /\bPromise\b/,
    /\bRegExp\b/,
    /\bBuffer\b/,
    /\bUint8Array\b/,
    /\bArrayBuffer\b/,
    /\bvoid\b/,
    /\bany\b/,
    /\bunknown\b/
  ];

  for (const pattern of problematicPatterns) {
    if (pattern.test(typeString)) {
      console.warn(`Converting problematic type '${typeString}' to sdk.JSONValue`);
      return 'sdk.JSONValue';
    }
  }

  return typeString;
}

function generateObjectTypeInterface(name: string, objectType: ObjectType, objectTypes: Record<string, ObjectType>): string {
  const sanitizedName = sanitizeTypeName(name);
  const fields = Object.entries(objectType.fields)
    .map(([fieldName, field]) => {
      const fieldType = generateTypeFromField(field, objectTypes, name);
      const quotedFieldName = isValidTypeScriptIdentifier(fieldName) ? fieldName : `"${fieldName}"`;
      return `  ${quotedFieldName}: ${fieldType};`;
    })
    .join('\n');

  return `interface ${sanitizedName} {\n${fields}\n}`;
}

function generateFilterType(collectionName: string, objectType: ObjectType): string {
  const sanitizedName = sanitizeTypeName(collectionName);
  const fields = Object.entries(objectType.fields)
    .filter(([fieldName]) => !fieldName.startsWith('_') || fieldName === '_id') // Include _id but exclude other internal fields for filtering
    .map(([fieldName, field]) => {
      // For filters, we only support equality on top-level fields
      let fieldType = 'sdk.JSONValue';
      if (field.type.scalar) {
        fieldType = mapScalarType(field.type.scalar);
      } else if (field.type.nullable?.scalar) {
        fieldType = `${mapScalarType(field.type.nullable.scalar)} | null`;
      } else if (field.type.object || field.type.nullable?.object) {
        // For complex objects in filters, use JSONValue
        fieldType = 'sdk.JSONValue';
      }
      const quotedFieldName = isValidTypeScriptIdentifier(fieldName) ? fieldName : `"${fieldName}"`;
      return `  ${quotedFieldName}?: ${fieldType};`;
    })
    .join('\n');

  // Add Hasura DDN's id field mapping (id -> _id)
  const idField = objectType.fields['_id'];
  if (idField) {
    let idFieldType = 'string';
    if (idField.type.scalar) {
      idFieldType = mapScalarType(idField.type.scalar);
    } else if (idField.type.nullable?.scalar) {
      idFieldType = `${mapScalarType(idField.type.nullable.scalar)} | null`;
    }
    const idFieldLine = `  id?: ${idFieldType};`;
    const finalFields = fields ? `${idFieldLine}\n${fields}` : idFieldLine;
    return `interface ${sanitizedName}Filter {\n${finalFields}\n}`;
  }

  return `interface ${sanitizedName}Filter {\n${fields}\n}`;
}

function generateInsertType(collectionName: string, objectType: ObjectType): string {
  const sanitizedName = sanitizeTypeName(collectionName);
  const fields = Object.entries(objectType.fields)
    .filter(([fieldName]) => fieldName !== '_id') // Exclude _id from inserts as it's auto-generated
    .map(([fieldName, field]) => {
      const fieldType = generateTypeFromField(field, {}, collectionName);
      const isOptional = field.type.nullable ? '?' : '';
      const quotedFieldName = isValidTypeScriptIdentifier(fieldName) ? fieldName : `"${fieldName}"`;
      return `  ${quotedFieldName}${isOptional}: ${fieldType};`;
    })
    .join('\n');

  return `interface ${mutationTypeName(sanitizedName, 'insert', false)} {\n${fields}\n}`;
}

function generateUpdateType(collectionName: string, objectType: ObjectType): string {
  const sanitizedName = sanitizeTypeName(collectionName);
  const fields = Object.entries(objectType.fields)
    .filter(([fieldName]) => fieldName !== '_id') // Exclude _id from updates
    .map(([fieldName, field]) => {
      const fieldType = generateTypeFromField(field, {}, collectionName);
      const quotedFieldName = isValidTypeScriptIdentifier(fieldName) ? fieldName : `"${fieldName}"`;
      return `  ${quotedFieldName}?: ${fieldType};`;
    })
    .join('\n');

  return `interface ${mutationTypeName(sanitizedName, 'update', false)} {\n${fields}\n}`;
}

function generateDeleteType(collectionName: string): string {
  const sanitizedName = sanitizeTypeName(collectionName);
  return `interface ${mutationTypeName(sanitizedName, 'delete', false)} {\n  acknowledged: boolean;\n  deletedCount: number;\n}`;
}

function generateParameterList(objectType: ObjectType, collectionName: string, operationType: 'insert' | 'update'): string {
  return Object.entries(objectType.fields)
    .filter(([fieldName]) => fieldName !== '_id') // Exclude _id from inserts/updates
    .map(([fieldName, field]) => {
      const fieldType = generateTypeFromField(field, {}, collectionName);
      // For single variants, make all parameters optional to avoid TypeScript parameter ordering issues
      const isOptional = '?';
      const quotedFieldName = isValidTypeScriptIdentifier(fieldName) ? fieldName : `"${fieldName}"`;
      return `${quotedFieldName}${isOptional}: ${fieldType}`;
    })
    .join(', ');
}

function generateMutationFunctions(collectionName: string, objectType: ObjectType): string {
  const sanitizedName = sanitizeTypeName(collectionName);
  return `
/**
 * Insert multiple ${collectionName} documents
 */
export async function insert${sanitizedName}Many(documents: ${mutationTypeName(sanitizedName, 'insert', false)}[]): Promise<{ insertedIds: string[] }> {
  const spanAttributes = {
    collection: '${collectionName}',
    operation: 'insert',
    documentsCount: documents?.length || 0
  };

  return await sdk.withActiveSpan(tracer, 'insert_${collectionName}', async () => {
    if (!documents || documents.length === 0) {
      throw new sdk.UnprocessableContent('Documents array cannot be empty', {
        collection: '${collectionName}',
        documentsLength: documents?.length || 0
      });
    }

    try {
      const db = await getDatabase();
      const collection = db.collection('${collectionName}');

      // Clean documents and convert ISO date strings to Date objects
      const convertedDocuments = documents.map(doc => {
        // First, remove undefined fields (keep nulls) and handle sdk.JSONValue
        const cleanDoc: any = {};
        Object.keys(doc as any).forEach(key => {
          const docAny = doc as any;
          if (docAny[key] !== undefined) {
            // Handle sdk.JSONValue types by extracting .value
            const value = docAny[key];
            if (value && typeof value === 'object' && 'value' in value && Object.keys(value).length === 1) {
              cleanDoc[key] = value.value;
            } else {
              cleanDoc[key] = value;
            }
          }
        });

        // Then convert date strings to Date objects based on schema
        const converted = convertDateFieldsToObjects(cleanDoc, '${collectionName}');
        console.log('Original document:', doc);
        console.log('Clean document:', cleanDoc);
        console.log('Converted document:', converted);
        return converted;
      });

      const result = await collection.insertMany(convertedDocuments as any[]);
      return { insertedIds: Object.values(result.insertedIds).map(id => id.toString()) };
    } catch (error) {
      if (error instanceof sdk.UnprocessableContent) {
        throw error; // Re-throw SDK errors as-is
      }

      const details = error instanceof Error ? sdk.getErrorDetails(error) : { error: String(error) };

      // Handle specific MongoDB errors
      if (error instanceof Error) {
        if (error.message.includes('duplicate key')) {
          throw new sdk.Conflict('Document with duplicate key already exists', {
            collection: '${collectionName}',
            ...details
          });
        }
        if (error.message.includes('validation')) {
          throw new sdk.UnprocessableContent('Document validation failed', {
            collection: '${collectionName}',
            ...details
          });
        }
      }

      throw new sdk.UnprocessableContent('Failed to insert documents', {
        collection: '${collectionName}',
        ...details
      });
    }
  }, spanAttributes);
}

/**
 * Update ${collectionName} documents matching the filter
 */
export async function update${sanitizedName}Many(filter: ${sanitizedName}Filter, updates: ${mutationTypeName(sanitizedName, 'update', false)}[]): Promise<{ modifiedCount: number }> {
  const spanAttributes = {
    collection: '${collectionName}',
    operation: 'update',
    updatesCount: updates?.length || 0,
    filter: JSON.stringify(filter)
  };

  return await sdk.withActiveSpan(tracer, 'update_${collectionName}', async () => {
    if (!updates || updates.length === 0) {
      throw new sdk.UnprocessableContent('Updates array cannot be empty', {
        collection: '${collectionName}',
        updatesLength: updates?.length || 0
      });
    }

    try {
      const db = await getDatabase();
      const collection = db.collection('${collectionName}');

      // Convert string _id to ObjectId if present
      const mongoFilter = convertFilterId(filter);

      // Apply updates to all documents matching the filter
      let totalModifiedCount = 0;
      for (const update of updates) {
        // First, remove undefined fields (keep nulls) and handle sdk.JSONValue
        const cleanUpdate: any = {};
        Object.keys(update as any).forEach(key => {
          const updateAny = update as any;
          if (updateAny[key] !== undefined) {
            // Handle sdk.JSONValue types by extracting .value
            const value = updateAny[key];
            if (value && typeof value === 'object' && 'value' in value && Object.keys(value).length === 1) {
              cleanUpdate[key] = value.value;
            } else {
              cleanUpdate[key] = value;
            }
          }
        });

        // Then convert date fields to Date objects based on schema
        const convertedUpdate = convertDateFieldsToObjects(cleanUpdate, '${collectionName}');
        console.log('Original update:', update);
        console.log('Clean update:', cleanUpdate);
        console.log('Converted update:', convertedUpdate);
        const result = await collection.updateMany(mongoFilter, { $set: convertedUpdate });
        totalModifiedCount += result.modifiedCount;
      }

      return { modifiedCount: totalModifiedCount };
    } catch (error) {
      if (error instanceof sdk.UnprocessableContent) {
        throw error; // Re-throw SDK errors as-is
      }

      const details = error instanceof Error ? sdk.getErrorDetails(error) : { error: String(error) };

      // Handle specific MongoDB errors
      if (error instanceof Error) {
        if (error.message.includes('validation')) {
          throw new sdk.UnprocessableContent('Update validation failed', {
            collection: '${collectionName}',
            filter,
            ...details
          });
        }
      }

      throw new sdk.UnprocessableContent('Failed to update documents', {
        collection: '${collectionName}',
        filter,
        ...details
      });
    }
  }, spanAttributes);
}



/**
 * Insert a single ${collectionName} document
 */
export async function insert${sanitizedName}(${generateParameterList(objectType, collectionName, 'insert')}): Promise<{ insertedId: string }> {
  const spanAttributes = {
    collection: '${collectionName}',
    operation: 'insert',
    documentsCount: 1
  };

  return await sdk.withActiveSpan(tracer, 'insert_${collectionName}', async () => {
    try {
      const db = await getDatabase();
      const collection = db.collection('${collectionName}');

      // Build document from individual parameters
      const document: any = {};
      ${Object.entries(objectType.fields)
        .filter(([fieldName]) => fieldName !== '_id')
        .map(([fieldName, field]) => {
          const quotedFieldName = isValidTypeScriptIdentifier(fieldName) ? fieldName : `"${fieldName}"`;
          const fieldType = generateTypeFromField(field, {}, collectionName);
          const isJSONValue = fieldType.includes('sdk.JSONValue');

          if (isJSONValue) {
            return `      if (${quotedFieldName} !== undefined) {
        document[${JSON.stringify(fieldName)}] = ${quotedFieldName}?.value ?? ${quotedFieldName};
      }`;
          } else {
            return `      if (${quotedFieldName} !== undefined) {
        document[${JSON.stringify(fieldName)}] = ${quotedFieldName};
      }`;
          }
        })
        .join('\n')}

      // Then convert date strings to Date objects based on schema
      const converted = convertDateFieldsToObjects(document, '${collectionName}');
      console.log('Original document:', document);
      console.log('Converted document:', converted);

      const result = await collection.insertOne(converted as any);
      return { insertedId: result.insertedId.toString() };
    } catch (error) {
      if (error instanceof sdk.UnprocessableContent) {
        throw error; // Re-throw SDK errors as-is
      }

      const details = error instanceof Error ? sdk.getErrorDetails(error) : { error: String(error) };

      // Handle specific MongoDB errors
      if (error instanceof Error) {
        if (error.message.includes('duplicate key')) {
          throw new sdk.Conflict('Document with duplicate key already exists', {
            collection: '${collectionName}',
            ...details
          });
        }
        if (error.message.includes('validation')) {
          throw new sdk.UnprocessableContent('Document validation failed', {
            collection: '${collectionName}',
            ...details
          });
        }
      }

      throw new sdk.UnprocessableContent('Failed to insert document', {
        collection: '${collectionName}',
        ...details
      });
    }
  }, spanAttributes);
}

/**
 * Update a single ${collectionName} document matching the filter
 */
export async function update${sanitizedName}(filter: ${sanitizedName}Filter, ${generateParameterList(objectType, collectionName, 'update')}): Promise<{ modifiedCount: number }> {
  const spanAttributes = {
    collection: '${collectionName}',
    operation: 'update',
    updatesCount: 1,
    filter: JSON.stringify(filter)
  };

  return await sdk.withActiveSpan(tracer, 'update_${collectionName}', async () => {
    try {
      const db = await getDatabase();
      const collection = db.collection('${collectionName}');

      // Convert string _id to ObjectId if present
      const mongoFilter = convertFilterId(filter);

      // Build update document from individual parameters
      const updateDoc: any = {};
      ${Object.entries(objectType.fields)
        .filter(([fieldName]) => fieldName !== '_id')
        .map(([fieldName, field]) => {
          const quotedFieldName = isValidTypeScriptIdentifier(fieldName) ? fieldName : `"${fieldName}"`;
          const fieldType = generateTypeFromField(field, {}, collectionName);
          const isJSONValue = fieldType.includes('sdk.JSONValue');

          if (isJSONValue) {
            return `      if (${quotedFieldName} !== undefined) {
        updateDoc[${JSON.stringify(fieldName)}] = ${quotedFieldName}?.value ?? ${quotedFieldName};
      }`;
          } else {
            return `      if (${quotedFieldName} !== undefined) {
        updateDoc[${JSON.stringify(fieldName)}] = ${quotedFieldName};
      }`;
          }
        })
        .join('\n')}

      // Then convert date fields to Date objects based on schema
      const convertedUpdate = convertDateFieldsToObjects(updateDoc, '${collectionName}');
      console.log('Original update:', updateDoc);
      console.log('Converted update:', convertedUpdate);

      const result = await collection.updateOne(mongoFilter, { $set: convertedUpdate });
      return { modifiedCount: result.modifiedCount };
    } catch (error) {
      if (error instanceof sdk.UnprocessableContent) {
        throw error; // Re-throw SDK errors as-is
      }

      const details = error instanceof Error ? sdk.getErrorDetails(error) : { error: String(error) };

      // Handle specific MongoDB errors
      if (error instanceof Error) {
        if (error.message.includes('validation')) {
          throw new sdk.UnprocessableContent('Update validation failed', {
            collection: '${collectionName}',
            filter,
            ...details
          });
        }
      }

      throw new sdk.UnprocessableContent('Failed to update document', {
        collection: '${collectionName}',
        filter,
        ...details
      });
    }
  }, spanAttributes);
}

/**
 * Delete ${collectionName} documents matching the filter
 */
export async function delete${sanitizedName}(filter: ${sanitizedName}Filter): Promise<${mutationTypeName(sanitizedName, 'delete', false)}> {
  const spanAttributes = {
    collection: '${collectionName}',
    operation: 'delete',
    filter: JSON.stringify(filter)
  };

  return await sdk.withActiveSpan(tracer, 'delete_${collectionName}', async () => {
    try {
      const db = await getDatabase();
      const collection = db.collection('${collectionName}');

      // Convert string _id to ObjectId if present
      const mongoFilter = convertFilterId(filter);

      const result = await collection.deleteMany(mongoFilter);
      return { acknowledged: result.acknowledged, deletedCount: result.deletedCount };
    } catch (error) {
      if (error instanceof sdk.UnprocessableContent) {
        throw error; // Re-throw SDK errors as-is
      }

      const details = error instanceof Error ? sdk.getErrorDetails(error) : { error: String(error) };

      throw new sdk.UnprocessableContent('Failed to delete documents', {
        collection: '${collectionName}',
        filter,
        ...details
      });
    }
  }, spanAttributes);
}`;
}

function generateOutputContent(allTypes: string[], allFunctions: string[], mongoUriEnvVar: string): string {
  return `/**
 * Generated MongoDB mutation functions and types
 * Generated on: ${new Date().toISOString()}
 */

import { MongoClient, Db, ObjectId } from 'mongodb';
import * as sdk from '@hasura/ndc-lambda-sdk';
import opentelemetry from '@opentelemetry/api';

// Initialize tracer for MongoDB mutations
const tracer = opentelemetry.trace.getTracer('mongodb-mutations');

// MongoDB connection management
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

async function getDatabase(): Promise<Db> {
  if (cachedDb && cachedClient) {
    return cachedDb;
  }

  const uri = process.env.${mongoUriEnvVar};

  if (!uri) {
    throw new sdk.UnprocessableContent('${mongoUriEnvVar} environment variable is required', {
      missingVariable: '${mongoUriEnvVar}'
    });
  }

  // Extract database name from URI
  let dbName: string;
  try {
    const url = new URL(uri);
    dbName = url.pathname.slice(1); // Remove leading '/'

    if (!dbName) {
      throw new sdk.UnprocessableContent('Database name must be included in the MongoDB URI', {
        uri: uri.replace(/:\\/\\/[^@]+@/, '://***:***@'), // Hide credentials in error
        example: 'mongodb://user:pass@host:port/database_name'
      });
    }
  } catch (error) {
    if (error instanceof sdk.UnprocessableContent) {
      throw error;
    }
    throw new sdk.UnprocessableContent('Invalid MongoDB URI format', {
      uri: uri.replace(/:\\/\\/[^@]+@/, '://***:***@'), // Hide credentials in error
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
    cachedDb = cachedClient.db(dbName);
    return cachedDb;
  } catch (error) {
    const details = error instanceof Error ? sdk.getErrorDetails(error) : { error: String(error) };
    throw new sdk.UnprocessableContent('Failed to connect to MongoDB', details);
  }
}

// Helper function to convert string id/_id to ObjectId
function convertFilterId(filter: any): any {
  const mongoFilter: any = {};

  // Copy only defined fields from the original filter
  Object.keys(filter).forEach(key => {
    if (filter[key] !== undefined && filter[key] !== null) {
      mongoFilter[key] = filter[key];
    }
  });

  // Handle Hasura DDN's id -> _id mapping
  if (filter.id && typeof filter.id === 'string') {
    try {
      mongoFilter._id = ObjectId.createFromHexString(filter.id);
      delete mongoFilter.id; // Remove the id field, use _id instead
    } catch (error) {
      throw new sdk.UnprocessableContent('Invalid ObjectId format for id field', {
        invalidId: filter.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Also handle direct _id field (for completeness)
  if (filter._id && typeof filter._id === 'string') {
    try {
      mongoFilter._id = ObjectId.createFromHexString(filter._id);
    } catch (error) {
      throw new sdk.UnprocessableContent('Invalid ObjectId format for _id field', {
        invalidId: filter._id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return mongoFilter;
}

// Helper function to convert date fields to Date objects
function convertDateFieldsToObjects(obj: any, collectionName: string): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Define date fields for each collection based on schema
  const dateFields: Record<string, string[]> = {
    'APPL_VER_CNFG_KEY': ['chg_dttm', 'creat_dttm'],
    'DATA_DOM': ['chg_dttm', 'creat_dttm'],
    'DATA_SCHM': ['chg_dttm', 'creat_dttm'],
    'SYS_CNFG': ['chg_dttm', 'creat_dttm', 'end_dt', 'strt_dt'],
    'SYS_FTUR_FLG': ['chg_dttm', 'creat_dttm', 'end_dt', 'lst_req_dttm', 'strt_dt'],
    'SYS_FTUR_FLG_CLI_VAR': ['chg_dttm', 'creat_dttm', 'eff_end_tm', 'eff_strt_tm', 'lst_req_dttm']
  };

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    const converted: any = {};
    const fieldsToConvert = dateFields[collectionName] || [];

    for (const [key, value] of Object.entries(obj)) {
      // Check if this field should be converted to a Date
      if (fieldsToConvert.includes(key) && value && typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          console.log(\`Converting date field '\${key}' from string to Date:\`, value, '->', date);
          converted[key] = date;
          continue;
        }
      }

      converted[key] = value;
    }
    return converted;
  }

  return obj;
}

// Helper function to convert Date objects to ISO strings
function convertDatesToStrings(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertDatesToStrings(item));
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertDatesToStrings(value);
    }
    return converted;
  }

  return obj;
}

// Type definitions
${allTypes.join('\n\n')}

// Mutation functions
${allFunctions.join('\n')}
`;
}

function processSchemaFile(filePath: string): { types: string[], functions: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const schema: Schema = JSON.parse(content);
  
  const types: string[] = [];
  const functions: string[] = [];
  
  // Generate object type interfaces
  Object.entries(schema.objectTypes).forEach(([typeName, objectType]) => {
    types.push(generateObjectTypeInterface(typeName, objectType, schema.objectTypes));
  });
  
  // Generate mutation types and functions for each collection
  Object.entries(schema.collections).forEach(([collectionName, collection]) => {
    const objectType = schema.objectTypes[collection.type];
    if (objectType) {
      // Generate types (base types only - single variants, many variants use arrays)
      types.push(generateFilterType(collectionName, objectType));
      types.push(generateInsertType(collectionName, objectType)); // Single variant
      types.push(generateUpdateType(collectionName, objectType)); // Single variant
      types.push(generateDeleteType(collectionName)); // Single variant

      // Generate functions
      functions.push(generateMutationFunctions(collectionName, objectType));
    }
  });
  
  return { types, functions };
}




function main() {
  const args = (globalThis as any).process?.argv?.slice(2) || [];

  if (args.length < 2 || args.length > 3) {
    console.error('Usage: npx tsx generate-mutations.ts <schema-directory> <output-file> [mongodb-uri-env-var]');
    console.error('Example: npx tsx generate-mutations.ts ../app/connector/mongo/schema ../app/connector/mongots/functions.ts');
    console.error('Example: npx tsx generate-mutations.ts ../app/connector/mongo/schema ../app/connector/mongots/functions.ts APP_MONGO_MONGODB_DATABASE_URI');
    console.error('Note: Database name should be included in the MongoDB URI (e.g., mongodb://user:pass@host:port/database_name)');
    (globalThis as any).process?.exit(1);
    return;
  }

  const [schemaDir, outputFile, mongoUriEnvVar = 'MONGODB_URI'] = args;

  if (!fs.existsSync(schemaDir)) {
    console.error(`Schema directory does not exist: ${schemaDir}`);
    (globalThis as any).process?.exit(1);
    return;
  }

  const allTypes: string[] = [];
  const allFunctions: string[] = [];

  // Process all JSON files in the schema directory
  const files = fs.readdirSync(schemaDir).filter((file: string) => file.endsWith('.json'));

  console.log(`Processing ${files.length} schema files...`);

  files.forEach((file: string) => {
    const filePath = path.join(schemaDir, file);
    console.log(`Processing: ${file}`);

    try {
      const { types, functions } = processSchemaFile(filePath);
      allTypes.push(...types);
      allFunctions.push(...functions);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  });

  // Generate the output file content
  const outputContent = generateOutputContent(allTypes, allFunctions, mongoUriEnvVar);

  // Write to output file
  fs.writeFileSync(outputFile, outputContent);
  console.log(`Generated mutations written to: ${outputFile}`);
  console.log(`Generated ${allTypes.length} types and ${allFunctions.length} collections worth of functions (single and many variants for insert/update, single for delete)`);
  console.log(`Using MongoDB URI env var: ${mongoUriEnvVar}`);
  console.log(`Database name will be extracted from the MongoDB URI`);
}

// Run main function
main();
