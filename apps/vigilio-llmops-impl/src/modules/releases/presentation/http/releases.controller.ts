import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { ReleaseWorkflowService } from '../../application/release-workflow.service';
import { ReleasesService } from '../../application/releases.service';
import {
  type CreatePolicyRequestDto,
  type CreateReleaseRequestDto,
  createPolicySchema,
  createReleaseSchema,
  type DryRunRequestDto,
  dryRunSchema,
  type PolicyVersionRequestDto,
  policyVersionSchema,
  type RejectRequestDto,
  rejectSchema,
} from './dto/release.dto';

const uuidPipe = new ZodPipe(z.string().uuid());

@Controller('api/v1/releases')
export class ReleasesController {
  constructor(
    private readonly releasesService: ReleasesService,
    private readonly workflowService: ReleaseWorkflowService,
  ) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createReleaseSchema)) body: CreateReleaseRequestDto,
  ) {
    return this.releasesService.create(principal.user_id, body);
  }

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('workspace_id', uuidPipe) workspace_id: string,
  ) {
    return this.releasesService.list(principal.user_id, workspace_id);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.releasesService.get(principal.user_id, id);
  }

  @Post(':id/verify')
  verify(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.releasesService.verify(principal.user_id, id);
  }

  @Post(':id/request-approval')
  requestApproval(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.workflowService.requestApproval(principal.user_id, id);
  }

  @Post(':id/approve')
  approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.releasesService.approve(principal, id);
  }

  @Post(':id/reject')
  reject(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodPipe(rejectSchema)) body: RejectRequestDto,
  ) {
    return this.workflowService.reject(principal, id, body.reason);
  }

  @Post(':id/activate')
  activate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.releasesService.activate(principal, id);
  }

  @Post(':id/rollback')
  rollback(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.releasesService.rollback(principal, id);
  }

  @Get(':id/rollout')
  rollout(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.workflowService.rollout(principal.user_id, id);
  }

  @Post(':id/rollout/pause')
  pause(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.workflowService.pause(principal.user_id, id);
  }

  @Post(':id/rollout/resume')
  resume(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.workflowService.resume(principal.user_id, id);
  }

  @Get(':id/evidence')
  evidence(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.workflowService.evidence(principal.user_id, id);
  }
}

@Controller('api/v1/quality-policies')
export class QualityPoliciesController {
  constructor(
    private readonly releasesService: ReleasesService,
    private readonly workflowService: ReleaseWorkflowService,
  ) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createPolicySchema)) body: CreatePolicyRequestDto,
  ) {
    return this.releasesService.createPolicy(
      principal.user_id,
      body.workspace_id,
      body.name,
      body.minimum_score,
    );
  }

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('workspace_id', uuidPipe) workspace_id: string,
  ) {
    return this.releasesService.policies(principal.user_id, workspace_id);
  }

  @Post(':policy_id/versions')
  version(
    @CurrentPrincipal() principal: Principal,
    @Param('policy_id', uuidPipe) policyId: string,
    @Body(new ZodPipe(policyVersionSchema)) body: PolicyVersionRequestDto,
  ) {
    return this.workflowService.policyVersion(
      principal.user_id,
      policyId,
      body.minimum_score,
    );
  }

  @Post('dry-run')
  dryRun(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(dryRunSchema)) body: DryRunRequestDto,
  ) {
    return this.workflowService.dryRun(
      principal.user_id,
      body.policy_id,
      body.run_id,
    );
  }
}
