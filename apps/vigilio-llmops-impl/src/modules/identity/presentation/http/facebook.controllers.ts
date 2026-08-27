import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { cookieNames } from '../../../../shared/config';
import {
  type AuthenticatedRequest,
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { Public } from '../../../../shared/http/public.decorator';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { RateLimitService } from '../../../../shared/security/rate-limit.service';
import { FacebookService } from '../../application/facebook.service';
import {
  applyOauthCookie,
  applySessionCookies,
  clearOauthCookie,
} from './cookie.helper';
import { facebookSignedRequestSchema } from './dto/auth.dto';

@Controller('api/v1/auth/facebook')
export class FacebookAuthController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Public()
  @Get('start')
  async start(
    @Res() response: Response,
    @Query('return_to') returnTo?: string,
  ) {
    const result = await this.facebookService.begin(returnTo);
    applyOauthCookie(response, result.oauth_cookie);
    response.redirect(302, result.authorization_url);
  }

  @Public()
  @Get('callback')
  async callback(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Query('state') state?: string,
    @Query('code') code?: string,
    @Query('error') error?: string,
  ) {
    clearOauthCookie(response);
    const result = await this.facebookService.callback(
      request.cookies?.[cookieNames.oauth] as string | undefined,
      state,
      code,
      error,
    );
    if (result.cookies) {
      applySessionCookies(response, result.cookies);
    }
    response.redirect(302, result.redirect_to);
  }

  @Public()
  @Post('data-deletion')
  @HttpCode(200)
  async delete(
    @Body(new ZodPipe(facebookSignedRequestSchema))
    body: z.infer<typeof facebookSignedRequestSchema>,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.rateLimitService.consume(
      'facebook-delete',
      request.ip ?? 'unknown',
      20,
      3600,
    );
    return this.facebookService.deletionWebhook(body.signed_request);
  }
}

@Controller('api/v1/webhooks/facebook')
export class FacebookWebhookController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Public()
  @Post('data-deletion')
  @HttpCode(200)
  async delete(
    @Body(new ZodPipe(facebookSignedRequestSchema))
    body: z.infer<typeof facebookSignedRequestSchema>,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.rateLimitService.consume(
      'facebook-delete',
      request.ip ?? 'unknown',
      20,
      3600,
    );
    return this.facebookService.deletionWebhook(body.signed_request);
  }
}

@Controller('api/v1/privacy')
export class PrivacyController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Public()
  @Get('deletion-status/:code')
  async status(
    @Param('code', new ZodPipe(z.string().min(16).max(150))) code: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.rateLimitService.consume(
      'delete-status',
      request.ip ?? 'unknown',
      30,
      3600,
    );
    return this.facebookService.deletionStatus(code);
  }
}

@Controller('api/v1/me/identities')
export class LinkedIdentityController {
  constructor(private readonly facebookService: FacebookService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.facebookService.listIdentities(principal.user_id);
  }

  @Post('facebook/link')
  async link(
    @CurrentPrincipal() principal: Principal,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
    @Query('mode') mode?: string,
  ) {
    const result = await this.facebookService.begin('/app/settings', principal);
    applyOauthCookie(response, result.oauth_cookie);
    const wantsJson =
      mode === 'json' ||
      Boolean(request.headers.accept?.includes('application/json'));
    if (wantsJson) {
      response
        .status(200)
        .json({ authorization_url: result.authorization_url });
      return;
    }
    response.redirect(302, result.authorization_url);
  }

  @Delete('facebook')
  unlink(@CurrentPrincipal() principal: Principal) {
    return this.facebookService.unlink(principal);
  }
}
