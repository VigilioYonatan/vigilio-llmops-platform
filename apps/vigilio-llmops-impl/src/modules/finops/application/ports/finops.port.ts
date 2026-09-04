export const FINOPS_REPOSITORY_PORT = Symbol('FINOPS_REPOSITORY_PORT');

export interface LedgerWriteInput {
  organization_id: string;
  workspace_id?: string | null;
  application_id?: string | null;
  reservation_id?: string | null;
  model: string;
  source?: string;
  input_tokens: number;
  output_tokens: number;
  amount_usd: string;
}

export interface FinopsRepositoryPort {
  findActivePriceCard(
    organizationId: string,
    model: string,
  ): Promise<{
    price_input_per_million: string;
    price_output_per_million: string;
  } | null>;
}
