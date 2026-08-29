import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { OrganizationsService } from '../../application/organizations.service';
import { WorkspaceManagementService } from '../../application/workspace-management.service';
import {
  acceptSchema,
  addMemberSchema,
  createOrgSchema,
  createWorkspaceSchema,
  invitationSchema,
  memberRoleSchema,
  orgPatchSchema,
  workspacePatchSchema,
} from './dto/organization.dto';

const id = z.uuid();

@Controller('api/v1/organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly managementService: WorkspaceManagementService,
  ) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createOrgSchema)) body: z.infer<typeof createOrgSchema>,
  ) {
    return this.organizationsService.create(principal.user_id, body);
  }

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.organizationsService.list(principal.user_id);
  }

  @Get(':org_id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('org_id', new ZodPipe(id)) orgId: string,
  ) {
    return this.organizationsService.get(principal.user_id, orgId);
  }

  @Patch(':org_id')
  patch(
    @CurrentPrincipal() p: Principal,
    @Param('org_id', new ZodPipe(id)) org: string,
    @Body(new ZodPipe(orgPatchSchema)) b: z.infer<typeof orgPatchSchema>,
  ) {
    return this.managementService.patchOrg(p.user_id, org, b.name);
  }

  @Get(':org_id/roles')
  roles(
    @CurrentPrincipal() p: Principal,
    @Param('org_id', new ZodPipe(id)) org: string,
  ) {
    return this.managementService.roles(p.user_id, org);
  }

  @Get(':org_id/workspaces')
  workspaces(
    @CurrentPrincipal() principal: Principal,
    @Param('org_id', new ZodPipe(id)) orgId: string,
  ) {
    return this.organizationsService.listWorkspaces(principal.user_id, orgId);
  }

  @Post(':org_id/workspaces')
  workspace(
    @CurrentPrincipal() principal: Principal,
    @Param('org_id', new ZodPipe(id)) orgId: string,
    @Body(new ZodPipe(createWorkspaceSchema)) body: z.infer<
      typeof createWorkspaceSchema
    >,
  ) {
    return this.organizationsService.createWorkspace(
      principal.user_id,
      orgId,
      body,
    );
  }

  @Get(':org_id/members')
  members(
    @CurrentPrincipal() principal: Principal,
    @Param('org_id', new ZodPipe(id)) orgId: string,
  ) {
    return this.organizationsService.members(principal.user_id, orgId);
  }

  @Post(':org_id/members')
  addMember(
    @CurrentPrincipal() principal: Principal,
    @Param('org_id', new ZodPipe(id)) orgId: string,
    @Body(new ZodPipe(addMemberSchema)) body: z.infer<typeof addMemberSchema>,
  ) {
    return this.organizationsService.addMember(
      principal.user_id,
      orgId,
      body.email,
      body.role,
    );
  }

  @Patch(':org_id/members/:member_id')
  changeMemberRole(
    @CurrentPrincipal() principal: Principal,
    @Param('org_id', new ZodPipe(id)) orgId: string,
    @Param('member_id', new ZodPipe(id)) memberId: string,
    @Body(new ZodPipe(memberRoleSchema)) body: z.infer<typeof memberRoleSchema>,
  ) {
    return this.organizationsService.changeMemberRole(
      principal.user_id,
      orgId,
      memberId,
      body.role,
    );
  }

  @Delete(':org_id/members/:member_id')
  removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param('org_id', new ZodPipe(id)) orgId: string,
    @Param('member_id', new ZodPipe(id)) memberId: string,
  ) {
    return this.organizationsService.removeMember(
      principal.user_id,
      orgId,
      memberId,
    );
  }

  @Get(':org_id/invitations')
  invitations(
    @CurrentPrincipal() p: Principal,
    @Param('org_id', new ZodPipe(id)) org: string,
  ) {
    return this.managementService.listInvitations(p.user_id, org);
  }

  @Post(':org_id/invitations')
  invite(
    @CurrentPrincipal() p: Principal,
    @Param('org_id', new ZodPipe(id)) org: string,
    @Body(new ZodPipe(invitationSchema)) b: z.infer<typeof invitationSchema>,
  ) {
    return this.managementService.invite(p.user_id, org, b);
  }

  @Delete(':org_id/invitations/:invitation_id')
  revokeInvitation(
    @CurrentPrincipal() p: Principal,
    @Param('org_id', new ZodPipe(id)) org: string,
    @Param('invitation_id', new ZodPipe(id)) inv: string,
  ) {
    return this.managementService.revoke(p.user_id, org, inv);
  }
}

@Controller('api/v1/invitations')
export class InvitationsController {
  constructor(private readonly service: WorkspaceManagementService) {}

  @Post(':invitation_id/accept')
  accept(
    @CurrentPrincipal() p: Principal,
    @Param('invitation_id', new ZodPipe(id)) inv: string,
    @Body(new ZodPipe(acceptSchema)) b: z.infer<typeof acceptSchema>,
  ) {
    return this.service.accept(p.user_id, inv, b.token);
  }
}

@Controller('api/v1/workspaces')
export class WorkspacesController {
  constructor(private readonly service: WorkspaceManagementService) {}

  @Patch(':workspace_id')
  patch(
    @CurrentPrincipal() p: Principal,
    @Param('workspace_id', new ZodPipe(id)) ws: string,
    @Body(new ZodPipe(workspacePatchSchema)) b: z.infer<
      typeof workspacePatchSchema
    >,
  ) {
    return this.service.workspace(p.user_id, ws, b.name);
  }

  @Get(':workspace_id/members')
  members(
    @CurrentPrincipal() p: Principal,
    @Param('workspace_id', new ZodPipe(id)) ws: string,
  ) {
    return this.service.workspaceMembers(p.user_id, ws);
  }
}
