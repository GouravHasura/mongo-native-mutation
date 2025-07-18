# DDN MongoDB Mutation Project

This project provides MongoDB mutation capabilities for Hasura DDN using TypeScript lambda functions.

## Quick Start

Follow these steps in order to set up and run the project:

### 1. Configure Context
Add the contents of `add-context.yaml` to `.hasura/context.yaml` under the scripts section.

### 2. Setup Scripts
```bash
ddn run setup-scripts
```
This initializes the necessary scripts and dependencies.

### 2. Generate Schema
```bash
ddn run generate-schema
```
Converts MongoDB collection creation scripts to Hasura DDN schema format.

### 3. Generate Mutations
```bash
ddn run generate-mutations
```
Generates TypeScript mutation functions and types from the schema files.

### 4. Start Docker Services
```bash
ddn run docker-start
```
Starts the required Docker containers for the project.

### 5. Update Connector Link
```bash
ddn connector-link update mongo
```
Updates the MongoDB connector link configuration.

### 6. Stop Docker Services
```bash
# Stop the docker-start process (Ctrl+C if running in foreground)
```
Stop the Docker services that were started in step 4.

### 7. Introspect MongoDB TypeScript Connector
```bash
ddn connector introspect mongots
```
Introspects the MongoDB TypeScript connector to discover available functions.

### 8. Add MongoDB Models
```bash
ddn model add mongo '*'
```
Adds all MongoDB models to the DDN supergraph.

### 9. Add MongoDB TypeScript Commands
```bash
ddn command add mongots '*'
```
Adds all MongoDB TypeScript mutation commands to the DDN supergraph.

### 10. Build Supergraph
```bash
ddn supergraph build local
```
Builds the local supergraph with all the configured models and commands.

### 11. Start Docker Services
```bash
ddn run docker-start
```
Restart the Docker services to run the complete setup.

## What This Does

- **Configure Context**: Adds necessary script configurations to DDN context
- **setup-scripts**: Prepares the development environment
- **generate-schema**: Converts MongoDB `$jsonSchema` validators to Hasura DDN format
- **generate-mutations**: Creates TypeScript functions for insert, update, and delete operations
- **docker-start**: Launches MongoDB and other required services
- **connector-link update**: Configures the MongoDB data connector
- **connector introspect**: Discovers available MongoDB collections and TypeScript functions
- **model add**: Exposes MongoDB collections as GraphQL types
- **command add**: Exposes mutation functions as GraphQL mutations
- **supergraph build**: Builds the complete supergraph configuration
- **docker-start (final)**: Starts the complete system with all configurations

After completing these steps, you'll have a fully functional GraphQL API with MongoDB mutations available through Hasura DDN.
