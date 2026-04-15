"use client";

import { useReactor, useReactorInternalMessage } from "./hooks";
import { FileRef } from "../core/FileRef";
import React, { useState, useCallback, useRef } from "react";

export interface ReactorControllerProps {
  className?: string;
  style?: React.CSSProperties;
}

interface CommandParamSchema {
  description?: string;
  type: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  required?: boolean;
  enum?: string[];
  default?: unknown;
}

function isFileParam(ps: CommandParamSchema): boolean {
  return (
    ps.type === "file" ||
    (ps.type === "object" && ps.format === "file-reference")
  );
}

interface CommandSchema {
  description: string;
  schema: Record<string, CommandParamSchema>;
}

// The runtime sends commands as a list of {name, description, schema}
// matching the proto Command message.
interface CommandCapabilityMessage {
  name: string;
  description: string;
  schema?: Record<string, CommandParamSchema>;
}

interface CommandsMessage {
  commands: CommandCapabilityMessage[];
}

export function ReactorController({
  className,
  style,
}: ReactorControllerProps) {
  const { sendCommand, uploadFile, status } = useReactor((state) => ({
    sendCommand: state.sendCommand,
    uploadFile: state.uploadFile,
    status: state.status,
  }));
  const [commands, setCommands] = useState<Record<string, CommandSchema>>({});
  const [formValues, setFormValues] = useState<
    Record<string, Record<string, any>>
  >({});
  const formRef = useRef(formValues);
  formRef.current = formValues;
  const [expandedCommands, setExpandedCommands] = useState<
    Record<string, boolean>
  >({});

  // Reset commands when disconnected
  React.useEffect(() => {
    if (status === "disconnected") {
      setCommands({});
      setFormValues({});
      setExpandedCommands({});
    }
  }, [status]);

  // Function to request capabilities (sent on the "runtime" channel)
  const requestCapabilities = useCallback(() => {
    if (status === "ready") {
      sendCommand("requestCapabilities", {}, "runtime");
    }
  }, [status, sendCommand]);

  // Send requestCapabilities when ready
  React.useEffect(() => {
    if (status === "ready") {
      requestCapabilities();
    }
  }, [status, requestCapabilities]);

  // Retry every 5 seconds if capabilities not set
  React.useEffect(() => {
    // Only set up interval if status is ready and commands are empty
    if (status !== "ready" || Object.keys(commands).length > 0) {
      return;
    }

    const interval = setInterval(() => {
      requestCapabilities();
    }, 5000);

    return () => clearInterval(interval);
  }, [status, commands, requestCapabilities]);

  useReactorInternalMessage((message) => {
    if (
      message &&
      typeof message === "object" &&
      message.type === "modelCapabilities" &&
      message.data &&
      "commands" in message.data
    ) {
      const commandsMessage = message.data as CommandsMessage;

      // Convert the list of command descriptors (proto Command shape)
      // into a Record keyed by name for the controller's internal state.
      const commandsRecord: Record<string, CommandSchema> = {};
      for (const cmd of commandsMessage.commands) {
        commandsRecord[cmd.name] = {
          description: cmd.description,
          schema: cmd.schema ?? {},
        };
      }
      setCommands(commandsRecord);

      // Initialize form values for each command
      const initialValues: Record<string, Record<string, any>> = {};
      const initialExpanded: Record<string, boolean> = {};

      Object.entries(commandsRecord).forEach(([commandName, commandSchema]) => {
        initialValues[commandName] = {};
        initialExpanded[commandName] = false;

        Object.entries(commandSchema.schema).forEach(
          ([paramName, paramSchema]) => {
            if (isFileParam(paramSchema)) {
              initialValues[commandName][paramName] = null;
            } else if (paramSchema.default !== undefined) {
              initialValues[commandName][paramName] = paramSchema.default;
            } else if (paramSchema.type === "number" || paramSchema.type === "integer") {
              initialValues[commandName][paramName] = paramSchema.minimum ?? 0;
            } else if (paramSchema.type === "string") {
              initialValues[commandName][paramName] = "";
            } else if (paramSchema.type === "boolean") {
              initialValues[commandName][paramName] = false;
            }
          }
        );
      });
      setFormValues(initialValues);
      setExpandedCommands(initialExpanded);
    }
  });

  const handleInputChange = useCallback(
    (commandName: string, paramName: string, value: any) => {
      setFormValues((prev) => ({
        ...prev,
        [commandName]: {
          ...prev[commandName],
          [paramName]: value,
        },
      }));
    },
    []
  );

  const toggleCommandExpanded = useCallback((commandName: string) => {
    setExpandedCommands((prev) => ({
      ...prev,
      [commandName]: !prev[commandName],
    }));
  }, []);

  const handleCommandSubmit = useCallback(
    async (commandName: string) => {
      const commandSchema = commands[commandName];
      const formData = formRef.current[commandName] || {};

      const data: Record<string, any> = {};

      Object.keys(commandSchema.schema).forEach((paramName) => {
        const paramSchema = commandSchema.schema[paramName];
        let value = formData[paramName];

        if (value instanceof FileRef) {
          data[paramName] = value;
          return;
        }

        if (paramSchema.type === "number" && typeof value === "string") {
          value = parseFloat(value) || 0;
        } else if (
          paramSchema.type === "integer" &&
          typeof value === "string"
        ) {
          value = parseInt(value) || 0;
        } else if (
          paramSchema.type === "boolean" &&
          typeof value !== "boolean"
        ) {
          value = Boolean(value);
        }

        if (value !== undefined && value !== "" && value !== null) {
          data[paramName] = value;
        } else if (paramSchema.required) {
          if (paramSchema.type === "number" || paramSchema.type === "integer") {
            data[paramName] = paramSchema.minimum ?? 0;
          } else if (paramSchema.type === "string") {
            data[paramName] = "";
          } else if (paramSchema.type === "boolean") {
            data[paramName] = false;
          }
        }
      });

      await sendCommand(commandName, data);
    },
    [sendCommand, commands]
  );

  const renderInput = (
    commandName: string,
    paramName: string,
    paramSchema: CommandParamSchema
  ) => {
    const value = formValues[commandName]?.[paramName] ?? "";

    if (isFileParam(paramSchema)) {
      return (
        <FileParamInput
          key={`${commandName}-${paramName}`}
          commandName={commandName}
          paramName={paramName}
          description={paramSchema.description}
          value={value}
          onChange={handleInputChange}
          disabled={status !== "ready"}
          uploadFile={uploadFile}
        />
      );
    }

    if (paramSchema.type === "number" || paramSchema.type === "integer") {
      const isInteger = paramSchema.type === "integer";
      const step = isInteger ? 1 : 0.1;
      const parseValue = isInteger ? parseInt : parseFloat;

      // Use slider if min/max are defined, otherwise use number input
      if (
        typeof paramSchema.minimum === "number" &&
        typeof paramSchema.maximum === "number"
      ) {
        return (
          <div style={{ marginBottom: "8px" }}>
            <label
              style={{ fontSize: "12px", color: "#666", display: "block" }}
            >
              {paramName} ({paramSchema.minimum} - {paramSchema.maximum})
              {paramSchema.description && ` - ${paramSchema.description}`}
              {paramSchema.required && <span style={{ color: "red" }}> *</span>}
            </label>
            <input
              type="range"
              min={paramSchema.minimum}
              max={paramSchema.maximum}
              step={step}
              value={value}
              onChange={(e) => {
                const newValue = parseValue(e.target.value) || 0;
                handleInputChange(commandName, paramName, newValue);
                // Execute command immediately for sliders
                handleCommandSubmit(commandName);
              }}
              style={{ width: "100%", marginBottom: "4px" }}
            />
            <div style={{ fontSize: "11px", color: "#888" }}>
              Value: {value}
            </div>
          </div>
        );
      } else {
        return (
          <div style={{ marginBottom: "8px" }}>
            <label
              style={{ fontSize: "12px", color: "#666", display: "block" }}
            >
              {paramName}
              {paramSchema.description && ` - ${paramSchema.description}`}
              {paramSchema.required && <span style={{ color: "red" }}> *</span>}
            </label>
            <input
              type="number"
              value={value}
              min={paramSchema.minimum}
              max={paramSchema.maximum}
              step={step}
              inputMode="numeric"
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || val === "-") {
                  // Allow empty or just minus sign while typing
                  handleInputChange(commandName, paramName, val);
                } else {
                  const parsed = parseValue(val);
                  if (!isNaN(parsed)) {
                    handleInputChange(commandName, paramName, parsed);
                  }
                }
              }}
              onBlur={(e) => {
                // On blur, ensure we have a valid number
                const val = e.target.value;
                if (val === "" || val === "-") {
                  handleInputChange(commandName, paramName, 0);
                }
              }}
              style={{
                width: "100%",
                padding: "4px",
                fontSize: "12px",
                border: "1px solid #ccc",
                borderRadius: "2px",
              }}
            />
          </div>
        );
      }
    } else if (paramSchema.type === "string") {
      if (paramSchema.enum) {
        // Dropdown for enum values
        return (
          <div style={{ marginBottom: "8px" }}>
            <label
              style={{ fontSize: "12px", color: "#666", display: "block" }}
            >
              {paramName}
              {paramSchema.description && ` - ${paramSchema.description}`}
              {paramSchema.required && <span style={{ color: "red" }}> *</span>}
            </label>
            <select
              value={value}
              onChange={(e) =>
                handleInputChange(commandName, paramName, e.target.value)
              }
              style={{
                width: "100%",
                padding: "4px",
                fontSize: "12px",
                border: "1px solid #ccc",
                borderRadius: "2px",
              }}
            >
              <option value="">Select...</option>
              {paramSchema.enum.map((option: string) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );
      } else {
        // Text input
        return (
          <div style={{ marginBottom: "8px" }}>
            <label
              style={{ fontSize: "12px", color: "#666", display: "block" }}
            >
              {paramName}
              {paramSchema.description && ` - ${paramSchema.description}`}
              {paramSchema.required && <span style={{ color: "red" }}> *</span>}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) =>
                handleInputChange(commandName, paramName, e.target.value)
              }
              style={{
                width: "100%",
                padding: "4px",
                fontSize: "12px",
                border: "1px solid #ccc",
                borderRadius: "2px",
              }}
            />
          </div>
        );
      }
    } else if (paramSchema.type === "boolean") {
      return (
        <div style={{ marginBottom: "8px" }}>
          <label
            style={{
              fontSize: "12px",
              color: "#666",
              display: "flex",
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={value}
              onChange={(e) =>
                handleInputChange(commandName, paramName, e.target.checked)
              }
              style={{ marginRight: "6px" }}
            />
            {paramName}
            {paramSchema.description && ` - ${paramSchema.description}`}
            {paramSchema.required && <span style={{ color: "red" }}> *</span>}
          </label>
        </div>
      );
    }

    return null;
  };

  const renderCommand = (commandName: string, commandSchema: CommandSchema) => {
    const hasParams = Object.keys(commandSchema.schema).length > 0;
    const isExpanded = expandedCommands[commandName];

    const params = Object.values(commandSchema.schema);
    const allSliders =
      params.length > 0 &&
      params.every(
        (ps) =>
          (ps.type === "number" || ps.type === "integer") &&
          typeof ps.minimum === "number" &&
          typeof ps.maximum === "number"
      );

    const showExecuteButton = !allSliders;

    return (
      <div
        key={commandName}
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          marginBottom: "8px",
          backgroundColor: "#fafafa",
        }}
      >
        {/* Command Header - Always Visible */}
        <div
          onClick={() => toggleCommandExpanded(commandName)}
          style={{
            padding: "8px 12px",
            cursor: "pointer",
            borderBottom: isExpanded ? "1px solid #ddd" : "none",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h4
              style={{
                margin: "0",
                fontSize: "13px",
                fontWeight: "bold",
              }}
            >
              {commandName}
            </h4>
            {isExpanded && commandSchema.description && (
              <p
                style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#666" }}
              >
                {commandSchema.description}
              </p>
            )}
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "#999",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            ▼
          </div>
        </div>

        {/* Command Content - Collapsible */}
        {isExpanded && (
          <div style={{ padding: "12px", paddingTop: "0" }}>
            {hasParams && (
              <div style={{ marginBottom: showExecuteButton ? "12px" : "0" }}>
                <div
                  style={{
                    marginBottom: "8px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#555",
                  }}
                >
                  Parameters:
                </div>
                {Object.entries(commandSchema.schema).map(
                  ([paramName, paramSchema]) => (
                    <div
                      key={`${commandName}-${paramName}`}
                      style={{ marginLeft: "8px" }}
                    >
                      {renderInput(commandName, paramName, paramSchema)}
                    </div>
                  )
                )}
              </div>
            )}

            {!hasParams && (
              <div
                style={{
                  marginBottom: showExecuteButton ? "12px" : "0",
                  marginTop: "2px",
                  fontSize: "11px",
                  color: "#666",
                  fontStyle: "italic",
                }}
              >
                No parameters required
              </div>
            )}

            {showExecuteButton && (
              <button
                onClick={() => handleCommandSubmit(commandName)}
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  backgroundColor: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Execute {commandName}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={className} style={style}>
      <div style={{ fontFamily: "monospace", fontSize: "12px" }}>
        {Object.keys(commands).length === 0 ? (
          <div style={{ padding: "12px", color: "#666", fontStyle: "italic" }}>
            Waiting for commands schema...
          </div>
        ) : (
          <div>
            <h3
              style={{
                margin: "0 0 16px 0",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              Reactor Commands
            </h3>
            {Object.entries(commands).map(([commandName, commandSchema]) => (
              <div key={commandName}>
                {renderCommand(commandName, commandSchema)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FileParamInput({
  commandName,
  paramName,
  description,
  value,
  onChange,
  disabled,
  uploadFile,
}: {
  commandName: string;
  paramName: string;
  description?: string;
  value: any;
  onChange: (cmd: string, param: string, value: any) => void;
  disabled: boolean;
  uploadFile: (file: File | Blob, options?: { name?: string }) => Promise<FileRef>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = value instanceof FileRef ? value : null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const ref = await uploadFile(file);
      onChange(commandName, paramName, ref);
    } catch (err) {
      console.error("[FileParamInput] Upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ marginBottom: "8px" }}>
      <label style={{ fontSize: "12px", color: "#666", display: "block" }}>
        {paramName}
        <span style={{ color: "#888", fontSize: "11px" }}> (file)</span>
        {description && ` - ${description}`}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <button
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          style={{
            padding: "4px 12px",
            fontSize: "12px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: disabled || uploading ? "default" : "pointer",
            opacity: disabled || uploading ? 0.5 : 1,
          }}
        >
          {uploading ? "Uploading\u2026" : fileRef ? "Change" : "Choose File"}
        </button>
        {fileRef && (
          <span style={{ fontSize: "11px", color: "#28a745" }}>
            \u2713 {fileRef.name}
          </span>
        )}
      </div>
    </div>
  );
}
