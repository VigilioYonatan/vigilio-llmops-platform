import { z } from 'zod';
import { registerEndpointDocs } from '../../../../../shared/http/openapi-doc.registry';
import {
  budgetCreateSchema,
  budgetPatchSchema,
  budgetSimulateSchema,
  priceCardSchema,
  upsertBudgetSchema,
} from '../dto/budget.dto';

registerEndpointDocs([
  {
    method: 'post',
    path: '/api/v1/budgets',
    tag: 'FinOps',
    summary: 'Create or update organization hard budget cap',
    auth: 'session',
    requestBody: upsertBudgetSchema,
  },
  {
    method: 'get',
    path: '/api/v1/budgets',
    tag: 'FinOps',
    summary: 'Get organization hard budget cap',
    auth: 'session',
  },
  {
    method: 'post',
    path: '/api/v1/budget-policies',
    tag: 'FinOps',
    summary: 'Create budget policy',
    auth: 'session',
    requestBody: budgetCreateSchema,
  },
  {
    method: 'get',
    path: '/api/v1/budget-policies',
    tag: 'FinOps',
    summary: 'List budget policies',
    auth: 'session',
  },
  {
    method: 'patch',
    path: '/api/v1/budget-policies/{budget_id}',
    tag: 'FinOps',
    summary: 'Update budget policy limit',
    auth: 'session',
    requestBody: budgetPatchSchema,
  },
  {
    method: 'post',
    path: '/api/v1/budget-policies/{budget_id}/simulate',
    tag: 'FinOps',
    summary: 'Simulate budget reservation impact',
    auth: 'session',
    requestBody: budgetSimulateSchema,
  },
  {
    method: 'get',
    path: '/api/v1/costs/overview',
    tag: 'FinOps',
    summary: 'Aggregated cost and token overview',
    auth: 'session',
  },
  {
    method: 'get',
    path: '/api/v1/costs/usage',
    tag: 'FinOps',
    summary: 'Cost breakdown by application and model',
    auth: 'session',
  },
  {
    method: 'get',
    path: '/api/v1/costs/ledger',
    tag: 'FinOps',
    summary: 'Budget reservation and cost ledger entries',
    auth: 'session',
  },
  {
    method: 'post',
    path: '/api/v1/costs/price-cards',
    tag: 'FinOps',
    summary: 'Create non-retroactive model price card',
    auth: 'session',
    requestBody: priceCardSchema,
  },
  {
    method: 'get',
    path: '/api/v1/costs/price-cards',
    tag: 'FinOps',
    summary: 'List model price cards',
    auth: 'session',
  },
  {
    method: 'post',
    path: '/api/v1/costs/reconciliations',
    tag: 'FinOps',
    summary:
      'Reconcile budget policy against outstanding reservations and ledger',
    auth: 'session',
    requestBody: z.object({ organization_id: z.uuid() }).strict(),
  },
]);
