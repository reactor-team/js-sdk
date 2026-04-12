// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Reference to an uploaded file, returned by {@link Reactor.uploadFile}.
 *
 * Pass a `FileRef` as a value in {@link Reactor.sendCommand} and it will
 * be serialized into the `uploads` section of the wire envelope, separate
 * from scalar arguments. The runtime resolves each reference to bytes
 * before dispatching the event to the model handler.
 */
export class FileRef {
  /** @internal Marker so sendCommand can detect FileRef values. */
  readonly __isFileRef = true as const;

  constructor(
    public readonly uploadId: string,
    public readonly name: string,
    public readonly mimeType: string,
    public readonly size: number
  ) {}
}
