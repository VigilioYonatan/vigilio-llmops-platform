Feature: Application API key isolation
  Scenario: Missing API key cannot send traces
    When I request POST "/api/v1/ingest/traces" without credentials
    Then the API status should be 401
  Scenario: Missing API key cannot use the inference gateway
    When I request POST "/api/v1/gateway/generate" without credentials
    Then the API status should be 401
