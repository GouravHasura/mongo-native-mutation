# MongoDB Mutation Generator

This tool generates MongoDB mutation files for Hasura DDN based on schema definitions.

## Setup

This project uses `uv` for Python package management. No external dependencies are required.

### Setup with uv

```bash
# Create a virtual environment
uv venv

# Activate the virtual environment
source .venv/bin/activate  # On Linux/Mac
# or
.venv\Scripts\activate     # On Windows
```

## Usage

```bash
# Generate mutations with default settings
python -m scripts.mongo_mutations.mutations

# Generate mutations with custom directories
python -m scripts.mongo_mutations.mutations --schema-dir path/to/schema --output-dir path/to/output

# Generate mutations with verbose output
python -m scripts.mongo_mutations.mutations --verbose
```

## Command Line Options

- `--schema-dir`: Directory containing schema JSON files (default: "app/connector/mongo/schema")
- `--output-dir`: Directory to save generated mutation files (default: "app/connector/mongo/native_mutations")
- `--verbose`: Enable verbose output

## Generated Mutations

For each collection defined in the schema files, the following mutation files are generated:

1. `insert<Collection>`: Insert a single document
2. `update<Collection>ById`: Update a document by ID
3. `delete<Collection>ById`: Delete a document by ID

Note: The `insertMany<Collection>`, `updateMany<Collection>`, and `deleteMany<Collection>` mutations have been removed due to limitations with field name mapping and to simplify the API.

## Schema Structure

The tool expects schema files in the following format:

```json
{
  "name": "CollectionName",
  "collections": {
    "CollectionName": {
      "type": "CollectionName"
    }
  },
  "objectTypes": {
    "CollectionName": {
      "fields": {
        "field1": {
          "type": {
            "scalar": "string"
          }
        },
        "field2": {
          "type": {
            "nullable": {
              "scalar": "int"
            }
          }
        },
        "_id": {
          "type": {
            "scalar": "objectId"
          }
        }
      }
    }
  }
}
```
