import './presentation/http/doc/identity.doc';
import { Module } from '@nestjs/common';
import { FacebookService } from './application/facebook.service';
import { IdentityService } from './application/identity.service';
import { IdentityLifecycleService } from './application/identity-lifecycle.service';
import { IDENTITY_REPOSITORY_PORT } from './application/ports/identity.port';
import { IdentityDrizzleRepository } from './infrastructure/persistence/drizzle/identity.repository';
import {
  FacebookAuthController,
  FacebookWebhookController,
  LinkedIdentityController,
  PrivacyController,
} from './presentation/http/facebook.controllers';
import {
  AuthController,
  MeController,
  OnboardingController,
} from './presentation/http/identity.controllers';

@Module({
  controllers: [
    AuthController,
    MeController,
    OnboardingController,
    FacebookAuthController,
    FacebookWebhookController,
    PrivacyController,
    LinkedIdentityController,
  ],
  providers: [
    IdentityService,
    IdentityLifecycleService,
    FacebookService,
    IdentityDrizzleRepository,
    {
      provide: IDENTITY_REPOSITORY_PORT,
      useExisting: IdentityDrizzleRepository,
    },
  ],
  exports: [IdentityService, IdentityLifecycleService, FacebookService],
})
export class IdentityModule {}
