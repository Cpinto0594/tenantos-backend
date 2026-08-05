import { SetMetadata } from '@nestjs/common';
import { METADATA } from '@shared/constants/http.constants';

/**
 * Returns the handler's value verbatim, without the `{ success, data, ... }`
 * wrapper. For endpoints whose shape is dictated by an external consumer —
 * Prometheus scraping `/metrics`, Kubernetes parsing `/health`.
 */
export const SkipEnvelope = () => SetMetadata(METADATA.SKIP_RESPONSE_ENVELOPE, true);
