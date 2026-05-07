// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

// ---------------------------------------------------------------------------
// Raw OpenAPI 3.1 document types — the shapes we read from schema.json
// ---------------------------------------------------------------------------

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OpenApiSchemaProperty {
  type?: string;
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: (string | number | boolean)[];
  format?: string;
  $ref?: string;
}

export interface OpenApiSchemaObject {
  type: "object";
  properties?: Record<string, OpenApiSchemaProperty>;
  required?: string[];
}

export interface OpenApiRequestBody {
  required?: boolean;
  content: {
    "application/json": {
      schema: OpenApiSchemaObject;
    };
  };
}

export interface OpenApiOperation {
  operationId: string;
  summary?: string;
  description?: string;
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, unknown>;
}

export interface OpenApiPathItem {
  post?: OpenApiOperation;
}

export interface ReactorTrackExtension {
  name: string;
  kind: "video" | "audio";
  direction: "in" | "out";
}

export interface ReactorExtensions {
  tracks?: ReactorTrackExtension[];
}

export interface OpenApiComponentSchemaObject {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, OpenApiSchemaProperty>;
  required?: string[];
}

export interface OpenApiComponents {
  schemas?: Record<string, OpenApiComponentSchemaObject>;
}

export interface OpenApiSchema {
  openapi: string;
  info: OpenApiInfo;
  "x-reactor"?: ReactorExtensions;
  paths?: Record<string, OpenApiPathItem>;
  webhooks?: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
}
