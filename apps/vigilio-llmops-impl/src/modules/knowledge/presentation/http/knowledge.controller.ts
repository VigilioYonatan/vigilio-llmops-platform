import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { KnowledgeService } from '../../application/knowledge.service';
import {
  type AclRequestDto,
  type AnswerRequestDto,
  aclSchema,
  answerSchema,
  type CreateKbRequestDto,
  createKbSchema,
  type DocumentRequestDto,
  documentSchema,
  type SearchRequestDto,
  searchSchema,
} from './dto/knowledge.dto';

const uuidPipe = new ZodPipe(z.string().uuid());

@Controller('api/v1/knowledge-bases')
export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}

  @Get()
  list(
    @CurrentPrincipal() p: Principal,
    @Query('workspace_id', uuidPipe) workspace_id: string,
  ) {
    return this.service.list(p.user_id, workspace_id);
  }

  @Post()
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createKbSchema)) b: CreateKbRequestDto,
  ) {
    return this.service.create(p.user_id, b);
  }

  @Post(':kb_id/documents')
  doc(
    @CurrentPrincipal() p: Principal,
    @Param('kb_id', uuidPipe) kb: string,
    @Body(new ZodPipe(documentSchema)) b: DocumentRequestDto,
  ) {
    return this.service.document(p.user_id, kb, b);
  }

  @Get(':kb_id/documents')
  docs(@CurrentPrincipal() p: Principal, @Param('kb_id', uuidPipe) kb: string) {
    return this.service.documents(p.user_id, kb);
  }

  @Patch(':kb_id/documents/:document_id/acl')
  acl(
    @CurrentPrincipal() p: Principal,
    @Param('kb_id', uuidPipe) kb: string,
    @Param('document_id', uuidPipe) doc: string,
    @Body(new ZodPipe(aclSchema)) b: AclRequestDto,
  ) {
    return this.service.acl(p.user_id, kb, doc, b);
  }

  @Post(':kb_id/search')
  search(
    @CurrentPrincipal() p: Principal,
    @Param('kb_id', uuidPipe) kb: string,
    @Body(new ZodPipe(searchSchema)) b: SearchRequestDto,
  ) {
    return this.service.search(p.user_id, kb, b);
  }

  @Post(':kb_id/answer')
  answer(
    @CurrentPrincipal() p: Principal,
    @Param('kb_id', uuidPipe) kb: string,
    @Body(new ZodPipe(answerSchema)) b: AnswerRequestDto,
  ) {
    return this.service.answer(p.user_id, kb, b);
  }

  @Post(':kb_id/reindex')
  reindex(
    @CurrentPrincipal() p: Principal,
    @Param('kb_id', uuidPipe) kb: string,
  ) {
    return this.service.reindex(p.user_id, kb);
  }

  @Get(':kb_id/jobs/:job_id')
  job(
    @CurrentPrincipal() p: Principal,
    @Param('kb_id', uuidPipe) kb: string,
    @Param('job_id', uuidPipe) job: string,
  ) {
    return this.service.job(p.user_id, kb, job);
  }
}
