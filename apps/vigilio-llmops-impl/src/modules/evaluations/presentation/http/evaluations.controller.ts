import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { EvaluationLifecycleService } from '../../application/evaluation-lifecycle.service';
import { EvaluationsService } from '../../application/evaluations.service';
import {
  type AnnotationRequestDto,
  annotationSchema,
  type CalibrationRequestDto,
  type ComparisonRequestDto,
  type CreateEvaluatorRequestDto,
  calibrationSchema,
  comparisonSchema,
  createEvaluatorSchema,
  type EvaluationRunRequestDto,
  type EvaluatorVersionRequestDto,
  evaluationRunSchema,
  evaluatorVersionSchema,
} from './dto/evaluation.dto';

const uuidPipe = new ZodPipe(z.string().uuid());

@Controller('api/v1/evaluation-runs')
export class EvaluationsController {
  constructor(
    private readonly evaluationsService: EvaluationsService,
    private readonly lifecycleService: EvaluationLifecycleService,
  ) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(evaluationRunSchema)) body: EvaluationRunRequestDto,
  ) {
    return this.evaluationsService.create(principal.user_id, body);
  }

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('workspace_id', uuidPipe) workspace_id: string,
  ) {
    return this.evaluationsService.list(principal.user_id, workspace_id);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.evaluationsService.get(principal.user_id, id);
  }

  @Get(':id/results')
  results(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.evaluationsService.results(principal.user_id, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentPrincipal() p: Principal, @Param('id', uuidPipe) r: string) {
    return this.lifecycleService.cancel(p.user_id, r);
  }

  @Get(':id/cases')
  cases(@CurrentPrincipal() p: Principal, @Param('id', uuidPipe) r: string) {
    return this.lifecycleService.cases(p.user_id, r);
  }

  @Get(':id/metrics')
  metrics(@CurrentPrincipal() p: Principal, @Param('id', uuidPipe) r: string) {
    return this.lifecycleService.metrics(p.user_id, r);
  }

  @Post(':id/annotations')
  annotate(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuidPipe) r: string,
    @Body(new ZodPipe(annotationSchema)) b: AnnotationRequestDto,
  ) {
    return this.lifecycleService.annotate(p.user_id, r, b);
  }

  @Get(':id/annotations')
  annotations(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuidPipe) r: string,
  ) {
    return this.lifecycleService.annotations(p.user_id, r);
  }

  @Post(':id/export')
  exportRun(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuidPipe) r: string,
  ) {
    return this.lifecycleService.export(p.user_id, r);
  }
}

@Controller('api/v1/evaluators')
export class EvaluatorsController {
  constructor(private readonly service: EvaluationLifecycleService) {}

  @Post()
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createEvaluatorSchema)) b: CreateEvaluatorRequestDto,
  ) {
    return this.service.createEvaluator(p.user_id, b);
  }

  @Get()
  list(
    @CurrentPrincipal() p: Principal,
    @Query('workspace_id', uuidPipe) ws: string,
  ) {
    return this.service.evaluators(p.user_id, ws);
  }

  @Post(':evaluator_id/versions')
  version(
    @CurrentPrincipal() p: Principal,
    @Param('evaluator_id', uuidPipe) e: string,
    @Body(new ZodPipe(evaluatorVersionSchema)) b: EvaluatorVersionRequestDto,
  ) {
    return this.service.version(p.user_id, e, b);
  }

  @Get(':evaluator_id/versions')
  versions(
    @CurrentPrincipal() p: Principal,
    @Param('evaluator_id', uuidPipe) e: string,
  ) {
    return this.service.versions(p.user_id, e);
  }

  @Post(':evaluator_id/calibrations')
  calibration(
    @CurrentPrincipal() p: Principal,
    @Param('evaluator_id', uuidPipe) e: string,
    @Body(new ZodPipe(calibrationSchema)) b: CalibrationRequestDto,
  ) {
    return this.service.calibrate(p.user_id, e, b);
  }
}

@Controller('api/v1/evaluation-comparisons')
export class EvaluationComparisonsController {
  constructor(private readonly service: EvaluationLifecycleService) {}

  @Post()
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(comparisonSchema)) b: ComparisonRequestDto,
  ) {
    return this.service.compare(p.user_id, b);
  }

  @Get()
  list(
    @CurrentPrincipal() p: Principal,
    @Query('workspace_id', uuidPipe) ws: string,
  ) {
    return this.service.comparisons(p.user_id, ws);
  }

  @Get(':comparison_id')
  detail(
    @CurrentPrincipal() p: Principal,
    @Param('comparison_id', uuidPipe) c: string,
  ) {
    return this.service.comparison(p.user_id, c);
  }
}
