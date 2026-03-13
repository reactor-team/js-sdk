// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * LocalCoordinatorClient connects to a local runtime instance.
 *
 * The local runtime exposes the same REST API as the production coordinator
 * but requires no authentication. This subclass overrides only the auth
 * headers — all endpoint paths and request/response shapes are inherited.
 */

import { CoordinatorClient } from "./CoordinatorClient";
import {
  API_VERSION_HEADER,
  API_ACCEPT_VERSION_HEADER,
  REACTOR_API_VERSION,
} from "./types";

export class LocalCoordinatorClient extends CoordinatorClient {
  constructor(baseUrl: string, model: string) {
    super({
      baseUrl,
      jwtToken: "local",
      model,
    });
  }

  /**
   * Override: local runtime requires no authentication.
   * Only versioning headers are sent.
   */
  protected override getHeaders(): HeadersInit {
    return {
      [API_VERSION_HEADER]: String(REACTOR_API_VERSION),
      [API_ACCEPT_VERSION_HEADER]: String(REACTOR_API_VERSION),
    };
  }
}
