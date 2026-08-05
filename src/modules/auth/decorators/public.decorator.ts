import { SetMetadata } from '@nestjs/common';
import { METADATA } from '@shared/constants/http.constants';

/**
 * Exempts a route from authentication.
 *
 * The guard is registered globally, so *everything* requires a valid token
 * unless it opts out here. That default is the point: forgetting to add a guard
 * silently exposes an endpoint, whereas forgetting to add `@Public()` produces
 * an immediate, obvious 401.
 *
 * Every use of this decorator deserves a second look in review.
 */
export const Public = () => SetMetadata(METADATA.IS_PUBLIC, true);
