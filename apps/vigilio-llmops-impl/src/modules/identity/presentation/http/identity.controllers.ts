import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
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
import { IdentityService } from '../../application/identity.service';
import { IdentityLifecycleService } from '../../application/identity-lifecycle.service';
import { applySessionCookies, clearSessionCookies } from './cookie.helper';
import {
  disableMfaSchema,
  emailChangeSchema,
  emailConfirmSchema,
  forgotRequestSchema,
  loginRequestSchema,
  mfaCompleteSchema,
  mfaSetupSchema,
  mfaStepUpSchema,
  mfaVerifySchema,
  passwordChangeSchema,
  profilePatchSchema,
  registerRequestSchema,
  resetRequestSchema,
  rotateRecoverySchema,
  tokenRequestSchema,
} from './dto/auth.dto';

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly lifecycleService: IdentityLifecycleService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodPipe(registerRequestSchema)) body: z.infer<
      typeof registerRequestSchema
    >,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rateLimitService.consume(
      'register',
      req.ip ?? 'unknown',
      6,
      3600,
    );
    return this.identityService.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginRequestSchema)) body: z.infer<
      typeof loginRequestSchema
    >,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.rateLimitService.consume('login', req.ip ?? 'unknown', 15, 900);
    const result = await this.identityService.login(body);
    if (result.mfa_required) {
      return result;
    }
    applySessionCookies(response, result.cookies);
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.rateLimitService.consume(
      'refresh',
      request.ip ?? 'unknown',
      30,
      900,
    );
    try {
      const result = await this.lifecycleService.refresh(
        request.cookies?.[cookieNames.session] as string | undefined,
        request.cookies?.[cookieNames.csrf] as string | undefined,
        request.headers['x-csrf-token'],
      );
      applySessionCookies(response, result.cookies);
      return { refreshed: true };
    } catch (error) {
      clearSessionCookies(response);
      throw error;
    }
  }

  @Public()
  @Post('mfa/complete')
  @HttpCode(200)
  async mfaComplete(
    @Body(new ZodPipe(mfaCompleteSchema)) body: z.infer<
      typeof mfaCompleteSchema
    >,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.rateLimitService.consume(
      'mfa',
      request.ip ?? 'unknown',
      10,
      900,
    );
    const result = await this.lifecycleService.completeMfa(body);
    applySessionCookies(response, result.cookies);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.identityService.logout(principal);
    clearSessionCookies(response);
    return result;
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @CurrentPrincipal() p: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.lifecycleService.logoutAll(p);
    clearSessionCookies(response);
    return result;
  }

  @Get('csrf')
  csrf(@Req() request: AuthenticatedRequest) {
    return {
      csrf_token:
        (request.cookies?.[cookieNames.csrf] as string | undefined) ?? null,
    };
  }

  @Public()
  @Post('email/verify')
  @HttpCode(200)
  verify(
    @Body(new ZodPipe(tokenRequestSchema)) body: z.infer<
      typeof tokenRequestSchema
    >,
  ) {
    return this.identityService.emailVerify(body.token);
  }

  @Public()
  @Post('email/resend')
  @HttpCode(200)
  async resend(
    @Body(new ZodPipe(forgotRequestSchema)) body: z.infer<
      typeof forgotRequestSchema
    >,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rateLimitService.consume('resend', req.ip ?? 'unknown', 5, 3600);
    return this.identityService.resendVerification(body.email);
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(200)
  async forgot(
    @Body(new ZodPipe(forgotRequestSchema)) body: z.infer<
      typeof forgotRequestSchema
    >,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rateLimitService.consume('forgot', req.ip ?? 'unknown', 5, 3600);
    return this.identityService.forgotPassword(body.email);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  async reset(
    @Body(new ZodPipe(resetRequestSchema)) body: z.infer<
      typeof resetRequestSchema
    >,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.rateLimitService.consume('reset', req.ip ?? 'unknown', 5, 3600);
    return this.identityService.resetPassword(body.token, body.password);
  }
}

@Controller('api/v1/me')
export class MeController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly lifecycleService: IdentityLifecycleService,
  ) {}

  @Get()
  me(@CurrentPrincipal() principal: Principal) {
    return this.identityService.currentUser(principal.user_id);
  }

  @Patch()
  patch(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(profilePatchSchema)) body: z.infer<
      typeof profilePatchSchema
    >,
  ) {
    return this.identityService.patchUser(principal.user_id, body.display_name);
  }

  @Get('sessions')
  sessions(@CurrentPrincipal() principal: Principal) {
    return this.identityService.listSessions(principal);
  }

  @Delete('sessions/:session_id')
  revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('session_id', new ZodPipe(z.uuid())) sessionId: string,
  ) {
    return this.identityService.revokeSession(principal, sessionId);
  }

  @Post('mfa/totp/setup')
  mfaSetup(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(mfaSetupSchema)) body: z.infer<typeof mfaSetupSchema>,
  ) {
    return this.identityService.beginMfa(principal, body.password);
  }

  @Post('mfa/totp/verify')
  mfaVerify(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(mfaVerifySchema)) body: z.infer<typeof mfaVerifySchema>,
  ) {
    return this.identityService.enableMfa(principal, body.otp);
  }

  @Post('mfa/step-up')
  @HttpCode(200)
  mfaStepUp(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(mfaStepUpSchema)) body: z.infer<typeof mfaStepUpSchema>,
  ) {
    return this.identityService.stepUpMfa(principal, body);
  }

  @Post('mfa/recovery-codes/rotate')
  rotateCodes(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(rotateRecoverySchema)) b: z.infer<
      typeof rotateRecoverySchema
    >,
  ) {
    return this.lifecycleService.rotateCodes(p, b.password);
  }

  @Post('mfa/totp/disable')
  disableMfa(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(disableMfaSchema)) b: z.infer<typeof disableMfaSchema>,
  ) {
    return this.lifecycleService.disableMfa(p, b.password, b.totp);
  }

  @Post('password/change')
  @HttpCode(200)
  async changePassword(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(passwordChangeSchema)) b: z.infer<
      typeof passwordChangeSchema
    >,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.lifecycleService.changePassword(
      p,
      b.current_password,
      b.new_password,
    );
    clearSessionCookies(response);
    return result;
  }

  @Patch('email')
  changeEmail(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(emailChangeSchema)) b: z.infer<typeof emailChangeSchema>,
  ) {
    return this.lifecycleService.changeEmail(p, b.next_email, b.password);
  }

  @Post('email/verify-change')
  @HttpCode(200)
  verifyEmailChange(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(emailConfirmSchema)) b: z.infer<
      typeof emailConfirmSchema
    >,
  ) {
    return this.lifecycleService.verifyEmailChange(p, b.token);
  }
}

@Controller('api/v1/onboarding')
export class OnboardingController {
  constructor(private readonly lifecycleService: IdentityLifecycleService) {}

  @Get('status')
  status(@CurrentPrincipal() p: Principal) {
    return this.lifecycleService.onboarding(p.user_id);
  }

  @Post('complete')
  complete(@CurrentPrincipal() p: Principal) {
    return this.lifecycleService.completeOnboarding(p.user_id);
  }
}
