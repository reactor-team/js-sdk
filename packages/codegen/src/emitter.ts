// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import type {
  CodegenOptions,
  EventSchema,
  FieldSchema,
  GeneratedPackage,
  MessageSchema,
  TrackSchema,
} from "./types.js";

function toPascalCase(snake: string): string {
  return snake
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function toCamelCase(snake: string): string {
  const pascal = toPascalCase(snake);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function indent(text: string, level: number): string {
  const pad = "  ".repeat(level);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

function enumValueToTs(v: string | number | boolean): string {
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

const UPLOAD_REF_FORMATS = new Set(["reactor-upload-reference", "file-reference"]);

function isUploadReference(field: FieldSchema): boolean {
  return field.type === "object" && !!field.format && UPLOAD_REF_FORMATS.has(field.format);
}

function fieldSchemaToTsType(field: FieldSchema): string {
  if (isUploadReference(field)) {
    return "FileRef";
  }
  if (field.enum && field.enum.length > 0) {
    return field.enum.map(enumValueToTs).join(" | ");
  }
  switch (field.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "Record<string, unknown>";
    case "array":
      return "unknown[]";
    default:
      return "unknown";
  }
}

function hasUploadRefParam(event: EventSchema): boolean {
  return Object.values(event.fields).some(isUploadReference);
}

function generateJsDoc(lines: string[], indentLevel: number = 0): string {
  if (lines.length === 0) return "";
  const pad = "  ".repeat(indentLevel);
  if (lines.length === 1) return `${pad}/** ${lines[0]} */\n`;
  const inner = lines.map((l) => `${pad} * ${l}`).join("\n");
  return `${pad}/**\n${inner}\n${pad} */\n`;
}

// ---------------------------------------------------------------------------
// Event (command) param interfaces
// ---------------------------------------------------------------------------

function generateParamInterface(
  modelPrefix: string,
  event: EventSchema,
): string {
  const interfaceName = `${modelPrefix}${toPascalCase(event.name)}Params`;
  const fields = Object.entries(event.fields);

  if (fields.length === 0) return "";

  const lines: string[] = [];
  const doc = generateJsDoc(event.description ? [event.description] : [], 0);
  lines.push(`${doc}export interface ${interfaceName} {`);

  for (const [name, field] of fields) {
    const tsType = fieldSchemaToTsType(field);
    const optional = field.default !== undefined ? "?" : "";
    const fieldDoc: string[] = [];
    if (field.description) fieldDoc.push(field.description);
    if (field.minimum !== undefined) fieldDoc.push(`@minimum ${field.minimum}`);
    if (field.maximum !== undefined) fieldDoc.push(`@maximum ${field.maximum}`);
    if (field.minLength !== undefined)
      fieldDoc.push(`@minLength ${field.minLength}`);
    if (field.maxLength !== undefined)
      fieldDoc.push(`@maxLength ${field.maxLength}`);
    if (field.default !== undefined)
      fieldDoc.push(`@default ${JSON.stringify(field.default)}`);

    if (fieldDoc.length > 0) lines.push(indent(generateJsDoc(fieldDoc), 1));
    lines.push(`  ${name}${optional}: ${tsType};`);
  }

  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Message interfaces + discriminated union
// ---------------------------------------------------------------------------

function generateMessageInterface(
  modelPrefix: string,
  message: MessageSchema,
): string {
  const interfaceName = `${modelPrefix}${toPascalCase(message.name)}Message`;
  const fields = Object.entries(message.fields);

  const lines: string[] = [];
  const doc = generateJsDoc(message.description ? [message.description] : [], 0);
  lines.push(`${doc}export interface ${interfaceName} {`);
  lines.push(`  type: "${message.name}";`);

  for (const [name, field] of fields) {
    const tsType = fieldSchemaToTsType(field);
    const fieldDoc: string[] = [];
    if (field.description) fieldDoc.push(field.description);
    if (fieldDoc.length > 0) lines.push(indent(generateJsDoc(fieldDoc), 1));
    lines.push(`  ${name}: ${tsType};`);
  }

  lines.push("}");
  return lines.join("\n");
}

function generateMessageUnion(
  modelPrefix: string,
  messages: MessageSchema[],
): string {
  if (messages.length === 0) return "";

  const members = messages.map(
    (m) => `  | ${modelPrefix}${toPascalCase(m.name)}Message`,
  );
  return `export type ${modelPrefix}Message =\n${members.join("\n")};`;
}

// ---------------------------------------------------------------------------
// Track constants
// ---------------------------------------------------------------------------

function generateTrackConstants(
  modelPrefix: string,
  tracks: TrackSchema[],
): string {
  if (tracks.length === 0) return "";

  const lines: string[] = [];
  lines.push(`export const ${modelPrefix}Tracks = {`);
  for (const track of tracks) {
    const constName = track.name.toUpperCase();
    lines.push(
      `  ${constName}: { name: "${track.name}", kind: "${track.kind}", direction: "${track.direction}" },`,
    );
  }
  lines.push("} as const;");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Options type + client class
// ---------------------------------------------------------------------------

function generateOptionsType(modelPrefix: string): string {
  const lines: string[] = [];
  lines.push(
    generateJsDoc(
      [`Options for creating a ${modelPrefix}Model (model name is set automatically).`],
      0,
    ),
  );
  lines.push(`export interface ${modelPrefix}Options {`);
  lines.push(`  apiUrl?: string;`);
  lines.push(`  local?: boolean;`);
  lines.push("}");
  return lines.join("\n");
}

function generateClientClass(
  modelPrefix: string,
  modelName: string,
  events: EventSchema[],
  messages: MessageSchema[],
): string {
  const className = `${modelPrefix}Model`;
  const optionsType = `${modelPrefix}Options`;
  const needsFileRef = events.some(hasUploadRefParam);

  const lines: string[] = [];

  const classDoc = [
    `Strongly-typed client for the ${modelPrefix} model.`,
    "",
    "Creates a Reactor connection with the model name pre-configured.",
    "Provides typed methods for every event and typed message listeners.",
  ];
  lines.push(generateJsDoc(classDoc, 0));
  lines.push(`export class ${className} {`);
  lines.push(`  readonly reactor: Reactor;`);
  lines.push("");
  lines.push(`  constructor(options?: ${optionsType}) {`);
  lines.push(`    this.reactor = new Reactor({ ...options, modelName: MODEL_NAME });`);
  lines.push(`  }`);
  lines.push("");
  lines.push(`  async connect(jwtToken?: string): Promise<void> {`);
  lines.push(`    await this.reactor.connect(jwtToken);`);
  lines.push(`  }`);
  lines.push("");
  lines.push(`  async disconnect(): Promise<void> {`);
  lines.push(`    await this.reactor.disconnect();`);
  lines.push(`  }`);

  for (const event of events) {
    const methodName = toCamelCase(event.name);
    const fields = Object.entries(event.fields);
    const hasParams = fields.length > 0;
    const paramType = hasParams
      ? `${modelPrefix}${toPascalCase(event.name)}Params`
      : undefined;

    lines.push("");

    const methodDoc: string[] = [];
    if (event.description) methodDoc.push(event.description);
    if (hasParams) methodDoc.push(`@param params - ${event.description}`);
    lines.push(indent(generateJsDoc(methodDoc), 1));

    if (paramType) {
      lines.push(`  async ${methodName}(params: ${paramType}): Promise<void> {`);
      lines.push(
        `    await this.reactor.sendCommand("${event.name}", params);`,
      );
    } else {
      lines.push(`  async ${methodName}(): Promise<void> {`);
      lines.push(
        `    await this.reactor.sendCommand("${event.name}", {});`,
      );
    }
    lines.push(`  }`);
  }

  if (messages.length > 0) {
    lines.push("");
    const listenerDoc = [
      "Subscribe to typed model messages.",
      `@param handler - Called with a discriminated ${modelPrefix}Message`,
      "@returns Unsubscribe function",
    ];
    lines.push(indent(generateJsDoc(listenerDoc), 1));
    lines.push(
      `  onMessage(handler: (message: ${modelPrefix}Message) => void): () => void {`,
    );
    lines.push(`    const wrappedHandler = (raw: unknown) => {`);
    lines.push(`      handler(raw as ${modelPrefix}Message);`);
    lines.push(`    };`);
    lines.push(`    this.reactor.on("message", wrappedHandler);`);
    lines.push(`    return () => this.reactor.off("message", wrappedHandler);`);
    lines.push(`  }`);

    for (const message of messages) {
      const hookName = `on${toPascalCase(message.name)}`;
      const msgType = `${modelPrefix}${toPascalCase(message.name)}Message`;
      lines.push("");
      lines.push(
        indent(
          generateJsDoc([
            `Subscribe to "${message.name}" messages only.`,
            `@returns Unsubscribe function`,
          ]),
          1,
        ),
      );
      lines.push(
        `  ${hookName}(handler: (message: ${msgType}) => void): () => void {`,
      );
      lines.push(`    return this.onMessage((msg) => {`);
      lines.push(`      if (msg.type === "${message.name}") handler(msg as ${msgType});`);
      lines.push(`    });`);
      lines.push(`  }`);
    }
  }

  if (needsFileRef) {
    lines.push("");
    const uploadDoc = [
      "Upload a file and get a FileRef for use in events.",
      "@param file - File or Blob to upload",
      "@param options - Optional name override",
    ];
    lines.push(indent(generateJsDoc(uploadDoc), 1));
    lines.push(
      `  async uploadFile(file: File | Blob, options?: { name?: string }): Promise<FileRef> {`,
    );
    lines.push(`    return this.reactor.uploadFile(file, options);`);
    lines.push(`  }`);
  }

  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Full source file assembly
// ---------------------------------------------------------------------------

function generateSourceFile(options: CodegenOptions): string {
  const { schema } = options;
  const modelPrefix = toPascalCase(schema.modelName);
  const events = schema.events;
  const messages = schema.messages;
  const tracks = schema.tracks;

  const needsFileRef = events.some(hasUploadRefParam);

  const sections: string[] = [];

  sections.push(`// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.`);
  sections.push("");
  sections.push(`// Auto-generated by @reactor-team/codegen — DO NOT EDIT`);
  sections.push(
    `// Model: ${schema.modelName} v${schema.modelVersion}`,
  );
  sections.push(
    `// Generated: ${new Date().toISOString().split("T")[0]}`,
  );
  sections.push("");

  const imports = ["Reactor"];
  if (needsFileRef) imports.push("FileRef");
  sections.push(
    `import { ${imports.join(", ")} } from "@reactor-team/js-sdk";`,
  );
  sections.push("");

  sections.push(`export const MODEL_NAME = "${schema.modelName}" as const;`);
  sections.push(`export const MODEL_VERSION = "${schema.modelVersion}" as const;`);

  if (tracks.length > 0) {
    sections.push("");
    sections.push(generateTrackConstants(modelPrefix, tracks));
  }

  for (const event of events) {
    const iface = generateParamInterface(modelPrefix, event);
    if (iface) {
      sections.push("");
      sections.push(iface);
    }
  }

  for (const message of messages) {
    sections.push("");
    sections.push(generateMessageInterface(modelPrefix, message));
  }

  if (messages.length > 0) {
    sections.push("");
    sections.push(generateMessageUnion(modelPrefix, messages));
  }

  sections.push("");
  sections.push(generateOptionsType(modelPrefix));
  sections.push("");
  sections.push(
    generateClientClass(modelPrefix, schema.modelName, events, messages),
  );

  sections.push("");
  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Package scaffolding
// ---------------------------------------------------------------------------

function generatePackageJson(options: CodegenOptions): string {
  const pkg = {
    name: `@reactor-models/${options.schema.modelName}`,
    version: options.schema.modelVersion,
    description: `Strongly-typed SDK for the ${toPascalCase(options.schema.modelName)} model on Reactor`,
    main: "dist/index.js",
    module: "dist/index.mjs",
    types: "dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.mjs",
        require: "./dist/index.js",
      },
    },
    files: ["dist", "README.md"],
    scripts: {
      build: "tsup",
    },
    dependencies: {
      "@reactor-team/js-sdk": `^${options.sdkVersion}`,
    },
    devDependencies: {
      tsup: "^8.5.0",
      typescript: "^5.8.3",
    },
    keywords: ["reactor", options.schema.modelName, "sdk", "typed"],
    author: "Reactor Technologies, Inc.",
    license: "MIT",
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function generateTsupConfig(): string {
  return `import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
`;
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: "dist",
      rootDir: "src",
      declaration: true,
    },
    include: ["src"],
    exclude: ["node_modules", "dist"],
  };
  return JSON.stringify(config, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// Exported generator
// ---------------------------------------------------------------------------

export const generator = {
  generate(options: CodegenOptions): GeneratedPackage {
    return {
      files: [
        { path: "src/index.ts", content: generateSourceFile(options) },
        { path: "package.json", content: generatePackageJson(options) },
        { path: "tsup.config.ts", content: generateTsupConfig() },
        { path: "tsconfig.json", content: generateTsConfig() },
      ],
    };
  },
};
